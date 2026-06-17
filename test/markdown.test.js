const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");

const { toMarkdown } = require("../src/markdown");
const { createFixtureServer, createTestApp, htmlRoute } = require("./helpers");

test("POST / returns markdown content by default", async (t) => {
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

  assert.doesNotMatch(response.body.content, /<p>/i);
  assert.doesNotMatch(response.body.content, /<h1>/i);
  assert.match(response.body.content, /This is the lead paragraph/);
});

test("POST / returns HTML content when contentFormat=html is requested", async (t) => {
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
    .send({ url: `${fixture.baseUrl}/article`, contentFormat: "html" })
    .expect(200);

  assert.match(response.body.content, /<p>/i);
  assert.match(response.body.content, /This is the lead paragraph/);
});

test("POST / returns markdown content when contentFormat=markdown is requested explicitly", async (t) => {
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
    .send({ url: `${fixture.baseUrl}/article`, contentFormat: "markdown" })
    .expect(200);

  assert.doesNotMatch(response.body.content, /<p>/i);
  assert.doesNotMatch(response.body.content, /<h1>/i);
  assert.match(response.body.content, /This is the second paragraph/);
});

test("POST / converts Vimeo iframe to markdown embed link", async (t) => {
  const fixture = await createFixtureServer({
    "/article": htmlRoute("article-vimeo"),
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

  assert.match(
    response.body.content,
    /\[Video: Vimeo\]\(https:\/\/player\.vimeo\.com\/video\/123456789\)/,
  );
});

test("POST / preserves allowed iframe and video tags in returned content", async (t) => {
  const fixture = await createFixtureServer({
    "/article": htmlRoute("article-media"),
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

  assert.match(
    response.body.content,
    /\[Video: YouTube\]\(https:\/\/www\.youtube\.com\/embed\/abc123\)/,
  );
  assert.match(
    response.body.content,
    /\[Video\]\(https:\/\/cdn\.example\/video\.mp4\)/,
  );
});

test("POST / converts HTML table to GFM markdown table", async (t) => {
  const fixture = await createFixtureServer({
    "/article": htmlRoute("article-table"),
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

  assert.match(response.body.content, /\|/);
  assert.match(response.body.content, /Name/);
  assert.match(response.body.content, /Score/);
  assert.match(response.body.content, /Alice/);
  assert.doesNotMatch(response.body.content, /<table/i);
  assert.doesNotMatch(response.body.content, /<td/i);
});

test("toMarkdown converts unknown iframe to generic embedded content link", () => {
  const result = toMarkdown(
    '<iframe src="https://embed.unknown-provider.com/widget/abc" allowfullscreen></iframe>',
  );

  assert.match(
    result,
    /\[Embedded content\]\(https:\/\/embed\.unknown-provider\.com\/widget\/abc\)/,
  );
});

test("toMarkdown does not classify unrelated hosts by query-string provider names", () => {
  const result = toMarkdown(
    '<iframe src="https://evil.example/embed?next=https://www.youtube.com/watch?v=abc123"></iframe>',
  );

  assert.doesNotMatch(result, /\[Video: YouTube\]/);
  assert.match(
    result,
    /\[Embedded content\]\(https:\/\/evil\.example\/embed\?next=https:\/\/www\.youtube\.com\/watch\?v=abc123\)/,
  );
});

test("toMarkdown drops iframe and video URLs with unsupported schemes", () => {
  const iframeResult = toMarkdown(
    '<iframe src="javascript:alert(1)"></iframe>',
  );
  const videoResult = toMarkdown('<video src="data:text/html,hello"></video>');

  assert.equal(iframeResult, "");
  assert.equal(videoResult, "");
});
