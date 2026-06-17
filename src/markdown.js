"use strict";

const TurndownService = require("turndown");
const { gfm } = require("turndown-plugin-gfm");

const KNOWN_EMBED_DOMAINS = [
  {
    hosts: ["youtube.com", "youtube-nocookie.com", "youtu.be"],
    label: "YouTube",
  },
  { hosts: ["vimeo.com"], label: "Vimeo" },
  { hosts: ["dailymotion.com"], label: "Dailymotion" },
];

const turndownService = new TurndownService();
turndownService.use(gfm);

function parseAbsoluteHttpUrl(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return null;
    }

    return parsedUrl;
  } catch (_error) {
    return null;
  }
}

function hostnameMatches(hostname, expectedHost) {
  return hostname === expectedHost || hostname.endsWith(`.${expectedHost}`);
}

function getSafeMediaUrl(rawUrl) {
  return parseAbsoluteHttpUrl(rawUrl)?.toString() ?? null;
}

function getKnownEmbedLabel(rawUrl) {
  const parsedUrl = parseAbsoluteHttpUrl(rawUrl);

  if (!parsedUrl) {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const match = KNOWN_EMBED_DOMAINS.find(({ hosts }) =>
    hosts.some((host) => hostnameMatches(hostname, host)),
  );

  return match?.label ?? null;
}

turndownService.addRule("iframe", {
  filter: "iframe",
  replacement(_content, node) {
    const safeSrc = getSafeMediaUrl(node.getAttribute("src"));

    if (!safeSrc) {
      return "";
    }

    const label = getKnownEmbedLabel(safeSrc);

    if (label) {
      return `[Video: ${label}](${safeSrc})`;
    }

    return `[Embedded content](${safeSrc})`;
  },
});

turndownService.addRule("video", {
  filter: "video",
  replacement(_content, node) {
    const safeSrc = getSafeMediaUrl(node.getAttribute("src"));

    if (!safeSrc) {
      return "";
    }

    return `[Video](${safeSrc})`;
  },
});

function toMarkdown(sanitizedHtml) {
  return turndownService.turndown(sanitizedHtml);
}

module.exports = { toMarkdown };
