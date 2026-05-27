import {
  KYCApplication,
  Document,
  FaceVerification,
  AuditLog,
  User,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { KYC_STATUS, KYC_STEPS } from '../constants.js';

// ─── Helper: calculate overall score ─────────────────────────────────────────
// Combines OCR confidence + face match score + liveness score into 0-100
const calculateOverallScore = (documents, faceVerification) => {
  let score = 0;
  let weights = 0;

  // Document OCR confidence (40% weight)
  const verifiedDocs = documents.filter((d) => d.verificationStatus === 'verified');
  if (verifiedDocs.length > 0) {
    const avgOcrConfidence =
      verifiedDocs.reduce((sum, d) => sum + (d.ocrConfidence || 0), 0) /
      verifiedDocs.length;
    score += avgOcrConfidence * 40;
    weights += 40;
  }

  // Face match score (35% weight)
  if (faceVerification?.faceMatch?.score != null) {
    score += faceVerification.faceMatch.score * 35;
    weights += 35;
  }

  // Liveness score (25% weight)
  if (faceVerification?.liveness?.score != null) {
    score += faceVerification.liveness.score * 25;
    weights += 25;
  }

  // Normalize to 100 if not all components are available
  if (weights === 0) return null;
  return Math.round((score / weights) * 100);
};

// ─── Get Review Queue ─────────────────────────────────────────────────────────
// GET /api/v1/admin/review-queue
// Returns all applications pending review with pagination + filters
export const getReviewQueue = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status = KYC_STATUS.UNDER_REVIEW,
    sortBy = 'submittedAt',
    sortOrder = 'asc', // oldest first — FIFO review
  } = req.query;

  const filter = {};

  // Validate status filter
  if (status === 'all') {
    // Admin can see all statuses
  } else if (Object.values(KYC_STATUS).includes(status)) {
    filter.status = status;
  } else {
    throw new ApiError(400, `Invalid status: ${status}`);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  const [applications, total] = await Promise.all([
    KYCApplication.find(filter)
      .populate('userId', 'name email phone createdAt')
      .populate('reviewedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .select('-personalInfo.address.line2'), // trim response size
    KYCApplication.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, 'Review queue fetched', {
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

// ─── Get Full Application Detail for Review ───────────────────────────────────
// GET /api/v1/admin/applications/:applicationId
// Returns complete application with all documents + face verification for review
export const getApplicationForReview = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const application = await KYCApplication.findById(applicationId)
    .populate('userId', 'name email phone status createdAt')
    .populate('reviewedBy', 'name email role')
    .populate({
      path: 'documents',
      select: '-extractedData.rawText', // exclude raw OCR text
    })
    .populate({
      path: 'faceVerification',
      select: '-liveness.rawResponse -faceMatch.rawResponse', // exclude raw FastAPI response
    });

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  // Get full audit history for this application
  const auditHistory = await AuditLog.find({ applicationId })
    .populate('performedBy', 'name email role')
    .sort({ createdAt: -1 })
    .limit(20); // last 20 events

  return res.status(200).json(
    new ApiResponse(200, 'Application fetched for review', {
      application,
      auditHistory,
    })
  );
});

// ─── Approve Application ──────────────────────────────────────────────────────
// POST /api/v1/admin/applications/:applicationId/approve
export const approveApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { reviewNotes } = req.body;

  const application = await KYCApplication.findById(applicationId)
    .populate('documents')
    .populate('faceVerification');

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  // Can only approve applications that are under review
  if (application.status !== KYC_STATUS.UNDER_REVIEW) {
    throw new ApiError(
      400,
      `Cannot approve application at status: ${application.status}. Must be 'under_review'.`
    );
  }

  const previousStatus = application.status;

  // Calculate overall score before approving
  const overallScore = calculateOverallScore(
    application.documents,
    application.faceVerification
  );

  // Update application
  application.status = KYC_STATUS.APPROVED;
  application.currentStep = KYC_STEPS.COMPLETED;
  application.reviewedBy = req.user._id;
  application.reviewedAt = new Date();
  application.reviewNotes = reviewNotes?.trim() || null;
  application.overallScore = overallScore;
  application.rejectionReason = null;

  await application.save();

  // Audit log
  await AuditLog.create({
    applicationId,
    performedBy: req.user._id,
    action: 'approved',
    entity: 'KYCApplication',
    entityId: applicationId,
    previousState: { status: previousStatus },
    newState: { status: KYC_STATUS.APPROVED, overallScore },
    description: `Application ${application.applicationNo} approved by ${req.user.name}`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json(
    new ApiResponse(200, 'Application approved successfully', {
      applicationNo: application.applicationNo,
      status: application.status,
      overallScore: application.overallScore,
      reviewedAt: application.reviewedAt,
    })
  );
});

// ─── Reject Application ───────────────────────────────────────────────────────
// POST /api/v1/admin/applications/:applicationId/reject
export const rejectApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { rejectionReason, reviewNotes } = req.body;

  if (!rejectionReason || rejectionReason.trim().length < 10) {
    throw new ApiError(400, 'Rejection reason is required (minimum 10 characters)');
  }

  const application = await KYCApplication.findById(applicationId);

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  if (application.status !== KYC_STATUS.UNDER_REVIEW) {
    throw new ApiError(
      400,
      `Cannot reject application at status: ${application.status}. Must be 'under_review'.`
    );
  }

  const previousStatus = application.status;

  application.status = KYC_STATUS.REJECTED;
  application.reviewedBy = req.user._id;
  application.reviewedAt = new Date();
  application.rejectionReason = rejectionReason.trim();
  application.reviewNotes = reviewNotes?.trim() || null;

  await application.save();

  await AuditLog.create({
    applicationId,
    performedBy: req.user._id,
    action: 'rejected',
    entity: 'KYCApplication',
    entityId: applicationId,
    previousState: { status: previousStatus },
    newState: { status: KYC_STATUS.REJECTED, rejectionReason },
    description: `Application ${application.applicationNo} rejected by ${req.user.name}: ${rejectionReason}`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json(
    new ApiResponse(200, 'Application rejected', {
      applicationNo: application.applicationNo,
      status: application.status,
      rejectionReason: application.rejectionReason,
      reviewedAt: application.reviewedAt,
    })
  );
});

// ─── Manual Override ──────────────────────────────────────────────────────────
// POST /api/v1/admin/applications/:applicationId/override
// Superadmin can force any status change with a reason
export const manualOverride = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { newStatus, reason } = req.body;

  // Only superadmin can do manual overrides
  if (req.user.role !== 'superadmin') {
    throw new ApiError(403, 'Only superadmin can perform manual overrides');
  }

  if (!newStatus || !Object.values(KYC_STATUS).includes(newStatus)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${Object.values(KYC_STATUS).join(', ')}`);
  }

  if (!reason || reason.trim().length < 10) {
    throw new ApiError(400, 'Override reason is required (minimum 10 characters)');
  }

  const application = await KYCApplication.findById(applicationId);
  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  const previousStatus = application.status;

  application.status = newStatus;
  application.reviewedBy = req.user._id;
  application.reviewedAt = new Date();
  application.reviewNotes = `MANUAL OVERRIDE: ${reason.trim()}`;

  if (newStatus === KYC_STATUS.APPROVED) {
    application.currentStep = KYC_STEPS.COMPLETED;
  }

  await application.save();

  await AuditLog.create({
    applicationId,
    performedBy: req.user._id,
    action: 'manual_override',
    entity: 'KYCApplication',
    entityId: applicationId,
    previousState: { status: previousStatus },
    newState: { status: newStatus },
    description: `MANUAL OVERRIDE by ${req.user.name}: ${previousStatus} → ${newStatus}. Reason: ${reason}`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json(
    new ApiResponse(200, 'Manual override applied', {
      applicationNo: application.applicationNo,
      previousStatus,
      newStatus: application.status,
      overriddenBy: req.user.name,
    })
  );
});

// ─── Get Dashboard Stats ──────────────────────────────────────────────────────
// GET /api/v1/admin/stats
// Overview numbers for the admin dashboard
export const getDashboardStats = asyncHandler(async (req, res) => {
  // Run all count queries in parallel for performance
  const [
    totalApplications,
    pendingReview,
    approved,
    rejected,
    draft,
    todaySubmissions,
    totalUsers,
  ] = await Promise.all([
    KYCApplication.countDocuments(),
    KYCApplication.countDocuments({ status: KYC_STATUS.UNDER_REVIEW }),
    KYCApplication.countDocuments({ status: KYC_STATUS.APPROVED }),
    KYCApplication.countDocuments({ status: KYC_STATUS.REJECTED }),
    KYCApplication.countDocuments({ status: KYC_STATUS.DRAFT }),
    KYCApplication.countDocuments({
      submittedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
    User.countDocuments({ role: 'applicant' }),
  ]);

  // Approval rate
  const reviewed = approved + rejected;
  const approvalRate = reviewed > 0 ? Math.round((approved / reviewed) * 100) : 0;

  // Last 7 days submission trend
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const submissionTrend = await KYCApplication.aggregate([
    { $match: { submittedAt: { $gte: sevenDaysAgo } } },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return res.status(200).json(
    new ApiResponse(200, 'Dashboard stats fetched', {
      overview: {
        totalApplications,
        pendingReview,
        approved,
        rejected,
        draft,
        todaySubmissions,
        totalUsers,
        approvalRate: `${approvalRate}%`,
      },
      submissionTrend,
    })
  );
});

// ─── Get All Users (Admin) ────────────────────────────────────────────────────
// GET /api/v1/admin/users
export const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, role, status, search } = req.query;

  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-passwordHash -refreshToken -failedLoginAttempts -lockedUntil')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, 'Users fetched', {
      users,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    })
  );
});

// ─── Update User Status (Admin) ───────────────────────────────────────────────
// PATCH /api/v1/admin/users/:userId/status
export const updateUserStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { status, reason } = req.body;

  const allowedStatuses = ['active', 'inactive', 'suspended'];
  if (!allowedStatuses.includes(status)) {
    throw new ApiError(400, `Status must be one of: ${allowedStatuses.join(', ')}`);
  }

  // Prevent admin from modifying superadmin accounts
  const targetUser = await User.findById(userId);
  if (!targetUser) {
    throw new ApiError(404, 'User not found');
  }

  if (targetUser.role === 'superadmin' && req.user.role !== 'superadmin') {
    throw new ApiError(403, 'Cannot modify superadmin accounts');
  }

  const previousStatus = targetUser.status;
  targetUser.status = status;
  await targetUser.save({ validateBeforeSave: false });

  await AuditLog.create({
    performedBy: req.user._id,
    action: 'status_changed',
    entity: 'User',
    entityId: userId,
    previousState: { status: previousStatus },
    newState: { status },
    description: `User ${targetUser.email} status changed to ${status} by ${req.user.name}. Reason: ${reason || 'N/A'}`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return res.status(200).json(
    new ApiResponse(200, 'User status updated', {
      userId,
      email: targetUser.email,
      previousStatus,
      newStatus: status,
    })
  );
});

// ─── Get Audit Logs ───────────────────────────────────────────────────────────
// GET /api/v1/admin/audit-logs
export const getAuditLogs = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    action,
    entity,
    applicationId,
    performedBy,
    from,
    to,
  } = req.query;

  const filter = {};
  if (action) filter.action = action;
  if (entity) filter.entity = entity;
  if (applicationId) filter.applicationId = applicationId;
  if (performedBy) filter.performedBy = performedBy;

  // Date range filter
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('performedBy', 'name email role')
      .populate('applicationId', 'applicationNo status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    AuditLog.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, 'Audit logs fetched', {
      logs,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    })
  );
});
