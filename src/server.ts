import 'dotenv/config';
import app from './app';
import { connectDB } from './config/database';

const PORT = Number(process.env.PORT) || 3000;

/**
 * Entrypoint for the Crystal Agencies backend server.
 *
 * 1. Loads `.env` via the `dotenv/config` side-effect import at the top
 *    of this file (so every module below sees a populated `process.env`).
 * 2. Opens the MongoDB connection via {@link connectDB}. Only once the
 *    database is ready do we begin accepting HTTP traffic — that way a
 *    broken connection string or unavailable Mongo fails fast instead of
 *    serving requests that will all 500 later.
 * 3. Binds the Express `app` to `PORT` and logs a ready line.
 */
async function bootstrap(): Promise<void> {
  try {
    await connectDB();
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[SERVER] Failed to start server:', err);
    process.exitCode = 1;
    // Delay actual exit slightly so stderr flushes in all environments
    // (e.g. ts-node + docker + CI log collectors).
    setTimeout(() => process.exit(1), 50);
  }
}

bootstrap().catch(() => {
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 50);
});

