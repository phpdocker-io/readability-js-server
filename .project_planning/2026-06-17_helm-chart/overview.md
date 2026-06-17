## Request

Plan issue https://github.com/phpdocker-io/readability-js-server/issues/53: add a Helm chart for Readability JS Server, cover deployment/service/optional ingress/optional autoscaling/optional disruption budget, support Artifact Hub discoverability, and add a health endpoint that is used by Docker Compose and Kubernetes probes.

## Overview

Add a conventional, production-usable Helm chart under the repository with chart metadata, configurable values, reusable template helpers, and templates for the Kubernetes resources needed to run the existing container. The chart should default to `phpdockerio/readability-js-server` on app version `1.8.0`, expose port `3000`, use environment variables already supported by `src/config.js`, and provide optional ingress, HPA, and PDB resources behind explicit values.

The chart values should be configurable in the same broad way users expect from established charts: security contexts, resource requests and limits, ingress class names, ingress annotations and TLS, HPA behavior and scaling knobs, PDB settings, pod labels/annotations, service account settings, image pull secrets, node selectors, tolerations, affinity, topology spread constraints, priority class, and probe tuning. Defaults should remain safe and minimal, but the templates should not force users to fork the chart for common Kubernetes policy and scheduling requirements.

Add `GET /healthz` to the Express app as a lightweight operational endpoint. It must not affect `POST /`, the fixed success response shape, the error envelope, or the existing `GET /` 400 POST guidance. Use `/healthz` in Docker Compose healthchecks and Helm liveness/readiness probes.

Publish chart packages through a standard Helm repository hosted on GitHub Pages using `helm/chart-releaser-action`. Artifact Hub should reference that repository URL; charts are not uploaded directly to Artifact Hub.

## Key Decisions

- Use separate chart and app versions. Start the chart at `0.1.0` and set `appVersion` plus the default image tag to the current `package.json` version, `1.8.0`. This follows common Helm practice and allows chart-only fixes without forcing app releases.
- Use `GET /healthz` for health checks. This keeps `GET /` behavior unchanged while giving Compose and Kubernetes a stable endpoint for operational readiness.
- Publish via GitHub Pages plus `helm/chart-releaser-action`. This is the lowest-friction path for a GitHub-hosted project and gives Artifact Hub a normal Helm repository to index.
- Keep app release publishing tag-driven. Docker image publishing remains tied to `vX.Y.Z` tags; chart publishing can run when chart files change on `master`.
- Add Helm verification commands to repo tooling. The executor should add chart lint/render checks alongside existing `pnpm lint` and `pnpm test` expectations.

## Tradeoffs

- Lockstep chart and app versions were rejected because chart-only fixes would require app-version-like releases. Independent chart versions are slightly more documentation-heavy but more maintainable.
- OCI chart publishing was deferred because it adds registry layout and Artifact Hub metadata complexity that is not needed for one public chart.
- GitHub Releases-only chart publishing was rejected because Artifact Hub needs an indexable Helm repository or OCI registry, not standalone release assets.
- Adding a health endpoint increases HTTP surface area, but it is operationally useful and safer than using `GET /` or a parse request as a probe.
- HTTP probes are preferred over TCP-only probes because they verify the Express route stack is serving requests, not just that the socket is open.

## Scope Boundaries

In scope:

- Add `GET /healthz` with tests and documentation.
- Add a Compose healthcheck using `/healthz`.
- Add a Helm chart with Deployment, Service, optional Ingress, optional HPA, optional PDB, configurable image, service account, pod labels/annotations, resources, security contexts, probes, supported environment variables, ingress class/annotations/TLS, image pull secrets, pod scheduling controls, topology spread constraints, priority class, and HPA/PDB tuning knobs.
- Add chart documentation and release/versioning guidance.
- Add CI or Makefile verification for Helm linting/rendering.
- Add chart publishing workflow support and Artifact Hub metadata/documentation.

Out of scope:

- Changing `POST /` behavior or response shape.
- Changing `GET /` 400 guidance.
- Adding authentication, caching, persistence, distributed rate limiting, or a metrics endpoint.
- Upgrading Node, pnpm, `@mozilla/readability`, jsdom, DOMPurify, or runtime dependency policy.
- Publishing directly to Artifact Hub, because Artifact Hub indexes an external Helm repository or OCI registry.

## Verification Strategy

- `pnpm lint`: cheap/medium. Required by repo instructions for docs, API, config, dependency, and general code changes.
- `pnpm test`: cheap/medium. Required because the health endpoint changes HTTP surface area and the chart work touches deployment docs/config.
- New health endpoint tests: cheap. Should verify `GET /healthz` status/body and that `GET /` still returns the existing 400 guidance.
- Helm lint: cheap/medium. Add or document a command such as `helm lint charts/readability-js-server`.
- Helm template/render check: cheap/medium. Add or document a command such as `helm template readability-js-server charts/readability-js-server` to catch template errors with defaults.
- Optional chart packaging check: cheap/medium. Useful if release workflow packages charts, for example `helm package charts/readability-js-server --destination /tmp`.
- Docker build: medium/expensive. Not required for chart-only template changes, but relevant if the health endpoint change should be validated in the container.
- Memory soak: expensive. Not required; the health endpoint and Helm chart should not affect allocation behavior under article parsing load.

## Decision Log

- 2026-06-17: User requested planning for issue 53.
- 2026-06-17: User added a health endpoint to scope and requested it be used by Compose and any other relevant deployment surfaces.
- 2026-06-17: Research confirmed Artifact Hub indexes external Helm repositories or OCI registries; it does not require direct artifact upload.
- 2026-06-17: Research confirmed major charts commonly keep chart `version` separate from `appVersion`.
- 2026-06-17: Planning defaults selected: chart `0.1.0`, app `1.8.0`, health path `/healthz`, GitHub Pages chart repository via chart-releaser.
