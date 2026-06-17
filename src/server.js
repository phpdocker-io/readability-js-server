// Ensure console.log spits out timestamps
require("log-timestamp");

const fs = require("fs");
const path = require("path");

const app = require("./app");

const port = 3000;
const version = fs
  .readFileSync(path.join(__dirname, "..", "release"))
  .toString()
  .split(" ")[0];

app.listen(port, () =>
  console.log(`Readability.js server v${version} listening on port ${port}!`),
);
