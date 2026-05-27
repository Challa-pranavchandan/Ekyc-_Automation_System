import { Router } from 'express';
import {
  registerWebhook,
  listWebhooks,
  getWebhookById,
  updateWebhook,
  deleteWebhook,
  rotateSecret,
  sendTestEvent,
  getDeliveryLogs,
  retryFailedEvent,
  triggerRetryQueue,
} from '../controllers/webhook.controller.js';
import { verifyJWT, authorizeRoles } from '../middlewares/auth.middleware.js';

const router = Router();

// ─── Internal cron route (no JWT — protected by cron secret header) ───────────
router.post('/process-retries', triggerRetryQueue);

// All other webhook routes require authentication + admin role
router.use(verifyJWT);
router.use(authorizeRoles('admin', 'superadmin'));

// ─── Webhook config management ────────────────────────────────────────────────
router.post('/', registerWebhook);
router.get('/', listWebhooks);
router.get('/:webhookId', getWebhookById);
router.patch('/:webhookId', updateWebhook);
router.delete('/:webhookId', deleteWebhook);

// ─── Secret management ────────────────────────────────────────────────────────
router.post('/:webhookId/rotate-secret', rotateSecret);

// ─── Testing ──────────────────────────────────────────────────────────────────
router.post('/:webhookId/test', sendTestEvent);

// ─── Delivery logs ────────────────────────────────────────────────────────────
router.get('/:webhookId/deliveries', getDeliveryLogs);

// ─── Manual retry ────────────────────────────────────────────────────────────
router.post('/events/:eventId/retry', retryFailedEvent);

export default router;
