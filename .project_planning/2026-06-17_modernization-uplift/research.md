## Question

How should `readability-js-server` be modernized while preserving the current public API, investigating reported memory consumption, upgrading dependencies where possible, adding meaningful tests, reassessing PM2 in Docker, and improving user/agent documentation?

## Findings

GitHub issue `phpdocker-io/readability-js-server#35` reports high memory consumption on a VPS, but it does not include measurements, profiles, memory limits, workload details, or a reproducible case. The proposed fix points at a fork commit that replaces `jsdom` with `linkedom`, replaces `axios` with `undici`, reduces PM2 instances from 5 to 2, forces production env in PM2/Docker, and documents the fork as memory-optimized. The report is useful signal, but the proposed solution is anecdotal and should not be accepted wholesale without compatibility tests and memory evidence.

The current implementation has several memory-risk patterns that can explain high memory use without assuming a leak: `axios.get(url)` buffers the whole response body; DOMPurify sanitizes the full fetched HTML before boilerplate removal; `JSDOM` builds a full DOM for arbitrary pages; Readability mutates/traverses the DOM and serializes another HTML string; PM2 starts five Node processes, multiplying baseline memory; concurrent requests multiply all of that again.

Technically defensible memory mitigations include request timeout, redirect limit, response byte limit, content-type checks before parsing, header-based early rejection, streaming byte caps because headers can lie, `http:`/`https:` URL validation, optional SSRF protections, Readability options such as `maxElemsToParse`, and sanitizing Readability output rather than sanitizing the entire fetched page first. `linkedom` may reduce memory, but it is not a safe drop-in assumption for this security-sensitive parser path because DOMPurify recommends current `jsdom` for server-side use.

Container guidance does not require a literal one-process container, and PM2 documents `pm2-runtime` for Docker. For this service, however, PM2's five workers multiply the exact expensive path that users are complaining about. If deployed under Docker Compose, Kubernetes, ECS, Nomad, or similar orchestration, one Node process per container plus replica scaling is the cleaner default. PM2 can remain documented as an opt-in pattern for single-VPS users if there is still a use case.

Node 24 is Active LTS as of 2026-06-17, with maintenance starting 2026-10-20 and EOL 2028-04-30. Node 20 is EOL as of 2026-04-30. Node 22 remains Maintenance LTS until 2027-04-30. The Dockerfile already uses `node:24-alpine`, so the simplest runtime policy is Node 24.

Latest dependency findings as of 2026-06-17:

| Package | Current | Latest |
|---|---:|---:|
| `@mozilla/readability` | `^0.6.0` | `0.6.0` |
| `axios` | `^1.13.2` | `1.18.0` |
| `body-parser` | `^2.2.2` | `2.3.0` |
| `dompurify` | `^3.3.1` | `3.4.10` |
| `express` | `^5.2.1` | `5.2.1` |
| `jsdom` | `^27.4.0` | `29.1.1` |
| `log-timestamp` | `^0.3.0` | `0.3.0` |
| `@types/express` | `^5.0.6` | `5.0.6` |
| `nodemon` | `^3.1.11` | `3.1.14` |
| `prettier` | `^3.7.4` | `3.8.4` |

Potential test dependencies:

| Package | Latest | Engine |
|---|---:|---|
| `supertest` | `7.2.2` | Node `>=14.18.0` |
| `nock` | `14.0.15` | Node `>=18.20.0 <20 || >=20.12.1` |

`@mozilla/readability` has no npm release newer than `0.6.0`. Its current parse object includes `title`, `content`, `textContent`, `length`, `excerpt`, `byline`, `dir`, `siteName`, `lang`, and `publishedTime`. The service currently documents only the older subset. Readability's changelog warns that output for a given document is not stable across minor releases. Unreleased main-branch changes after `0.6.0` may affect title and content extraction in a future npm release, but they are not available through npm today.

Upgrade candidates and cleanup:

- Upgrade `axios` to `1.18.0` if Axios is retained. Current Axios defaults are not defensive: timeout defaults to `0`, and body buffering remains a concern.
- Upgrade `dompurify` to `3.4.10`; `3.3.1` is in the affected range for CVE-2026-0540, fixed in later 3.3.x/3.4.x versions.
- Upgrade `jsdom` to `29.1.1`; it requires Node `^20.19.0 || ^22.13.0 || >=24.0.0`.
- Keep `express` at `5.2.1`.
- Replace direct `body-parser` usage with `express.json()` unless a specific body-parser behavior is needed.
- Remove `@types/express` unless TypeScript or checked JS is introduced.
- Consider replacing `log-timestamp` with a tiny local timestamped logger or a structured logger, but this is less important than memory and security work.
- Consider replacing Axios with Node built-in `fetch`/Undici only if explicit timeout, redirect, size-limit, content-type, and error-normalization behavior are implemented at the same time.

The best minimal test stack for this CommonJS service is Node's built-in `node:test` plus `node:assert/strict`, `supertest` for Express endpoint testing, and `nock` for outbound HTTP mocking and blocking accidental real network calls. Jest or Vitest are unnecessary unless the project later wants a larger testing framework.

Package manager recommendation: keep Yarn Classic short term because the repo already has a Yarn v1 lockfile and Dockerfile flow. Add `packageManager`, likely `yarn@1.22.22`, and make Docker/CI use Corepack or an explicit Yarn version. Migrating to npm or Yarn modern would add more churn than value for this small service.

README/user documentation should be upgraded as part of the modernization. It should document the supported Node/package-manager versions, current Docker runtime, API compatibility, response fields including newer Readability fields, environment variables, limits/timeouts, memory guidance, Docker scaling guidance, sanitization policy, local/test commands, and limitations such as no authentication/rate limiting/caching.

AGENTS.md should be rewritten to be shorter and more operational: API compatibility requirement, current runtime, commands, test expectations, memory/security constraints, documentation expectations, and a warning not to swap DOM implementations without compatibility tests and memory evidence.

## Implications

The fork linked from issue #35 identifies plausible pressure points, but adopting it directly would replace the DOM implementation in the core parser path without proof that extraction quality and sanitization behavior remain compatible. The plan should instead add characterization tests and memory probes first, then change one risk area at a time.

The public API can remain compatible while internals change. Tests should pin the endpoint behavior and field shape, but they should not assert huge exact Readability HTML snapshots unless used intentionally as compatibility fixtures.

The strongest default container change is to run one Node process per container and document orchestrator-level scaling. If PM2 remains, make it opt-in or configurable rather than a hard-coded five-worker default.

The dependency uplift cannot upgrade Readability beyond `0.6.0` today because no newer npm package exists. The plan should still explicitly verify this during implementation and document the result, because the user specifically asked to investigate Readability.

The modernization should make resource limits configurable so compatibility-sensitive deployments can tune timeout, max response bytes, max redirects, and SSRF/private-network behavior without changing the API shape.

## Risks and Uncertainties

Issue #35 lacks measurements, so there is no known baseline workload or memory target. Implementation should create repeatable local memory evidence with representative fixture pages and/or a local stress harness.

Strict size, timeout, content-type, and SSRF limits can reject pages that currently parse. Defaults should be documented, and potentially sensitive controls should be configurable.

Sanitizing only Readability output follows the upstream security model more closely and may reduce memory, but it can change exact content HTML. Compatibility fixtures should cover scripts, iframes, videos, and representative article content.

Switching Axios to `fetch` can subtly alter redirects, proxy support, compressed responses, errors, timeout behavior, and test mocks. If done, it should be paired with explicit behavior tests.

Upgrading `jsdom` from 27 to 29 is the highest dependency compatibility risk because it changes the DOM implementation under the parser.

Blocking private IPs is a strong security improvement for internet-exposed deployments, but it may break intentional intranet use cases. This should be a conscious product decision, preferably configurable.

## Sources

- Issue #35: https://github.com/phpdocker-io/readability-js-server/issues/35
- Proposed fork commit: https://github.com/madpin/readability-js-server/commit/7876aab374faa3ddfcae024d872767487d797a2f
- Node release schedule: https://github.com/nodejs/release
- Express 5 migration/release: https://expressjs.com/en/guide/migrating-5/ and https://expressjs.com/en/blog/2024-10-15-v5-release/
- Express body-parser middleware docs: https://expressjs.com/en/resources/middleware/body-parser/
- jsdom releases and package: https://github.com/jsdom/jsdom/releases/tag/27.0.0, https://github.com/jsdom/jsdom/releases/tag/27.0.1, https://www.npmjs.com/package/jsdom
- DOMPurify README and releases: https://github.com/cure53/DOMPurify and https://github.com/cure53/DOMPurify/releases
- DOMPurify CVE: https://nvd.nist.gov/vuln/detail/cve-2026-0540
- Readability README, changelog, and comparison: https://github.com/mozilla/readability, https://github.com/mozilla/readability/blob/main/CHANGELOG.md, https://github.com/mozilla/readability/compare/0.6.0...main
- Readability npm package: https://www.npmjs.com/package/%40mozilla/readability
- Axios README/releases/advisory context: https://raw.githubusercontent.com/axios/axios/v1.13.2/README.md, https://github.com/axios/axios/releases, https://nvd.nist.gov/vuln/detail/CVE-2025-62718
- Docker multi-process guidance: https://docs.docker.com/engine/containers/multi-service_container/
- PM2 Docker docs: https://pm2.keymetrics.io/docs/usage/docker-pm2-nodejs/
- Node test runner: https://nodejs.org/api/test.html
- Supertest: https://github.com/forwardemail/supertest
- Nock: https://github.com/nock/nock
- Node fetch/Undici docs: https://nodejs.org/learn/getting-started/fetch
- Yarn/Corepack docs: https://yarnpkg.com/corepack

## Open Questions

- Should local development standardize on Node 24 only, or support Node 22/20.19+ as well?
- Is exact Readability-generated HTML considered part of the compatibility contract, or are status codes, top-level fields, and sanitized-safe output the contract?
- Should SSRF/private-network blocking be enabled by default, opt-in, or deferred?
- What default timeout and max response size should the service ship with?
- Should PM2 be removed from the default Docker image, retained but configurable, or kept as a separate documented variant?
