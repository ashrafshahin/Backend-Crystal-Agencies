import { Router } from 'express';
import { protect, requirePermission } from '../middleware/auth';
import {
  getAllUsers,
  getUserById,
  deleteUser,
} from '../controllers/userController';

const userRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management (admins / staff with users:manage permission)
 */

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     tags: [Users]
 *     summary: List all users (requires `users:manage`)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of users with their role populated }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `users:manage` permission }
 */
userRouter.get('/', protect, requirePermission('users:manage'), getAllUsers);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Fetch a single user by id
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB ObjectId of the user
 *         schema: { type: string }
 *     responses:
 *       200: { description: User record }
 *       401: { description: Missing / invalid bearer token }
 *       404: { description: User not found }
 */
userRouter.get('/:id', protect, getUserById);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user (requires `users:manage`)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB ObjectId of the user to delete
 *         schema: { type: string }
 *     responses:
 *       200: { description: User was deleted }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `users:manage` permission }
 *       404: { description: User not found }
 */
userRouter.delete('/:id', protect, requirePermission('users:manage'), deleteUser);

export default userRouter;
