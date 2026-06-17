# Readability JS Server

Readability JS Server is a small HTTP service that fetches a page, sanitizes the HTML, and runs Mozilla Readability to return article-shaped JSON.

At the time of this uplift, `@mozilla/readability@0.6.0` was already the latest release on npm, so the service stays on that version.

## Overview

- Runtime: Node.js 24
- Package manager: pnpm 11.7.0
- Web framework: Express 5
- HTML parsing: jsdom 29
- Sanitization: DOMPurify 3
- Deployment image: `node:24-alpine`

The container runs as a non-root user and the service exposes a single `POST /` endpoint.

## API

### Request

`POST /`

Content-Type:

```http
application/json
```

Body:

```json
{
  "url": "https://example.com/article",
  "contentFormat": "markdown"
}
```

The `url` field is required. Only absolute `http:` and `https:` URLs are accepted.

The `contentFormat` field is optional and controls the format of the `content` response field. Valid values are `"markdown"` (default) or `"html"`. This field overrides the server-wide `CONTENT_FORMAT` environment variable on a per-request basis.

### Success response

HTTP 200 returns the requested URL plus the parsed article fields:

```json
{
  "url": "https://example.com/article",
  "title": "Article title",
  "byline": "Author name",
  "dir": "ltr",
  "content": "# Article title\n\nAuthor name\n\n...",
  "length": 12345,
  "excerpt": "Short summary",
  "siteName": "Site name",
  "textContent": "Plain text body",
  "lang": "en",
  "publishedTime": "2024-01-02T03:04:05Z"
}
```

The `content` field is formatted as markdown by default. To receive HTML instead, set `contentFormat: "html"` in the request body or the `CONTENT_FORMAT` environment variable to `"html"`.

Fields are emitted in the exact response shape defined by the service. Nullable fields may come back as `null`.

### Error response

Client and server errors use a stable JSON envelope:

```json
{
  "error": "Some weird error fetching the content",
  "details": {
    "code": "FETCH_TIMEOUT",
    "message": "Fetch request timed out"
  }
}
```

- `400` is used for missing or malformed input.
- `429` is used when the in-process concurrency gate is full.
- `500` is used for fetch and parse failures.

The `details` object is machine-readable and may include fields such as `status`, `url`, `cause`, `maxBytes`, or `maxRedirects`.

## Configuration

All configuration is driven by environment variables.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Listen port for the HTTP server. |
| `REQUEST_BODY_LIMIT` | `16kb` | Maximum JSON request body size. |
| `FETCH_TIMEOUT_MS` | `10000` | Timeout for upstream fetches. |
| `FETCH_MAX_BYTES` | `5242880` | Maximum upstream response size in bytes. |
| `FETCH_MAX_REDIRECTS` | `5` | Maximum redirect hops before failure. |
| `BLOCK_PRIVATE_NETWORKS` | `true` | Block loopback and private-network targets by default. |
| `READABILITY_MAX_ELEMS` | unset | Optional Readability parse cap for very large documents. |
| `MAX_CONCURRENT_REQUESTS` | `10` | Maximum in-flight requests per process before returning `429`. |
| `CONTENT_FORMAT` | `"markdown"` | Default content format for the `content` response field. Valid values: `"markdown"` or `"html"`. Can be overridden per-request via the `contentFormat` parameter. |

Example:

```bash
PORT=3000 MAX_CONCURRENT_REQUESTS=20 pnpm start
```

## Local development

Prerequisites:

- Node.js 24
- pnpm 11.7.0

Install and start:

```bash
pnpm install --frozen-lockfile
pnpm start
```

The server starts on `http://localhost:3000/` by default.

The Makefile mirrors the same workflow:

```bash
make install
make start
```

Release versions come from [`package.json`](package.json). To publish a release, bump `version`, commit the change, create a `vX.Y.Z` tag, and push that tag. The release workflow publishes Docker images for `X.Y.Z`, `X.Y`, `X`, and `latest`, and creates the matching GitHub Release with generated notes.

## Testing

Run the lint and test suites with pnpm:

```bash
pnpm lint
pnpm test
```

The repo also exposes a memory soak harness:

```bash
make soak
# or directly:
node scripts/memory-soak.js --requests 20 --concurrency 2 --sample-every 10
```

The soak script launches a local fixture server and the API, then reports `rss`, `heapUsed`, and `external` memory samples. On a 20-request local soak at concurrency 2, the service completed without failures and ended at `rss=252.5MB`, `heapUsed=138.2MB`, and `external=5.5MB`, up from `rss=166.1MB`, `heapUsed=64.4MB`, and `external=4.9MB`.

The Makefile provides the same checks:

```bash
make lint
make lint-fix
```

For release tagging there is also:

```bash
make release-tag VERSION=1.8.0
```

## Docker

Build and run the container locally:

```bash
docker build -t readability-js .
docker run --rm -p 3000:3000 readability-js
```

The image is based on `node:24-alpine`, installs production dependencies only, and runs the service as a non-root user.

CI on pull requests and pushes to `master` runs lint and tests only. Container publishing happens from the tag-triggered release workflow.

For Docker Compose setup, see [`examples/compose.yaml`](examples/compose.yaml).

## Security posture

- Only absolute `http:` and `https:` URLs are accepted.
- Private-network and loopback targets are blocked by default.
- Redirects are followed manually and capped.
- Upstream responses must be HTML.
- Upstream bodies are capped by byte size and timeout.
- Article HTML is sanitized with DOMPurify.
- `iframe` and `video` tags are intentionally allowed, along with a narrow attribute allowlist.
- jsdom is used with its default disabled external-loading and script-execution behavior during parsing.

This service is still an untrusted content fetcher. Do not relax the defaults without tests that cover the new risk.

## Limits

- Single endpoint only: `POST /`
- No authentication
- No cache
- No persistence
- No session state
- No built-in distributed rate limiting
- Per-process concurrency is capped by `MAX_CONCURRENT_REQUESTS`
- The response shape is fixed; do not add fields casually

## Breaking change: contentFormat default

The `content` response field is now returned as **markdown by default** instead of HTML. Existing consumers that expect HTML must either:

1. Set the `CONTENT_FORMAT=html` environment variable (server-wide default), or
2. Pass `contentFormat: "html"` in each request

This change makes article content more portable and easier to consume, but requires explicit opt-in to preserve the previous HTML output.

## Memory behavior

The service does not keep article state between requests, but each fetch still allocates DOM and Readability objects while it parses. Short memory soaks show growth in `rss` and `heapUsed` during active work, while `external` stays comparatively flat. That is the signal to watch for leak regressions: sustained growth across longer runs, not a single small sample.

Use the soak harness when you need to check that behavior under repeat load.

## Deployment and scaling

The container listens on `PORT` and is designed to be replicated horizontally. There is no PM2 layer in the current image, so scale by running more container replicas behind a load balancer or orchestrator.

Typical production settings:

- `PORT=3000`
- `BLOCK_PRIVATE_NETWORKS=true`
- `MAX_CONCURRENT_REQUESTS` tuned to the CPU and memory budget of one replica

Use more replicas rather than pushing a single process into very high concurrency.
