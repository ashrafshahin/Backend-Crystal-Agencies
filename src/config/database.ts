import mongoose from 'mongoose';

/**
 * Open a connection to the application MongoDB using Mongoose.
 *
 * The connection URI is read from the `MONGO_URI` environment variable.
 * A sensible development default is supplied so `npm run dev` works
 * immediately without configuration, but in non-development environments
 * callers must set `MONGO_URI` explicitly.
 *
 * @returns Resolves when the connection is ready. On failure the returned
 *          promise rejects (typically with a `MongooseError`) so callers
 *          can abort startup instead of running with a half-degraded DB.
 */
export async function connectDB(): Promise<void> {
  const defaultDevUri = 'mongodb://localhost:27017/crystal-agencies';
  const isDev = process.env.NODE_ENV !== 'production';
  // Accept both MONGODB_URI (the widely-used name, and what's in .env)
  // and MONGO_URI (the shorter alias some deployments set).
  const envUri = process.env.MONGODB_URI ?? process.env.MONGO_URI;
  const uri = envUri ?? (isDev ? defaultDevUri : undefined);

  if (!uri || uri.length === 0) {
    throw new Error(
      'MONGO_URI environment variable is required in non-development environments.',
    );
  }

  await mongoose.connect(uri);
  // eslint-disable-next-line no-console
  console.log(`[DATABASE] MongoDB connected successfully... — host=${mongoose.connection.host}`);
}
