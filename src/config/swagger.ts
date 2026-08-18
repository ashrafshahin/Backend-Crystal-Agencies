import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';

/**
 * Swagger / OpenAPI 3.0 configuration used to generate the API reference
 * served at `/api-docs` via `swagger-ui-express`.
 *
 * The spec is assembled by:
 *   1. Static `info`, `servers`, and `security` entries below.
 *   2. JSDoc `@swagger` comments parsed from every `*.ts` file under
 *      `src/routes/` and `src/controllers/` (where each endpoint lives).
 *
 * The shared `bearerAuth` security scheme lets any route opt in via the
 * `security: [{ bearerAuth: [] }]` JSDoc block.
 */
const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'Crystal Agencies Backend API',
    version: '1.0.0',
    description:
      'E-commerce and B2B backend for Crystal Agencies, Bangladesh. Supports products, inventory, orders, RFQs, customer accounts, and admin management.',
    contact: {
      name: 'Crystal Agencies',
      email: 'support@crystalagencies.example',
    },
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local development server',
    },
    {
      url: 'https://api.crystalagencies.example',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JSON Web Token returned from POST /api/v1/auth/login or /api/v1/auth/register. Send as: Authorization: Bearer <accessToken>',
      },
    },
  },
  // Default security requirement: endpoints marked `security: []` or with a
  // custom scheme override this. For fully public endpoints no header is
  // needed; for protected ones the individual route spec opts-in.
  security: [
    {
      bearerAuth: [],
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  // Files whose JSDoc `@swagger` blocks should be ingested.
  apis: [
    path.resolve(process.cwd(), 'src/routes/**/*.ts'),
    path.resolve(process.cwd(), 'src/controllers/**/*.ts'),
    path.resolve(process.cwd(), 'src/routes/**/*.js'),
    path.resolve(process.cwd(), 'src/controllers/**/*.js'),
  ],
};

/**
 * Pre-built OpenAPI spec object ready to pass to `swagger-ui-express`'s
 * `.setup(swaggerSpec)` method.
 */
const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
