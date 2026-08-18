import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { Error } from 'mongoose';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants';

/**
 * Extended Error shape recognised by the error handler.
 *
 * Application code can `throw` (or `next(err)` with) any plain `Error`;
 * to drive a specific status code / error code attach any combination
 * of the optional fields below.
 */
export interface AppError extends Error {
  /** Suggested HTTP status code. Falls back to 500 when missing. */
  statusCode?: number;
  /** Stable error code surfaced to clients via the envelope. */
  errorCode?: string;
  /** Extra structured detail (e.g. per-field validation failures). */
  errors?: Array<Record<string, unknown>>;
}

/**
 * Shape of the object emitted by `errorHandler` on every failure path.
 * Returned bodies always match this shape so clients can rely on a
 * single contract whether the failure is from Mongoose, Express, or
 * application code.
 */
export interface StandardErrorBody {
  success: false;
  data: null;
  message: string;
  errorCode: string;
  errors: Array<Record<string, unknown>>;
  meta: null;
}

/**
 * Per the requirements, the handler catches:
 *
 *   - **ValidationError**  → HTTP 400 · `VALIDATION_ERROR` · collects per-field messages
 *   - **CastError**        → HTTP 400 · `CAST_ERROR`
 *   - **Duplicate key (11000)** → HTTP 409 · `DUPLICATE_KEY` · infers the offending field
 *   - **Known AppError**   → uses the attached `statusCode` / `errorCode` / `errors`
 *   - **Anything else**    → HTTP 500 · `INTERNAL_ERROR`
 *
 * In all cases the handler returns a JSON body shaped exactly like
 * {@link StandardErrorBody}, i.e. the error variant of
 * `API_RESPONSE_ENVELOPE`.
 */
const errorHandler: ErrorRequestHandler = (
  err: AppError | Error.ValidationError | Error.CastError | { code?: number; keyPattern?: Record<string, unknown> },
  _req: Request,
  res: Response<StandardErrorBody>,
  _next: NextFunction,
): void => {
  let statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let errorCode: string = ERROR_CODES.INTERNAL_ERROR;
  let message: string = 'An unexpected error occurred. Please try again later.';
  const errors: Array<Record<string, unknown>> = [];

  // --- Mongoose ValidationError ------------------------------------------------
  if (err instanceof Error.ValidationError) {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
    message = 'Validation failed. Please review the submitted data.';
    for (const field of Object.keys(err.errors)) {
      const item = err.errors[field];
      errors.push({
        field,
        message: item?.message ?? 'Invalid value',
        kind: item?.kind ?? undefined,
        value: item?.value ?? undefined,
      });
    }
  }

  // --- Mongoose CastError (bad ObjectId / type cast) --------------------------
  else if (err instanceof Error.CastError) {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    errorCode = ERROR_CODES.CAST_ERROR;
    message = `Invalid value provided for ${err.path}: ${String(err.value)}`;
    errors.push({ field: err.path, value: err.value, kind: err.kind });
  }

  // --- Mongo duplicate key error (E11000) -------------------------------------
  else if (
    err &&
    typeof err === 'object' &&
    (err as { code?: number }).code === 11000
  ) {
    statusCode = HTTP_STATUS.CONFLICT;
    errorCode = ERROR_CODES.DUPLICATE_KEY;
    const dupError = err as { keyPattern?: Record<string, unknown> };
    const dupKeys = dupError.keyPattern
      ? Object.keys(dupError.keyPattern)
      : [];
    const fieldList = dupKeys.length > 0 ? dupKeys.join(', ') : 'unknown';
    message = `A record with this ${fieldList} already exists.`;
    dupKeys.forEach((key) => {
      errors.push({ field: key, message: `${key} must be unique` });
    });
  }

  // --- App-level error with explicit metadata ---------------------------------
  else if (err instanceof Error) {
    const appErr = err as AppError;
    if (typeof appErr.statusCode === 'number') {
      statusCode = appErr.statusCode;
    }
    if (typeof appErr.errorCode === 'string' && appErr.errorCode.length > 0) {
      errorCode = appErr.errorCode;
    }
    if (appErr.message && appErr.message.length > 0) {
      message = appErr.message;
    }
    if (Array.isArray(appErr.errors)) {
      errors.push(...appErr.errors);
    }
  }

  const body: StandardErrorBody = {
    success: false,
    data: null,
    message,
    errorCode,
    errors,
    meta: null,
  };

  res.status(statusCode).json(body);
};

export default errorHandler;
