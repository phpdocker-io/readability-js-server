# AGENTS.md - Readability JS Server

## Operating rules

- The API is `POST /` only. Keep `GET /` returning the existing 400 guidance.
- Success responses must keep the exact top-level field set from `src/response.js`: `url`, `title`, `byline`, `dir`, `content`, `length`, `excerpt`, `siteName`, `textContent`, `lang`, `publishedTime`.
- Error handling must stay stable: 400 for invalid input, 429 for overload, 500 for fetch and parse failures.
- Do not add response fields, change the error envelope, or weaken the HTTP contract without tests.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Start: `pnpm start`
- Lint: `pnpm lint`
- Test: `pnpm test`
- Memory soak: `pnpm memory:soak -- --requests 100 --concurrency 2 --sample-every 10`
- Docker build: `docker build -t readability-js .`
- Docker run: `docker run --rm -p 3000:3000 readability-js`

The Makefile mirrors those workflows with `make install`, `make start`, `make lint`, `make lint-fix`, `make build-container`, `make run-container`, and `make example-request`.

## Testing expectations

- Run `pnpm lint` and `pnpm test` for any docs, API, config, or dependency change.
- Add or update tests when a change touches response shape, error normalization, URL validation, sanitization, redirect handling, concurrency gating, or config parsing.
- Use the memory soak script when a change could affect allocation behavior or long-run stability.

## Memory and security constraints

- Keep the default SSRF protections: private-network blocking on, absolute `http:`/`https:` URLs only, redirect limits, HTML-only fetches, body-size limits, and timeouts.
- Keep DOMPurify sanitization in place.
- Keep jsdom parsing free of external resource loading and script execution.
- Preserve the current `iframe` and `video` allowlist only if the tests still cover the intended surface.
- Treat any memory growth that appears only under load as a regression candidate until a longer soak shows it is expected allocator behavior.

## Dependency and DOM policy

- `@mozilla/readability@0.6.0` was already the latest npm release at the time of the uplift. Do not upgrade it casually.
- Only widen DOMPurify or Readability/jsdom behavior with a clear reason and tests.
- Keep the container on Node 24 and the repo on pnpm 11.7.0 unless the branch explicitly changes runtime policy.
