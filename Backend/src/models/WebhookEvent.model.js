import mongoose from 'mongoose';

const EVENT_TYPES = [
  'kyc.submitted',
  'kyc.document_verified',
  'kyc.face_verified',
  'kyc.approved',
  'kyc.rejected',
  'kyc.expired',
  'kyc.under_review',
];

const STATUS = ['pending', 'delivered', 'failed', 'retrying', 'cancelled'];

const webhookEventSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KYCApplication',
      required: [true, 'Application ID is required'],
      index: true,
    },
    eventType: {
      type: String,
      required: [true, 'Event type is required'],
      enum: {
        values: EVENT_TYPES,
        message: `Event type must be one of: ${EVENT_TYPES.join(', ')}`,
      },
    },
    targetUrl: {
      type: String,
      required: [true, 'Target URL is required'],
      trim: true,
      match: [/^https?:\/\/.+/, 'Target URL must be a valid HTTP/HTTPS URL'],
    },
    status: {
      type: String,
      enum: {
        values: STATUS,
        message: `Status must be one of: ${STATUS.join(', ')}`,
      },
      default: 'pending',
    },
    // HTTP response from the third-party endpoint
    httpStatus: {
      type: Number,
      min: 100,
      max: 599,
      default: null,
    },
    responseBody: {
      type: String,
      maxlength: [2000, 'Response body cannot exceed 2000 characters'],
      default: null,
    },
    // Retry logic
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
      max: [5, 'Maximum 5 retries allowed'],
    },
    maxRetries: {
      type: Number,
      default: 5,
    },
    nextRetryAt: {
      type: Date,
      default: null,
      index: true, // queried by the retry job scheduler
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    // Payload sent to third-party
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Payload is required'],
    },
    // HMAC signature header sent with the request
    signatureHeader: {
      type: String,
      trim: true,
      default: null,
      select: false, // sensitive — hidden from default queries
    },
    // Error details
    errorMessage: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
webhookEventSchema.index({ applicationId: 1, eventType: 1 });
webhookEventSchema.index({ status: 1, nextRetryAt: 1 }); // for retry job
webhookEventSchema.index({ createdAt: -1 });

// TTL: auto-delete delivered webhooks after 90 days
webhookEventSchema.index(
  { deliveredAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90, sparse: true }
);

// Pre-save: calculate next retry using exponential backoff
webhookEventSchema.pre('save', function (next) {
  if (this.isModified('retryCount') && this.status === 'retrying') {
    // Backoff: 1min, 5min, 30min, 2hr, 8hr
    const backoffMinutes = [1, 5, 30, 120, 480];
    const delayMinutes = backoffMinutes[this.retryCount - 1] || 480;
    this.nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    this.lastAttemptAt = new Date();
  }
  if (this.isModified('status') && this.status === 'delivered') {
    this.deliveredAt = new Date();
    this.nextRetryAt = null;
  }
  next();
});

const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
export default WebhookEvent;
