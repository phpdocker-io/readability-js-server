## Request

Address two issues:

1. **#58** — Upgrade all GitHub Actions to latest versions
2. **#54** — Provide a `compose.yaml` example pointing to the container registry image

## Overview

Bump 7 GitHub Actions across 2 workflow files to their latest major versions, and add an `examples/compose.yaml` for users to run the service locally via Docker Compose.

## Key Decisions

- **Major version tags only** — pin to major version tags (e.g. `@v6`) per GitHub Actions convention, not full SHAs or minor versions. Matches existing style.
- **Compose in `examples/`** — per user request, not repo root.
- **Compose references registry image** — `phpdockerio/readability-js-server:latest`, not a local build.
- **Include env var examples** — per user request, show configurable env vars with defaults commented or shown.

## Tradeoffs

- **Major tags vs SHA pinning**: major tags are less secure (mutable) but standard for this repo and simpler to maintain. SHA pinning would be more secure but noisy to update.
- **`latest` tag vs pinned version**: using `latest` in compose example is simplest for users. Pinning a version would be more reproducible but requires manual updates to the example.

## Scope Boundaries

**In scope:**
- Upgrade all actions in `build-publish.yaml` and `codeql-analysis.yml`
- Add `examples/compose.yaml`
- Update README to reference compose example

**Out of scope:**
- Changing CI logic or workflow structure
- Adding dev-mode compose for local development
- Modifying Dockerfile
- Changing any application code

## Verification Strategy

From AGENTS.md and CI:

| Check | Command | Cost |
|-------|---------|------|
| Lint | `pnpm lint` | Cheap |
| Test | `pnpm test` | Cheap |

For this task specifically:
- Lint and test confirm no regressions (these changes don't touch app code, but good hygiene)
- Manual review of YAML syntax correctness
- `docker compose -f examples/compose.yaml config` to validate compose file syntax

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Upgrade to major version tags | Matches existing convention |
| 2 | Compose in `examples/` | User preference |
| 3 | Include env var examples in compose | User preference |
| 4 | Reference `latest` tag in compose | Simplest for end users |
