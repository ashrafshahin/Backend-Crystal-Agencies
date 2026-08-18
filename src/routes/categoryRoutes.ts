import { Router } from 'express';
import { protect, requirePermission } from '../middleware/auth';
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController';

const categoryRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Product category management (admins / staff with categories:manage permission)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Category:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         name: { type: string, example: "Electronics" }
 *         slug: { type: string, example: "electronics" }
 *         description: { type: string, nullable: true, example: "Electronic devices and accessories" }
 *         isActive: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     CategoryBody:
 *       type: object
 *       required: [name]
 *       properties:
 *         name: { type: string, example: "Electronics" }
 *         description: { type: string, nullable: true, example: "Electronic devices and accessories" }
 *         isActive: { type: boolean, example: true }
 *     CategoryUpdateBody:
 *       type: object
 *       properties:
 *         name: { type: string, example: "Electronics & Gadgets" }
 *         description: { type: string, nullable: true }
 *         isActive: { type: boolean }
 */

/**
 * @swagger
 * /api/v1/categories:
 *   post:
 *     tags: [Categories]
 *     summary: Create a new category (requires `categories:manage`)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CategoryBody' }
 *     responses:
 *       201: { description: Category created successfully }
 *       400: { description: Validation failure or duplicate name/slug }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `categories:manage` permission }
 *       409: { description: Category name or slug already exists }
 */
categoryRouter.post('/', protect, requirePermission('categories:manage'), createCategory);

/**
 * @swagger
 * /api/v1/categories:
 *   get:
 *     tags: [Categories]
 *     summary: List all active categories (public)
 *     responses:
 *       200: { description: List of active categories with count metadata }
 */
categoryRouter.get('/', getAllCategories);

/**
 * @swagger
 * /api/v1/categories/{id}:
 *   get:
 *     tags: [Categories]
 *     summary: Fetch a single category by id (public)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB ObjectId of the category
 *         schema: { type: string }
 *     responses:
 *       200: { description: Category record }
 *       400: { description: Invalid ObjectId format }
 *       404: { description: Category not found }
 */
categoryRouter.get('/:id', getCategoryById);

/**
 * @swagger
 * /api/v1/categories/{id}:
 *   put:
 *     tags: [Categories]
 *     summary: Update a category (requires `categories:manage`)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB ObjectId of the category to update
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CategoryUpdateBody' }
 *     responses:
 *       200: { description: Category updated successfully }
 *       400: { description: Validation failure, bad ObjectId, or duplicate name/slug }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `categories:manage` permission }
 *       404: { description: Category not found }
 *       409: { description: Category name or slug already exists }
 */
categoryRouter.put('/:id', protect, requirePermission('categories:manage'), updateCategory);

/**
 * @swagger
 * /api/v1/categories/{id}:
 *   delete:
 *     tags: [Categories]
 *     summary: Delete a category (requires `categories:manage`)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB ObjectId of the category to delete
 *         schema: { type: string }
 *     responses:
 *       200: { description: Category was deleted }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `categories:manage` permission }
 *       404: { description: Category not found }
 */
categoryRouter.delete('/:id', protect, requirePermission('categories:manage'), deleteCategory);

export default categoryRouter;
