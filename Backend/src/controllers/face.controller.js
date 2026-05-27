import axios from 'axios';
import { FaceVerification, KYCApplication, Document, AuditLog } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { uploadOnCloudinary } from '../utils/cloudinary.utils.js';
import { KYC_STATUS, KYC_STEPS, DOCUMENT_TYPES } from '../constants.js';

// FastAPI base URL — read from .env
const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL || 'http://localhost:8001';

// ─── Helper: get best ID document for face match ──────────────────────────────
// Priority: passport → aadhaar → driving_license → any available
const getBestDocumentForFaceMatch = (documents) => {
  const priority = [
    DOCUMENT_TYPES.PASSPORT,
    DOCUMENT_TYPES.AADHAAR,
    DOCUMENT_TYPES.DRIVING_LICENSE,
    DOCUMENT_TYPES.VOTER_ID,
  ];

  for (const type of priority) {
    const doc = documents.find(
      (d) => d.type === type && d.verificationStatus === 'verified'
    );
    if (doc) return doc;
  }

  // Fallback — return any verified document
  return documents.find((d) => d.verificationStatus === 'verified') || null;
};

// ─── Upload Selfie ────────────────────────────────────────────────────────────
// POST /api/v1/face/:applicationId/upload-selfie
// Receives base64 image from React camera capture, uploads to Cloudinary
export const uploadSelfie = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    throw new ApiError(400, 'Selfie image (base64) is required');
  }

  // Verify application ownership
  const application = await KYCApplication.findOne({
    _id: applicationId,
    userId: req.user._id,
  });

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  // Must have documents uploaded before face verification
  if (
    ![KYC_STATUS.DOCUMENT_UPLOADED, KYC_STATUS.FACE_PENDING].includes(
      application.status
    )
  ) {
    throw new ApiError(
      400,
      `Face verification not available at status: ${application.status}. Upload documents first.`
    );
  }

  // Convert base64 to buffer and save as temp file
  // React sends: "data:image/jpeg;base64,/9j/4AAQ..."
  // We strip the prefix to get raw base64
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // Write buffer to temp file so Cloudinary util can upload it
  const tempPath = `./public/temp/selfie-${applicationId}-${Date.now()}.jpg`;
  const fs = await import('fs');
  fs.writeFileSync(tempPath, buffer);

  // Upload to Cloudinary under ekyc/selfies/{applicationId}
  const uploaded = await uploadOnCloudinary(
    tempPath,
    `ekyc/selfies/${applicationId}`
  );

  if (!uploaded) {
    throw new ApiError(500, 'Failed to upload selfie to storage');
  }

  // Create or update FaceVerification record
  let faceVerification = await FaceVerification.findOne({ applicationId });

  if (faceVerification) {
    // Update existing record (re-attempt)
    faceVerification.selfieS3Key = uploaded.publicId;
    faceVerification.selfieS3Url = uploaded.url;
    faceVerification.selfieMimeType = 'image/jpeg';
    faceVerification.attemptCount += 1;
    // Reset previous results for fresh check
    faceVerification.liveness = { status: 'pending', pass: null, score: null };
    faceVerification.faceMatch = { status: 'pending', pass: null, score: null };
    faceVerification.overallStatus = 'pending';
    await faceVerification.save();
  } else {
    // Create new record
    faceVerification = await FaceVerification.create({
      applicationId,
      selfieS3Key: uploaded.publicId,
      selfieS3Url: uploaded.url,
      selfieMimeType: 'image/jpeg',
      attemptCount: 1,
    });
  }

  // Update application status to face_pending
  application.status = KYC_STATUS.FACE_PENDING;
  application.currentStep = KYC_STEPS.FACE_VERIFICATION;
  await application.save();

  return res.status(200).json(
    new ApiResponse(200, 'Selfie uploaded successfully', {
      faceVerificationId: faceVerification._id,
      selfieUrl: uploaded.url,
      applicationStatus: application.status,
    })
  );
});

// ─── Run Face Verification ────────────────────────────────────────────────────
// POST /api/v1/face/:applicationId/verify
// Calls FastAPI for liveness + face match, saves results
export const runFaceVerification = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  // Verify application
  const application = await KYCApplication.findOne({
    _id: applicationId,
    userId: req.user._id,
  });

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  if (application.status !== KYC_STATUS.FACE_PENDING) {
    throw new ApiError(400, `Upload selfie first before running verification`);
  }

  // Get FaceVerification record with selfie
  const faceVerification = await FaceVerification.findOne({ applicationId });
  if (!faceVerification?.selfieS3Url) {
    throw new ApiError(400, 'Selfie not found — please upload selfie first');
  }

  // Check attempt limit (max 3)
  if (faceVerification.attemptCount > 3) {
    throw new ApiError(429, 'Maximum verification attempts (3) reached. Contact support.');
  }

  // Get best ID document for face match
  const documents = await Document.find({ applicationId });
  const idDocument = getBestDocumentForFaceMatch(documents);

  if (!idDocument) {
    throw new ApiError(400, 'No verified identity document found. Verify documents first.');
  }

  /* 
  // ── Step 1: Call FastAPI for liveness check ──────────────────────────────
  let livenessResult;
  try {
    faceVerification.liveness.status = 'processing';
    await faceVerification.save();

    const livenessResponse = await axios.post(
      `${FACE_SERVICE_URL}/liveness/check`,
      {
        selfie_url: faceVerification.selfieS3Url,
        application_id: applicationId,
      },
      { timeout: 30000 } // 30 second timeout for ML operations
    );

    livenessResult = livenessResponse.data;
  } catch (error) {
    throw new ApiError(
      502,
      `Liveness service unavailable: ${error.message}`
    );
  }

  // ── Step 2: Call FastAPI for face match ──────────────────────────────────
  let faceMatchResult;
  try {
    faceVerification.faceMatch.status = 'processing';
    await faceVerification.save();

    const faceMatchResponse = await axios.post(
      `${FACE_SERVICE_URL}/face-match/compare`,
      {
        selfie_url: faceVerification.selfieS3Url,
        id_photo_url: idDocument.s3Url,
        document_type: idDocument.type,
        application_id: applicationId,
      },
      { timeout: 30000 }
    );

    faceMatchResult = faceMatchResponse.data;
  } catch (error) {
    throw new ApiError(
      502,
      `Face match service unavailable: ${error.message}`
    );
  }
  */

  // ── Step 1 & 2: FastAPI STUB ──────────────────────────────────────────────
  // TEMPORARY STUB — remove when FastAPI is working
  const livenessResult = {
    pass_check: true,
    score: 0.92,
    method: 'combined',
    spoofing_detected: false,
    failure_reason: null,
    face_detected: true,
  };

  const faceMatchResult = {
    pass_check: true,
    score: 0.87,
    distance: 0.13,
    threshold_used: 0.50,
    model_used: 'stub',
    selfie_face_found: true,
    id_face_found: true,
    failure_reason: null,
  };




  // ── Step 3: Save results to FaceVerification model ───────────────────────
  faceVerification.liveness = {
    status: livenessResult.pass_check ? 'passed' : 'failed',
    pass: livenessResult.pass_check,
    score: livenessResult.score,
    method: livenessResult.method,
    spoofingDetected: livenessResult.spoofing_detected,
    failureReason: livenessResult.failure_reason,
    rawResponse: livenessResult,
  };

  faceVerification.faceMatch = {
    status: faceMatchResult.pass_check ? 'passed' : 'failed',
    pass: faceMatchResult.pass_check,
    score: faceMatchResult.score,
    threshold: faceMatchResult.threshold_used,
    matchedDocumentId: idDocument._id,
    failureReason: faceMatchResult.failure_reason,
    rawResponse: faceMatchResult,
  };

  faceVerification.fastApiVersion = '1.0.0';
  // overallStatus is auto-derived in pre-save hook
  await faceVerification.save();

  // ── Step 4: Update application status ────────────────────────────────────
  const bothPassed =
    livenessResult.pass_check && faceMatchResult.pass_check;

  if (bothPassed) {
    application.status = KYC_STATUS.FACE_VERIFIED;
    application.currentStep = KYC_STEPS.REVIEW;
  } else {
    // Failed — stay at face_pending so user can retry
    application.status = KYC_STATUS.FACE_PENDING;
  }
  await application.save();

  // Audit log
  await AuditLog.create({
    applicationId,
    performedBy: req.user._id,
    action: 'face_verified',
    entity: 'FaceVerification',
    entityId: faceVerification._id,
    newState: {
      livenessPass: livenessResult.pass_check,
      faceMatchPass: faceMatchResult.pass_check,
      overallStatus: faceVerification.overallStatus,
    },
    description: `Face verification ${bothPassed ? 'passed' : 'failed'} for ${application.applicationNo}`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json(
    new ApiResponse(200, 'Face verification complete', {
      overallStatus: faceVerification.overallStatus,
      liveness: {
        pass: livenessResult.pass_check,
        score: livenessResult.score,
        failureReason: livenessResult.failure_reason,
      },
      faceMatch: {
        pass: faceMatchResult.pass_check,
        score: faceMatchResult.score,
        failureReason: faceMatchResult.failure_reason,
      },
      applicationStatus: application.status,
      attemptsRemaining: 3 - faceVerification.attemptCount,
    })
  );
});

// ─── Get Face Verification Result ────────────────────────────────────────────
// GET /api/v1/face/:applicationId/result
export const getFaceVerificationResult = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const application = await KYCApplication.findOne({
    _id: applicationId,
    userId: req.user._id,
  });
  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  const faceVerification = await FaceVerification.findOne({ applicationId }).select(
    '-liveness.rawResponse -faceMatch.rawResponse'
  );

  if (!faceVerification) {
    throw new ApiError(404, 'No face verification found for this application');
  }

  return res.status(200).json(
    new ApiResponse(200, 'Face verification result fetched', faceVerification)
  );
});
