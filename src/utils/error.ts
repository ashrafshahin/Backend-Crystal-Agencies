import { HTTP_STATUS } from '../utils/constants';
import type { AppError } from '../middleware/errorHandler';

/**
 * Convenience helper for constructing AppErrors in controllers.
 *
 * Instead of manually doing:
 *   const err = new Error('msg');
 *   (err as AppError).statusCode = 404;
 *   (err as AppError).errorCode = 'NOT_FOUND';
 *   return next(err);
 *
 * You can write:
 *   return next(newAppError('Not found', 404, 'NOT_FOUND'));
 *
 * @param message    - Human readable error message placed in the envelope.
 * @param statusCode - HTTP status code the global error handler will use.
 * @param errorCode  - Stable machine-readable error code the client can key off.
 * @param errors     - Optional per-field validation errors.
 */
export function newAppError(
  message: string,
  statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
  errorCode: string = 'INTERNAL_ERROR',
  errors: Array<Record<string, unknown>> = [],
): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  err.errors = errors;
  return err;
}
