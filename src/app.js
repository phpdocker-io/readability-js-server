const express = require("express");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const createDOMPurify = require("dompurify");

const { loadConfig, validateConfig } = require("./config");
const { normalizeFetchError } = require("./errors");
const { fetchArticleHtml } = require("./fetcher");
const { toMarkdown } = require("./markdown");
const { mapArticleResponse } = require("./response");

const DOMPurify = createDOMPurify(new JSDOM("").window);

const INVALID_REQUEST_MESSAGE =
  'Send JSON, like so: {"url": "https://url/to/whatever"}';
const INVALID_GET_MESSAGE =
  'POST (not GET) JSON, like so: {"url": "https://url/to/whatever"}';

const domPurifyOptions = {
  ADD_TAGS: ["iframe", "video"],
  ADD_ATTR: [
    "allow",
    "allowfullscreen",
    "autoplay",
    "controls",
    "frameborder",
    "loading",
    "loop",
    "muted",
    "playsinline",
    "poster",
    "preload",
    "referrerpolicy",
    "scrolling",
  ],
};

function createConcurrencyGate(maxConcurrentRequests) {
  let activeRequests = 0;

  return (req, res, next) => {
    if (activeRequests >= maxConcurrentRequests) {
      res.status(429).send({
        error: "Server is busy, try again later",
        details: {
          code: "SERVER_OVERLOADED",
          maxConcurrentRequests,
        },
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

function validateRequestContentFormat(rawValue, defaultFormat) {
  if (rawValue === undefined) {
    return defaultFormat;
  }

  const validFormats = ["markdown", "html"];
  const normalized = String(rawValue).trim().toLowerCase();

  if (!validFormats.includes(normalized)) {
    throw new Error(`contentFormat must be one of: ${validFormats.join(", ")}`);
  }

  return normalized;
}

function createReadabilityOptions(config) {
  if (config.readabilityMaxElems === undefined) {
    return undefined;
  }

  return {
    maxElemsToParse: config.readabilityMaxElems,
  };
}

function sanitizeArticleContent(content) {
  if (!content) {
    return null;
  }

  return DOMPurify.sanitize(content, domPurifyOptions);
}

function parseArticle(html, url, config, contentFormat) {
  const dom = new JSDOM(html, { url });
  const parsed = new Readability(
    dom.window.document,
    createReadabilityOptions(config),
  ).parse();

  const sanitizedContent = sanitizeArticleContent(parsed?.content ?? null);
  const finalContent =
    sanitizedContent !== null && contentFormat === "markdown"
      ? toMarkdown(sanitizedContent)
      : sanitizedContent;

  const article = parsed ? { ...parsed, content: finalContent } : null;

  return mapArticleResponse(url, article, dom.window.document);
}

function createApp(configInput, logger) {
  const config = validateConfig(configInput);
  const log = logger || {
    info(msg) {
      console.log(`[${new Date().toISOString()}] ${msg}`);
    },
    error(msg, err) {
      if (err) {
        console.error(`[${new Date().toISOString()}] ${msg}`, err);
      } else {
        console.error(`[${new Date().toISOString()}] ${msg}`);
      }
    },
  };

  const app = express();

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(express.json({ limit: config.requestBodyLimit }));
  app.use(createConcurrencyGate(config.maxConcurrentRequests));

  app.get("/", (_req, res) => {
    res.status(400).send({ error: INVALID_GET_MESSAGE });
  });

  app.post("/", async (req, res) => {
    const url = req.body?.url;

    if (url === undefined || url === "") {
      res.status(400).send({ error: INVALID_REQUEST_MESSAGE });
      return;
    }

    let contentFormat;
    try {
      contentFormat = validateRequestContentFormat(
        req.body?.contentFormat,
        config.contentFormat,
      );
    } catch (error) {
      res.status(400).send({ error: error.message });
      return;
    }

    log.info(`Fetching ${url}...`);

    try {
      const response = await fetchArticleHtml(url, config);
      const article = parseArticle(
        response.body,
        response.finalUrl,
        config,
        contentFormat,
      );

      log.info(`Fetched and parsed ${url} successfully`);
      res.status(200).send(article);
    } catch (error) {
      log.error(`Failed to fetch or parse ${url}`, error);

      const normalized = normalizeFetchError(error);

      res.status(normalized.statusCode).send({
        error:
          normalized.statusCode === 400
            ? INVALID_REQUEST_MESSAGE
            : "Some weird error fetching the content",
        details: normalized.toResponseBody(),
      });
    }
  });

  return app;
}

module.exports = createApp(loadConfig());
module.exports.createApp = createApp;
module.exports.createReadabilityOptions = createReadabilityOptions;
module.exports.messages = {
  INVALID_GET_MESSAGE,
  INVALID_REQUEST_MESSAGE,
};
