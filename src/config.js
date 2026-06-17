const DEFAULTS = Object.freeze({
  PORT: 3000,
  REQUEST_BODY_LIMIT: "16kb",
  FETCH_TIMEOUT_MS: 10000,
  FETCH_MAX_BYTES: 5 * 1024 * 1024,
  FETCH_MAX_REDIRECTS: 5,
  BLOCK_PRIVATE_NETWORKS: true,
  MAX_CONCURRENT_REQUESTS: 10,
  CONTENT_FORMAT: "markdown",
});

const BODY_LIMIT_PATTERN = /^\d+(b|kb|mb|gb)?$/i;

function parseInteger(name, rawValue, { min = 1, max } = {}) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    throw new Error(`${name} must be set`);
  }

  if (!/^-?\d+$/.test(String(rawValue).trim())) {
    throw new Error(`${name} must be an integer`);
  }

  const value = Number.parseInt(String(rawValue), 10);

  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }

  if (value < min) {
    throw new Error(`${name} must be >= ${min}`);
  }

  if (max !== undefined && value > max) {
    throw new Error(`${name} must be <= ${max}`);
  }

  return value;
}

function parseBoolean(name, rawValue) {
  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  const normalized = String(rawValue).trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`${name} must be a boolean`);
}

function parseBodyLimit(rawValue) {
  if (
    typeof rawValue !== "string" ||
    !BODY_LIMIT_PATTERN.test(rawValue.trim())
  ) {
    throw new Error(
      "REQUEST_BODY_LIMIT must be a positive byte size like 16kb or 1048576",
    );
  }

  if (Number.parseInt(rawValue, 10) <= 0) {
    throw new Error(
      "REQUEST_BODY_LIMIT must be a positive byte size like 16kb or 1048576",
    );
  }

  return rawValue.trim().toLowerCase();
}

function parseContentFormat(name, rawValue) {
  const validFormats = ["markdown", "html"];
  const normalized = String(rawValue).trim().toLowerCase();

  if (!validFormats.includes(normalized)) {
    throw new Error(`${name} must be one of: ${validFormats.join(", ")}`);
  }

  return normalized;
}

function validateConfig(configInput) {
  const config = configInput || {};

  return {
    port: parseInteger("PORT", config.port, { min: 1, max: 65535 }),
    requestBodyLimit: parseBodyLimit(config.requestBodyLimit),
    fetchTimeoutMs: parseInteger("FETCH_TIMEOUT_MS", config.fetchTimeoutMs),
    fetchMaxBytes: parseInteger("FETCH_MAX_BYTES", config.fetchMaxBytes),
    fetchMaxRedirects: parseInteger(
      "FETCH_MAX_REDIRECTS",
      config.fetchMaxRedirects,
      {
        min: 0,
      },
    ),
    blockPrivateNetworks: parseBoolean(
      "BLOCK_PRIVATE_NETWORKS",
      config.blockPrivateNetworks,
    ),
    readabilityMaxElems:
      config.readabilityMaxElems === undefined
        ? undefined
        : parseInteger("READABILITY_MAX_ELEMS", config.readabilityMaxElems),
    maxConcurrentRequests: parseInteger(
      "MAX_CONCURRENT_REQUESTS",
      config.maxConcurrentRequests,
    ),
    contentFormat: parseContentFormat("CONTENT_FORMAT", config.contentFormat),
  };
}

function loadConfig(env = process.env) {
  return validateConfig({
    port: env.PORT ?? DEFAULTS.PORT,
    requestBodyLimit: env.REQUEST_BODY_LIMIT ?? DEFAULTS.REQUEST_BODY_LIMIT,
    fetchTimeoutMs: env.FETCH_TIMEOUT_MS ?? DEFAULTS.FETCH_TIMEOUT_MS,
    fetchMaxBytes: env.FETCH_MAX_BYTES ?? DEFAULTS.FETCH_MAX_BYTES,
    fetchMaxRedirects: env.FETCH_MAX_REDIRECTS ?? DEFAULTS.FETCH_MAX_REDIRECTS,
    blockPrivateNetworks:
      env.BLOCK_PRIVATE_NETWORKS ?? DEFAULTS.BLOCK_PRIVATE_NETWORKS,
    readabilityMaxElems:
      env.READABILITY_MAX_ELEMS === undefined
        ? undefined
        : env.READABILITY_MAX_ELEMS,
    maxConcurrentRequests:
      env.MAX_CONCURRENT_REQUESTS ?? DEFAULTS.MAX_CONCURRENT_REQUESTS,
    contentFormat: env.CONTENT_FORMAT ?? DEFAULTS.CONTENT_FORMAT,
  });
}

module.exports = {
  DEFAULTS,
  loadConfig,
  validateConfig,
};
