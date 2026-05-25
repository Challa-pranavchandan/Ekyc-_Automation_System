import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const ROLES = ['applicant', 'admin', 'reviewer', 'superadmin'];
const STATUS = ['active', 'inactive', 'suspended', 'pending_verification'];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[1-9]\d{7,14}$/, 'Please provide a valid phone number'],
    },
    role: {
      type: String,
      enum: {
        values: ROLES,
        message: `Role must be one of: ${ROLES.join(', ')}`,
      },
      default: 'applicant',
    },
    status: {
      type: String,
      enum: {
        values: STATUS,
        message: `Status must be one of: ${STATUS.join(', ')}`,
      },
      default: 'active',
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    refreshToken: {
      type: String,
      default: null,
      select: false, // never returned in queries by default
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ createdAt: -1 });

// Virtual: full profile link to KYC applications
userSchema.virtual('kycApplications', {
  ref: 'KYCApplication',
  localField: '_id',
  foreignField: 'userId',
});

// Pre-save: hash password if modified
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  this.passwordChangedAt = Date.now();
});

// Pre-save: hash refresh token if modified
userSchema.pre('save', async function () {
  if (!this.isModified('refreshToken') || !this.refreshToken) return;
  this.refreshToken = await bcrypt.hash(this.refreshToken, 10);
});

// Instance method: compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Instance method: compare refresh token (bcrypt compare since it's hashed)
userSchema.methods.compareRefreshToken = async function (candidateToken) {
  return bcrypt.compare(candidateToken, this.refreshToken);
};

// Instance method: check if account is locked
userSchema.methods.isLocked = function () {
  return this.lockedUntil && this.lockedUntil > Date.now();
};

const User = mongoose.model('User', userSchema);
export default User;
