import { Router } from 'express';
import {
  uploadSelfie,
  runFaceVerification,
  getFaceVerificationResult,
} from '../controllers/face.controller.js';
import { verifyJWT, authorizeRoles } from '../middlewares/auth.middleware.js';

const router = Router();

// All face routes require authentication
router.use(verifyJWT);

// ─── Applicant routes ─────────────────────────────────────────────────────────

// Step 1: Upload selfie (base64 from camera)
router.post('/:applicationId/upload-selfie', authorizeRoles('applicant'), uploadSelfie);

// Step 2: Run liveness + face match against ID document
router.post('/:applicationId/verify', authorizeRoles('applicant'), runFaceVerification);

// Get results
router.get('/:applicationId/result', getFaceVerificationResult);

export default router;
