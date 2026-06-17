const test = require("node:test");
const assert = require("node:assert/strict");
const dns = require("node:dns/promises");
const supertest = require("supertest");

const {
  assertFetchFailureShape,
  createFixtureServer,
  createTestApp,
} = require("./helpers");

test("POST / follows redirects when the targets remain allowed", async (t) => {
  const fixture = await createFixtureServer({
    "/start": (_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", "/article");
      res.end();
    },
    "/article": (_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(
        "<html><head><title>Redirected headline</title></head><body><article><h1>Redirected headline</h1><p>Redirect success body.</p></article></body></html>",
      );
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({ blockPrivateNetworks: false }),
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
    createTestApp({ blockPrivateNetworks: false, fetchMaxRedirects: 1 }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/loop-a` })
    .expect(500);

  assertFetchFailureShape(response, "FETCH_REDIRECT_LIMIT_EXCEEDED");
  assert.equal(response.body.details.maxRedirects, 1);
});

test("POST / returns a stable error when a redirect omits the Location header", async (t) => {
  const fixture = await createFixtureServer({
    "/start": (_req, res) => {
      res.statusCode = 302;
      res.end();
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({ blockPrivateNetworks: false }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/start` })
    .expect(500);

  assertFetchFailureShape(response, "FETCH_REDIRECT_WITHOUT_LOCATION");
  assert.equal(response.body.details.status, 302);
});
