import dotenv from 'dotenv';
import connectDB from './db/index.js';
import { app } from './app.js';
import { processRetryQueue } from './utils/webhook.utils.js';

dotenv.config({ path: './.env' });

const PORT = process.env.PORT || 8000;

connectDB()
    .then(() => {
        const server = app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);

        });

        // ─── Webhook retry queue ─────────────────────────────────────────────────
        // Runs every 60 seconds — picks up failed webhook events and retries them
        // using exponential backoff (1m → 5m → 30m → 2h → 8h)
        const retryInterval = setInterval(async () => {
            try {
                await processRetryQueue();
            } catch (err) {
                console.error('[RetryQueue] Error:', err.message);
            }
        }, 60 * 1000); // every 60 seconds

        // ─── Graceful shutdown ───────────────────────────────────────────────────
        // Cleans up open connections when the process is terminated
        const shutdown = (signal) => {
            console.log(`\n${signal} received — shutting down gracefully...`);
            clearInterval(retryInterval);
            server.close(() => {
                console.log('✅ HTTP server closed');
                process.exit(0);
            });
            // Force exit after 10 seconds if graceful shutdown hangs
            setTimeout(() => process.exit(1), 10000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // ─── Unhandled rejections ────────────────────────────────────────────────
        process.on('unhandledRejection', (err) => {
            console.error('UNHANDLED REJECTION:', err.message);
            server.close(() => process.exit(1));
        });

        process.on('uncaughtException', (err) => {
            console.error('UNCAUGHT EXCEPTION:', err.message);
            process.exit(1);
        });
    })
    .catch((error) => {
        console.error('❌ Failed to connect to DB:', error);
        process.exit(1);
    });
