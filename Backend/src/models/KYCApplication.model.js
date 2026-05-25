import mongoose from 'mongoose';

const STATUS = [
  'draft',
  'document_pending',
  'document_uploaded',
  'face_pending',
  'face_verified',
  'under_review',
  'approved',
  'rejected',
  'expired',
];

const STEPS = [
  'personal_info',
  'document_upload',
  'face_verification',
  'review',
  'completed',
];

const kycApplicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    applicationNo: {
      type: String,
      unique: true,
      uppercase: true,
      // e.g. KYC-2024-00001
    },
    status: {
      type: String,
      enum: {
        values: STATUS,
        message: `Status must be one of: ${STATUS.join(', ')}`,
      },
      default: 'draft',
    },
    currentStep: {
      type: String,
      enum: {
        values: STEPS,
        message: `Step must be one of: ${STEPS.join(', ')}`,
      },
      default: 'personal_info',
    },
    // Personal info snapshot at submission time
    personalInfo: {
      fullName: { type: String, trim: true },
      dateOfBirth: { type: Date },
      gender: {
        type: String,
        enum: ['male', 'female', 'other', 'prefer_not_to_say'],
      },
      nationality: { type: String, trim: true },
      address: {
        line1: { type: String, trim: true },
        line2: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        pincode: {
          type: String,
          match: [/^\d{6}$/, 'Pincode must be 6 digits'],
        },
        country: { type: String, trim: true, default: 'India' },
      },
    },
    // Scores aggregated after all checks
    overallScore: {
      type: Number,
      min: [0, 'Score cannot be negative'],
      max: [100, 'Score cannot exceed 100'],
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
      default: null,
    },
    reviewNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Review notes cannot exceed 1000 characters'],
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
kycApplicationSchema.index({ userId: 1, status: 1 });
kycApplicationSchema.index({ applicationNo: 1 }, { unique: true, sparse: true });
kycApplicationSchema.index({ status: 1, createdAt: -1 });
kycApplicationSchema.index({ reviewedBy: 1 });
kycApplicationSchema.index({ submittedAt: -1 });

// Virtuals
kycApplicationSchema.virtual('documents', {
  ref: 'Document',
  localField: '_id',
  foreignField: 'applicationId',
});

kycApplicationSchema.virtual('faceVerification', {
  ref: 'FaceVerification',
  localField: '_id',
  foreignField: 'applicationId',
  justOne: true,
});

// Pre-save: auto-generate applicationNo
kycApplicationSchema.pre('save', async function () {
  if (this.applicationNo) return;
  const year = new Date().getFullYear();
  const count = await mongoose.model('KYCApplication').countDocuments();
  this.applicationNo = `KYC-${year}-${String(count + 1).padStart(5, '0')}`;
});

// Pre-save: set submittedAt when status moves past draft
kycApplicationSchema.pre('save', async function () {
  if (
    this.isModified('status') &&
    this.status !== 'draft' &&
    !this.submittedAt
  ) {
    this.submittedAt = new Date();
  }
});

const KYCApplication = mongoose.model('KYCApplication', kycApplicationSchema);
export default KYCApplication;
