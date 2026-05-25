import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import userRoutes from './routes/user.routes.js';
import kycRoutes from './routes/kyc.routes.js';

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { success: false, message: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static('public'));

app.use(cookieParser());

app.use('/api/v1/users', userRoutes);
app.use('/api/v1/kyc', kycRoutes);
/* app.use('/api/v1/kyc', kycRoutes);        ← next
// app.use('/api/v1/documents', documentRoutes);    
// app.use('/api/v1/face', faceRoutes);
// app.use('/api/v1/admin', adminRoutes);
// app.use('/api/v1/webhooks', webhookRoutes);*/

app.use((err, req, res, next) => {
    console.error("EXPRESS ERROR:", err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message, stack: err.stack });
});

export { app };