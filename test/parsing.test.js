const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");

const { RESPONSE_FIELDS } = require("../src/response");
const { createFixtureServer, createTestApp, htmlRoute } = require("./helpers");

test("POST / returns only the explicit response fields for a readable article", async (t) => {
  const fixture = await createFixtureServer({
    "/article": htmlRoute("article-basic"),
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

test("POST / falls back to the document language in the response", async (t) => {
  const fixture = await createFixtureServer({
    "/article": (_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
        <html lang="fr">
          <head><title>Bonjour</title></head>
          <body><article><h1>Bonjour</h1><p>Texte lisible.</p></article></body>
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

  assert.equal(response.body.lang, "fr");
});
