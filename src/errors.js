"use strict";

const INVALID_REQUEST_CODES = new Set([
  "FETCH_INVALID_URL",
  "FETCH_UNSUPPORTED_PROTOCOL",
]);

class FetchArticleError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "FetchArticleError";
    this.code = code;
    this.details = details;
  }

  get statusCode() {
    return INVALID_REQUEST_CODES.has(this.code) ? 400 : 500;
  }

  toResponseBody() {
    return {
      code: this.code,
      message: this.message,
      ...this.details,
    };
  }
}

function normalizeFetchError(error) {
  if (error instanceof FetchArticleError) {
    return error;
  }

  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return new FetchArticleError("FETCH_TIMEOUT", "Fetch request timed out");
  }

  return new FetchArticleError("FETCH_NETWORK_ERROR", "Fetch request failed", {
    cause: error?.code || error?.name || "UNKNOWN",
  });
}

module.exports = { FetchArticleError, normalizeFetchError };
