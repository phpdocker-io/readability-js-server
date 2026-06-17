const express = require("express");
const axios = require("axios").default;
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const createDOMPurify = require("dompurify");

const { loadConfig, validateConfig } = require("./config");
const { createLogger } = require("./logger");
const { mapArticleResponse } = require("./response");

const DOMPurify = createDOMPurify(new JSDOM("").window);

const INVALID_REQUEST_MESSAGE =
  'Send JSON, like so: {"url": "https://url/to/whatever"}';
const INVALID_GET_MESSAGE =
  'POST (not GET) JSON, like so: {"url": "https://url/to/whatever"}';

const domPurifyOptions = {
  ADD_TAGS: ["iframe", "video"],
};

function createConcurrencyGate(maxConcurrentRequests) {
  let activeRequests = 0;

  return (req, res, next) => {
    if (activeRequests >= maxConcurrentRequests) {
      res.status(503).send({
        error: "Server is busy, try again later",
      });
      return;
    }

    activeRequests += 1;

    let released = false;
    const release = () => {
      if (released) {
        return;
      }

      released = true;
      activeRequests -= 1;
    };

    res.on("finish", release);
    res.on("close", release);

    next();
  };
}

function createReadabilityOptions(config) {
  if (config.readabilityMaxElems === undefined) {
    return undefined;
  }

  return {
    maxElemsToParse: config.readabilityMaxElems,
  };
}

function fetchArticleHtml(url, config) {
  return axios.get(url, {
    timeout: config.fetchTimeoutMs,
    maxContentLength: config.fetchMaxBytes,
    maxRedirects: config.fetchMaxRedirects,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0",
    },
  });
}

function createApp(configInput, loggerInput) {
  const config = validateConfig(configInput);
  const logger = loggerInput || createLogger();
  const app = express();

  app.use(express.json({ limit: config.requestBodyLimit }));
  app.use(createConcurrencyGate(config.maxConcurrentRequests));

  app.get("/", (_req, res) => {
    res.status(400).send({
      error: INVALID_GET_MESSAGE,
    });
  });

  app.post("/", async (req, res) => {
    const url = req.body?.url;

    if (url === undefined || url === "") {
      res.status(400).send({
        error: INVALID_REQUEST_MESSAGE,
      });
      return;
    }

    logger.info(`Fetching ${url}...`);

    try {
      const response = await fetchArticleHtml(url, config);
      const dom = new JSDOM(response.data, { url });
      const parsed = new Readability(
        dom.window.document,
        createReadabilityOptions(config),
      ).parse();
      const article = parsed
        ? {
            ...parsed,
            content: parsed.content
              ? DOMPurify.sanitize(parsed.content, domPurifyOptions)
              : null,
          }
        : null;

      logger.info(`Fetched and parsed ${url} successfully`);

      res
        .status(200)
        .send(mapArticleResponse(url, article, dom.window.document));
    } catch (error) {
      logger.error(`Failed to fetch or parse ${url}`, error);

      res.status(500).send({
        error: "Some weird error fetching the content",
        details: {
          message: error.message,
        },
      });
    }
  });

  return app;
}

module.exports = createApp(loadConfig());
module.exports.createApp = createApp;
module.exports.messages = {
  INVALID_GET_MESSAGE,
  INVALID_REQUEST_MESSAGE,
};
