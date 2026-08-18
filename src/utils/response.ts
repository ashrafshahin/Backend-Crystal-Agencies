import type { Response } from 'express';
import { HTTP_STATUS } from './constants';

/**
 * Shape of every successful API response body produced by {@link sendResponse}.
 * Mirrors the success branch of `API_RESPONSE_ENVELOPE` with typing.
 */
export interface SuccessEnvelope<T> {
  success: true;
  data: T | null;
  message: string;
  errorCode: null;
  errors: Array<Record<string, unknown>>;
  meta: Record<string, unknown> | null;
}

/**
 * Send a standard success response using the shared envelope.
 *
 * @param res      - Express response object.
 * @param data     - Primary payload (e.g. the created user, a list of records).
 * @param message  - Short human-readable description of the outcome.
 * @param status   - HTTP status code. Defaults to 200 OK.
 * @param meta     - Optional pagination / trace metadata attached to responses.
 * @returns The same Express `Response` for call-chain fluency (useful in tests).
 */
export function sendResponse<T>(
  res: Response<SuccessEnvelope<T>>,
  data: T | null = null,
  message: string = 'Success',
  status: number = HTTP_STATUS.OK,
  meta: Record<string, unknown> | null = null,
): Response<SuccessEnvelope<T>> {
  const body: SuccessEnvelope<T> = {
    success: true,
    data,
    message,
    errorCode: null,
    errors: [],
    meta,
  };
  return res.status(status).json(body);
}
