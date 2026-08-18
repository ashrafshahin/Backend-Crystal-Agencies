import { Router } from 'express';
import { protect, requirePermission } from '../middleware/auth';
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  searchProducts,
} from '../controllers/productController';

const productRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product catalogue, search and management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     BulkPriceTier:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         quantity: { type: number, example: 50, description: "Minimum quantity to trigger this tier" }
 *         price: { type: number, example: 18.50, description: "Per-unit price at this tier" }
 *     ProductRating:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         user:
 *           oneOf:
 *             - type: object
 *               properties:
 *                 _id: { type: string }
 *                 name: { type: string }
 *             - type: string
 *             - type: 'null'
 *         rating: { type: number, example: 4 }
 *         comment: { type: string, nullable: true, example: "Great value." }
 *         createdAt: { type: string, format: date-time }
 *     Product:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         name: { type: string, example: "Widget Pro 500" }
 *         sku: { type: string, example: "WIDGET-PRO-500" }
 *         description: { type: string, nullable: true, example: "Heavy-duty widget with premium finish." }
 *         slug: { type: string, example: "widget-pro-500" }
 *         category: { $ref: '#/components/schemas/Category' }
 *         brand: { $ref: '#/components/schemas/Brand' }
 *         basePrice: { type: number, example: 29.99 }
 *         discountedPrice: { type: number, nullable: true, example: 24.99 }
 *         discountPercent: { type: number, nullable: true, example: 16.67 }
 *         images: { type: array, items: { type: string } }
 *         attributes: { type: object, additionalProperties: true, example: { size: "L", color: "Red" } }
 *         stock: { type: number, example: 150 }
 *         isActive: { type: boolean, example: true }
 *         ratings: { type: array, items: { $ref: '#/components/schemas/ProductRating' } }
 *         createdBy: { type: string, nullable: true, description: "User id who created the product" }
 *         updatedBy: { type: string, nullable: true, description: "Last user id who edited the product" }
 *         type: { type: string, enum: [b2b, b2c, both], example: "both" }
 *         moq: { type: number, nullable: true, example: 10 }
 *         bulkPrices: { type: array, items: { $ref: '#/components/schemas/BulkPriceTier' } }
 *         leadTime: { type: number, nullable: true, example: 7 }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     ProductBody:
 *       type: object
 *       required: [name, sku, category, brand, basePrice]
 *       properties:
 *         name: { type: string, example: "Widget Pro 500" }
 *         sku: { type: string, example: "WIDGET-PRO-500" }
 *         description: { type: string, nullable: true }
 *         category: { type: string, description: "Category ObjectId" }
 *         brand: { type: string, description: "Brand ObjectId" }
 *         basePrice: { type: number, example: 29.99, minimum: 0 }
 *         discountedPrice: { type: number, nullable: true, minimum: 0 }
 *         discountPercent: { type: number, nullable: true, minimum: 0, maximum: 100 }
 *         images: { type: array, items: { type: string } }
 *         attributes: { type: object, additionalProperties: true }
 *         stock: { type: integer, example: 0, minimum: 0 }
 *         isActive: { type: boolean, example: true }
 *         type: { type: string, enum: [b2b, b2c, both], default: "both" }
 *         moq: { type: integer, nullable: true, minimum: 1 }
 *         bulkPrices:
 *           type: array
 *           items:
 *             type: object
 *             required: [quantity, price]
 *             properties:
 *               quantity: { type: number, minimum: 1 }
 *               price: { type: number, minimum: 0 }
 *         leadTime: { type: integer, nullable: true, minimum: 0 }
 *     ProductUpdateBody:
 *       type: object
 *       properties:
 *         name: { type: string }
 *         sku: { type: string }
 *         description: { type: string, nullable: true }
 *         basePrice: { type: number, minimum: 0 }
 *         discountedPrice: { type: number, nullable: true, minimum: 0 }
 *         discountPercent: { type: number, nullable: true, minimum: 0, maximum: 100 }
 *         images: { type: array, items: { type: string } }
 *         attributes: { type: object, additionalProperties: true }
 *         stock: { type: integer, minimum: 0 }
 *         isActive: { type: boolean }
 *         type: { type: string, enum: [b2b, b2c, both] }
 *         moq: { type: integer, nullable: true, minimum: 1 }
 *         bulkPrices:
 *           type: array
 *           items:
 *             type: object
 *             required: [quantity, price]
 *             properties:
 *               quantity: { type: number, minimum: 1 }
 *               price: { type: number, minimum: 0 }
 *         leadTime: { type: integer, nullable: true, minimum: 0 }
 */

/**
 * @swagger
 * /api/v1/products:
 *   post:
 *     tags: [Products]
 *     summary: Create a new product (requires `products:write`)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ProductBody' }
 *     responses:
 *       201: { description: Product created, with category+brand populated }
 *       400: { description: Validation failure (fields, category/brand existence, duplicate sku) }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `products:write` permission }
 *       409: { description: SKU or slug already exists }
 */
productRouter.post('/', protect, requirePermission('products:write'), createProduct);

/**
 * @swagger
 * /api/v1/products:
 *   get:
 *     tags: [Products]
 *     summary: List products (public)
 *     description: |
 *       Supports filters via query string:
 *       - `category`: filter by category id
 *       - `brand`: filter by brand id
 *       - `type`: filter by type (`b2b`, `b2c`, `both`)
 *       - `isActive`: default `true`; pass `false` to include inactive
 *       - `search`: regex match name or description
 *       - `minPrice` / `maxPrice`: price range (applies to discountedPrice when set, else basePrice)
 *       - `page` + `limit`: optional pagination
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: brand
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [b2b, b2c, both] }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: List of products (category+brand populated) with count metadata }
 */
productRouter.get('/', getAllProducts);

/**
 * @swagger
 * /api/v1/products/search:
 *   get:
 *     tags: [Products]
 *     summary: Search products by name/description + filters (public)
 *     description: Alias of the GET / list endpoint that also accepts a `q` parameter.
 *                  Supports the same filters (category, brand, type, isActive, minPrice, maxPrice, page, limit).
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Keyword matched against name and description (case-insensitive regex)
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: brand
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [b2b, b2c, both] }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Search results with category+brand populated }
 */
productRouter.get('/search', searchProducts);

/**
 * @swagger
 * /api/v1/products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Fetch a single product by id (public)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB ObjectId of the product
 *         schema: { type: string }
 *     responses:
 *       200: { description: Product with category, brand and ratings populated }
 *       400: { description: Invalid ObjectId format }
 *       404: { description: Product not found }
 */
productRouter.get('/:id', getProductById);

/**
 * @swagger
 * /api/v1/products/{id}:
 *   put:
 *     tags: [Products]
 *     summary: Update a product (requires `products:write`)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB ObjectId of the product to update
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ProductUpdateBody' }
 *     responses:
 *       200: { description: Product updated, with category+brand+ratings populated }
 *       400: { description: Validation failure, bad ObjectId, or duplicate sku/slug }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `products:write` permission }
 *       404: { description: Product not found }
 *       409: { description: SKU or slug already exists }
 */
productRouter.put('/:id', protect, requirePermission('products:write'), updateProduct);

/**
 * @swagger
 * /api/v1/products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete a product (requires `products:delete`)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB ObjectId of the product to delete
 *         schema: { type: string }
 *     responses:
 *       200: { description: Product was deleted }
 *       400: { description: Invalid ObjectId format }
 *       401: { description: Missing / invalid bearer token }
 *       403: { description: Caller lacks `products:delete` permission }
 *       404: { description: Product not found }
 */
productRouter.delete('/:id', protect, requirePermission('products:delete'), deleteProduct);

export default productRouter;
