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

app.listen(config.port, () => {
  logger.info(
    `Readability.js server v${version} listening on port ${config.port}!`,
  );
});
