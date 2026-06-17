## Request

Fix issues #60, #61, #62, #55 in one pass — signal handling, linting, test reorganization, and tag-based versioning.

## Overview

Four improvements batched as a code quality pass:

1. **#60 — Signal handling**: Add `SIGINT`/`SIGTERM` handlers to `server.js` for graceful shutdown. Add `tini` as PID 1 in the Dockerfile so signals propagate correctly to the Node process.
2. **#61 — ESLint setup**: Add ESLint with flat config (`eslint.config.cjs`), `@eslint/js` recommended rules, `eslint-plugin-n` for Node-specific checks, `eslint-config-prettier` for formatter coexistence. Update `pnpm lint` to run both ESLint and Prettier. Fix any violations.
3. **#62 — Test reorganization**: Break `test/app.test.js` (982 lines) into focused test files by theme. Analyse coverage gaps and add tests for edge cases. Add integration tests with real HTML fixtures.
4. **#55 — Tag-based versioning**: Replace `release` file with `package.json` version field. CI triggers on `v*` tags, derives semver tags (major, major.minor, full), creates GitHub Releases with auto-generated notes. Remove `release` file from Dockerfile and `server.js`.

## Key Decisions

- **Tini for PID 1**: Using `tini` (Alpine package) instead of `dumb-init` — already available in Alpine repos, no extra download. Handles signal forwarding and zombie reaping.
- **ESLint flat config**: Using `eslint.config.cjs` (CommonJS) with the modern flat config format. No legacy `.eslintrc`.
- **Separate lint commands**: `pnpm lint` runs both `eslint` and `prettier --check`. Separate tools, separate concerns.
- **Version source**: `package.json` `version` field becomes the single source of truth. `server.js` reads it via `require('../package.json').version`. The `release` file is deleted.
- **Tag format**: `v2.0.0` style tags. CI extracts version, pushes Docker tags for `2.0.0`, `2.0`, `2`, and `latest`.
- **Test split strategy**: One file per theme (e.g., `test/validation.test.js`, `test/parsing.test.js`, `test/markdown.test.js`, `test/errors.test.js`). Shared fixtures in `test/fixtures/`.
- **GitHub Release**: Auto-created on tag push with `--generate-notes` (same pattern as steiner repo).

## Tradeoffs

- **Tini vs Node signal handling alone**: Tini adds a small binary but is the Docker best practice for signal handling. Pure-Node handlers work but don't handle zombie reaping. Chose tini.
- **ESLint + Prettier separate vs combined**: Could use `eslint-plugin-prettier` to run both via ESLint, but this is discouraged in 2026 — causes conflicts. Separate tools is cleaner.
- **Test fixtures as HTML files vs inline strings**: HTML fixture files are more maintainable and realistic for integration tests, but add file count. Worth it for readability and cross-section testing.
- **Removing `release` file entirely vs keeping for backwards compat**: Clean break. The file served one purpose and that purpose moves to tags + `package.json`.

## Scope Boundaries

**In scope:**
- Signal handling fix in `server.js` + tini in Dockerfile
- ESLint setup, config, and fixing all violations
- Test file reorganization + coverage gap analysis + new tests
- Tag-based CI workflow replacing release-file workflow
- GitHub Release creation on tag
- Updating Makefile, package.json scripts as needed
- Updating AGENTS.md and README.md if commands change

**Out of scope:**
- Helm chart (#53)
- Memory consumption (#35)
- Dependency upgrades beyond ESLint tooling
- TypeScript migration
- New API features or response shape changes

## Verification Strategy

| Tool | Command | Cost | Notes |
|------|---------|------|-------|
| Prettier | `pnpm lint` (currently prettier-only) | Cheap | Already configured |
| ESLint | `pnpm lint` (after adding eslint) | Cheap | New — will be added |
| Tests | `pnpm test` | Cheap | Node built-in test runner |
| Docker build | `docker build -t readability-js .` | Medium | Verify Dockerfile changes |
| Docker signal test | `docker run` + ctrl+c | Manual | Verify #60 fix |
| CI workflow | Validate YAML syntax | Cheap | Can lint locally |

Primary verification: `pnpm lint && pnpm test` after every step. Docker build after Dockerfile changes.

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Batch #60, #61, #62, #55 together | All code quality / DX improvements with no feature risk |
| 2 | Defer #53 (helm) | Separate deliverable, different domain |
| 3 | Use tini for signal handling | Alpine-native, Docker best practice, handles zombies |
| 4 | ESLint flat config with eslint-plugin-n | 2026 standard for Node.js projects |
| 5 | Version from package.json, not release file | Single source of truth, standard Node convention |
| 6 | Tag-triggered CI following steiner pattern | Proven pattern from user's own project |
