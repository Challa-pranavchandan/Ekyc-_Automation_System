import crypto from 'crypto';
import axios from 'axios';
import { WebhookEvent } from '../models/index.js';
import WebhookConfig from '../models/WebhookConfig.model.js';

// ─── HMAC Signature ───────────────────────────────────────────────────────────
// Signs the payload with the webhook secret using HMAC-SHA256
// Third-party receiver can verify:
//   const expected = HMAC-SHA256(secret, rawBody)
//   if expected === X-eKYC-Signature → payload is authentic
export const generateSignature = (secret, payload) => {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(typeof payload === 'string' ? payload : JSON.stringify(payload));
  return `sha256=${hmac.digest('hex')}`;
};

// ─── Verify Signature (for inbound webhook verification) ─────────────────────
export const verifySignature = (secret, payload, signature) => {
  const expected = generateSignature(secret, payload);
  // Use timingSafeEqual to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
};

// ─── Build Standard Payload ───────────────────────────────────────────────────
// All webhook payloads follow this structure for consistency
export const buildPayload = (eventType, application, additionalData = {}) => {
  return {
    event: eventType,
    timestamp: new Date().toISOString(),
    version: '1.0',
    data: {
      applicationId: application._id,
      applicationNo: application.applicationNo,
      status: application.status,
      userId: application.userId,
      submittedAt: application.submittedAt,
      reviewedAt: application.reviewedAt,
      overallScore: application.overallScore,
      ...additionalData,
    },
  };
};

// ─── Exponential Backoff Calculator ──────────────────────────────────────────
// Retry delays: 1min → 5min → 30min → 2hr → 8hr
const BACKOFF_MINUTES = [1, 5, 30, 120, 480];

export const getNextRetryAt = (retryCount) => {
  const delayMinutes = BACKOFF_MINUTES[retryCount] || 480;
  return new Date(Date.now() + delayMinutes * 60 * 1000);
};

// ─── Single HTTP Dispatch ─────────────────────────────────────────────────────
// Sends one webhook event to one target URL
// Returns { success, httpStatus, responseBody, errorMessage }
export const dispatchWebhook = async (webhookEvent, webhookConfig) => {
  const payloadString = JSON.stringify(webhookEvent.payload);
  const signature = generateSignature(webhookConfig.secret, payloadString);

  try {
    const response = await axios.post(
      webhookEvent.targetUrl,
      webhookEvent.payload,
      {
        timeout: 10000, // 10 second timeout
        headers: {
          'Content-Type': 'application/json',
          'X-eKYC-Signature': signature,           // HMAC signature
          'X-eKYC-Event': webhookEvent.eventType,  // event name
          'X-eKYC-Delivery': webhookEvent._id.toString(), // unique delivery ID
          'X-eKYC-Version': '1.0',
          'User-Agent': 'eKYC-Webhook/1.0',
        },
      }
    );

    return {
      success: response.status >= 200 && response.status < 300,
      httpStatus: response.status,
      responseBody: JSON.stringify(response.data).slice(0, 500), // truncate to 500 chars
      errorMessage: null,
    };
  } catch (error) {
    const httpStatus = error.response?.status || null;
    return {
      success: false,
      httpStatus,
      responseBody: error.response?.data
        ? JSON.stringify(error.response.data).slice(0, 500)
        : null,
      errorMessage: error.message,
    };
  }
};

// ─── Dispatch to All Subscribers ─────────────────────────────────────────────
// Called whenever a KYC status changes
// Finds all active webhook configs subscribed to this event
// Creates WebhookEvent docs and dispatches them
export const dispatchToAllSubscribers = async (eventType, application, additionalData = {}) => {
  try {
    // Find all active configs subscribed to this event or wildcard
    const configs = await WebhookConfig.find({
      isActive: true,
      subscribedEvents: { $in: [eventType, '*'] },
    }).select('+secret');

    if (configs.length === 0) return;

    const payload = buildPayload(eventType, application, additionalData);

    // Create and dispatch webhook events for each subscriber
    const dispatches = configs.map(async (config) => {
      // Create WebhookEvent record
      const webhookEvent = await WebhookEvent.create({
        applicationId: application._id,
        eventType,
        targetUrl: config.targetUrl,
        payload,
        status: 'pending',
        signatureHeader: generateSignature(config.secret, JSON.stringify(payload)),
      });

      // Attempt immediate dispatch
      const result = await dispatchWebhook(webhookEvent, config);

      if (result.success) {
        // Delivered successfully
        await WebhookEvent.findByIdAndUpdate(webhookEvent._id, {
          status: 'delivered',
          httpStatus: result.httpStatus,
          responseBody: result.responseBody,
          deliveredAt: new Date(),
          lastAttemptAt: new Date(),
        });

        // Update config stats
        await WebhookConfig.findByIdAndUpdate(config._id, {
          $inc: { totalDelivered: 1 },
          lastDeliveredAt: new Date(),
        });

        console.log(`[Webhook] ✅ Delivered ${eventType} to ${config.targetUrl}`);
      } else {
        // Failed — schedule for retry
        await WebhookEvent.findByIdAndUpdate(webhookEvent._id, {
          status: 'retrying',
          httpStatus: result.httpStatus,
          responseBody: result.responseBody,
          errorMessage: result.errorMessage,
          retryCount: 1,
          nextRetryAt: getNextRetryAt(0),
          lastAttemptAt: new Date(),
        });

        // Update config stats
        await WebhookConfig.findByIdAndUpdate(config._id, {
          $inc: { totalFailed: 1 },
          lastFailedAt: new Date(),
        });

        console.log(`[Webhook] ❌ Failed ${eventType} to ${config.targetUrl} — scheduled retry`);
      }
    });

    await Promise.allSettled(dispatches);
  } catch (error) {
    // Non-critical — webhook failure should never crash main flow
    console.error('[Webhook] dispatchToAllSubscribers error:', error.message);
  }
};

// ─── Retry Worker ─────────────────────────────────────────────────────────────
// Called by a cron job / setInterval every minute
// Picks up failed events that are due for retry
export const processRetryQueue = async () => {
  const now = new Date();

  // Find all events due for retry
  const dueEvents = await WebhookEvent.find({
    status: 'retrying',
    nextRetryAt: { $lte: now },
    retryCount: { $lt: 5 },
  }).limit(50); // process 50 at a time

  if (dueEvents.length === 0) return;

  console.log(`[Webhook] Processing ${dueEvents.length} retry event(s)...`);

  for (const event of dueEvents) {
    // Find the config for this URL to get the secret
    const config = await WebhookConfig.findOne({
      targetUrl: event.targetUrl,
      isActive: true,
    }).select('+secret');

    if (!config) {
      // Config was deleted or deactivated — cancel this event
      await WebhookEvent.findByIdAndUpdate(event._id, { status: 'cancelled' });
      continue;
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

      await WebhookConfig.findByIdAndUpdate(config._id, {
        $inc: { totalDelivered: 1 },
        lastDeliveredAt: new Date(),
      });

      console.log(`[Webhook] ✅ Retry delivered to ${event.targetUrl}`);
    } else {
      const newRetryCount = event.retryCount + 1;

      if (newRetryCount >= 5) {
        // Max retries reached — mark as permanently failed
        await WebhookEvent.findByIdAndUpdate(event._id, {
          status: 'failed',
          httpStatus: result.httpStatus,
          errorMessage: result.errorMessage,
          retryCount: newRetryCount,
          lastAttemptAt: new Date(),
          nextRetryAt: null,
        });

        await WebhookConfig.findByIdAndUpdate(config._id, {
          $inc: { totalFailed: 1 },
          lastFailedAt: new Date(),
        });

        console.log(`[Webhook] ❌ Max retries reached for ${event.targetUrl}`);
      } else {
        // Schedule next retry with exponential backoff
        await WebhookEvent.findByIdAndUpdate(event._id, {
          status: 'retrying',
          httpStatus: result.httpStatus,
          errorMessage: result.errorMessage,
          retryCount: newRetryCount,
          nextRetryAt: getNextRetryAt(newRetryCount),
          lastAttemptAt: new Date(),
        });

        console.log(`[Webhook] 🔄 Retry ${newRetryCount}/5 failed for ${event.targetUrl} — rescheduled`);
      }
    }
  }
};
