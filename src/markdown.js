"use strict";

const TurndownService = require("turndown");
const { gfm } = require("turndown-plugin-gfm");

const KNOWN_EMBED_DOMAINS = [
  { pattern: /youtube\.com|youtu\.be/, label: "YouTube" },
  { pattern: /vimeo\.com/, label: "Vimeo" },
  { pattern: /dailymotion\.com/, label: "Dailymotion" },
];

const turndownService = new TurndownService();
turndownService.use(gfm);

turndownService.addRule("iframe", {
  filter: "iframe",
  replacement(content, node) {
    const src = node.getAttribute("src");
    if (!src) {
      return "";
    }

    const match = KNOWN_EMBED_DOMAINS.find(({ pattern }) => pattern.test(src));
    if (match) {
      return `[Video: ${match.label}](${src})`;
    }

    return `[Embedded content](${src})`;
  },
});

turndownService.addRule("video", {
  filter: "video",
  replacement(content, node) {
    const src = node.getAttribute("src");
    if (!src) {
      return "";
    }

    return `[Video](${src})`;
  },
});

function toMarkdown(sanitizedHtml) {
  return turndownService.turndown(sanitizedHtml);
}

module.exports = { toMarkdown };
