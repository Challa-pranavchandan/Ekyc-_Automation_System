import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.headers?.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new ApiError(401, 'Unauthorized — no token provided');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Access token expired');
    }
    throw new ApiError(401, 'Invalid access token');
  }

  const user = await User.findById(decoded._id).select(
    '-passwordHash -failedLoginAttempts -lockedUntil'
  );

  if (!user) {
    throw new ApiError(401, 'User no longer exists');
  }

  if (user.status === 'suspended') {
    throw new ApiError(403, 'Account suspended — contact support');
  }

  if (user.status === 'inactive') {
    throw new ApiError(403, 'Account is inactive');
  }

  req.user = user;
  next();
});

// Role-based access control
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new ApiError(
        403,
        `Role '${req.user.role}' is not allowed to access this resource`
      );
    }
    next();
  };
};
