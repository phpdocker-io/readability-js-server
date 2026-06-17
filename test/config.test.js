const test = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULTS, loadConfig, validateConfig } = require("../src/config");
const { createReadabilityOptions } = require("../src/app");

test("configuration defaults are loaded and validated", () => {
  assert.deepEqual(loadConfig({}), {
    port: DEFAULTS.PORT,
    requestBodyLimit: DEFAULTS.REQUEST_BODY_LIMIT,
    fetchTimeoutMs: DEFAULTS.FETCH_TIMEOUT_MS,
    fetchMaxBytes: DEFAULTS.FETCH_MAX_BYTES,
    fetchMaxRedirects: DEFAULTS.FETCH_MAX_REDIRECTS,
    blockPrivateNetworks: DEFAULTS.BLOCK_PRIVATE_NETWORKS,
    readabilityMaxElems: undefined,
    maxConcurrentRequests: DEFAULTS.MAX_CONCURRENT_REQUESTS,
    contentFormat: DEFAULTS.CONTENT_FORMAT,
  });

  assert.throws(
    () =>
      loadConfig({
        PORT: "70000",
      }),
    /PORT must be <= 65535/,
  );
});

test("CONTENT_FORMAT env var changes the server default content format", () => {
  assert.equal(loadConfig({}).contentFormat, "markdown");
  assert.equal(loadConfig({ CONTENT_FORMAT: "html" }).contentFormat, "html");

  assert.equal(
    validateConfig({
      port: 3000,
      requestBodyLimit: "16kb",
      fetchTimeoutMs: 10000,
      fetchMaxBytes: 5 * 1024 * 1024,
      fetchMaxRedirects: 5,
      blockPrivateNetworks: true,
      maxConcurrentRequests: 10,
      contentFormat: "html",
    }).contentFormat,
    "html",
  );

  assert.throws(
    () => loadConfig({ CONTENT_FORMAT: "xml" }),
    /CONTENT_FORMAT must be one of/,
  );
});

test("readability options are only applied when configured", () => {
  assert.equal(
    createReadabilityOptions({ readabilityMaxElems: undefined }),
    undefined,
  );
  assert.deepEqual(createReadabilityOptions({ readabilityMaxElems: 2500 }), {
    maxElemsToParse: 2500,
  });
});
