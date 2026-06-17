const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { createApp } = require("../src/app");

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
    const routeHandler = Object.hasOwn(routes, req.url)
      ? routes[req.url]
      : routes.default;

    if (routeHandler === undefined) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    if (typeof routeHandler !== "function") {
      res.statusCode = 500;
      res.end("invalid route handler");
      return;
    }

    routeHandler(req, res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();

      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
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

function fixtureHtml(name) {
  return fs.readFileSync(
    path.join(__dirname, "fixtures", `${name}.html`),
    "utf8",
  );
}

function htmlRoute(fixtureName) {
  return (_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(fixtureHtml(fixtureName));
  };
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

module.exports = {
  assertFetchFailureShape,
  createFixtureServer,
  createTestApp,
  fixtureHtml,
  htmlRoute,
  postJson,
};
