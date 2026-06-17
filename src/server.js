const fs = require("fs");
const path = require("path");

const { loadConfig } = require("./config");
const { createLogger } = require("./logger");
const app = require("./app");

const config = loadConfig();
const logger = createLogger();
const version = fs
  .readFileSync(path.join(__dirname, "..", "release"))
  .toString()
  .split(" ")[0];

const shutdownTimeoutMs = 10_000;
const server = app.listen(config.port, () => {
  logger.info(
    `Readability.js server v${version} listening on port ${config.port}!`,
  );
});

let isShuttingDown = false;

function closeServer(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  process.exitCode = 0;

  logger.info(
    `Received ${signal}, starting graceful shutdown with a ${shutdownTimeoutMs}ms timeout...`,
  );

  if (typeof server.closeIdleConnections === "function") {
    server.closeIdleConnections();
  }

  const forceCloseTimer = setTimeout(() => {
    logger.info(
      `Graceful shutdown timed out after ${shutdownTimeoutMs}ms, closing remaining connections...`,
    );

    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
  }, shutdownTimeoutMs);

  forceCloseTimer.unref();

  server.close((error) => {
    clearTimeout(forceCloseTimer);

    if (error) {
      logger.error("HTTP server shutdown failed", error);
      return;
    }

    logger.info("HTTP server closed cleanly, exiting.");
    process.exitCode = 0;
  });
}

process.on("SIGINT", () => {
  closeServer("SIGINT");
});

process.on("SIGTERM", () => {
  closeServer("SIGTERM");
});
