import express from 'express';
import cors from 'cors';
import errorHandler from './middleware/errorHandler';

/**
 * Root Express application for the Crystal Agencies backend.
 *
 * The app intentionally mounts only the small, universal set of
 * middleware required for every request:
 *
 *   1. `cors()`             — cross-origin headers for browser clients
 *   2. `express.json()`     — parse JSON bodies (Content-Type: application/json)
 *   3. (future route mounts — added in upcoming commits)
 *   4. `errorHandler`       — the terminal "four-argument" Express error
 *                             middleware that normalises every failure into
 *                             the standard API response envelope.
 *
 * The app is exported separately from the HTTP server (see `server.ts`)
 * so that it can be mounted in tests with `supertest` without opening a
 * real network port.
 */
const app = express();

app.use(cors());
app.use(express.json());

// Future route mounts go here, e.g.:
//   app.use('/api/v1/auth', authRouter);
//   app.use('/api/v1/users', userRouter);
//   app.use('/api/v1/products', productRouter);

app.use(errorHandler);

export default app;
