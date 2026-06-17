const http = require("node:http");
const { once } = require("node:events");

const { createApp } = require("../src/app");
const { loadConfig } = require("../src/config");

function parseArgs(argv) {
  const options = {
    requests: 100,
    concurrency: 2,
    sampleEvery: 10,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if (token === "--requests") {
      options.requests = Number.parseInt(value, 10);
      index += 1;
    } else if (token === "--concurrency") {
      options.concurrency = Number.parseInt(value, 10);
      index += 1;
    } else if (token === "--sample-every") {
      options.sampleEvery = Number.parseInt(value, 10);
      index += 1;
    }
  }

  if (!Number.isInteger(options.requests) || options.requests <= 0) {
    throw new Error("--requests must be a positive integer");
  }

  if (!Number.isInteger(options.concurrency) || options.concurrency <= 0) {
    throw new Error("--concurrency must be a positive integer");
  }

  if (!Number.isInteger(options.sampleEvery) || options.sampleEvery <= 0) {
    throw new Error("--sample-every must be a positive integer");
  }

  return options;
}

function formatMegabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function snapshotMemory(completed, failures) {
  if (global.gc) {
    global.gc();
  }

  const usage = process.memoryUsage();

  return {
    completed,
    failures,
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

function trend(samples, field) {
  if (samples.length < 2) {
    return 0;
  }

  return samples[samples.length - 1][field] - samples[0][field];
}

function logSample(sample) {
  console.log(
    [
      `sample completed=${sample.completed}`,
      `failures=${sample.failures}`,
      `rss=${formatMegabytes(sample.rss)}`,
      `heapUsed=${formatMegabytes(sample.heapUsed)}`,
      `external=${formatMegabytes(sample.external)}`,
      `arrayBuffers=${formatMegabytes(sample.arrayBuffers)}`,
    ].join(" "),
  );
}

async function startServer(handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

function createFixtureHtml() {
  return `<!doctype html>
    <html lang="en">
      <head>
        <title>Memory soak article</title>
        <meta property="article:published_time" content="2026-06-17T00:00:00Z">
      </head>
      <body>
        <main>
          <article>
            <h1>Memory soak article</h1>
            ${"<p>This is repeated fixture content for memory soak runs.</p>".repeat(120)}
            <iframe src="https://www.youtube.com/embed/example" allowfullscreen></iframe>
            <video controls src="https://cdn.example/video.mp4"></video>
          </article>
        </main>
      </body>
    </html>`;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    json: await response.json(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const fixtureHtml = createFixtureHtml();

  const fixture = await startServer((req, res) => {
    if (req.url !== "/article") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(fixtureHtml);
  });

  const app = createApp({
    ...loadConfig({}),
    blockPrivateNetworks: false,
    maxConcurrentRequests: Math.max(options.concurrency, 2),
  });
  const api = await startServer(app);

  let completed = 0;
  let failures = 0;
  const samples = [snapshotMemory(completed, failures)];

  console.log(
    `memory:soak requests=${options.requests} concurrency=${options.concurrency} fixture=${fixture.url}/article api=${api.url}/`,
  );
  logSample(samples[0]);

  const workers = Array.from(
    { length: options.concurrency },
    async (_, worker) => {
      for (
        let index = worker;
        index < options.requests;
        index += options.concurrency
      ) {
        const response = await postJson(api.url, {
          url: `${fixture.url}/article`,
        });

        if (response.status !== 200) {
          failures += 1;
          console.error(
            `request ${index + 1} failed status=${response.status} code=${response.json.details?.code || "UNKNOWN"}`,
          );
        }

        completed += 1;

        if (
          completed % options.sampleEvery === 0 ||
          completed === options.requests
        ) {
          const sample = snapshotMemory(completed, failures);
          samples.push(sample);
          logSample(sample);
        }
      }
    },
  );

  try {
    await Promise.all(workers);
  } finally {
    await Promise.all([
      new Promise((resolve, reject) => {
        fixture.server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
      new Promise((resolve, reject) => {
        api.server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    ]);
  }

  console.log(
    [
      "memory:soak summary",
      `requests=${options.requests}`,
      `failures=${failures}`,
      `rss=${formatMegabytes(samples[samples.length - 1].rss)}`,
      `heapUsed=${formatMegabytes(samples[samples.length - 1].heapUsed)}`,
      `external=${formatMegabytes(samples[samples.length - 1].external)}`,
      `rssTrend=${formatMegabytes(trend(samples, "rss"))}`,
      `heapTrend=${formatMegabytes(trend(samples, "heapUsed"))}`,
      `externalTrend=${formatMegabytes(trend(samples, "external"))}`,
    ].join(" "),
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
