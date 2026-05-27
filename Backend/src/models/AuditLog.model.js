import mongoose from 'mongoose';

const ACTIONS = [
  'created',
  'updated',
  'deleted',
  'status_changed',
  'document_uploaded',
  'document_verified',
  'face_verified',
  'approved',
  'rejected',
  'login',
  'logout',
  'password_changed',
  'webhook_triggered',
  'manual_override',
];

const ENTITIES = [
  'KYCApplication',
  'Document',
  'FaceVerification',
  'User',
  'WebhookEvent',
];

const auditLogSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KYCApplication',
      default: null,
      index: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Performed by (user ID) is required'],
      index: true,
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      enum: {
        values: ACTIONS,
        message: `Action must be one of: ${ACTIONS.join(', ')}`,
      },
    },
    entity: {
      type: String,
      required: [true, 'Entity name is required'],
      enum: {
        values: ENTITIES,
        message: `Entity must be one of: ${ENTITIES.join(', ')}`,
      },
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Entity ID is required'],
    },
    // State diff for compliance
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // Change summary (human-readable)
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: null,
    },
    // Request metadata
    ipAddress: {
      type: String,
      trim: true,
      match: [
        /^[0-9a-fA-F:.]+$/,
        'Invalid IP address format',
      ],

      default: null,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    requestId: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    // Audit logs are immutable — disable updates
  }
);

// Indexes for compliance queries
auditLogSchema.index({ applicationId: 1, createdAt: -1 });
auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// TTL index: auto-delete logs older than 7 years (compliance requirement)
auditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 365 * 7 }
);

// Prevent updates — audit logs must be immutable
auditLogSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function () {
  throw new Error('AuditLog documents are immutable and cannot be updated');
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
