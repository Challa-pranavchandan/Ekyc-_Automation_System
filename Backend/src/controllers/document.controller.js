import { Document, KYCApplication, AuditLog } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../utils/cloudinary.utils.js';
import { processDocument } from '../utils/ocr.utils.js';
import { KYC_STATUS, KYC_STEPS, DOCUMENT_TYPES, VERIFICATION_STATUS } from '../constants.js';

// ─── Upload Document ──────────────────────────────────────────────────────────
// POST /api/v1/documents/:applicationId/upload
export const uploadDocument = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { type, side = 'single' } = req.body;

  // Validate document type
  if (!type || !Object.values(DOCUMENT_TYPES).includes(type)) {
    throw new ApiError(400, `Invalid document type. Must be one of: ${Object.values(DOCUMENT_TYPES).join(', ')}`);
  }

  // Check file was uploaded by multer
  if (!req.file) {
    throw new ApiError(400, 'Document file is required');
  }

  // Find the application and verify ownership
  const application = await KYCApplication.findOne({
    _id: applicationId,
    userId: req.user._id,
  });

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  // Only allow upload at correct status
  const allowedStatuses = [
    KYC_STATUS.DOCUMENT_PENDING,
    KYC_STATUS.DOCUMENT_UPLOADED, // allow re-upload
  ];
  if (!allowedStatuses.includes(application.status)) {
    throw new ApiError(400, `Cannot upload documents at status: ${application.status}`);
  }

  // If document of same type+side exists, delete old one first
  const existingDoc = await Document.findOne({ applicationId, type, side });
  if (existingDoc) {
    // Delete from Cloudinary
    await deleteFromCloudinary(existingDoc.s3Key);
    await Document.deleteOne({ _id: existingDoc._id });
  }

  // Upload to Cloudinary under ekyc/documents/{applicationId} folder
  const folder = `ekyc/documents/${applicationId}`;
  // Keep local file for OCR processing (more reliable than URL)
  const uploaded = await uploadOnCloudinary(req.file.path, folder, false);

  if (!uploaded) {
    throw new ApiError(500, 'Failed to upload document to storage');
  }

  // Save document record with status = processing (OCR will run next)
  const document = await Document.create({
    applicationId,
    type,
    side,
    s3Key: uploaded.publicId,     // Cloudinary public_id acts as our key
    s3Url: uploaded.url,
    mimeType: req.file.mimetype,
    fileSizeBytes: uploaded.bytes,
    verificationStatus: VERIFICATION_STATUS.PROCESSING,
  });

  // Run OCR asynchronously — don't make user wait
  // Run OCR asynchronously using local file — delete file after done
  runOCRInBackground(document._id, req.file.path, type, true);

  // Update application step if first document
  if (application.currentStep === KYC_STEPS.DOCUMENT_UPLOAD) {
    application.status = KYC_STATUS.DOCUMENT_UPLOADED;
  }
  await application.save();

  // Audit log
  await AuditLog.create({
    applicationId,
    performedBy: req.user._id,
    action: 'document_uploaded',
    entity: 'Document',
    entityId: document._id,
    newState: { type, side, verificationStatus: document.verificationStatus },
    description: `Document uploaded: ${type} (${side}) for ${application.applicationNo}`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(201).json(
    new ApiResponse(201, 'Document uploaded successfully. OCR processing started.', {
      document,
      applicationStatus: application.status,
    })
  );
});

// ─── OCR Background Runner ────────────────────────────────────────────────────
// Runs after upload response is sent — updates document with extracted data
const runOCRInBackground = async (documentId, filePath, documentType, deleteFile = false) => {
  try {
    const { Document } = await import('../models/index.js'); // Ensure model is available
    const { VERIFICATION_STATUS } = await import('../constants.js');
    const fs = await import('fs');

    const extracted = await processDocument(filePath, documentType);

    await Document.findByIdAndUpdate(documentId, {
      extractedData: {
        name: extracted.name,
        dateOfBirth: extracted.dateOfBirth,
        idNumber: extracted.idNumber,
        address: extracted.address,
        fatherName: extracted.fatherName,
        gender: extracted.gender,
        expiryDate: extracted.expiryDate,
        rawText: extracted.rawText,
      },
      ocrConfidence: extracted.confidence,
      verificationStatus:
        extracted.confidence > 0.6
          ? VERIFICATION_STATUS.VERIFIED
          : VERIFICATION_STATUS.MANUAL_REVIEW,
      processedAt: new Date(),
    });

    console.log(`OCR completed for document: ${documentId}`);
  } catch (error) {
    console.error(`OCR failed for document ${documentId}:`, error.message);
    try {
      await Document.findByIdAndUpdate(documentId, {
        verificationStatus: VERIFICATION_STATUS.FAILED,
        failureReason: error.message,
      });
    } catch (dbError) {
      console.error('Failed to update document error status:', dbError.message);
    }
  } finally {
    // Cleanup local file if requested
    if (deleteFile) {
      try {
        const fs = await import('fs');
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('Failed to delete temp file after OCR:', err.message);
      }
    }
  }
};

// ─── Get OCR Result ───────────────────────────────────────────────────────────
// GET /api/v1/documents/:applicationId/:documentId/ocr
// Frontend polls this after upload to get extracted data
export const getOCRResult = asyncHandler(async (req, res) => {
  const { applicationId, documentId } = req.params;

  const document = await Document.findOne({
    _id: documentId,
    applicationId,
  });

  if (!document) {
    throw new ApiError(404, 'Document not found');
  }

  // Verify ownership
  const application = await KYCApplication.findOne({
    _id: applicationId,
    userId: req.user._id,
  });
  if (!application) {
    throw new ApiError(403, 'Access denied');
  }

  return res
    .status(200)
    .set('Cache-Control', 'no-store, no-cache, must-revalidate')
    .set('Pragma', 'no-cache')
    .json(
      new ApiResponse(200, 'OCR result fetched', {
        verificationStatus: document.verificationStatus,
        ocrConfidence: document.ocrConfidence,
        extractedData: {
          name: document.extractedData?.name,
          dateOfBirth: document.extractedData?.dateOfBirth,
          idNumber: document.extractedData?.idNumber,
          address: document.extractedData?.address,
          gender: document.extractedData?.gender,
          expiryDate: document.extractedData?.expiryDate,
          fatherName: document.extractedData?.fatherName,
        },
        processedAt: document.processedAt,
      })
    );
});

// ─── Get All Documents for Application ───────────────────────────────────────
// GET /api/v1/documents/:applicationId
export const getDocuments = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  // Verify ownership (applicant) or admin access
  if (req.user.role === 'applicant') {
    const application = await KYCApplication.findOne({
      _id: applicationId,
      userId: req.user._id,
    });
    if (!application) {
      throw new ApiError(403, 'Access denied');
    }
  }

  const documents = await Document.find({ applicationId }).select('-extractedData.rawText');

  return res.status(200).json(
    new ApiResponse(200, 'Documents fetched', documents)
  );
});

// ─── Delete Document ──────────────────────────────────────────────────────────
// DELETE /api/v1/documents/:applicationId/:documentId
export const deleteDocument = asyncHandler(async (req, res) => {
  const { applicationId, documentId } = req.params;

  const application = await KYCApplication.findOne({
    _id: applicationId,
    userId: req.user._id,
  });

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  // Can only delete if application is in document stage
  const allowedStatuses = [KYC_STATUS.DOCUMENT_PENDING, KYC_STATUS.DOCUMENT_UPLOADED];
  if (!allowedStatuses.includes(application.status)) {
    throw new ApiError(400, `Cannot delete documents at status: ${application.status}`);
  }

  const document = await Document.findOne({ _id: documentId, applicationId });
  if (!document) {
    throw new ApiError(404, 'Document not found');
  }

  // Delete from Cloudinary
  await deleteFromCloudinary(document.s3Key);

  // Delete from DB
  await Document.deleteOne({ _id: documentId });

  // If no documents left, revert status
  const remainingDocs = await Document.countDocuments({ applicationId });
  if (remainingDocs === 0) {
    application.status = KYC_STATUS.DOCUMENT_PENDING;
    await application.save();
  }

  await AuditLog.create({
    applicationId,
    performedBy: req.user._id,
    action: 'deleted',
    entity: 'Document',
    entityId: documentId,
    previousState: { type: document.type, side: document.side },
    description: `Document deleted: ${document.type} for ${application.applicationNo}`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json(
    new ApiResponse(200, 'Document deleted successfully', null)
  );
});

// ─── Re-trigger OCR ───────────────────────────────────────────────────────────
// POST /api/v1/documents/:applicationId/:documentId/reprocess
// Admin can re-run OCR on a document if it failed
export const reprocessOCR = asyncHandler(async (req, res) => {
  const { applicationId, documentId } = req.params;

  const document = await Document.findOne({ _id: documentId, applicationId });
  if (!document) {
    throw new ApiError(404, 'Document not found');
  }

  // Reset status to processing
  await Document.findByIdAndUpdate(documentId, {
    verificationStatus: VERIFICATION_STATUS.PROCESSING,
    failureReason: null,
  });

  // Re-run OCR in background
  runOCRInBackground(documentId, document.s3Url, document.type);

  return res.status(200).json(
    new ApiResponse(200, 'OCR reprocessing started', { documentId })
  );
});
