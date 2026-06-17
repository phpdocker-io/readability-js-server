const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const supertest = require("supertest");

const app = require("../src/app");

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
  const response = await supertest(app).get("/").expect(400);

  assert.deepEqual(response.body, {
    error: 'POST (not GET) JSON, like so: {"url": "https://url/to/whatever"}',
  });
});

test("POST / rejects missing and empty url values", async () => {
  await supertest(app)
    .post("/")
    .send({})
    .expect(400)
    .expect(({ body }) => {
      assert.deepEqual(body, {
        error: 'Send JSON, like so: {"url": "https://url/to/whatever"}',
      });
    });

  await supertest(app)
    .post("/")
    .send({ url: "" })
    .expect(400)
    .expect(({ body }) => {
      assert.deepEqual(body, {
        error: 'Send JSON, like so: {"url": "https://url/to/whatever"}',
      });
    });
});

test("POST / returns the current extraction shape for a readable article", async (t) => {
  const fixture = await createFixtureServer({
    "/article": (_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
        <html>
          <head>
            <title>Ignored page title</title>
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

  const response = await supertest(app)
    .post("/")
    .send({ url: `${fixture.baseUrl}/article` })
    .expect(200);

  assert.equal(response.body.url, `${fixture.baseUrl}/article`);
  assert.equal(typeof response.body.title, "string");
  assert.equal(response.body.title, "");
  assert.equal(response.body.byline, null);
  assert.equal(response.body.dir, null);
  assert.equal(typeof response.body.content, "string");
  assert.ok(response.body.content.includes("Readable headline"));
  assert.ok(response.body.content.includes("This is the lead paragraph."));
  assert.equal(typeof response.body.length, "number");
  assert.ok(response.body.length > 0);
  assert.equal(response.body.excerpt, "This is the lead paragraph.");
  assert.equal(response.body.siteName, null);
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

  const response = await supertest(app)
    .post("/")
    .send({ url: `${fixture.baseUrl}/fail` })
    .expect(500);

  assert.equal(response.body.error, "Some weird error fetching the content");
  assert.equal(typeof response.body.details, "object");
  assert.ok(response.body.details);
  assert.match(response.body.details.message, /Request failed with status code 500/);
});
