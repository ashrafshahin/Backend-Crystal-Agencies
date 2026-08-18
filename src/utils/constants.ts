/**
 * Standard envelope used for every API response.
 *
 * Consumers of the API can always rely on this shape, whether a call
 * succeeds or fails, which makes client-side handling uniform.
 */
export const API_RESPONSE_ENVELOPE = {
  /** True when the request succeeded (no error to handle). */
  success: true as boolean,
  /** Primary payload. May be null when success is false or there is nothing to return. */
  data: null as unknown,
  /** Human-readable short description of the outcome. */
  message: '' as string,
  /** Stable error code string. Only populated when `success` is false. */
  errorCode: null as string | null,
  /** Per-field validation error map or additional error detail entries. */
  errors: [] as Array<Record<string, unknown>>,
  /** Pagination / trace metadata for list endpoints. */
  meta: null as Record<string, unknown> | null,
} as const;

/**
 * Numeric HTTP status codes used throughout the application.
 * Using named constants instead of magic numbers makes intent clearer and
 * avoids the common 401/403/404 mix-ups at call sites.
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * Stable, machine-readable error codes that clients can key logic off.
 * These intentionally stay the same across changes to English messages.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR...',
  DUPLICATE_KEY: 'DUPLICATE_KEY...',
  CAST_ERROR: 'CAST_ERROR...',
  UNAUTHORIZED: 'UNAUTHORIZED...',
  FORBIDDEN: 'FORBIDDEN...',
  NOT_FOUND: 'NOT_FOUND...',
  INTERNAL_ERROR: 'INTERNAL_ERROR...',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS...',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED...',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED...',
  TOKEN_INVALID: 'TOKEN_INVALID...',
} as const;

/**
 * Default permission lists assigned to each out-of-the-box role when
 * the system is bootstrapped. Individual permissions can be tweaked later
 * by an admin editing the role document directly.
 *
 * Keys are role names; values are the permission strings that role holds.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'user:read',
    'user:write',
    'user:delete',
    'role:read',
    'role:write',
    'role:delete',
    'product:read',
    'product:write',
    'product:delete',
    'order:read',
    'order:write',
    'order:delete',
    'inventory:read',
    'inventory:write',
    'payment:read',
    'payment:write',
    'rfq:read',
    'rfq:write',
    'rfq:delete',
    'settings:read',
    'settings:write',
  ],
  staff: [
    'user:read',
    'user:write',
    'product:read',
    'product:write',
    'order:read',
    'order:write',
    'inventory:read',
    'inventory:write',
    'rfq:read',
    'rfq:write',
  ],
  customer: [
    'profile:read',
    'profile:write',
    'product:read',
    'order:read',
    'order:write',
    'rfq:read',
    'rfq:write',
    'cart:read',
    'cart:write',
  ],
  guest: ['product:read', 'rfq:write'],
};
