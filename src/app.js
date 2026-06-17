const express = require("express");
const dns = require("node:dns/promises");
const net = require("node:net");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const createDOMPurify = require("dompurify");

const { loadConfig, validateConfig } = require("./config");
const { createLogger } = require("./logger");
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

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0";
const HTML_CONTENT_TYPES = new Set(["text/html", "application/xhtml+xml"]);

class FetchArticleError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "FetchArticleError";
    this.code = code;
    this.details = details;
  }
}

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

function isPrivateIpv4(address) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));

  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(address) {
  const normalized = address.toLowerCase();

  if (normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("fe80:")) {
    return true;
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice("::ffff:".length));
  }

  return false;
}

function isPrivateIp(address) {
  const family = net.isIP(address);

  if (family === 4) {
    return isPrivateIpv4(address);
  }

  if (family === 6) {
    return isPrivateIpv6(address);
  }

  return false;
}

async function assertAllowedUrl(rawUrl, config) {
  let parsedUrl;

  try {
    parsedUrl = new URL(rawUrl);
  } catch (_error) {
    throw new FetchArticleError(
      "FETCH_INVALID_URL",
      "URL must be a valid absolute URL",
      { url: rawUrl },
    );
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new FetchArticleError(
      "FETCH_UNSUPPORTED_PROTOCOL",
      "Only http and https URLs are supported",
      {
        protocol: parsedUrl.protocol,
        url: parsedUrl.toString(),
      },
    );
  }

  if (!config.blockPrivateNetworks) {
    return parsedUrl;
  }

  const hostname = parsedUrl.hostname;

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new FetchArticleError(
        "FETCH_PRIVATE_NETWORK_BLOCKED",
        "Requests to private or loopback addresses are blocked",
        {
          address: hostname,
          hostname,
          url: parsedUrl.toString(),
        },
      );
    }

    return parsedUrl;
  }

  let addresses;

  try {
    addresses = await dns.lookup(hostname, {
      all: true,
      verbatim: true,
    });
  } catch (error) {
    throw new FetchArticleError(
      "FETCH_DNS_ERROR",
      `Failed to resolve hostname ${hostname}`,
      {
        hostname,
        cause: error.code || error.name,
      },
    );
  }

  const blockedAddress = addresses.find(({ address }) => isPrivateIp(address));

  if (blockedAddress) {
    throw new FetchArticleError(
      "FETCH_PRIVATE_NETWORK_BLOCKED",
      "Requests to private or loopback addresses are blocked",
      {
        address: blockedAddress.address,
        family: blockedAddress.family,
        hostname,
        url: parsedUrl.toString(),
      },
    );
  }

  return parsedUrl;
}

function validateContentType(response) {
  const contentTypeHeader = response.headers.get("content-type");
  const mediaType = contentTypeHeader
    ? contentTypeHeader.split(";")[0].trim().toLowerCase()
    : "";

  if (HTML_CONTENT_TYPES.has(mediaType)) {
    return;
  }

  throw new FetchArticleError(
    "FETCH_NON_HTML_RESPONSE",
    "Fetched response must be HTML content",
    {
      contentType: contentTypeHeader || null,
      status: response.status,
      url: response.url,
    },
  );
}

async function readBodyWithLimit(response, maxBytes) {
  const contentLengthHeader = response.headers.get("content-length");

  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);

    if (Number.isInteger(contentLength) && contentLength > maxBytes) {
      throw new FetchArticleError(
        "FETCH_RESPONSE_TOO_LARGE",
        `Fetched response exceeded byte limit of ${maxBytes}`,
        {
          contentLength,
          maxBytes,
          url: response.url,
        },
      );
    }
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maxBytes) {
      await reader.cancel("response exceeded configured byte limit");

      throw new FetchArticleError(
        "FETCH_RESPONSE_TOO_LARGE",
        `Fetched response exceeded byte limit of ${maxBytes}`,
        {
          bytesRead: totalBytes,
          maxBytes,
          url: response.url,
        },
      );
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function normalizeFetchError(error) {
  if (error instanceof FetchArticleError) {
    return error;
  }

  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return new FetchArticleError("FETCH_TIMEOUT", "Fetch request timed out");
  }

  return new FetchArticleError("FETCH_NETWORK_ERROR", "Fetch request failed", {
    cause: error?.code || error?.name || "UNKNOWN",
  });
}

async function fetchArticleHtml(url, config) {
  let currentUrl = await assertAllowedUrl(url, config);

  for (let redirectCount = 0; ; redirectCount += 1) {
    let response;

    try {
      response = await fetch(currentUrl, {
        headers: {
          "User-Agent": USER_AGENT,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(config.fetchTimeoutMs),
      });
    } catch (error) {
      throw normalizeFetchError(error);
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount >= config.fetchMaxRedirects) {
        throw new FetchArticleError(
          "FETCH_REDIRECT_LIMIT_EXCEEDED",
          `Fetch exceeded redirect limit of ${config.fetchMaxRedirects}`,
          {
            maxRedirects: config.fetchMaxRedirects,
            status: response.status,
            url: currentUrl.toString(),
          },
        );
      }

      const location = response.headers.get("location");

      if (!location) {
        throw new FetchArticleError(
          "FETCH_REDIRECT_WITHOUT_LOCATION",
          "Redirect response did not include a Location header",
          {
            status: response.status,
            url: currentUrl.toString(),
          },
        );
      }

      currentUrl = await assertAllowedUrl(
        new URL(location, currentUrl).toString(),
        config,
      );
      continue;
    }

    if (!response.ok) {
      throw new FetchArticleError(
        "FETCH_HTTP_ERROR",
        `Fetch failed with status code ${response.status}`,
        {
          status: response.status,
          url: currentUrl.toString(),
        },
      );
    }

    validateContentType(response);

    return {
      body: await readBodyWithLimit(response, config.fetchMaxBytes),
      finalUrl: response.url || currentUrl.toString(),
    };
  }
}

function normalizeErrorDetails(error) {
  const normalizedError = normalizeFetchError(error);

  return {
    code: normalizedError.code,
    message: normalizedError.message,
    ...normalizedError.details,
  };
}

function isInvalidRequestError(error) {
  return (
    error instanceof FetchArticleError &&
    ["FETCH_INVALID_URL", "FETCH_UNSUPPORTED_PROTOCOL"].includes(error.code)
  );
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

    let contentFormat;
    try {
      contentFormat = validateRequestContentFormat(
        req.body?.contentFormat,
        config.contentFormat,
      );
    } catch (error) {
      res.status(400).send({
        error: error.message,
      });
      return;
    }

    logger.info(`Fetching ${url}...`);

    try {
      const response = await fetchArticleHtml(url, config);
      // Intentionally rely on jsdom defaults so inline scripts and external
      // resource loading remain disabled during parsing.
      const dom = new JSDOM(response.body, { url: response.finalUrl });
      const parsed = new Readability(
        dom.window.document,
        createReadabilityOptions(config),
      ).parse();
      const sanitizedContent = sanitizeArticleContent(parsed?.content ?? null);
      const finalContent =
        sanitizedContent !== null && contentFormat === "markdown"
          ? toMarkdown(sanitizedContent)
          : sanitizedContent;
      const article = parsed
        ? {
            ...parsed,
            content: finalContent,
          }
        : null;

      logger.info(`Fetched and parsed ${url} successfully`);

      res
        .status(200)
        .send(mapArticleResponse(url, article, dom.window.document));
    } catch (error) {
      logger.error(`Failed to fetch or parse ${url}`, error);

      const status = isInvalidRequestError(error) ? 400 : 500;

      res.status(status).send({
        error:
          status === 400
            ? INVALID_REQUEST_MESSAGE
            : "Some weird error fetching the content",
        details: normalizeErrorDetails(error),
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
