import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import authRouter from './routes/authRoutes';
import userRouter from './routes/userRoutes';
import categoryRouter from './routes/categoryRoutes';
import brandRouter from './routes/brandRoutes';
import productRouter from './routes/productRoutes';
import inventoryRouter from './routes/inventoryRoutes';
import alertRouter from './routes/alertRoutes';
import relationshipRouter from './routes/relationshipRoutes';
import wishlistRouter from './routes/wishlistRoutes';
import cartRouter from './routes/cartRoutes';
import orderRouter from './routes/orderRoutes';
import rfqRouter from './routes/rfqRoutes';
import quotationRouter from './routes/quotationRoutes';
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
 *   4. Routes:   /api/v1/auth, /api/v1/users, /api/v1/categories, /api/v1/brands, /api/v1/products
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
app.use('/api/v1/categories', categoryRouter);
app.use('/api/v1/brands', brandRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/inventory', inventoryRouter);
app.use('/api/v1/alerts', alertRouter);
app.use('/api/v1/relationships', relationshipRouter);
app.use('/api/v1', relationshipRouter);
app.use('/api/v1/wishlist', wishlistRouter);
app.use('/api/v1/cart', cartRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/rfqs', rfqRouter);
app.use('/api/v1/quotations', quotationRouter);

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
