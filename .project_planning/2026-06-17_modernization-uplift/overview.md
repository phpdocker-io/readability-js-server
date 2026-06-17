## Request

Modernize `readability-js-server` while preserving the current public API shape, investigating reported high memory consumption, upgrading dependencies where possible, adding meaningful tests, reassessing the Docker process model, and improving both user-facing README documentation and operational `AGENTS.md` guidance.

## Overview

This uplift keeps the service as a small stateless HTTP API: `POST /` accepts JSON containing a `url` and returns extracted article content. The implementation will be modernized around Node 24, pnpm, built-in `fetch`, explicit resource limits, safe normalized errors, explicit response field mapping, controlled in-process concurrency, and a one-process Docker container.

The memory investigation will be evidence-driven. Issue #35 reports high memory use but does not provide a reproducible workload or measurements. The linked fork identifies plausible pressure points, but its `linkedom` switch is not accepted as a default because it changes the core DOM implementation without proving extraction compatibility or sanitizer safety. The first uplift should remove obvious memory multipliers and unbounded inputs, add tests, and provide a configurable memory soak harness for future comparisons.

Testing will be introduced before riskier behavior changes. The app should be restructured so tests can import the Express app without binding port 3000. Tests should lock down endpoint behavior, validation, explicit response fields, sanitization expectations, fetch/limit failures, private-network blocking, and normalized error responses.

Documentation is a first-class part of the work. README should become accurate user and usage documentation for Node 24, pnpm, Docker, API fields, configuration, resource limits, security posture, memory behavior, and deployment scaling. `AGENTS.md` should become a concise operational guide for future coding agents rather than a broad generated README duplicate.

## Key Decisions

- Preserve API shape but use explicit response mapping. Keep `url`, `title`, `byline`, `dir`, `content`, `length`, `excerpt`, and `siteName`; add current Readability fields `textContent`, `lang`, and `publishedTime`; do not pass through arbitrary future Readability fields silently.
- Do not guarantee byte-for-byte stable generated `content` HTML. Tests should assert field shape, sanitization, and important content properties rather than treating complete generated HTML as immutable.
- Standardize on Node 24 only for local development, Docker, and CI.
- Migrate from Yarn Classic to pnpm. Add a pinned `packageManager`, replace `yarn.lock` with `pnpm-lock.yaml`, and update Docker, CI, Makefile, README, and AGENTS commands.
- Replace Axios with Node 24 built-in `fetch`. Implement timeout, redirect handling, content-type checks, response byte caps, and normalized errors explicitly.
- Remove direct `body-parser` usage and use `express.json()` with `REQUEST_BODY_LIMIT`.
- Remove `log-timestamp` and replace it with a small local logger that produces timestamped logs without global console monkey-patching.
- Remove PM2 from the default Docker path. Run one Node process per container and document replica/container scaling.
- Preserve Node's normal asynchronous I/O concurrency, but add a configurable guard for active expensive request/parse work so one process cannot try to parse too many large pages at once.
- Keep `jsdom` and upgrade it. Do not switch to `linkedom` in this uplift.
- Switch sanitization order to parse with `JSDOM`, run Readability, then sanitize the extracted `content` before returning it.
- Add SSRF/private-network protection enabled by default with `BLOCK_PRIVATE_NETWORKS=true`; allow opt-out with `BLOCK_PRIVATE_NETWORKS=false` for intranet/self-hosted use cases.
- Add configurable resource limits: `PORT=3000`, `REQUEST_BODY_LIMIT=16kb`, `FETCH_TIMEOUT_MS=10000`, `FETCH_MAX_BYTES=5242880`, `FETCH_MAX_REDIRECTS=5`, `MAX_CONCURRENT_REQUESTS` with a modest default, and optional `READABILITY_MAX_ELEMS`.
- Add a single configurable memory soak harness rather than separate smoke and long-run scripts.
- Add PR and `master` CI checks for install, lint, and test; make Docker build/publish depend on those checks passing.
- Keep `@mozilla/readability@0.6.0` because it is the latest npm release as of research time, but explicitly document that it was checked.

## Tradeoffs

- PM2 removal trades single-container clustering for simpler memory behavior and standard container scaling. This is appropriate because PM2's five workers multiply the expensive jsdom parsing path.
- One raw Node process still handles concurrent asynchronous network I/O, but CPU-heavy jsdom/Readability/sanitization work runs on the event loop. A configurable in-process concurrency guard reduces request pileups and memory amplification under bursts.
- Keeping `jsdom` trades possible lower memory from `linkedom` for compatibility and sanitizer confidence. A future DOM replacement should be benchmarked against fixtures before adoption.
- Built-in `fetch` removes Axios dependency churn, but requires the project to own redirect, timeout, byte-cap, and error semantics explicitly.
- Private-network blocking improves default security for public deployments, but can break intentional intranet parsing. Making it configurable preserves an escape hatch.
- Sanitizing after Readability may change exact returned HTML, but it sanitizes the actual returned content and avoids a full-page sanitization pass over discarded boilerplate.
- pnpm adds package-manager migration churn, but it is a current package manager with better dependency discipline and is an explicit user decision for this uplift.
- Memory soak testing is non-gating initially because stable memory thresholds vary by machine. It should produce evidence and trends before becoming a hard CI gate.

## Scope Boundaries

In scope:

- App modularization needed for tests and server startup.
- Node 24 and pnpm migration.
- Dependency upgrades and removals described in the research.
- Explicit response mapping with backward-compatible fields plus current Readability fields.
- Fetch/resource-limit/redirect/private-network handling.
- In-process request/parse concurrency limiting.
- Safe normalized error details while preserving the top-level error shape.
- Sanitization order change and sanitizer policy tests.
- Dockerfile and CI updates, including removal of PM2 from the default container path.
- Configurable memory soak harness.
- README and AGENTS rewrite/update.

Out of scope:

- Replacing Mozilla Readability as the core parser.
- Switching production DOM implementation from `jsdom` to `linkedom`.
- Adding persistence, caching, authentication, rate limiting, queues, or a database.
- Guaranteeing exact byte-for-byte Readability HTML output.
- Making memory soak thresholds a blocking CI gate in the first uplift.
- Broad product/API expansion beyond the existing root endpoint and explicit response fields.

## Verification Strategy

Current repo verification is minimal:

- `make lint` runs `yarn prettier -c src/`.
- `make lint-fix` runs `yarn prettier -w src/`.
- There is no current test script.
- Existing CI builds/publishes Docker images and runs CodeQL, but does not run app tests.

Planned verification after the uplift:

- `pnpm install --frozen-lockfile` - medium, required in CI.
- `pnpm lint` - cheap, check-only Prettier formatting.
- `pnpm test` - cheap/medium, Node built-in test runner with endpoint and parser behavior tests.
- `pnpm start` - manual local server start.
- `pnpm memory:soak` - manual/non-gating memory investigation harness.
- `docker build ...` or `make build-container` - medium/expensive, required before image publish.
- Existing CodeQL remains.

CI should run install, lint, and test on pull requests and pushes to `master`. Docker build/publish should depend on those checks passing, and publish should remain limited to `master` when the `release` file changes.

## Decision Log

- User confirmed the current public API must remain compatible.
- User added `AGENTS.md` improvement to scope.
- User added dependency investigation and newest-available upgrades to scope, especially Mozilla Readability.
- User added README user and usage documentation uplift to scope.
- Research was approved and delegated to read-only sub-agents.
- Research found issue #35 lacks measurements and that the linked fork is plausible but unproven.
- Research found `@mozilla/readability@0.6.0` is already latest on npm.
- User chose Node 24 only.
- User chose explicit response field mapping and adding current Readability fields.
- User chose replacing Axios with built-in `fetch`.
- User chose removing `log-timestamp` in favor of a local logger.
- User chose removing `body-parser` in favor of `express.json()`.
- User chose removing PM2.
- User accepted one-process Node concurrency behavior with an explicit concurrency guard.
- User chose configurable private-network protection, enabled by default.
- User accepted default resource limits.
- User chose sanitizing after Readability.
- User chose keeping `jsdom`.
- User chose pnpm.
- User approved safe normalized error details.
- User approved the environment configuration set.
- User approved Node-native testing with app modularization.
- User approved PR/`master` CI checks and gating build/release on those checks.
- User refined memory testing to a single configurable memory soak harness.
- User approved the dependency strategy.
- User approved README and AGENTS documentation strategy.
- User approved the implementation sequencing.
