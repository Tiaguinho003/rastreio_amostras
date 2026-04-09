import { HttpError } from '../contracts/errors.js';

function isPrismaInitializationError(error) {
  return (
    Boolean(error) && typeof error === 'object' && error.name === 'PrismaClientInitializationError'
  );
}

function isPrismaDatabaseUnavailable(error) {
  if (!isPrismaInitializationError(error)) {
    return false;
  }

  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    message.includes("can't reach database server") ||
    message.includes('authentication failed') ||
    message.includes('database server')
  );
}

function toDatabaseUnavailableResponse(error) {
  const includeDetails = process.env.NODE_ENV !== 'production';
  return {
    status: 503,
    body: {
      error: {
        message: 'Database unavailable',
        ...(includeDetails ? { details: { reason: error.message } } : {}),
      },
    },
  };
}

export function toHttpErrorResponse(error) {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      body: {
        error: {
          message: error.message,
          details: error.details,
        },
      },
    };
  }

  if (isPrismaDatabaseUnavailable(error)) {
    return toDatabaseUnavailableResponse(error);
  }

  return {
    status: 500,
    body: {
      error: {
        message: 'Internal server error',
      },
    },
  };
}

export async function executeApi(handler, options = {}) {
  return executeApiWithOptions(handler, options);
}

export async function executeApiWithOptions(handler, options = {}) {
  try {
    return await handler();
  } catch (error) {
    if (!(error instanceof HttpError)) {
      const requestId =
        typeof options.requestId === 'string' && options.requestId.length > 0
          ? options.requestId
          : null;
      // Keep useful diagnostics in server logs while returning sanitized payloads.
      console.error('Unhandled API error', {
        requestId,
        name: error?.name ?? 'Error',
        message: error?.message ?? 'Unknown error',
      });
      if (error?.stack) {
        console.error(error.stack);
      }
    }
    return toHttpErrorResponse(error);
  }
}

export function readPositiveInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(422, `${fieldName} must be a non-negative integer`);
  }

  return parsed;
}
