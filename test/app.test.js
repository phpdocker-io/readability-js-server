const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const dns = require("node:dns/promises");
const supertest = require("supertest");

const { DEFAULTS, loadConfig } = require("../src/config");
const { RESPONSE_FIELDS } = require("../src/response");
const { createApp, createReadabilityOptions, messages } = require("../src/app");

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

function postJson(server, payload) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const body = JSON.stringify(payload);
    const request = http.request(
      {
        method: "POST",
        host: "127.0.0.1",
        port: address.port,
        path: "/",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          });
        });
      },
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function assertFetchFailureShape(
  response,
  expectedCode,
  expectedError = "Some weird error fetching the content",
) {
  assert.equal(response.body.error, expectedError);
  assert.equal(typeof response.body.details, "object");
  assert.ok(response.body.details);
  assert.equal(response.body.details.code, expectedCode);
  assert.equal(typeof response.body.details.message, "string");
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

test("readability options are only applied when configured", () => {
  assert.equal(
    createReadabilityOptions({ readabilityMaxElems: undefined }),
    undefined,
  );
  assert.deepEqual(createReadabilityOptions({ readabilityMaxElems: 2500 }), {
    maxElemsToParse: 2500,
  });
});

test("POST / blocks private-network targets by default", async (t) => {
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
    .expect(500);

  assertFetchFailureShape(response, "FETCH_PRIVATE_NETWORK_BLOCKED");
  assert.equal(response.body.details.address, "127.0.0.1");
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

  const response = await supertest(
    createTestApp({
      blockPrivateNetworks: false,
    }),
  )
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

test("POST / sanitizes returned article content", async (t) => {
  const fixture = await createFixtureServer({
    "/article": (_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
        <html lang="en">
          <head>
            <title>Unsafe headline</title>
          </head>
          <body>
            <article>
              <h1>Unsafe headline</h1>
              <p>Lead paragraph.</p>
              <img src="https://cdn.example/image.jpg" onerror="alert('xss')">
              <video controls src="javascript:alert('xss')" onclick="alert('xss')"></video>
              <script>alert("xss")</script>
              <p>Tail paragraph.</p>
            </article>
          </body>
        </html>`);
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({
      blockPrivateNetworks: false,
    }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/article` })
    .expect(200);

  assert.doesNotMatch(response.body.content, /<script/i);
  assert.doesNotMatch(response.body.content, /\sonerror=/i);
  assert.doesNotMatch(response.body.content, /\sonclick=/i);
  assert.doesNotMatch(response.body.content, /javascript:/i);
  assert.match(
    response.body.content,
    /<img[^>]*src="https:\/\/cdn\.example\/image\.jpg"/,
  );
  assert.match(response.body.content, /<video controls=""><\/video>/);
});

test("POST / preserves allowed iframe and video tags in returned content", async (t) => {
  const fixture = await createFixtureServer({
    "/article": (_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
        <html lang="en">
          <head>
            <title>Media headline</title>
          </head>
          <body>
            <article>
              <h1>Media headline</h1>
              <p>Lead paragraph.</p>
              <iframe
                src="https://www.youtube.com/embed/abc123"
                allowfullscreen
              ></iframe>
              <video controls src="https://cdn.example/video.mp4"></video>
              <p>Tail paragraph.</p>
            </article>
          </body>
        </html>`);
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({
      blockPrivateNetworks: false,
    }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/article` })
    .expect(200);

  assert.match(
    response.body.content,
    /<iframe[^>]*src="https:\/\/www\.youtube\.com\/embed\/abc123"[^>]*allowfullscreen=""><\/iframe>/,
  );
  assert.match(
    response.body.content,
    /<video controls="" src="https:\/\/cdn\.example\/video\.mp4"><\/video>/,
  );
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
  assert.equal(response.body.error, messages.INVALID_REQUEST_MESSAGE);
  assert.equal(response.body.details.protocol, "ftp:");
});

test("POST / follows redirects when the targets remain allowed", async (t) => {
  const fixture = await createFixtureServer({
    "/start": (_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", "/article");
      res.end();
    },
    "/article": (_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
        <html>
          <head>
            <title>Redirected headline</title>
          </head>
          <body>
            <article>
              <h1>Redirected headline</h1>
              <p>Redirect success body.</p>
            </article>
          </body>
        </html>`);
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({
      blockPrivateNetworks: false,
    }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/start` })
    .expect(200);

  assert.equal(response.body.title, "Redirected headline");
  assert.match(response.body.content, /Redirect success body/);
});

test("POST / rejects redirects to private networks when blocking is enabled", async (t) => {
  t.after(() => {
    t.mock.restoreAll();
  });

  t.mock.method(dns, "lookup", async (hostname) => {
    if (hostname === "public.example") {
      return [{ address: "93.184.216.34", family: 4 }];
    }

    throw Object.assign(new Error(`unexpected hostname ${hostname}`), {
      code: "ENOTFOUND",
    });
  });

  t.mock.method(global, "fetch", async () => {
    return new Response(null, {
      status: 302,
      headers: {
        location: "http://127.0.0.1/private-article",
      },
    });
  });

  const response = await supertest(createTestApp())
    .post("/")
    .send({ url: "http://public.example/start" })
    .expect(500);

  assertFetchFailureShape(response, "FETCH_PRIVATE_NETWORK_BLOCKED");
  assert.equal(response.body.details.address, "127.0.0.1");
});

test("POST / returns a stable redirect-limit error for redirect loops", async (t) => {
  const fixture = await createFixtureServer({
    "/loop-a": (_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", "/loop-b");
      res.end();
    },
    "/loop-b": (_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", "/loop-a");
      res.end();
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({
      blockPrivateNetworks: false,
      fetchMaxRedirects: 1,
    }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/loop-a` })
    .expect(500);

  assertFetchFailureShape(response, "FETCH_REDIRECT_LIMIT_EXCEEDED");
  assert.equal(response.body.details.maxRedirects, 1);
});

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
    createTestApp({
      blockPrivateNetworks: false,
      fetchTimeoutMs: 20,
    }),
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
    createTestApp({
      blockPrivateNetworks: false,
      fetchMaxBytes: 32,
    }),
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
    createTestApp({
      blockPrivateNetworks: false,
    }),
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
    createTestApp({
      blockPrivateNetworks: false,
    }),
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
    createTestApp({
      blockPrivateNetworks: false,
    }),
  )
    .post("/")
    .send({ url: "https://example.com/article" })
    .expect(500);

  assertFetchFailureShape(response, "FETCH_NETWORK_ERROR");
  assert.equal(response.body.details.cause, "TypeError");
  assert.equal(response.body.details.message, "Fetch request failed");
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
  assert.equal(response.body.error, messages.INVALID_REQUEST_MESSAGE);
  assert.equal(response.body.details.url, "not a url");
});

test("POST / returns a stable overload response when concurrent work exceeds the limit", async (t) => {
  const releaseFetch = Promise.withResolvers();
  let fetchCalls = 0;

  const fetchMock = t.mock.method(global, "fetch", async () => {
    fetchCalls += 1;

    if (fetchCalls === 1) {
      await releaseFetch.promise;
    }

    return new Response(
      "<html><body><article><p>Queued article.</p></article></body></html>",
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      },
    );
  });

  t.after(() => {
    fetchMock.mock.restore();
  });

  const server = http.createServer(
    createTestApp({
      blockPrivateNetworks: false,
      maxConcurrentRequests: 1,
    }),
  );

  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => {
    server.once("listening", resolve);
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const firstRequest = postJson(server, {
    url: "https://example.com/slow-article",
  });

  await new Promise((resolve) => setImmediate(resolve));

  const secondResponse = await postJson(server, {
    url: "https://example.com/fast-article",
  });

  releaseFetch.resolve();
  const firstResponse = await firstRequest;

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 429);
  assert.deepEqual(secondResponse.body, {
    error: "Server is busy, try again later",
    details: {
      code: "SERVER_OVERLOADED",
      maxConcurrentRequests: 1,
    },
  });
});
