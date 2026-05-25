import { Router } from 'express';
import {
  createApplication,
  savePersonalInfo,
  getMyApplication,
  getApplicationById,
  getApplicationStatus,
  submitApplication,
  getAllApplications,
  getApplicationHistory,
} from '../controllers/kyc.controller.js';
import { verifyJWT, authorizeRoles } from '../middlewares/auth.middleware.js';

const router = Router();

// All KYC routes require authentication
router.use(verifyJWT);

// ─── Applicant routes ─────────────────────────────────────────────────────────
router.post('/', authorizeRoles('applicant'), createApplication);
router.get('/my-application', authorizeRoles('applicant'), getMyApplication);
router.put('/:applicationId/personal-info', authorizeRoles('applicant'), savePersonalInfo);
router.get('/:applicationId/status', authorizeRoles('applicant'), getApplicationStatus);
router.post('/:applicationId/submit', authorizeRoles('applicant'), submitApplication);

// ─── Shared routes (applicant sees own, admin/reviewer sees all) ──────────────
router.get('/:applicationId', getApplicationById);
router.get('/:applicationId/history', getApplicationHistory);

// ─── Admin / Reviewer routes ──────────────────────────────────────────────────
router.get('/', authorizeRoles('admin', 'reviewer', 'superadmin'), getAllApplications);

export default router;
