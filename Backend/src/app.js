import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

// Route imports
import userRoutes from './routes/user.routes.js';
import kycRoutes from './routes/kyc.routes.js';
import documentRoutes from './routes/document.routes.js';
import faceRoutes from './routes/face.routes.js';
import adminRoutes from './routes/admin.routes.js';
import webhookRoutes from './routes/webhook.routes.js';

const app = express();

// ─── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
}));

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));           // JSON body (base64 selfie needs 2mb)
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static('public'));
app.use(cookieParser());

// ─── Global rate limiter ──────────────────────────────────────────────────────
// Max 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests from this IP. Please try again after 15 minutes.',
    },
});
app.use('/api/', globalLimiter);

// Stricter limiter for auth routes (prevent brute force)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: {
        success: false,
        message: 'Too many login attempts. Please try again after 15 minutes.',
    },
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authLimiter, userRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/face', faceRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'eKYC API is running',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
    });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    console.error(`[ERROR] ${req.method} ${req.originalUrl} →`, err.message);

    return res.status(statusCode).json({
        success: false,
        message,
        errors: err.errors || [],
        // Only expose stack trace in development
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

export { app };
