## Request

GitHub issue #52: Return content as markdown by default instead of HTML. Make output format configurable per-request.

## Overview

Add HTML-to-markdown conversion to the response pipeline using Turndown + turndown-plugin-gfm. The `content` field changes from sanitized HTML to sanitized-then-converted markdown by default. Consumers control output format via a `contentFormat` request body param (`"markdown"` or `"html"`), with a server-wide default set by the `CONTENT_FORMAT` env var.

Pipeline becomes: raw HTML → DOMPurify sanitize → Turndown convert (if markdown) → response.

## Key Decisions

- **Turndown over alternatives**: Battle-tested with Readability output, pure JS, lightweight (~50KB), plugin ecosystem. node-html-markdown is faster but smaller community; mdream needs native bindings problematic on Alpine.
- **`contentFormat` not `outputFormat`**: More descriptive — only the `content` field changes format.
- **Always sanitize regardless of format**: Defense-in-depth. Turndown can pass unrecognized HTML through as raw markdown, and crafted HTML could produce markdown that re-renders maliciously. DOMPurify first eliminates these vectors.
- **Per-request param + env var default**: Per-request gives consumers flexibility. Env var (`CONTENT_FORMAT`) lets operators pin `html` globally for backward compatibility during migration.
- **Default to markdown**: Per issue intent. Breaking change, mitigated by env var.

## Tradeoffs

- **Breaking default**: Existing consumers expecting HTML in `content` will get markdown. Accepted — env var provides escape hatch, and the security posture improvement justifies the default.
- **Extra dependency (Turndown + GFM plugin)**: Adds ~60KB to node_modules. Acceptable for the functionality gained. Both are pure JS, no native modules.
- **Sanitize-then-convert vs convert-only**: Small perf cost from always sanitizing. Worth it for defense-in-depth — can't guarantee downstream consumers won't re-render markdown as HTML.

## Scope Boundaries

**In scope:**
- `turndown` and `turndown-plugin-gfm` dependencies
- Conversion logic in app.js or a new converter module
- `contentFormat` request body parameter with validation
- `CONTENT_FORMAT` env var with config parsing and validation
- Tests: unit for conversion, integration for request param, config parsing
- README and env var documentation updates
- Docker compose example update if env vars are documented there

**Out of scope:**
- No new response fields — `content` changes format, field set stays frozen
- No changes to error handling, status codes, or error envelope
- No changes to `textContent` (already plain text)
- No changes to other response fields (all plain strings)
- No Turndown customization beyond GFM plugin and media embed rules

## Verification Strategy

| Check       | Command              | Cost   | Notes                                    |
|-------------|----------------------|--------|------------------------------------------|
| Lint        | `pnpm lint`          | Cheap  | Prettier check on src/ test/ scripts/    |
| Test        | `pnpm test`          | Cheap  | `node --test`, fixture-based             |
| Lint fix    | `pnpm lint:fix`      | Cheap  | Prettier auto-fix, prefer over check     |
| Memory soak | `pnpm memory:soak`   | Medium | Only if allocation behavior may change   |
| Docker build| `docker build -t readability-js .` | Medium | Verify container builds cleanly |

Run `pnpm lint:fix` then `pnpm test` after each step. Memory soak and Docker build at the end.

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Turndown as converter | Proven with Readability, pure JS, Alpine-safe |
| 2 | `contentFormat` param name | Descriptive of what changes — only `content` field |
| 3 | Always sanitize first | Defense-in-depth: converter bugs, markdown injection, raw HTML passthrough |
| 4 | Env var `CONTENT_FORMAT` | Backward compat for operators, overridable per-request |
| 5 | Default `markdown` | Issue intent, security improvement, env var mitigates breakage |
| 6 | Custom Turndown rules for media embeds | Pattern-match iframe `src` against known embed domains (YouTube, Vimeo, Dailymotion, etc.) → `[Video: Provider](url)`. Unknown iframes → `[Embedded content](url)`. Video tags → `[Video](src)`. Preserves media references that would otherwise be silently dropped. |
| 7 | Invalid `contentFormat` returns 400 | Descriptive error message echoing valid options. Consistent with existing input validation pattern. |
