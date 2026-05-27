import { Router } from 'express';
import {
  getReviewQueue,
  getApplicationForReview,
  approveApplication,
  rejectApplication,
  manualOverride,
  getDashboardStats,
  getAllUsers,
  updateUserStatus,
  getAuditLogs,
} from '../controllers/admin.controller.js';
import { verifyJWT, authorizeRoles } from '../middlewares/auth.middleware.js';

const router = Router();

// All admin routes require authentication
router.use(verifyJWT);

// All admin routes require admin, reviewer, or superadmin role
// Individual routes further restrict where needed (e.g. superadmin only)
router.use(authorizeRoles('admin', 'reviewer', 'superadmin'));

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/stats', getDashboardStats);

// ─── Review Queue ─────────────────────────────────────────────────────────────
router.get('/review-queue', getReviewQueue);
router.get('/applications/:applicationId', getApplicationForReview);

// ─── Review Actions ───────────────────────────────────────────────────────────
router.post(
  '/applications/:applicationId/approve',
  authorizeRoles('admin', 'superadmin'), // reviewers can view but not approve
  approveApplication
);
router.post(
  '/applications/:applicationId/reject',
  authorizeRoles('admin', 'superadmin'),
  rejectApplication
);
router.post(
  '/applications/:applicationId/override',
  authorizeRoles('superadmin'), // only superadmin
  manualOverride
);

// ─── User Management ──────────────────────────────────────────────────────────
router.get('/users', authorizeRoles('admin', 'superadmin'), getAllUsers);
router.patch(
  '/users/:userId/status',
  authorizeRoles('admin', 'superadmin'),
  updateUserStatus
);

// ─── Audit Logs ───────────────────────────────────────────────────────────────
router.get('/audit-logs', getAuditLogs);

export default router;
