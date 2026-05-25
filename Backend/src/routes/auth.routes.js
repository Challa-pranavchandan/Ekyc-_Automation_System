import { Router } from 'express';
import {
  register,
  login,
  logout,
  refreshAccessToken,
  getMe,
  changePassword,
} from '../controllers/auth.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// ─── Public routes (no auth required) ────────────────────────────────────────
router.post('/register', register);
router.post('/login', login);
router.post('/refresh-token', refreshAccessToken);

// ─── Protected routes (JWT required) ─────────────────────────────────────────
router.post('/logout', verifyJWT, logout);
router.get('/me', verifyJWT, getMe);
router.post('/change-password', verifyJWT, changePassword);

export default router;
