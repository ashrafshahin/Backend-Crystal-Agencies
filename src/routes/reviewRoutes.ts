import { Router } from 'express';
import { protect, requirePermission } from '../middleware/auth';
import {
  createReview,
  getProductReviews,
  updateReview,
  deleteReview,
  approveReview,
  rejectReview,
  markHelpful,
} from '../controllers/reviewController';

const reviewRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Product reviews and ratings with moderation workflow
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ReviewStatus:
 *       type: string
 *       enum: [pending, approved, rejected]
 *     Review:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         product: { $ref: '#/components/schemas/ProductRef' }
 *         user:
 *           type: object
 *           properties:
 *             _id: { type: string }
 *             name: { type: string }
 *         rating: { type: integer, minimum: 1, maximum: 5 }
 *         title: { type: string, nullable: true }
 *         content: { type: string, nullable: true }
 *         helpful: { type: integer, minimum: 0 }
 *         status: { $ref: '#/components/schemas/ReviewStatus' }
 *         moderationNote: { type: string, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     ReviewList:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items: { $ref: '#/components/schemas/Review' }
 *         count: { type: integer }
 *     CreateReviewBody:
 *       type: object
 *       required: [productId, rating]
 *       properties:
 *         productId: { type: string, description: "Product ObjectId being reviewed" }
 *         rating: { type: integer, minimum: 1, maximum: 5, description: "Star rating" }
 *         title: { type: string, description: "Optional review headline" }
 *         content: { type: string, description: "Optional review body" }
 *     UpdateReviewBody:
 *       type: object
 *       properties:
 *         rating: { type: integer, minimum: 1, maximum: 5 }
 *         title: { type: string }
 *         content: { type: string }
 *     RejectReviewBody:
 *       type: object
 *       properties:
 *         reason: { type: string, description: "Moderation reason for rejection" }
 */

/**
 * @swagger
 * /api/v1/reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Create a new product review (requires auth)
 *     description: Creates a review in `pending` status for moderation. One review per user per product.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateReviewBody' }
 *     responses:
 *       201:
 *         description: Review submitted (pending moderation)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         item: { $ref: '#/components/schemas/Review' }
 *       400: { description: Validation failure }
 *       401: { description: Missing / invalid bearer token }
 *       409: { description: User has already reviewed this product }
 */
reviewRouter.post('/reviews', protect, createReview);

/**
 * @swagger
 * /api/v1/reviews/{id}:
 *   put:
 *     tags: [Reviews]
 *     summary: Update a review (author only, requires auth)
 *     description: Resets status to `pending` for re-moderation.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Review ObjectId
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateReviewBody' }
 *     responses:
 *       200: { description: Review updated (pending re-moderation) }
 *       400: { description: Validation failure }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Not the author of this review }
 *       404: { description: Review not found }
 */
reviewRouter.put('/reviews/:id', protect, updateReview);

/**
 * @swagger
 * /api/v1/reviews/{id}:
 *   delete:
 *     tags: [Reviews]
 *     summary: Delete a review (author or admin, requires auth)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Review ObjectId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Review deleted }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Not author or admin }
 *       404: { description: Review not found }
 */
reviewRouter.delete('/reviews/:id', protect, deleteReview);

/**
 * @swagger
 * /api/v1/reviews/{id}/approve:
 *   put:
 *     tags: [Reviews]
 *     summary: Approve a pending review (products:manage permission)
 *     description: Approves review and triggers product rating recalculation.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Review ObjectId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Review approved }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Insufficient permissions }
 *       404: { description: Review not found }
 */
reviewRouter.put(
  '/reviews/:id/approve',
  protect,
  requirePermission('products:manage'),
  approveReview,
);

/**
 * @swagger
 * /api/v1/reviews/{id}/reject:
 *   put:
 *     tags: [Reviews]
 *     summary: Reject a review (products:manage permission)
 *     description: Rejects review with optional moderation reason. Triggers product rating recalculation if previously approved.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Review ObjectId
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RejectReviewBody' }
 *     responses:
 *       200: { description: Review rejected }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Insufficient permissions }
 *       404: { description: Review not found }
 */
reviewRouter.put(
  '/reviews/:id/reject',
  protect,
  requirePermission('products:manage'),
  rejectReview,
);

/**
 * @swagger
 * /api/v1/reviews/{id}/helpful:
 *   put:
 *     tags: [Reviews]
 *     summary: Mark a review as helpful (requires auth)
 *     description: Increments the helpful counter on the review by 1.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Review ObjectId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Review marked as helpful }
 *       401: { description: Missing / invalid bearer token }
 *       404: { description: Review not found }
 */
reviewRouter.put('/reviews/:id/helpful', protect, markHelpful);

export default reviewRouter;
