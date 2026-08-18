import { hash as bcryptHash, compare as bcryptCompare } from 'bcryptjs';
import {
  sign as jwtSign,
  verify as jwtVerify,
  type JwtPayload,
} from 'jsonwebtoken';
import { randomBytes } from 'crypto';

/**
 * Standard JWT payload claims issued by this server in every access and
 * refresh token. Additional claims can be added later without changing
 * call sites that only need `sub` / `role`.
 */
export interface TokenPayload extends JwtPayload {
  /** Subject — the user id the token was issued for. */
  sub: string;
  /** Role id assigned to the user at token issue time. */
  role: string;
}

/**
 * Return value from {@link generateTokens}. A freshly minted token-pair.
 */
export interface TokenPair {
  /** Short-lived bearer token passed on every authenticated API call. */
  accessToken: string;
  /** Longer-lived bearer token used only to obtain a new access token. */
  refreshToken: string;
}

const DEFAULT_SALT_ROUNDS = 12;
// Accept both the names used in this project's .env (JWT_EXPIRE / JWT_REFRESH_EXPIRE)
// and the more explicit alias names (JWT_ACCESS_TTL / JWT_REFRESH_TTL).
const DEFAULT_ACCESS_TTL =
  process.env.JWT_EXPIRE ?? process.env.JWT_ACCESS_TTL ?? '15m';
const DEFAULT_REFRESH_TTL =
  process.env.JWT_REFRESH_EXPIRE ?? process.env.JWT_REFRESH_TTL ?? '7d';

/**
 * Produce a salted bcrypt(js) hash of a plaintext password.
 *
 * @param password - Plaintext password supplied by a registration or
 *                   password-reset flow.
 * @param saltRounds - Cost factor passed to bcrypt. Defaults to
 *                     `DEFAULT_SALT_ROUNDS` (12) for a good
 *                     security/performance trade-off in 2025.
 * @returns Base64-encoded bcrypt hash suitable for storage in the
 *          `users.password` field.
 */
export async function hashPassword(
  password: string,
  saltRounds: number = DEFAULT_SALT_ROUNDS,
): Promise<string> {
  return bcryptHash(password, saltRounds);
}

/**
 * Verify a candidate plaintext password against a stored bcrypt hash.
 *
 * @param password - Plaintext password candidate (e.g. submitted via login).
 * @param hash     - Stored hash previously produced by {@link hashPassword}.
 * @returns `true` when the candidate matches, `false` otherwise. The
 *          function is timing-safe: it always runs for roughly the same
 *          duration regardless of whether the match was good or bad.
 */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcryptCompare(password, hash);
}

function requireJwtSecret(
  envName: string,
  fallback: string,
  _allowFallback: boolean = true,
): string {
  const value = process.env[envName];
  if (value && value.length > 0) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${envName} is not set. Refusing to issue tokens without a real secret.`,
    );
  }
  return fallback;
}

/**
 * Issue a new access + refresh token pair for a given user.
 *
 * @param userId - Identifier of the user the tokens represent (`sub`).
 * @param roleId - Identifier of the user's currently assigned role.
 * @returns A {@link TokenPair} with fresh, signed JWT strings.
 */
export function generateTokens(userId: string, roleId: string): TokenPair {
  // Use the single JWT_SECRET set in .env as the default signing secret for
  // both token kinds. If an explicit JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
  // pair is provided later, those take precedence (allowing key rotation
  // and asymmetric refresh signing on production).
  const sharedSecret = process.env.JWT_SECRET;
  const accessSecret = requireJwtSecret(
    'JWT_ACCESS_SECRET',
    sharedSecret ?? 'dev-access-secret-change-me',
    true,
  );
  const refreshSecret = requireJwtSecret(
    'JWT_REFRESH_SECRET',
    sharedSecret ?? 'dev-refresh-secret-change-me',
    true,
  );

  const payload: TokenPayload = { sub: userId, role: roleId };

  const accessToken = jwtSign(
    payload,
    accessSecret,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    { expiresIn: DEFAULT_ACCESS_TTL } as object,
  );
  const refreshToken = jwtSign(
    payload,
    refreshSecret,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    { expiresIn: DEFAULT_REFRESH_TTL } as object,
  );

  return { accessToken, refreshToken };
}

/**
 * Decode and verify an access token, returning the embedded claims.
 *
 * @throws `JsonWebTokenError` family of errors when the token is
 *         malformed, tampered with, or signed with a different secret.
 * @throws `TokenExpiredError` when the token has expired past its `exp`.
 */
export function verifyAccessToken(token: string): TokenPayload {
  const sharedSecret = process.env.JWT_SECRET;
  const accessSecret = requireJwtSecret(
    'JWT_ACCESS_SECRET',
    sharedSecret ?? 'dev-access-secret-change-me',
  );
  return jwtVerify(token, accessSecret) as TokenPayload;
}

/**
 * Decode and verify a refresh token, returning the embedded claims.
 *
 * @throws `JsonWebTokenError` when the token is malformed/invalid.
 * @throws `TokenExpiredError` when the token has expired past its `exp`.
 */
export function verifyRefreshToken(token: string): TokenPayload {
  const sharedSecret = process.env.JWT_SECRET;
  const refreshSecret = requireJwtSecret(
    'JWT_REFRESH_SECRET',
    sharedSecret ?? 'dev-refresh-secret-change-me',
  );
  return jwtVerify(token, refreshSecret) as TokenPayload;
}

/**
 * Produce a high-entropy opaque token suitable for email-verification
 * one-time links. The result is URL-safe and has 256 bits of entropy.
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Produce a high-entropy opaque token suitable for password-reset
 * one-time links. Uses the same underlying entropy source as
 * {@link generateVerificationToken} but callers should treat them as
 * distinct — they are stored on separate `User` fields and consumed by
 * separate endpoints.
 */
export function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}
