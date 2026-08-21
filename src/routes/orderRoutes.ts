import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  createOrder,
  getOrder,
  getUserOrders,
  updateOrderStatus,
  cancelOrder,
  getOrderHistory,
} from '../controllers/orderController';

const orderRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Customer order management — checkout from cart, status transitions, cancellation, and history with filters
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     OrderStatus:
 *       type: string
 *       enum: [pending, confirmed, shipped, delivered, cancelled]
 *       example: pending
 *     PaymentStatus:
 *       type: string
 *       enum: [unpaid, paid, failed]
 *       example: unpaid
 *     PaymentMethod:
 *       type: string
 *       enum: [cod, card, wallet, bank_transfer]
 *       example: card
 *     ShippingMethod:
 *       type: string
 *       enum: [standard, express, pickup]
 *       example: standard
 *     ShippingAddress:
 *       type: object
 *       required: [fullName, addressLine1, city, postalCode, country]
 *       properties:
 *         fullName: { type: string, example: "Jane Doe" }
 *         phone: { type: string, example: "+1 555-0123" }
 *         addressLine1: { type: string, example: "123 Market Street" }
 *         addressLine2: { type: string, example: "Apt 4B" }
 *         city: { type: string, example: "San Francisco" }
 *         state: { type: string, example: "CA" }
 *         postalCode: { type: string, example: "94103" }
 *         country: { type: string, example: "United States" }
 *     OrderLine:
 *       type: object
 *       properties:
 *         _id: { type: string, description: "Order-line ObjectId" }
 *         productId: { type: string, description: "Product ObjectId" }
 *         product: { $ref: '#/components/schemas/ProductRef' }
 *         productName: { type: string, description: "Snapshot of product name at order time" }
 *         productSku: { type: string, description: "Snapshot of SKU at order time" }
 *         quantity: { type: number, minimum: 1, example: 2 }
 *         price: { type: number, description: "Snapshot of unit price (discountedPrice or basePrice)", example: 25.0 }
 *         subtotal: { type: number, description: "price × quantity", example: 50.0 }
 *     Order:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         userId: { type: string }
 *         orderNumber: { type: string, example: "ORD-20260821-123456" }
 *         items: { type: array, items: { $ref: '#/components/schemas/OrderLine' } }
 *         itemCount: { type: number, description: "Sum of line quantities" }
 *         shippingAddress: { $ref: '#/components/schemas/ShippingAddress' }
 *         shippingMethod: { $ref: '#/components/schemas/ShippingMethod' }
 *         status: { $ref: '#/components/schemas/OrderStatus' }
 *         paymentMethod: { $ref: '#/components/schemas/PaymentMethod' }
 *         paymentStatus: { $ref: '#/components/schemas/PaymentStatus' }
 *         totalAmount: { type: number, description: "Sum of line subtotals before discount/tax", example: 100.0 }
 *         discount: { type: number, example: 10.0 }
 *         tax: { type: number, example: 8.0 }
 *         finalAmount: { type: number, description: "totalAmount - discount + tax", example: 98.0 }
 *         confirmedAt: { type: string, format: 'date-time', nullable: true }
 *         shippedAt: { type: string, format: 'date-time', nullable: true }
 *         deliveredAt: { type: string, format: 'date-time', nullable: true }
 *         cancelledAt: { type: string, format: 'date-time', nullable: true }
 *         notes: { type: string, example: "Leave at front door" }
 *         createdAt: { type: string, format: 'date-time' }
 *         updatedAt: { type: string, format: 'date-time' }
 *     CreateOrderBody:
 *       type: object
 *       required: [shippingAddress, shippingMethod, paymentMethod]
 *       properties:
 *         shippingAddress: { $ref: '#/components/schemas/ShippingAddress' }
 *         shippingMethod: { $ref: '#/components/schemas/ShippingMethod' }
 *         paymentMethod: { $ref: '#/components/schemas/PaymentMethod' }
 *         discount: { type: number, minimum: 0, default: 0, example: 10.0 }
 *         tax: { type: number, minimum: 0, default: 0, example: 8.0 }
 *         notes: { type: string, example: "Leave at front door" }
 *         useCart: { type: boolean, default: true, description: "When true (default), converts the current user's cart. When false, require explicit items array." }
 *         items:
 *           type: array
 *           description: "Required only when useCart=false"
 *           items:
 *             type: object
 *             required: [productId, quantity]
 *             properties:
 *               productId: { type: string, description: "Product ObjectId" }
 *               quantity: { type: integer, minimum: 1 }
 *     UpdateOrderStatusBody:
 *       type: object
 *       required: [status]
 *       properties:
 *         status: { $ref: '#/components/schemas/OrderStatus' }
 */

orderRouter.use(protect);

/**
 * @swagger
 * /api/v1/orders/history:
 *   get:
 *     tags: [Orders]
 *     summary: Filtered order history for the current user (requires auth)
 *     description: Supports filtering by comma-separated statuses, date range and amount range. Returns summary counts + totals in meta.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: "Comma-separated OrderStatus values, e.g. pending,confirmed"
 *         required: false
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *         description: "ISO date (inclusive), e.g. 2026-08-01"
 *         required: false
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *         description: "ISO date (inclusive, end of day), e.g. 2026-08-31"
 *         required: false
 *       - in: query
 *         name: minAmount
 *         schema: { type: number, minimum: 0 }
 *         description: "Minimum finalAmount"
 *         required: false
 *       - in: query
 *         name: maxAmount
 *         schema: { type: number, minimum: 0 }
 *         description: "Maximum finalAmount"
 *         required: false
 *     responses:
 *       200:
 *         description: Filtered order list (or empty list when no matches)
 *       401: { description: "Missing / invalid bearer token" }
 */
orderRouter.get('/history', getOrderHistory);

/**
 * @swagger
 * /api/v1/orders:
 *   post:
 *     tags: [Orders]
 *     summary: Create a new order (checkout), by default from the user's cart (requires auth)
 *     description: "Validates stock against aggregate Inventory, computes totals using discountedPrice→basePrice, snapshots name/SKU/price into each line, generates a unique orderNumber, and clears the cart on success (useCart=true, default). Pass useCart=false with an explicit items array to order without the cart."
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateOrderBody' }
 *     responses:
 *       201:
 *         description: "Order created, cart cleared (when useCart=true)"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 order: { $ref: '#/components/schemas/Order' }
 *                 cartCleared: { type: boolean }
 *                 itemsRemovedFromCart: { type: number }
 *       400: { description: "Validation failure — shipping details, payment method, cart emptiness, or stock issues" }
 *       401: { description: "Missing / invalid bearer token" }
 */
orderRouter.post('/', createOrder);

/**
 * @swagger
 * /api/v1/orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get a single order by id (requires auth)
 *     description: Returns the order with product refs populated. The order must belong to the authenticated user.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ObjectId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Single order with lines + populated products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 order: { $ref: '#/components/schemas/Order' }
 *       401: { description: "Missing / invalid bearer token" }
 *       403: { description: "Order does not belong to the requesting user" }
 *       404: { description: "Order not found" }
 */
orderRouter.get('/:id', getOrder);

/**
 * @swagger
 * /api/v1/orders:
 *   get:
 *     tags: [Orders]
 *     summary: List all orders for the current user (requires auth)
 *     description: "Returns orders sorted newest first, with per-order totals and a running totalSpent meta."
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Order' }
 *       401: { description: "Missing / invalid bearer token" }
 */
orderRouter.get('/', getUserOrders);

/**
 * @swagger
 * /api/v1/orders/{id}/status:
 *   put:
 *     tags: [Orders]
 *     summary: Transition an order's lifecycle status (requires auth)
 *     description: "Allows progressing pending→confirmed→shipped→delivered, or setting cancelled. Sets the matching timestamp field (confirmedAt / shippedAt / deliveredAt / cancelledAt) on first transition. Cancelled or delivered orders cannot be further modified. Must own the order."
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ObjectId
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateOrderStatusBody' }
 *     responses:
 *       200: { description: "Status updated, returns the refreshed order" }
 *       400: { description: "Invalid status or terminal order (cancelled / delivered) cannot be modified" }
 *       401: { description: "Missing / invalid bearer token" }
 *       403: { description: "Order does not belong to the requesting user" }
 *       404: { description: "Order not found" }
 */
orderRouter.put('/:id/status', updateOrderStatus);

/**
 * @swagger
 * /api/v1/orders/{id}/cancel:
 *   put:
 *     tags: [Orders]
 *     summary: Cancel a pending order (requires auth)
 *     description: "Idempotent cancellation endpoint restricted to orders in the 'pending' state. Sets status to cancelled and populates cancelledAt. For cancellation after confirmation, use the general status endpoint."
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ObjectId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 order: { $ref: '#/components/schemas/Order' }
 *                 cancelled: { type: boolean, example: true }
 *       400: { description: "Only pending orders can be cancelled via this endpoint" }
 *       401: { description: "Missing / invalid bearer token" }
 *       403: { description: "Order does not belong to the requesting user" }
 *       404: { description: "Order not found" }
 */
orderRouter.put('/:id/cancel', cancelOrder);

export default orderRouter;
