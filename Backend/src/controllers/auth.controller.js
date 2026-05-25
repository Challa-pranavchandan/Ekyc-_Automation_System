import jwt from 'jsonwebtoken';
import { User, AuditLog } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  generateTokenPair,
  accessCookieOptions,
  refreshCookieOptions,
} from '../utils/jwt.utils.js';

// ─── Register ────────────────────────────────────────────────────────────────
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, 'Name, email and password are required');
  }

  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ApiError(409, 'Email is already registered');
  }

  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash: password, // pre-save hook hashes this
    phone: phone?.trim() || undefined,
    role: 'applicant',
  });

  const createdUser = await User.findById(user._id).select(
    '-passwordHash -failedLoginAttempts -lockedUntil -refreshToken'
  );

  await AuditLog.create({
    performedBy: user._id,
    action: 'created',
    entity: 'User',
    entityId: user._id,
    newState: { email: user.email, role: user.role },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    description: `New user registered: ${user.email}`,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, 'Registration successful', createdUser));
});

// ─── Login ────────────────────────────────────────────────────────────────────
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    '+passwordHash +failedLoginAttempts +lockedUntil'
  );

  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (user.isLocked()) {
    const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw new ApiError(423, `Account locked. Try again in ${minutesLeft} minute(s)`);
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    }
    await user.save({ validateBeforeSave: false });
    throw new ApiError(401, 'Invalid email or password');
  }

  if (user.status === 'suspended') {
    throw new ApiError(403, 'Account suspended — contact support');
  }

  // Reset failed attempts on successful login
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  // Generate token pair — keep raw refreshToken to send to client BEFORE hashing
  const { accessToken, refreshToken } = generateTokenPair(user);

  // Save refresh token — pre-save hook hashes it before storing
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  const loggedInUser = await User.findById(user._id).select(
    '-passwordHash -failedLoginAttempts -lockedUntil -refreshToken'
  );

  await AuditLog.create({
    performedBy: user._id,
    action: 'login',
    entity: 'User',
    entityId: user._id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    description: `User logged in: ${user.email}`,
  });

  return res
    .status(200)
    .cookie('accessToken', accessToken, accessCookieOptions)
    .cookie('refreshToken', refreshToken, refreshCookieOptions) // raw token sent to client
    .json(
      new ApiResponse(200, 'Login successful', {
        user: loggedInUser,
        accessToken, // raw token sent to client
      })
    );
});

// ─── Logout ───────────────────────────────────────────────────────────────────
export const logout = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    { $unset: { refreshToken: 1 } },
    { new: true }
  );

  await AuditLog.create({
    performedBy: req.user._id,
    action: 'logout',
    entity: 'User',
    entityId: req.user._id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    description: `User logged out: ${req.user.email}`,
  });

  return res
    .status(200)
    .clearCookie('accessToken', accessCookieOptions)
    .clearCookie('refreshToken', refreshCookieOptions)
    .json(new ApiResponse(200, 'Logged out successfully', null));
});

// ─── Refresh Access Token ─────────────────────────────────────────────────────
export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, 'Refresh token is required');
  }

  let decoded;
  try {
    decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  // Fetch user with hashed refreshToken from DB
  const user = await User.findById(decoded._id).select('+refreshToken');

  if (!user || !user.refreshToken) {
    throw new ApiError(401, 'Refresh token not found — please login again');
  }

  // bcrypt.compare: incoming raw token vs hashed token in DB
  const isTokenValid = await user.compareRefreshToken(incomingRefreshToken);

  if (!isTokenValid) {
    throw new ApiError(401, 'Refresh token mismatch — please login again');
  }

  // Generate new pair — rotate refresh token on every use
  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user);

  // Save new refresh token — pre-save hook hashes before storing
  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .cookie('accessToken', accessToken, accessCookieOptions)
    .cookie('refreshToken', newRefreshToken, refreshCookieOptions)
    .json(new ApiResponse(200, 'Token refreshed', { accessToken }));
});

// ─── Get Current User ─────────────────────────────────────────────────────────
export const getMe = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, 'User fetched successfully', req.user));
});

// ─── Change Password ──────────────────────────────────────────────────────────
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current password and new password are required');
  }

  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters');
  }

  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different from current password');
  }

  const user = await User.findById(req.user._id).select('+passwordHash');

  const isValid = await user.comparePassword(currentPassword);
  if (!isValid) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  // Invalidate all sessions by clearing refresh token
  user.passwordHash = newPassword; // pre-save hook hashes it
  user.refreshToken = null;
  await user.save();

  await AuditLog.create({
    performedBy: req.user._id,
    action: 'password_changed',
    entity: 'User',
    entityId: req.user._id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    description: `Password changed for: ${req.user.email}`,
  });

  return res
    .status(200)
    .clearCookie('accessToken', accessCookieOptions)
    .clearCookie('refreshToken', refreshCookieOptions)
    .json(new ApiResponse(200, 'Password changed successfully — please login again', null));
});
