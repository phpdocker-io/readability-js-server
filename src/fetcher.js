"use strict";

const { FetchArticleError, normalizeFetchError } = require("./errors");
const { assertAllowedUrl } = require("./network");

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0";
const HTML_CONTENT_TYPES = new Set(["text/html", "application/xhtml+xml"]);

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

module.exports = { fetchArticleHtml };
