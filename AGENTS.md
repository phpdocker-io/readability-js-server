# AGENTS.md - Readability JS Server

## Operating rules

- The API is `POST /` only. Keep `GET /` returning the existing 400 guidance.
- Success responses must keep the exact top-level field set from `src/response.js`: `url`, `title`, `byline`, `dir`, `content`, `length`, `excerpt`, `siteName`, `textContent`, `lang`, `publishedTime`.
- Error handling must stay stable: 400 for invalid input, 429 for overload, 500 for fetch and parse failures.
- Do not add response fields, change the error envelope, or weaken the HTTP contract without tests.

## Commands

- Install: `npm ci`
- Start: `npm start`
- Lint: `npm run lint`
- Test: `npm test`
- Helm lint: `make helm-lint` or `helm lint charts/readability-js-server`
- Helm template: `make helm-template` or `helm template readability-js-server charts/readability-js-server`
- Memory soak: `make soak` or `node scripts/memory-soak.js --requests 100 --concurrency 2 --sample-every 10`
- Docker build: `docker build -t readability-js .`
- Docker run: `docker run --rm -p 3000:3000 readability-js`
- Release tag: `make release-tag VERSION=1.8.0`

The Makefile mirrors those workflows with `make install`, `make start`, `make lint`, `make lint-fix`, `make helm-lint`, `make helm-template`, `make helm-verify`, `make build-container`, `make run-container`, `make release-tag`, and `make example-request`.

`package.json` is the single source of truth for the service version. Release publishing is tag-driven: bump `package.json`'s `version`, commit it, create a matching `vX.Y.Z` tag, and push the tag to trigger Docker publish plus GitHub Release creation.

## Testing expectations

- Run `npm run lint`, `npm test`, and the Helm verification targets for any docs, API, config, chart, or dependency change.
- Add or update tests when a change touches response shape, error normalization, URL validation, sanitization, redirect handling, concurrency gating, or config parsing.
- Use the memory soak script when a change could affect allocation behavior or long-run stability.

## Memory and security constraints

- Keep the default SSRF protections: private-network blocking on, absolute `http:`/`https:` URLs only, redirect limits, HTML-only fetches, body-size limits, and timeouts.
- Keep sanitize-html sanitization in place with the iframe/video allowlist.
- Keep linkedom parsing free of external resource loading and script execution.
- Preserve the current `iframe` and `video` allowlist only if the tests still cover the intended surface.
- Treat any memory growth that appears only under load as a regression candidate until a longer soak shows it is expected allocator behavior.

## Dependency and DOM policy

- `@mozilla/readability@0.6.0` was already the latest npm release at the time of the uplift. Do not upgrade it casually.
- Only widen sanitize-html or Readability/linkedom behavior with a clear reason and tests.
- Keep the container on Node 24.
- linkedom 0.18.x and sanitize-html 2.17.x are the supported parser and sanitizer pins; sanitize-html upstream is archived, do not expect backports.
