import crypto from 'crypto';
import { WebhookEvent } from '../models/index.js';
import WebhookConfig from '../models/WebhookConfig.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  dispatchWebhook,
  buildPayload,
  generateSignature,
  processRetryQueue,
} from '../utils/webhook.utils.js';

// ─── Register Webhook ─────────────────────────────────────────────────────────
// POST /api/v1/webhooks
export const registerWebhook = asyncHandler(async (req, res) => {
  const { name, targetUrl, subscribedEvents, description } = req.body;

  if (!name || !targetUrl) {
    throw new ApiError(400, 'Name and target URL are required');
  }

  // Enforce HTTPS in production
  if (
    process.env.NODE_ENV === 'production' &&
    !targetUrl.startsWith('https://')
  ) {
    throw new ApiError(400, 'Target URL must use HTTPS in production');
  }

  // Prevent duplicate URLs
  const existing = await WebhookConfig.findOne({ targetUrl, isActive: true });
  if (existing) {
    throw new ApiError(409, 'A webhook with this URL already exists');
  }

  const config = await WebhookConfig.create({
    name: name.trim(),
    targetUrl: targetUrl.trim(),
    subscribedEvents: subscribedEvents || ['*'],
    description: description?.trim(),
    createdBy: req.user._id,
  });

  // Fetch with secret for one-time display
  const configWithSecret = await WebhookConfig.findById(config._id).select('+secret');

  return res.status(201).json(
    new ApiResponse(201, 'Webhook registered successfully', {
      id: config._id,
      name: config.name,
      targetUrl: config.targetUrl,
      subscribedEvents: config.subscribedEvents,
      // Show secret ONCE at creation — never returned again
      secret: configWithSecret.secret,
      createdAt: config.createdAt,
      warning: 'Store this secret securely — it will not be shown again',
    })
  );
});

// ─── List Webhooks ────────────────────────────────────────────────────────────
// GET /api/v1/webhooks
export const listWebhooks = asyncHandler(async (req, res) => {
  const configs = await WebhookConfig.find()
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  // Never return secrets in list
  return res.status(200).json(
    new ApiResponse(200, 'Webhooks fetched', configs)
  );
});

// ─── Get Webhook By ID ────────────────────────────────────────────────────────
// GET /api/v1/webhooks/:webhookId
export const getWebhookById = asyncHandler(async (req, res) => {
  const config = await WebhookConfig.findById(req.params.webhookId)
    .populate('createdBy', 'name email');

  if (!config) {
    throw new ApiError(404, 'Webhook not found');
  }

  return res.status(200).json(
    new ApiResponse(200, 'Webhook fetched', config)
  );
});

// ─── Update Webhook ───────────────────────────────────────────────────────────
// PATCH /api/v1/webhooks/:webhookId
export const updateWebhook = asyncHandler(async (req, res) => {
  const { name, subscribedEvents, description, isActive } = req.body;

  const config = await WebhookConfig.findById(req.params.webhookId);
  if (!config) {
    throw new ApiError(404, 'Webhook not found');
  }

  // Only update provided fields
  if (name) config.name = name.trim();
  if (subscribedEvents) config.subscribedEvents = subscribedEvents;
  if (description !== undefined) config.description = description?.trim();
  if (isActive !== undefined) config.isActive = isActive;

  await config.save();

  return res.status(200).json(
    new ApiResponse(200, 'Webhook updated', config)
  );
});

// ─── Delete Webhook ───────────────────────────────────────────────────────────
// DELETE /api/v1/webhooks/:webhookId
export const deleteWebhook = asyncHandler(async (req, res) => {
  const config = await WebhookConfig.findById(req.params.webhookId);
  if (!config) {
    throw new ApiError(404, 'Webhook not found');
  }

  // Soft delete — deactivate instead of removing
  // Keeps historical delivery records intact
  config.isActive = false;
  await config.save();

  return res.status(200).json(
    new ApiResponse(200, 'Webhook deactivated successfully', {
      id: config._id,
      name: config.name,
    })
  );
});

// ─── Rotate Secret ────────────────────────────────────────────────────────────
// POST /api/v1/webhooks/:webhookId/rotate-secret
// Generates a new HMAC secret — old one is immediately invalidated
export const rotateSecret = asyncHandler(async (req, res) => {
  const config = await WebhookConfig.findById(req.params.webhookId).select('+secret');
  if (!config) {
    throw new ApiError(404, 'Webhook not found');
  }

  // Generate new 256-bit secret
  const newSecret = crypto.randomBytes(32).toString('hex');
  config.secret = newSecret;
  await config.save({ validateBeforeSave: false });

  return res.status(200).json(
    new ApiResponse(200, 'Secret rotated successfully', {
      id: config._id,
      secret: newSecret,
      warning: 'Update your receiver immediately — old secret is now invalid',
    })
  );
});

// ─── Send Test Event ──────────────────────────────────────────────────────────
// POST /api/v1/webhooks/:webhookId/test
// Sends a test ping to verify the endpoint is reachable
export const sendTestEvent = asyncHandler(async (req, res) => {
  const config = await WebhookConfig.findById(req.params.webhookId).select('+secret');
  if (!config) {
    throw new ApiError(404, 'Webhook not found');
  }

  if (!config.isActive) {
    throw new ApiError(400, 'Webhook is inactive');
  }

  // Build a test payload
  const testPayload = {
    event: 'webhook.test',
    timestamp: new Date().toISOString(),
    version: '1.0',
    data: {
      message: 'This is a test event from eKYC system',
      webhookId: config._id,
      webhookName: config.name,
    },
  };

  // Create a temporary WebhookEvent for dispatch
  const testEvent = {
    _id: crypto.randomBytes(12).toString('hex'),
    payload: testPayload,
    targetUrl: config.targetUrl,
    eventType: 'webhook.test',
  };

  const result = await dispatchWebhook(testEvent, config);

  return res.status(200).json(
    new ApiResponse(
      200,
      result.success ? 'Test event delivered successfully' : 'Test event failed',
      {
        success: result.success,
        httpStatus: result.httpStatus,
        responseBody: result.responseBody,
        errorMessage: result.errorMessage,
        targetUrl: config.targetUrl,
      }
    )
  );
});

// ─── Get Delivery Logs ────────────────────────────────────────────────────────
// GET /api/v1/webhooks/:webhookId/deliveries
// Shows delivery history for a specific webhook
export const getDeliveryLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;

  const config = await WebhookConfig.findById(req.params.webhookId);
  if (!config) {
    throw new ApiError(404, 'Webhook not found');
  }

  const filter = { targetUrl: config.targetUrl };
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [events, total] = await Promise.all([
    WebhookEvent.find(filter)
      .select('-signatureHeader -payload') // exclude sensitive fields
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    WebhookEvent.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, 'Delivery logs fetched', {
      events,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    })
  );
});

// ─── Manually Retry Failed Event ─────────────────────────────────────────────
// POST /api/v1/webhooks/events/:eventId/retry
export const retryFailedEvent = asyncHandler(async (req, res) => {
  const event = await WebhookEvent.findById(req.params.eventId);
  if (!event) {
    throw new ApiError(404, 'Webhook event not found');
  }

  if (!['failed', 'retrying'].includes(event.status)) {
    throw new ApiError(400, `Cannot retry event with status: ${event.status}`);
  }

  const config = await WebhookConfig.findOne({
    targetUrl: event.targetUrl,
    isActive: true,
  }).select('+secret');

  if (!config) {
    throw new ApiError(404, 'No active webhook config found for this URL');
  }

  const result = await dispatchWebhook(event, config);

  if (result.success) {
    await WebhookEvent.findByIdAndUpdate(event._id, {
      status: 'delivered',
      httpStatus: result.httpStatus,
      responseBody: result.responseBody,
      deliveredAt: new Date(),
      lastAttemptAt: new Date(),
    });
  } else {
    await WebhookEvent.findByIdAndUpdate(event._id, {
      status: 'failed',
      httpStatus: result.httpStatus,
      errorMessage: result.errorMessage,
      lastAttemptAt: new Date(),
    });
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      result.success ? 'Event retried successfully' : 'Retry failed',
      {
        success: result.success,
        httpStatus: result.httpStatus,
        errorMessage: result.errorMessage,
      }
    )
  );
});

// ─── Process Retry Queue (internal cron trigger) ──────────────────────────────
// POST /api/v1/webhooks/process-retries
// Called by a cron job every minute
export const triggerRetryQueue = asyncHandler(async (req, res) => {
  // Validate internal cron secret to prevent unauthorized access
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    throw new ApiError(401, 'Unauthorized');
  }

  await processRetryQueue();

  return res.status(200).json(
    new ApiResponse(200, 'Retry queue processed', null)
  );
});
