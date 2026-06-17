"use strict";

const { parseHTML } = require("linkedom");
const { Readability } = require("@mozilla/readability");
const sanitizeHtml = require("sanitize-html");

const { toMarkdown } = require("./markdown");
const { mapArticleResponse } = require("./response");

const { window } = parseHTML("");
const domParser = new window.DOMParser();

const sanitizeHtmlOptions = {
  allowedTags: false,
  allowedAttributes: {
    iframe: [
      "allow",
      "allowfullscreen",
      "frameborder",
      "loading",
      "referrerpolicy",
      "scrolling",
      "src",
    ],
    video: [
      "autoplay",
      "controls",
      "loop",
      "muted",
      "playsinline",
      "poster",
      "preload",
      "src",
    ],
    a: ["href", "name"],
    img: ["src", "alt"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    iframe: ["https"],
    video: ["https"],
  },
  disallowedTagsMode: "discard",
};

function createReadabilityOptions(config) {
  if (config.readabilityMaxElems === undefined) {
    return undefined;
  }
  return { maxElemsToParse: config.readabilityMaxElems };
}

function sanitizeArticleContent(content) {
  if (!content) {
    return null;
  }
  return sanitizeHtml(content, sanitizeHtmlOptions);
}

function parseArticle(html, url, config, contentFormat) {
  const baseTag = `<base href="${url.replace(/"/g, "&quot;")}">`;
  const htmlWithBase = /<head[^>]*>/i.test(html)
    ? html.replace(/(<head[^>]*>)/i, `$1${baseTag}`)
    : html.replace(/(<html[^>]*>)/i, `$1<head>${baseTag}</head>`);

  const doc = domParser.parseFromString(htmlWithBase, "text/html");

  // linkedom omits Document.documentURI; Readability's _fixRelativeUris uses baseURI == documentURI
  // as the same-document signal. Shim it so '#anchor' links stay relative. The 'about:blank' fallback
  // is defensive — the base-href injection always runs first, so baseURI is never null in practice.
  doc.documentURI = doc.baseURI ?? "about:blank";

  const parsed = new Readability(doc, createReadabilityOptions(config)).parse();

  const sanitizedContent = sanitizeArticleContent(parsed?.content ?? null);
  const finalContent =
    sanitizedContent !== null && contentFormat === "markdown"
      ? toMarkdown(sanitizedContent)
      : sanitizedContent;

  const article = parsed ? { ...parsed, content: finalContent } : null;

  return mapArticleResponse(url, article, doc);
}

process.on("message", (msg) => {
  try {
    const result = parseArticle(
      msg.html,
      msg.url,
      msg.config,
      msg.contentFormat,
    );
    process.send({ id: msg.id, result });
  } catch (error) {
    process.send({
      id: msg.id,
      error: { message: error.message, code: error.code },
    });
  }
});

process.send({ type: "ready" });
