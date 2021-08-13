// Ensure console.log spits out timestamps
require("log-timestamp");

// Express
const app = require("express")();
const bodyParser = require("body-parser").json();
const port = 3000;

// HTTP client
const axios = require("axios").default;

// Readability, dom and dom purify
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const createDOMPurify = require("dompurify");
const DOMPurify = createDOMPurify(new JSDOM("").window);

// Not too happy to allow iframe, but it's the only way to get youtube vids
const domPurifyOptions = {
  ADD_TAGS: ["iframe", "video"],
};

app.get("/", (req, res) => {
  return res.status(400).send({
    error: 'POST (not GET) JSON, like so: {"url": "https://url/to/whatever"}',
  }).end;
});

app.post("/", bodyParser, (req, res) => {
  const url = req.body.url;

  if (url === undefined || url === "") {
    return res.status(400).send({
      error: 'Send JSON, like so: {"url": "https://url/to/whatever"}',
    }).end();
  }

  console.log("Fetching " + url + "...");

  axios
    .get(url)
    .then((response) => {
      const sanitized = DOMPurify.sanitize(response.data, domPurifyOptions);

      const dom = new JSDOM(sanitized, {
        url: url,
      });

      const parsed = new Readability(dom.window.document).parse();

      console.log("Fetched and parsed " + url + " successfully");

      return res.status(200).send({
        url,
        ...parsed
      }).end();
    })
    .catch((error) => {
      return res.status(500).send({
        error: "Some weird error fetching the content",
        details: error,
      }).end();
    });
});

// Start server and dump current server version
const version = require("fs")
  .readFileSync("./release")
  .toString()
  .split(" ")[0];

app.listen(port, () =>
  console.log(`Readability.js server v${version} listening on port ${port}!`)
);
