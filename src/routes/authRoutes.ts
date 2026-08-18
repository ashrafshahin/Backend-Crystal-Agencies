import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  register,
  login,
  verifyEmail,
  forgotPassword,
  resetPassword,
  refreshToken,
  getProfile,
  updateProfile,
} from '../controllers/authController';

const authRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication, registration, profile and password flows
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterBody:
 *       type: object
 *       required: [name, email, password]
 *       properties:
 *         name: { type: string, example: "Alice Smith" }
 *         email: { type: string, format: email, example: "alice@example.com" }
 *         password: { type: string, minLength: 8, example: "s3cretP@ss" }
 *     LoginBody:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email: { type: string, format: email }
 *         password: { type: string }
 *     VerifyEmailBody:
 *       type: object
 *       required: [token]
 *       properties:
 *         token: { type: string }
 *     ForgotPasswordBody:
 *       type: object
 *       required: [email]
 *       properties:
 *         email: { type: string, format: email }
 *     ResetPasswordBody:
 *       type: object
 *       required: [token, password]
 *       properties:
 *         token: { type: string }
 *         password: { type: string, minLength: 8 }
 *     RefreshTokenBody:
 *       type: object
 *       required: [refreshToken]
 *       properties:
 *         refreshToken: { type: string }
 *     UpdateProfileBody:
 *       type: object
 *       properties:
 *         name: { type: string }
 *         phone: { type: string, nullable: true }
 *     AuthPayload:
 *       type: object
 *       properties:
 *         user: { $ref: '#/components/schemas/User' }
 *         accessToken: { type: string }
 *         refreshToken: { type: string }
 *     User:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         name: { type: string }
 *         email: { type: string, format: email }
 *         phone: { type: string, nullable: true }
 *         role:   { $ref: '#/components/schemas/Role' }
 *         isVerified: { type: boolean }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     Role:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         name: { type: string }
 *         description: { type: string, nullable: true }
 *         permissions: { type: array, items: { type: string } }
 *         isSystem: { type: boolean }
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new customer user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RegisterBody' }
 *     responses:
 *       201: { description: User created, returns user + tokens }
 *       400: { description: Validation failure or duplicate email }
 */
authRouter.post('/register', register);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate and obtain a token pair
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginBody' }
 *     responses:
 *       200: { description: Login succeeded }
 *       401: { description: Invalid credentials or email not verified }
 */
authRouter.post('/login', login);

/**
 * @swagger
 * /api/v1/auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify a user's email with the issued verification token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/VerifyEmailBody' }
 *     responses:
 *       200: { description: Email verified }
 *       400: { description: Invalid / missing token }
 */
authRouter.post('/verify-email', verifyEmail);

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Trigger a password reset email for a registered address
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ForgotPasswordBody' }
 *     responses:
 *       200: { description: Confirmation message (same whether email exists or not) }
 */
authRouter.post('/forgot-password', forgotPassword);

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Complete password reset using a reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ResetPasswordBody' }
 *     responses:
 *       200: { description: Password updated }
 *       400: { description: Invalid / expired token }
 */
authRouter.post('/reset-password', resetPassword);

/**
 * @swagger
 * /api/v1/auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange a valid refresh token for a new access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RefreshTokenBody' }
 *     responses:
 *       200: { description: New access token issued }
 *       401: { description: Invalid or expired refresh token }
 */
authRouter.post('/refresh-token', refreshToken);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the authenticated user's profile
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Authenticated user profile }
 *       401: { description: Missing / invalid bearer token }
 */
authRouter.get('/me', protect, getProfile);

/**
 * @swagger
 * /api/v1/auth/me:
 *   patch:
 *     tags: [Auth]
 *     summary: Update the authenticated user's name and/or phone
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateProfileBody' }
 *     responses:
 *       200: { description: Profile updated }
 *       401: { description: Missing / invalid bearer token }
 */
authRouter.patch('/me', protect, updateProfile);

export default authRouter;
