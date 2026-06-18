const { loadConfig } = require("./config");
const app = require("./app");

const config = loadConfig();

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logError(message, error) {
  if (error) {
    console.error(`[${new Date().toISOString()}] ${message}`, error);
  } else {
    console.error(`[${new Date().toISOString()}] ${message}`);
  }
}

const shutdownTimeoutMs = 10_000;
const server = app.listen(config.port, () => {
  log(`Readability.js server listening on port ${config.port}!`);
});

let isShuttingDown = false;

function closeServer(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  process.exitCode = 0;

  log(
    `Received ${signal}, starting graceful shutdown with a ${shutdownTimeoutMs}ms timeout...`,
  );

  if (typeof server.closeIdleConnections === "function") {
    server.closeIdleConnections();
  }

  const forceCloseTimer = setTimeout(() => {
    log(
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
      logError("HTTP server shutdown failed", error);
      return;
    }

    log("HTTP server closed cleanly, exiting.");
    process.exitCode = 0;
  });
}

process.on("SIGINT", () => {
  closeServer("SIGINT");
});

process.on("SIGTERM", () => {
  closeServer("SIGTERM");
});
