import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.routes.js';

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));


app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static('public'));

app.use(cookieParser());

app.use('/api/v1/auth', authRoutes);

app.use((err, req, res, next) => {
    console.error("EXPRESS ERROR:", err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message, stack: err.stack });
});

export { app };