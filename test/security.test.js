const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");

const {
  assertFetchFailureShape,
  createFixtureServer,
  createTestApp,
  htmlRoute,
} = require("./helpers");

test("POST / blocks private-network targets by default", async (t) => {
  const fixture = await createFixtureServer({
    "/article": htmlRoute("article-basic"),
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

test("POST / sanitizes returned article content", async (t) => {
  const fixture = await createFixtureServer({
    "/article": htmlRoute("article-unsafe"),
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({ blockPrivateNetworks: false }),
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
    /!\[\]\(https:\/\/cdn\.example\/image\.jpg\)/,
  );
});

test("POST / strips script tags and event handlers even in markdown output", async (t) => {
  const fixture = await createFixtureServer({
    "/article": htmlRoute("article-sanitize-markdown"),
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({ blockPrivateNetworks: false }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/article` })
    .expect(200);

  assert.doesNotMatch(response.body.content, /<script/i);
  assert.doesNotMatch(response.body.content, /\sonclick=/i);
  assert.match(response.body.content, /Safe paragraph text/);
  assert.match(response.body.content, /Clean tail paragraph/);
});

test("POST / restricts iframe and video src to https scheme", async (t) => {
  const fixture = await createFixtureServer({
    "/article": (_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
<html lang="en">
  <head><title>Scheme security test</title></head>
  <body>
    <article>
      <h1>Test</h1>
      <p>Lead.</p>
      <iframe src="http://example.com/embed"></iframe>
      <video src="http://example.com/v.mp4"></video>
      <iframe src="https://player.vimeo.com/video/123"></iframe>
      <p>Tail.</p>
    </article>
  </body>
</html>`);
    },
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await supertest(
    createTestApp({ blockPrivateNetworks: false }),
  )
    .post("/")
    .send({ url: `${fixture.baseUrl}/article`, contentFormat: "html" })
    .expect(200);

  assert.doesNotMatch(
    response.body.content,
    /http:\/\/example\.com\/embed/,
    "http iframe src should be stripped",
  );
  assert.doesNotMatch(
    response.body.content,
    /http:\/\/example\.com\/v\.mp4/,
    "http video src should be stripped",
  );
  assert.match(
    response.body.content,
    /https:\/\/player\.vimeo\.com\/video\/123/,
    "https iframe src should survive",
  );
});
