const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createFixtureServer } = require("./helpers");

test("createFixtureServer rejects non-function route handlers", async (t) => {
  const fixture = await createFixtureServer({
    "/broken": "not-a-function",
  });

  t.after(async () => {
    await fixture.close();
  });

  const response = await new Promise((resolve, reject) => {
    const request = http.request(`${fixture.baseUrl}/broken`, (res) => {
      const chunks = [];

      res.on("data", (chunk) => {
        chunks.push(chunk);
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    request.on("error", reject);
    request.end();
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.body, "invalid route handler");
});
