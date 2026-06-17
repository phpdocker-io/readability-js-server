const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createTestApp, postJson } = require("./helpers");

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
