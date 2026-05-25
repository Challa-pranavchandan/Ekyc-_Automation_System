import { KYCApplication, AuditLog, Document, FaceVerification } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { KYC_STATUS, KYC_STEPS } from '../constants.js';

// ─── Helper: log audit ────────────────────────────────────────────────────────
const logAudit = async ({ applicationId, performedBy, action, previousState, newState, description, req }) => {
  await AuditLog.create({
    applicationId,
    performedBy,
    action,
    entity: 'KYCApplication',
    entityId: applicationId,
    previousState,
    newState,
    description,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
};

// ─── Create Application ───────────────────────────────────────────────────────
// POST /api/v1/kyc/
// Applicant starts a new KYC application
export const createApplication = asyncHandler(async (req, res) => {
  // One active application per user at a time
  const existingActive = await KYCApplication.findOne({
    userId: req.user._id,
    status: {
      $nin: [KYC_STATUS.APPROVED, KYC_STATUS.REJECTED, KYC_STATUS.EXPIRED],
    },
  });

  if (existingActive) {
    throw new ApiError(
      409,
      `You already have an active application (${existingActive.applicationNo})`
    );
  }

  const application = await KYCApplication.create({
    userId: req.user._id,
    status: KYC_STATUS.DRAFT,
    currentStep: KYC_STEPS.PERSONAL_INFO,
  });

  await logAudit({
    applicationId: application._id,
    performedBy: req.user._id,
    action: 'created',
    newState: { status: application.status, step: application.currentStep },
    description: `KYC application created: ${application.applicationNo}`,
    req,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, 'KYC application created', application));
});

// ─── Save Personal Info ───────────────────────────────────────────────────────
// PUT /api/v1/kyc/:applicationId/personal-info
// Applicant fills step 1 — personal details
export const savePersonalInfo = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { fullName, dateOfBirth, gender, nationality, address } = req.body;

  if (!fullName || !dateOfBirth || !gender) {
    throw new ApiError(400, 'Full name, date of birth and gender are required');
  }

  const application = await KYCApplication.findOne({
    _id: applicationId,
    userId: req.user._id,
  });

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  if (![KYC_STATUS.DRAFT, KYC_STATUS.DOCUMENT_PENDING].includes(application.status)) {
    throw new ApiError(400, `Cannot edit personal info at status: ${application.status}`);
  }

  const previousState = { ...application.personalInfo };

  application.personalInfo = {
    fullName: fullName.trim(),
    dateOfBirth: new Date(dateOfBirth),
    gender,
    nationality: nationality?.trim(),
    address: {
      line1: address?.line1?.trim(),
      line2: address?.line2?.trim(),
      city: address?.city?.trim(),
      state: address?.state?.trim(),
      pincode: address?.pincode,
      country: address?.country?.trim() || 'India',
    },
  };

  // Advance step if still on personal_info
  if (application.currentStep === KYC_STEPS.PERSONAL_INFO) {
    application.currentStep = KYC_STEPS.DOCUMENT_UPLOAD;
    application.status = KYC_STATUS.DOCUMENT_PENDING;
  }

  await application.save();

  await logAudit({
    applicationId: application._id,
    performedBy: req.user._id,
    action: 'updated',
    previousState,
    newState: application.personalInfo,
    description: `Personal info saved for: ${application.applicationNo}`,
    req,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, 'Personal info saved', application));
});

// ─── Get My Application ───────────────────────────────────────────────────────
// GET /api/v1/kyc/my-application
// Applicant fetches their current active application with all details
export const getMyApplication = asyncHandler(async (req, res) => {
  const application = await KYCApplication.findOne({
    userId: req.user._id,
    status: {
      $nin: [KYC_STATUS.APPROVED, KYC_STATUS.REJECTED, KYC_STATUS.EXPIRED],
    },
  })
    .populate('documents')
    .populate('faceVerification');

  if (!application) {
    throw new ApiError(404, 'No active KYC application found');
  }

  return res
    .status(200)
    .json(new ApiResponse(200, 'Application fetched', application));
});

// ─── Get Application By ID ────────────────────────────────────────────────────
// GET /api/v1/kyc/:applicationId
// Applicant or admin fetches a specific application
export const getApplicationById = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const query = { _id: applicationId };

  // Applicants can only see their own applications
  if (req.user.role === 'applicant') {
    query.userId = req.user._id;
  }

  const application = await KYCApplication.findOne(query)
    .populate('userId', 'name email phone')
    .populate('documents')
    .populate('faceVerification')
    .populate('reviewedBy', 'name email');

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  return res
    .status(200)
    .json(new ApiResponse(200, 'Application fetched', application));
});

// ─── Get Application Status ───────────────────────────────────────────────────
// GET /api/v1/kyc/:applicationId/status
// Lightweight status check (no populate) — used by frontend polling
export const getApplicationStatus = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const application = await KYCApplication.findOne({
    _id: applicationId,
    userId: req.user._id,
  }).select('applicationNo status currentStep overallScore submittedAt reviewedAt');

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  return res
    .status(200)
    .json(new ApiResponse(200, 'Status fetched', application));
});

// ─── Submit Application ───────────────────────────────────────────────────────
// POST /api/v1/kyc/:applicationId/submit
// Applicant finalizes and submits for review — all steps must be complete
export const submitApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const application = await KYCApplication.findOne({
    _id: applicationId,
    userId: req.user._id,
  }).populate('documents').populate('faceVerification');

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  if (application.status !== KYC_STATUS.FACE_VERIFIED) {
    throw new ApiError(
      400,
      `Application cannot be submitted at status: ${application.status}. Complete all steps first.`
    );
  }

  // Validate all required documents exist
  const docTypes = application.documents.map((d) => d.type);
  if (!docTypes.includes('aadhaar') && !docTypes.includes('passport')) {
    throw new ApiError(400, 'At least one identity document (Aadhaar or Passport) is required');
  }

  if (!application.faceVerification?.liveness.pass) {
    throw new ApiError(400, 'Liveness check must be passed before submission');
  }

  if (!application.faceVerification?.faceMatch.pass) {
    throw new ApiError(400, 'Face match must be passed before submission');
  }

  const previousStatus = application.status;

  application.status = KYC_STATUS.UNDER_REVIEW;
  application.currentStep = KYC_STEPS.REVIEW;
  application.submittedAt = new Date();
  // Set expiry — KYC valid for 1 year
  application.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  await application.save();

  await logAudit({
    applicationId: application._id,
    performedBy: req.user._id,
    action: 'status_changed',
    previousState: { status: previousStatus },
    newState: { status: application.status },
    description: `Application submitted for review: ${application.applicationNo}`,
    req,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, 'Application submitted for review', {
      applicationNo: application.applicationNo,
      status: application.status,
      submittedAt: application.submittedAt,
    }));
});

// ─── Get All Applications (Admin/Reviewer) ────────────────────────────────────
// GET /api/v1/kyc/
// Admin/reviewer gets paginated list with filters
export const getAllApplications = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const filter = {};

  if (status) {
    if (!Object.values(KYC_STATUS).includes(status)) {
      throw new ApiError(400, `Invalid status filter: ${status}`);
    }
    filter.status = status;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  let query = KYCApplication.find(filter)
    .populate('userId', 'name email phone')
    .populate('reviewedBy', 'name email')
    .sort(sort)
    .skip(skip)
    .limit(Number(limit));

  // Search by applicationNo or user name
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filter.$or = [
      { applicationNo: searchRegex },
    ];
  }

  const [applications, total] = await Promise.all([
    query,
    KYCApplication.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, 'Applications fetched', {
      applications,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    })
  );
});

// ─── Get Application History ──────────────────────────────────────────────────
// GET /api/v1/kyc/:applicationId/history
// Full audit trail for an application
export const getApplicationHistory = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const application = await KYCApplication.findById(applicationId);
  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  // Applicants can only see their own history
  if (
    req.user.role === 'applicant' &&
    application.userId.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(403, 'Access denied');
  }

  const history = await AuditLog.find({ applicationId })
    .populate('performedBy', 'name email role')
    .sort({ createdAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, 'Application history fetched', history));
});
