"use strict";

const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const createDOMPurify = require("dompurify");

const { toMarkdown } = require("./markdown");
const { mapArticleResponse } = require("./response");

const maxParses = parseInt(process.env.PARSER_MAX_PARSES || "500", 10);
let parseCount = 0;

const sharedWindow = new JSDOM("").window;
const DOMPurify = createDOMPurify(sharedWindow);
const sharedDOMParser = new sharedWindow.DOMParser();

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
  RETURN_DOM_FRAGMENT: true,
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
  const fragment = DOMPurify.sanitize(content, domPurifyOptions);
  const container = fragment.ownerDocument.createElement("div");
  container.appendChild(fragment);
  return container.innerHTML;
}

function parseArticle(html, url, config, contentFormat) {
  const baseTag = `<base href="${url.replace(/"/g, "&quot;")}">`;
  const htmlWithBase = /<head[^>]*>/i.test(html)
    ? html.replace(/(<head[^>]*>)/i, `$1${baseTag}`)
    : html.replace(/(<html[^>]*>)/i, `$1<head>${baseTag}</head>`);

  const doc = sharedDOMParser.parseFromString(htmlWithBase, "text/html");

  const parsed = new Readability(
    doc,
    createReadabilityOptions(config),
  ).parse();

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

  parseCount += 1;
  if (parseCount >= maxParses) {
    process.send({ type: "recycle" });
  }
});

process.send({ type: "ready" });
