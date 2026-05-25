import jwt from 'jsonwebtoken';

export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      email: user.email,
      role: user.role,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
  );
};

export const generateRefreshToken = (user) => {
  return jwt.sign(
    { _id: user._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
  );
};

export const generateTokenPair = (user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  return { accessToken, refreshToken };
};

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
};

export const accessCookieOptions = {
  ...cookieOptions,
  maxAge: 15 * 60 * 1000, // 15 minutes
};

export const refreshCookieOptions = {
  ...cookieOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};
