const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const supertest = require("supertest");

const { DEFAULTS, loadConfig } = require("../src/config");
const { RESPONSE_FIELDS } = require("../src/response");
const { createApp, messages } = require("../src/app");

function createTestApp(configOverrides) {
  return createApp(
    {
      ...loadConfig({}),
      ...configOverrides,
    },
    {
      info() {},
      error() {},
    },
  );
}

function createFixtureServer(routes) {
  const server = http.createServer((req, res) => {
    const handler = routes[req.url] || routes.default;

    if (!handler) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    handler(req, res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;

      resolve({
        baseUrl,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          }),
      });
    });
  });
}

test("GET / returns guidance for POST JSON", async () => {
  const response = await supertest(createTestApp()).get("/").expect(400);

  assert.deepEqual(response.body, {
    error: messages.INVALID_GET_MESSAGE,
  });
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
  });

  assert.throws(
    () =>
      loadConfig({
        PORT: "70000",
      }),
    /PORT must be <= 65535/,
  );
});

test("POST / returns only the explicit response fields for a readable article", async (t) => {
  const fixture = await createFixtureServer({
    "/article": (_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
        <html lang="en">
          <head>
            <title>Readable headline</title>
            <meta property="article:published_time" content="2024-01-02T03:04:05Z">
          </head>
          <body>
            <main>
              <article>
                <h1>Readable headline</h1>
                <p>This is the lead paragraph.</p>
                <p>This is the second paragraph.</p>
              </article>
            </main>
          </body>
        </html>`);
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(createTestApp())
    .post("/")
    .send({ url: `${fixture.baseUrl}/article` })
    .expect(200);

  assert.deepEqual(Object.keys(response.body), RESPONSE_FIELDS);
  assert.equal(response.body.url, `${fixture.baseUrl}/article`);
  assert.equal(response.body.title, "Readable headline");
  assert.equal(response.body.byline, null);
  assert.equal(response.body.dir, null);
  assert.equal(typeof response.body.content, "string");
  assert.ok(response.body.content.includes("This is the lead paragraph."));
  assert.equal(typeof response.body.length, "number");
  assert.ok(response.body.length > 0);
  assert.equal(response.body.excerpt, "This is the lead paragraph.");
  assert.equal(response.body.siteName, null);
  assert.equal(typeof response.body.textContent, "string");
  assert.ok(
    response.body.textContent.includes("This is the second paragraph."),
  );
  assert.equal(response.body.lang, "en");
  assert.equal(response.body.publishedTime, "2024-01-02T03:04:05Z");
});

test("POST / returns the current 500 shape when fetch fails", async (t) => {
  const fixture = await createFixtureServer({
    "/fail": (_req, res) => {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("upstream failed");
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(createTestApp())
    .post("/")
    .send({ url: `${fixture.baseUrl}/fail` })
    .expect(500);

  assert.equal(response.body.error, "Some weird error fetching the content");
  assert.equal(typeof response.body.details, "object");
  assert.ok(response.body.details);
  assert.match(
    response.body.details.message,
    /Request failed with status code 500/,
  );
});
