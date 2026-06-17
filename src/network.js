"use strict";

const dns = require("node:dns/promises");
const net = require("node:net");

const { FetchArticleError } = require("./errors");

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

module.exports = { assertAllowedUrl, isPrivateIp, isPrivateIpv4, isPrivateIpv6 };
