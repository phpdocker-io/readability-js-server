const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");

const { createTestApp, assertFetchFailureShape } = require("./helpers");
const { messages } = require("../src/app");

test("GET / returns guidance for POST JSON", async () => {
  const response = await supertest(createTestApp()).get("/").expect(400);

  assert.deepEqual(response.body, {
    error: messages.INVALID_GET_MESSAGE,
  });
});

test("GET /healthz returns a lightweight probe response", async (t) => {
  const fetchMock = t.mock.method(global, "fetch", async () => {
    throw new Error("fetch should not be called for health checks");
  });

  t.after(() => {
    fetchMock.mock.restore();
  });

  const response = await supertest(createTestApp()).get("/healthz").expect(200);

  assert.deepEqual(response.body, {
    ok: true,
  });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("POST / rejects missing and empty url values", async () => {
  const app = createTestApp();

  await supertest(app)
    .post("/")
    .send({})
    .expect(400)
    .expect(({ body }) => {
      assert.deepEqual(body, {
        error: messages.INVALID_REQUEST_MESSAGE,
      });
    });

  await supertest(app)
    .post("/")
    .send({ url: "" })
    .expect(400)
    .expect(({ body }) => {
      assert.deepEqual(body, {
        error: messages.INVALID_REQUEST_MESSAGE,
      });
    });
});

test("POST / rejects unsupported URL schemes with normalized details", async () => {
  const response = await supertest(createTestApp())
    .post("/")
    .send({ url: "ftp://example.com/article" })
    .expect(400);

  assertFetchFailureShape(
    response,
    "FETCH_UNSUPPORTED_PROTOCOL",
    messages.INVALID_REQUEST_MESSAGE,
  );
  assert.equal(response.body.details.protocol, "ftp:");
});

test("POST / normalizes malformed absolute URLs", async () => {
  const response = await supertest(createTestApp())
    .post("/")
    .send({ url: "not a url" })
    .expect(400);

  assertFetchFailureShape(
    response,
    "FETCH_INVALID_URL",
    messages.INVALID_REQUEST_MESSAGE,
  );
  assert.equal(response.body.details.url, "not a url");
});

test("POST / rejects invalid contentFormat with a descriptive 400 error", async () => {
  const response = await supertest(createTestApp())
    .post("/")
    .send({ url: "https://example.com/article", contentFormat: "xml" })
    .expect(400);

  assert.match(response.body.error, /contentFormat must be one of/i);
  assert.match(response.body.error, /markdown/);
  assert.match(response.body.error, /html/);
});

test("POST / accepts normalized contentFormat values", async (t) => {
  const fetchMock = t.mock.method(global, "fetch", async () => {
    return new Response(
      "<html><body><article><h1>Trimmed format</h1><p>Body.</p></article></body></html>",
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  });

  t.after(() => {
    fetchMock.mock.restore();
  });

  const response = await supertest(
    createTestApp({ blockPrivateNetworks: false }),
  )
    .post("/")
    .send({ url: "https://example.com/article", contentFormat: " HTML " })
    .expect(200);

  assert.match(response.body.content, /<p>Body\.<\/p>/i);
});
