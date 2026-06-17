## Question

What are the current latest major versions of all GitHub Actions used in this repository's workflows?

## Findings

| Action | Current | Latest | Status |
|--------|---------|--------|--------|
| actions/checkout | @v4 | @v6 | Upgrade needed |
| actions/setup-node | @v4 | @v5 | Upgrade needed |
| docker/setup-qemu-action | @v3 | @v4 | Upgrade needed |
| docker/setup-buildx-action | @v3 | @v4 | Upgrade needed |
| docker/login-action | @v3 | @v4 | Upgrade needed |
| docker/build-push-action | @v6 | @v7 | Upgrade needed |
| tj-actions/changed-files | @v46 | @v46 | Up-to-date |
| github/codeql-action | @v3 | @v4 | Upgrade needed |

7 of 8 actions need upgrades.

## Implications

- Docker actions (qemu, buildx, login) moved to Node 24 runtime and ESM — requires Actions Runner v2.327.1+. GitHub-hosted runners already meet this.
- `actions/checkout` jumped two major versions (v4 → v6).
- `actions/setup-node` is one major version behind (v4 → v5).
- `github/codeql-action` is one major version behind (v3 → v4).

## Risks and Uncertainties

- Docker action v4 breaking changes: deprecated inputs removed, ESM switch. Need to verify no deprecated inputs are used in current workflows.
- `actions/checkout@v6` and `actions/setup-node@v5` breaking changes not fully enumerated — need to check changelogs if issues arise.
- `github/codeql-action@v4` may have changed default language detection or analysis behavior.

## Sources

- GitHub releases pages for each action repository

## Open Questions

- None blocking — current workflow usage is straightforward and unlikely to hit breaking changes.
