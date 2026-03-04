import { HttpError } from '../contracts/errors.js';

/**
 * Framework-agnostic handler that can be used inside Next.js route handlers.
 *
 * Expected body shape:
 * {
 *   event: <event object without sequenceNumber>,
 *   expectedVersion?: number
 * }
 */
export async function createEventHandler({ eventService, body }) {
  try {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;
    const { event, expectedVersion } = payload ?? {};

    if (!event || typeof event !== 'object') {
      throw new HttpError(422, 'Request must include an event object');
    }

    const result = await eventService.appendEvent(event, { expectedVersion });
    return {
      status: result.statusCode,
      body: result
    };
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        status: error.status,
        body: {
          error: {
            message: error.message,
            details: error.details
          }
        }
      };
    }

    return {
      status: 500,
      body: {
        error: {
          message: 'Unexpected error while processing event'
        }
      }
    };
  }
}
