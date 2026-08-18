import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import authRouter from './routes/authRoutes';
import userRouter from './routes/userRoutes';
import swaggerSpec from './config/swagger';
import errorHandler from './middleware/errorHandler';
import { ERROR_CODES, HTTP_STATUS } from './utils/constants';
import { sendResponse } from './utils/response';


/**
 * Root Express application for the Crystal Agencies backend.
 *
 * Middleware stack (in order):
 *   1. CORS pre-flight + headers
 *   2. JSON body parsing (`application/json`)
 *   3. Documentation: Swagger UI served at `/api-docs`, raw spec at `/api-docs.json`
 *   4. Routes:   /api/v1/auth, /api/v1/users
 *   5. 404 catch-all for anything not handled above (standard envelope)
 *   6. Terminal error-handling middleware that normalises every failure
 *      into the standard API response envelope.
 */
const app = express();

app.use(cors());
app.use(express.json());

// --- Documentation -----------------------------------------------------------
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// --- API routes --------------------------------------------------------------
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);

// --- 404 catch-all (must run BEFORE errorHandler) ---------------------------
app.use((req, res) => {
  return res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    data: null,
    message: `Cannot ${req.method} ${req.originalUrl}`,
    errorCode: ERROR_CODES.NOT_FOUND,
    errors: [],
    meta: null,
  });
});

// --- Terminal error middleware (must be registered last) ---------------------
app.use(errorHandler);

export default app;
