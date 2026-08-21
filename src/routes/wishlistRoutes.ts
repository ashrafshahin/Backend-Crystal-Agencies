import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  isInWishlist,
} from '../controllers/wishlistController';

const wishlistRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Wishlist
 *   description: Per-user saved / wishlist products
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     WishlistItem:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         userId: { type: string }
 *         product: { $ref: '#/components/schemas/ProductRef' }
 *         createdAt: { type: string, format: date-time }
 *     AddWishlistBody:
 *       type: object
 *       required: [productId]
 *       properties:
 *         productId: { type: string, description: "Product ObjectId to save" }
 */

wishlistRouter.use(protect);

/**
 * @swagger
 * /api/v1/wishlist:
 *   get:
 *     tags: [Wishlist]
 *     summary: Fetch the current user's wishlist (requires auth)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Wishlist items, products populated, newest first }
 *       401: { description: Missing / invalid bearer token }
 */
wishlistRouter.get('/', getWishlist);

/**
 * @swagger
 * /api/v1/wishlist/check/{id}:
 *   get:
 *     tags: [Wishlist]
 *     summary: Check whether a product is in the current user's wishlist (requires auth)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Product ObjectId to look up
 *         schema: { type: string }
 *     responses:
 *       200: { description: Boolean `inWishlist` result }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 */
wishlistRouter.get('/check/:id', isInWishlist);

/**
 * @swagger
 * /api/v1/wishlist:
 *   post:
 *     tags: [Wishlist]
 *     summary: Add a product to the current user's wishlist (requires auth)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AddWishlistBody' }
 *     responses:
 *       201: { description: Product added to wishlist }
 *       200: { description: Product already in wishlist (returned existing) }
 *       400: { description: Validation failure (bad productId, missing, or inactive/non-existent product) }
 *       401: { description: Missing / invalid bearer token }
 *       409: { description: Duplicate (unique index collision — usually replaced by idempotent 200) }
 */
wishlistRouter.post('/', addToWishlist);

/**
 * @swagger
 * /api/v1/wishlist/{id}:
 *   delete:
 *     tags: [Wishlist]
 *     summary: Remove a product from the wishlist (requires auth)
 *     description: Accepts either the Wishlist ObjectId or the Product ObjectId.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Wishlist document id OR product id to remove
 *         schema: { type: string }
 *     responses:
 *       200: { description: Removed, reports removed wishlist + product id }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 *       404: { description: Wishlist item not found }
 */
wishlistRouter.delete('/:id', removeFromWishlist);

export default wishlistRouter;
