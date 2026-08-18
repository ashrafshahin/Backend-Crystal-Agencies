import { Router } from 'express';
import { protect, requirePermission } from '../middleware/auth';
import {
  createBrand,
  getAllBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
} from '../controllers/brandController';

const brandRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Brands
 *   description: Product brand management (admins / staff with categories:manage permission)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Brand:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         name: { type: string, example: "Apple" }
 *         slug: { type: string, example: "apple" }
 *         logo: { type: string, nullable: true, example: "https://example.com/logo.png" }
 *         description: { type: string, nullable: true, example: "American technology company" }
 *         isActive: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     BrandBody:
 *       type: object
 *       required: [name]
 *       properties:
 *         name: { type: string, example: "Apple" }
 *         logo: { type: string, nullable: true, example: "https://example.com/logo.png" }
 *         description: { type: string, nullable: true, example: "American technology company" }
 *         isActive: { type: boolean, example: true }
 *     BrandUpdateBody:
 *       type: object
 *       properties:
 *         name: { type: string, example: "Apple Inc." }
 *         logo: { type: string, nullable: true }
 *         description: { type: string, nullable: true }
 *         isActive: { type: boolean }
 */

/**
 * @swagger
 * /api/v1/brands:
 *   post:
 *     tags: [Brands]
 *     summary: Create a new brand (requires `categories:manage`)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BrandBody' }
 *     responses:
 *       201: { description: Brand created successfully }
 *       400: { description: Validation failure or duplicate name/slug }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `categories:manage` permission }
 *       409: { description: Brand name or slug already exists }
 */
brandRouter.post('/', protect, requirePermission('categories:manage'), createBrand);

/**
 * @swagger
 * /api/v1/brands:
 *   get:
 *     tags: [Brands]
 *     summary: List all active brands (public)
 *     responses:
 *       200: { description: List of active brands with count metadata }
 */
brandRouter.get('/', getAllBrands);

/**
 * @swagger
 * /api/v1/brands/{id}:
 *   get:
 *     tags: [Brands]
 *     summary: Fetch a single brand by id (public)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB ObjectId of the brand
 *         schema: { type: string }
 *     responses:
 *       200: { description: Brand record }
 *       400: { description: Invalid ObjectId format }
 *       404: { description: Brand not found }
 */
brandRouter.get('/:id', getBrandById);

/**
 * @swagger
 * /api/v1/brands/{id}:
 *   put:
 *     tags: [Brands]
 *     summary: Update a brand (requires `categories:manage`)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB ObjectId of the brand to update
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BrandUpdateBody' }
 *     responses:
 *       200: { description: Brand updated successfully }
 *       400: { description: Validation failure, bad ObjectId, or duplicate name/slug }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `categories:manage` permission }
 *       404: { description: Brand not found }
 *       409: { description: Brand name or slug already exists }
 */
brandRouter.put('/:id', protect, requirePermission('categories:manage'), updateBrand);

/**
 * @swagger
 * /api/v1/brands/{id}:
 *   delete:
 *     tags: [Brands]
 *     summary: Delete a brand (requires `categories:manage`)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB ObjectId of the brand to delete
 *         schema: { type: string }
 *     responses:
 *       200: { description: Brand was deleted }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `categories:manage` permission }
 *       404: { description: Brand not found }
 */
brandRouter.delete('/:id', protect, requirePermission('categories:manage'), deleteBrand);

export default brandRouter;
