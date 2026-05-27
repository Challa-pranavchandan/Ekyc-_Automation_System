import mongoose from 'mongoose';
import crypto from 'crypto';

const WEBHOOK_EVENTS = [
  'kyc.submitted',
  'kyc.document_verified',
  'kyc.face_verified',
  'kyc.approved',
  'kyc.rejected',
  'kyc.expired',
  'kyc.under_review',
  '*', // wildcard — receives all events
];

const webhookConfigSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Webhook name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    targetUrl: {
      type: String,
      required: [true, 'Target URL is required'],
      trim: true,
      match: [/^https:\/\/.+/, 'Target URL must be a valid HTTPS URL'], // HTTPS only in production
    },
    // HMAC secret — used to sign payloads so receiver can verify authenticity
    // Generated automatically on creation, never exposed after that
    secret: {
      type: String,
      default: () => crypto.randomBytes(32).toString('hex'),
      select: false, // never returned in queries
    },
    // Which events this webhook listens to
    subscribedEvents: {
      type: [String],
      enum: {
        values: WEBHOOK_EVENTS,
        message: `Event must be one of: ${WEBHOOK_EVENTS.join(', ')}`,
      },
      default: ['*'],
      validate: {
        validator: (arr) => arr.length > 0,
        message: 'At least one event must be subscribed',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Metadata
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Stats
    totalDelivered: { type: Number, default: 0 },
    totalFailed: { type: Number, default: 0 },
    lastDeliveredAt: { type: Date, default: null },
    lastFailedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes
webhookConfigSchema.index({ isActive: 1 });
webhookConfigSchema.index({ subscribedEvents: 1 });
webhookConfigSchema.index({ createdBy: 1 });


const WebhookConfig = mongoose.model('WebhookConfig', webhookConfigSchema);
export default WebhookConfig;
