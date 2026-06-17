const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");

const {
  assertFetchFailureShape,
  createFixtureServer,
  createTestApp,
} = require("./helpers");

test("POST / returns a stable timeout error", async (t) => {
  const fixture = await createFixtureServer({
    "/slow": async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end("<html><body><article><p>Too slow.</p></article></body></html>");
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({ blockPrivateNetworks: false, fetchTimeoutMs: 20 }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/slow` })
    .expect(500);

  assertFetchFailureShape(response, "FETCH_TIMEOUT");
});

test("POST / returns a stable oversized-response error", async (t) => {
  const fixture = await createFixtureServer({
    "/large": (_req, res) => {
      const body = "<html><body>" + "x".repeat(256) + "</body></html>";
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("content-length", Buffer.byteLength(body));
      res.end(body);
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({ blockPrivateNetworks: false, fetchMaxBytes: 32 }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/large` })
    .expect(500);

  assertFetchFailureShape(response, "FETCH_RESPONSE_TOO_LARGE");
  assert.equal(response.body.details.maxBytes, 32);
});

test("POST / rejects non-HTML responses", async (t) => {
  const fixture = await createFixtureServer({
    "/json": (_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({ blockPrivateNetworks: false }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/json` })
    .expect(500);

  assertFetchFailureShape(response, "FETCH_NON_HTML_RESPONSE");
  assert.equal(response.body.details.contentType, "application/json");
});

test("POST / normalizes upstream HTTP failures", async (t) => {
  const fixture = await createFixtureServer({
    "/fail": (_req, res) => {
      res.statusCode = 500;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end("<html><body><p>upstream failed</p></body></html>");
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({ blockPrivateNetworks: false }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/fail` })
    .expect(500);

  assertFetchFailureShape(response, "FETCH_HTTP_ERROR");
  assert.equal(response.body.details.status, 500);
});

test("POST / normalizes low-level fetch failures", async (t) => {
  const fetchMock = t.mock.method(global, "fetch", async () => {
    throw new TypeError("socket hang up");
  });

  t.after(() => {
    fetchMock.mock.restore();
  });

  const response = await supertest(
    createTestApp({ blockPrivateNetworks: false }),
  )
    .post("/")
    .send({ url: "https://example.com/article" })
    .expect(500);

  assertFetchFailureShape(response, "FETCH_NETWORK_ERROR");
  assert.equal(response.body.details.cause, "TypeError");
  assert.equal(response.body.details.message, "Fetch request failed");
});
