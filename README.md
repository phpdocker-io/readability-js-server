# Readability JS Server

Readability JS Server is a small HTTP service that fetches a page, sanitizes the HTML, and runs Mozilla Readability to return article-shaped JSON.

At the time of this uplift, `@mozilla/readability@0.6.0` was already the latest release on npm, so the service stays on that version.

## Migrating from v1

The `content` response field is now returned as **markdown by default** instead of HTML. If you are upgrading from v1, existing consumers that expect HTML must either:

1. Set the `CONTENT_FORMAT=html` environment variable (server-wide), or
2. Pass `contentFormat: "html"` in each request body

Markdown output is more portable and easier to consume in many contexts, but any integration that renders the `content` field directly as HTML must opt back in to the old behaviour.

## Overview

- Runtime: Node.js 24
- Package manager: npm
- Web framework: Express 5
- HTML parsing: linkedom
- Sanitization: sanitize-html
- Deployment image: `node:24-alpine`

The container runs as a non-root user and the service exposes `POST /` plus a lightweight `GET /healthz` probe endpoint. The Compose example uses that same `/healthz` path for its container healthcheck.

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
PORT=3000 MAX_CONCURRENT_REQUESTS=20 npm start
```

## Local development

Prerequisites:

- Node.js 24
- npm (bundled with Node.js)

Install and start:

```bash
npm ci
npm start
```

The server starts on `http://localhost:3000/` by default.

The Makefile mirrors the same workflow:

```bash
make install
make start
```

Release versions come from the git tag (`vX.Y.Z`). Pushing one tag publishes Docker images for `X.Y.Z`, `X.Y`, `X`, and `latest`, the Helm chart on `gh-pages`, the Artifact Hub metadata, and the GitHub Release with generated notes. Nothing publishes when a change merges to `main`.

## Helm chart

The Kubernetes chart is published as a conventional Helm repository on GitHub Pages:

```bash
helm repo add phpdocker-io https://phpdocker-io.github.io/readability-js-server
helm repo update
helm install readability-js-server phpdocker-io/readability-js-server \
  --namespace readability \
  --create-namespace
```

For local chart development, install from the checkout with `helm install readability-js-server ./charts/readability-js-server`.

Artifact Hub should reference the external Helm repository URL `https://phpdocker-io.github.io/readability-js-server`. It should not be configured to ingest GitHub release assets directly.

## Release and versioning

Publishing runs from a single workflow triggered by one strict `vX.Y.Z` tag (`^v[0-9]+\.[0-9]+\.[0-9]+$`, no pre-release suffixes). The tag commit must be on `main`, and `charts/readability-js-server/Chart.yaml` `version` and `appVersion` must both equal the tag without the `v` prefix.

Pushing the tag publishes, in order:

- Docker images for `X.Y.Z`, `X.Y`, `X`, and `latest`.
- The Helm chart package and `index.yaml` on `gh-pages`.
- The Artifact Hub metadata (`artifacthub-repo.yml` and `.nojekyll`) on `gh-pages`.
- The GitHub Release with generated notes.

Merging to `main` publishes nothing. A manual `workflow_dispatch` run of the release workflow republishes only the Artifact Hub metadata to `gh-pages`; it never builds an image or a chart package.

`make release-tag VERSION=X.Y.Z` only creates the tag. It refuses to run unless the working tree is clean, `HEAD` matches `origin/main`, `VERSION` is a strict `MAJOR.MINOR.PATCH` value, and `Chart.yaml` `version` and `appVersion` already match. Push the tag to publish.

For the chart itself:

- `version` and `appVersion` move together, and both equal the release tag without the `v` prefix.
- A chart-only change still needs a new patch tag, with both `Chart.yaml` fields bumped.

## Testing

Run the lint and test suites with npm:

```bash
npm run lint
npm test
```

Run the Helm chart checks with the Makefile:

```bash
make helm-lint
make helm-template
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
make helm-verify
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

CI on pull requests and pushes to `main` runs lint, tests, Helm chart verification, and an amd64 container build. Publishing happens only from the tag-triggered release workflow.

For Docker Compose setup, see [`examples/compose.yaml`](examples/compose.yaml). That example publishes port `3000` and checks `GET /healthz` from inside the container using the `node` runtime that ships in the published image.

## Security posture

- Only absolute `http:` and `https:` URLs are accepted.
- Private-network and loopback targets are blocked by default.
- Redirects are followed manually and capped.
- Upstream responses must be HTML.
- Upstream bodies are capped by byte size and timeout.
- Article HTML is sanitized with sanitize-html. No external resources are loaded; no script execution is triggered.
- `iframe` and `video` tags are intentionally allowed, along with a narrow attribute allowlist.
- linkedom is used for parsing with no external resource loading or script execution.

This service is still an untrusted content fetcher. Do not relax the defaults without tests that cover the new risk.

## Limits

- Public API endpoints: `POST /` and `GET /healthz`
- No authentication
- No cache
- No persistence
- No session state
- No built-in distributed rate limiting
- Per-process concurrency is capped by `MAX_CONCURRENT_REQUESTS`
- The response shape is fixed; do not add fields casually

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
