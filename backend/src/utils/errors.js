export class AppError extends Error {
  constructor(code, message, status = 400, retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function errorResponse(error, correlationId) {
  const known = error instanceof AppError;
  return {
    status: known ? error.status : 500,
    body: {
      error: {
        code: known ? error.code : "INTERNAL_ERROR",
        message: known ? error.message : "The request could not be completed.",
        retryable: known ? error.retryable : false,
        correlationId
      }
    }
  };
}
