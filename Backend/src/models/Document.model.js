import mongoose from 'mongoose';

const DOCUMENT_TYPES = ['aadhaar', 'pan', 'passport', 'voter_id', 'driving_license'];
const VERIFICATION_STATUS = ['pending', 'processing', 'verified', 'failed', 'manual_review'];
const SIDES = ['front', 'back', 'single'];

const documentSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KYCApplication',
      required: [true, 'Application ID is required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Document type is required'],
      enum: {
        values: DOCUMENT_TYPES,
        message: `Document type must be one of: ${DOCUMENT_TYPES.join(', ')}`,
      },
    },
    side: {
      type: String,
      enum: {
        values: SIDES,
        message: `Side must be one of: ${SIDES.join(', ')}`,
      },
      default: 'single',
    },
    // S3 storage
    s3Key: {
      type: String,
      required: [true, 'S3 key is required'],
      trim: true,
    },
    s3Url: {
      type: String,
      required: [true, 'S3 URL is required'],
      trim: true,
    },
    mimeType: {
      type: String,
      enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      required: [true, 'MIME type is required'],
    },
    fileSizeBytes: {
      type: Number,
      min: [1, 'File size must be positive'],
      max: [10485760, 'File size cannot exceed 10MB'],
    },
    // OCR extracted fields
    extractedData: {
      name: { type: String, trim: true, default: null },
      dateOfBirth: { type: Date, default: null },
      idNumber: { type: String, trim: true, default: null },
      address: { type: String, trim: true, default: null },
      expiryDate: { type: Date, default: null },
      fatherName: { type: String, trim: true, default: null },
      gender: { type: String, trim: true, default: null },
      // Raw OCR full text (for debugging/audit)
      rawText: { type: String, select: false, default: null },
    },
    ocrConfidence: {
      type: Number,
      min: [0, 'OCR confidence cannot be negative'],
      max: [1, 'OCR confidence cannot exceed 1'],
      default: null,
    },
    verificationStatus: {
      type: String,
      enum: {
        values: VERIFICATION_STATUS,
        message: `Verification status must be one of: ${VERIFICATION_STATUS.join(', ')}`,
      },
      default: 'pending',
    },
    failureReason: {
      type: String,
      trim: true,
      default: null,
    },
    isEncrypted: {
      type: Boolean,
      default: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: one document type per application per side
documentSchema.index(
  { applicationId: 1, type: 1, side: 1 },
  { unique: true }
);
documentSchema.index({ verificationStatus: 1 });
documentSchema.index({ createdAt: -1 });

// Validate: passport requires front only; aadhaar requires front + back
documentSchema.pre('save', async function (next) {
  if (this.type === 'passport' && this.side === 'back') {
    return next(new Error('Passport does not have a back side'));
  }
  if (this.type === 'pan' && this.side === 'back') {
    return next(new Error('PAN card does not require a back side'));
  }
  next();
});

const Document = mongoose.model('Document', documentSchema);
export default Document;
