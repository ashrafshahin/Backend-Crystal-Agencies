import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  addToCart,
  removeFromCart,
  getCart,
  updateQuantity,
  clearCart,
  validateCart,
} from '../controllers/cartController';

const cartRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Per-user shopping cart, line-item management and stock validation
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CartLine:
 *       type: object
 *       properties:
 *         _id: { type: string, description: "Cart-line ObjectId" }
 *         productId: { type: string }
 *         product: { $ref: '#/components/schemas/ProductRef' }
 *         quantity: { type: number, minimum: 1, example: 3 }
 *         unitPrice: { type: number, example: 15.5, description: "Uses discountedPrice when present, else basePrice" }
 *         subtotal: { type: number, example: 46.5, description: "unitPrice × quantity" }
 *         addedAt: { type: string, format: date-time }
 *     Cart:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         userId: { type: string }
 *         items: { type: array, items: { $ref: '#/components/schemas/CartLine' } }
 *         count: { type: number, description: "Sum of all line quantities" }
 *         subtotal: { type: number, description: "Sum of line subtotals" }
 *         total: { type: number, description: "Equals subtotal (tax/shipping added at checkout)" }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     AddCartBody:
 *       type: object
 *       required: [productId]
 *       properties:
 *         productId: { type: string, description: "Product ObjectId" }
 *         quantity: { type: integer, minimum: 1, default: 1, example: 2 }
 *     UpdateCartQtyBody:
 *       type: object
 *       required: [quantity]
 *       properties:
 *         quantity: { type: integer, minimum: 0, description: "Set to 0 to remove the line", example: 5 }
 *     CartValidationIssue:
 *       type: object
 *       properties:
 *         itemId: { type: string }
 *         productId: { type: string }
 *         type:
 *           type: string
 *           enum: [out-of-stock, insufficient-stock, inactive]
 *         message: { type: string }
 *         available: { type: number }
 *         requested: { type: number }
 */

cartRouter.use(protect);

/**
 * @swagger
 * /api/v1/cart:
 *   get:
 *     tags: [Cart]
 *     summary: Get the current user's cart (requires auth)
 *     description: Lazily creates an empty cart document if the user has never added anything.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Cart with populated product lines + totals }
 *       401: { description: Missing / invalid bearer token }
 */
cartRouter.get('/', getCart);

/**
 * @swagger
 * /api/v1/cart/validate:
 *   get:
 *     tags: [Cart]
 *     summary: Validate cart lines against available inventory (requires auth)
 *     description: Checks each line against aggregate Inventory qty per product, and flags inactive products.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Validation result (HTTP 200 regardless of validity; check `valid` field).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid: { type: boolean }
 *                 issues: { type: array, items: { $ref: '#/components/schemas/CartValidationIssue' } }
 *                 summary: { type: object, properties: { count: { type: number }, value: { type: number } } }
 *       401: { description: Missing / invalid bearer token }
 */
cartRouter.get('/validate', validateCart);

/**
 * @swagger
 * /api/v1/cart:
 *   post:
 *     tags: [Cart]
 *     summary: Add a product (or increase quantity) to the cart (requires auth)
 *     description: If the product is already in the cart, quantity is incremented by `quantity`. Requires an active product.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AddCartBody' }
 *     responses:
 *       200: { description: Product already present, quantity increased }
 *       200!description: Product added to a new or existing cart }
 *       400: { description: Validation failure (bad productId, qty, or inactive/non-existent product) }
 *       401: { description: Missing / invalid bearer token }
 */
cartRouter.post('/', addToCart);

/**
 * @swagger
 * /api/v1/cart/{id}:
 *   put:
 *     tags: [Cart]
 *     summary: Update a cart line's quantity (requires auth)
 *     description: Accepts either the cart-line ObjectId or the product ObjectId. Setting `quantity = 0` removes the line.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Cart-line ObjectId or Product ObjectId to update
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateCartQtyBody' }
 *     responses:
 *       200: { description: Updated cart + recomputed totals }
 *       400: { description: Validation failure (invalid ObjectId or bad qty) }
 *       401: { description: Missing / invalid bearer token }
 *       404: { description: Cart line not found }
 */
cartRouter.put('/:id', updateQuantity);

/**
 * @swagger
 * /api/v1/cart/{id}:
 *   delete:
 *     tags: [Cart]
 *     summary: Remove a line from the cart (requires auth)
 *     description: Accepts either cart-line ObjectId or product ObjectId.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Cart-line ObjectId or Product ObjectId to remove
 *         schema: { type: string }
 *     responses:
 *       200: { description: Removed, returns updated cart }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 *       404: { description: Cart line not found }
 */
cartRouter.delete('/:id', removeFromCart);

/**
 * @swagger
 * /api/v1/cart:
 *   delete:
 *     tags: [Cart]
 *     summary: Clear the entire cart (requires auth)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Cart emptied, reports count of removed units }
 *       401: { description: Missing / invalid bearer token }
 */
cartRouter.delete('/', clearCart);

export default cartRouter;
