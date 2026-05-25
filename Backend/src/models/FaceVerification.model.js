import mongoose from 'mongoose';

const LIVENESS_METHODS = ['blink_detection', 'depth_analysis', 'motion_analysis', 'combined'];
const VERIFICATION_STATUS = ['pending', 'processing', 'passed', 'failed'];

const faceVerificationSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KYCApplication',
      required: [true, 'Application ID is required'],
      unique: true, // one-to-one with KYCApplication
      index: true,
    },
    // Selfie storage
    selfieS3Key: {
      type: String,
      trim: true,
      default: null,
    },
    selfieS3Url: {
      type: String,
      trim: true,
      default: null,
    },
    selfieMimeType: {
      type: String,
      enum: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'],
      default: null,
    },
    // Liveness check results (from FastAPI)
    liveness: {
      status: {
        type: String,
        enum: {
          values: VERIFICATION_STATUS,
          message: `Liveness status must be one of: ${VERIFICATION_STATUS.join(', ')}`,
        },
        default: 'pending',
      },
      pass: {
        type: Boolean,
        default: null,
      },
      score: {
        type: Number,
        min: [0, 'Liveness score cannot be negative'],
        max: [1, 'Liveness score cannot exceed 1'],
        default: null,
      },
      method: {
        type: String,
        enum: {
          values: LIVENESS_METHODS,
          message: `Liveness method must be one of: ${LIVENESS_METHODS.join(', ')}`,
        },
        default: null,
      },
      spoofingDetected: {
        type: Boolean,
        default: null,
      },
      failureReason: {
        type: String,
        trim: true,
        default: null,
      },
      rawResponse: {
        type: mongoose.Schema.Types.Mixed,
        select: false, // hidden from default queries
        default: null,
      },
    },
    // Face match results (from FastAPI)
    faceMatch: {
      status: {
        type: String,
        enum: {
          values: VERIFICATION_STATUS,
          message: `Face match status must be one of: ${VERIFICATION_STATUS.join(', ')}`,
        },
        default: 'pending',
      },
      pass: {
        type: Boolean,
        default: null,
      },
      score: {
        type: Number,
        min: [0, 'Face match score cannot be negative'],
        max: [1, 'Face match score cannot exceed 1'],
        default: null,
      },
      threshold: {
        type: Number,
        default: 0.75, // configurable threshold
      },
      matchedDocumentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
        default: null,
      },
      failureReason: {
        type: String,
        trim: true,
        default: null,
      },
      rawResponse: {
        type: mongoose.Schema.Types.Mixed,
        select: false,
        default: null,
      },
    },
    // Overall result
    overallStatus: {
      type: String,
      enum: {
        values: VERIFICATION_STATUS,
        message: `Overall status must be one of: ${VERIFICATION_STATUS.join(', ')}`,
      },
      default: 'pending',
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
      max: [3, 'Maximum 3 attempts allowed'],
    },
    processedAt: {
      type: Date,
      default: null,
    },
    fastApiVersion: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
faceVerificationSchema.index({ 'liveness.status': 1 });
faceVerificationSchema.index({ 'faceMatch.status': 1 });
faceVerificationSchema.index({ overallStatus: 1 });
faceVerificationSchema.index({ createdAt: -1 });

// Validate: overall status derived from liveness + faceMatch
faceVerificationSchema.pre('save', function (next) {
  if (
    this.liveness.pass !== null &&
    this.faceMatch.pass !== null
  ) {
    this.overallStatus =
      this.liveness.pass && this.faceMatch.pass ? 'passed' : 'failed';
    this.processedAt = new Date();
  }
  next();
});

const FaceVerification = mongoose.model('FaceVerification', faceVerificationSchema);
export default FaceVerification;
