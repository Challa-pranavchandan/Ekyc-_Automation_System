import { Router } from 'express';
import {
  uploadDocument,
  getDocuments,
  getOCRResult,
  deleteDocument,
  reprocessOCR,
} from '../controllers/document.controller.js';
import { verifyJWT, authorizeRoles } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = Router();

// All document routes require authentication
router.use(verifyJWT);

// ─── Applicant routes ─────────────────────────────────────────────────────────
router.post(
  '/:applicationId/upload',
  authorizeRoles('applicant'),
  upload.single('document'),   // multer picks up 'document' field from form-data
  uploadDocument
);

router.get('/:applicationId', getDocuments);
router.get('/:applicationId/:documentId/ocr', authorizeRoles('applicant'), getOCRResult);
router.delete('/:applicationId/:documentId', authorizeRoles('applicant'), deleteDocument);

// ─── Admin routes ─────────────────────────────────────────────────────────────
router.post(
  '/:applicationId/:documentId/reprocess',
  authorizeRoles('admin', 'reviewer', 'superadmin'),
  reprocessOCR
);

export default router;
