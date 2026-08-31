import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  createQuotation,
  getQuotation,
  listQuotations,
  updateQuotation,
  sendQuotation,
  acceptQuotation,
  rejectQuotation,
} from '../controllers/quotationController';

const quotationRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Quotations
 *   description: Staff-generated Quotations in response to RFQs — draft pricing, email sending, and buyer accept/reject converting to an Order
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     QuotationStatus:
 *       type: string
 *       enum: [draft, sent, accepted, rejected]
 *       example: draft
 *     QuotationLine:
 *       type: object
 *       required: [productId, quantity, unitPrice]
 *       properties:
 *         _id: { type: string }
 *         productId: { type: string }
 *         product: { $ref: '#/components/schemas/ProductRef' }
 *         productName: { type: string, description: "Snapshot of product name at quote time" }
 *         productSku: { type: string, description: "Snapshot of SKU at quote time" }
 *         quantity: { type: integer, minimum: 1, example: 100 }
 *         unitPrice: { type: number, minimum: 0, example: 12.5 }
 *         discount: { type: number, minimum: 0, default: 0, description: "Flat line-level discount amount (not %)" }
 *         subtotal: { type: number, description: "unitPrice * quantity - discount (pre-tax)" }
 *     Quotation:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         rfqId: { type: string, description: "RFQ this quotation responds to" }
 *         userId: { type: string, description: "Buyer the quotation is addressed to" }
 *         quotationNumber: { type: string, example: "QUO-20260821-654321" }
 *         items: { type: array, items: { $ref: '#/components/schemas/QuotationLine' } }
 *         itemCount: { type: integer }
 *         totalQuantity: { type: integer }
 *         totalAmount: { type: number, description: "Sum of line subtotals (pre-tax)" }
 *         tax: { type: number }
 *         finalAmount: { type: number, description: "totalAmount + tax" }
 *         validUntil: { type: string, format: 'date-time', description: "Offer expiry date (end of day)" }
 *         isExpired: { type: boolean, description: "True when validUntil < now" }
 *         status: { $ref: '#/components/schemas/QuotationStatus' }
 *         notes: { type: string, example: "Prices valid for stock on hand. Lead time subject to change." }
 *         attachmentUrl: { type: string, description: "URL to PDF / doc attachment" }
 *         createdBy: { type: string, description: "Staff user who drafted the quotation" }
 *         sentAt: { type: string, format: 'date-time', nullable: true }
 *         acceptedAt: { type: string, format: 'date-time', nullable: true }
 *         rejectedAt: { type: string, format: 'date-time', nullable: true }
 *         orderId: { type: string, nullable: true, description: "Order created on acceptance" }
 *         createdAt: { type: string, format: 'date-time' }
 *         updatedAt: { type: string, format: 'date-time' }
 *     CreateQuotationBody:
 *       type: object
 *       required: [rfqId, items]
 *       properties:
 *         rfqId: { type: string, description: "RFQ ObjectId this quotation responds to" }
 *         userId: { type: string, description: "Optional override for buyer (defaults to RFQ owner)" }
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             required: [productId, quantity, unitPrice]
 *             properties:
 *               productId: { type: string }
 *               quantity: { type: integer, minimum: 1 }
 *               unitPrice: { type: number, minimum: 0 }
 *               discount: { type: number, minimum: 0, description: "Flat line-level discount" }
 *         tax: { type: number, minimum: 0, default: 0 }
 *         validUntil: { type: string, format: date, description: "Expiry date (defaults to 30 days from now)" }
 *         notes: { type: string }
 *         attachmentUrl: { type: string }
 *     UpdateQuotationBody:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             required: [productId, quantity, unitPrice]
 *             properties:
 *               productId: { type: string }
 *               quantity: { type: integer, minimum: 1 }
 *               unitPrice: { type: number, minimum: 0 }
 *               discount: { type: number, minimum: 0 }
 *         tax: { type: number, minimum: 0 }
 *         validUntil: { type: string, format: date }
 *         notes: { type: string }
 *         attachmentUrl: { type: string }
 *     AcceptQuotationBody:
 *       type: object
 *       required: [shippingAddress, shippingMethod, paymentMethod]
 *       properties:
 *         shippingAddress: { $ref: '#/components/schemas/ShippingAddress' }
 *         shippingMethod: { $ref: '#/components/schemas/ShippingMethod' }
 *         paymentMethod: { $ref: '#/components/schemas/PaymentMethod' }
 */

quotationRouter.use(protect);

/**
 * @swagger
 * /api/v1/quotations:
 *   get:
 *     tags: [Quotations]
 *     summary: List quotations (requires auth)
 *     description: "Returns quotations visible to the current user (as buyer or creator). Filter by ?rfqId for a single RFQ's quotations, and/or ?status=draft,sent comma-separated statuses."
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: rfqId
 *         schema: { type: string }
 *         description: "RFQ ObjectId — restrict results to quotations responding to a specific RFQ"
 *         required: false
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: "Comma-separated QuotationStatus values, e.g. draft,sent"
 *         required: false
 *     responses:
 *       200:
 *         description: List of quotations with totalValue + statusCounts in meta
 *       401: { description: "Missing / invalid bearer token" }
 */
quotationRouter.get('/', listQuotations);

/**
 * @swagger
 * /api/v1/quotations/{id}/send:
 *   put:
 *     tags: [Quotations]
 *     summary: Send a draft quotation to the buyer via email (requires auth)
 *     description: "Transitions status from draft → sent (idempotent), emails the buyer, records sentAt. Creator-only. Blocks already-accepted/rejected quotations and quotations past validUntil."
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quotation ObjectId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Email dispatched; returns quotation with emailed=true and recipient info }
 *       400: { description: Terminal status / expired / missing buyer }
 *       401: { description: "Missing / invalid bearer token" }
 *       403: { description: Only the creator can send }
 *       404: { description: "Quotation not found" }
 */
quotationRouter.put('/:id/send', sendQuotation);

/**
 * @swagger
 * /api/v1/quotations/{id}/accept:
 *   put:
 *     tags: [Quotations]
 *     summary: Accept a sent quotation and convert it to an Order (requires auth)
 *     description: "Buyer-only endpoint. Requires shipping+payment info in the body. Validates the quotation is sent, not yet accepted/rejected, and not expired. Creates an Order document from the quotation lines using their snapshots, links orderId on the quotation, sets RFQ status to accepted, and returns both the updated quotation and the new order summary."
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quotation ObjectId
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AcceptQuotationBody' }
 *     responses:
 *       200:
 *         description: Quotation accepted + Order created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quotation: { $ref: '#/components/schemas/Quotation' }
 *                 order:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     orderNumber: { type: string }
 *                     status: { type: string }
 *                     totalAmount: { type: number }
 *                     tax: { type: number }
 *                     finalAmount: { type: number }
 *                     shippingMethod: { type: string }
 *                     paymentMethod: { type: string }
 *                     paymentStatus: { type: string }
 *       400: { description: Bad state / missing required fields / expired }
 *       401: { description: "Missing / invalid bearer token" }
 *       403: { description: Only the buyer (userId) can accept }
 *       404: { description: "Quotation not found" }
 */
quotationRouter.put('/:id/accept', acceptQuotation);

/**
 * @swagger
 * /api/v1/quotations/{id}/reject:
 *   put:
 *     tags: [Quotations]
 *     summary: Reject a quotation (requires auth)
 *     description: "Either the buyer or the creator can reject. Sets status=rejected and rejectedAt. Cannot reject an already-accepted quotation."
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quotation ObjectId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Quotation rejected, returns quotation with rejected=true }
 *       400: { description: Already accepted / already rejected }
 *       401: { description: "Missing / invalid bearer token" }
 *       403: { description: Must be buyer or creator }
 *       404: { description: "Quotation not found" }
 */
quotationRouter.put('/:id/reject', rejectQuotation);

/**
 * @swagger
 * /api/v1/quotations:
 *   post:
 *     tags: [Quotations]
 *     summary: Create a new (draft) quotation in response to an RFQ (requires auth)
 *     description: "Staff creates a draft quotation. Autos the status to 'quoted' on the linked RFQ. Calculates totals from items, snapshots product names/SKUs, generates a unique quotationNumber, and sets validUntil to +30 days by default. userId defaults to RFQ owner but can be overridden."
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateQuotationBody' }
 *     responses:
 *       201: { description: Draft quotation created with populated products }
 *       400: { description: Validation failure (missing RFQ, bad products/prices, invalid dates, etc.) }
 *       401: { description: "Missing / invalid bearer token" }
 */
quotationRouter.post('/', createQuotation);

/**
 * @swagger
 * /api/v1/quotations/{id}:
 *   get:
 *     tags: [Quotations]
 *     summary: Get a single quotation by id (requires auth)
 *     description: Populates product refs. Accessible by the buyer (userId) or the creator (createdBy). Includes isExpired boolean in the response.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quotation ObjectId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Single quotation with lines + populated products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quotation: { $ref: '#/components/schemas/Quotation' }
 *       401: { description: "Missing / invalid bearer token" }
 *       403: { description: Not a participant in this quotation }
 *       404: { description: "Quotation not found" }
 */
quotationRouter.get('/:id', getQuotation);

/**
 * @swagger
 * /api/v1/quotations/{id}:
 *   put:
 *     tags: [Quotations]
 *     summary: Edit a draft quotation's lines, prices, tax, validity, or notes (requires auth)
 *     description: "Creator-only. Only draft quotations can be edited. Any change to items or tax recalculates totals. Other fields (validUntil, notes, attachmentUrl) are updated directly."
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Quotation ObjectId
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateQuotationBody' }
 *     responses:
 *       200: { description: Quotation updated and totals recalculated }
 *       400: { description: Not a draft / validation errors }
 *       401: { description: "Missing / invalid bearer token" }
 *       403: { description: Only the creator can edit }
 *       404: { description: "Quotation not found" }
 */
quotationRouter.put('/:id', updateQuotation);

export default quotationRouter;
