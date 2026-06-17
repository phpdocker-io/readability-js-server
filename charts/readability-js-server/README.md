# readability-js-server Helm chart

This chart deploys Readability JS Server as a single-replica `Deployment` behind a `ClusterIP` `Service` by default. Optional `Ingress`, `HorizontalPodAutoscaler`, and `PodDisruptionBudget` resources stay disabled until you opt in.

## Prerequisites

- Kubernetes 1.26 or newer
- Helm 3.12 or newer

## Installation

Install from the repository checkout:

```bash
helm install readability-js-server ./charts/readability-js-server
```

Override values at install or upgrade time:

```bash
helm upgrade --install readability-js-server ./charts/readability-js-server \
  --namespace readability \
  --create-namespace \
  --set image.tag=1.8.0 \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=readability.example.com
```

## Defaults

- Chart version: `0.1.0`
- App version: `1.8.0`
- Image repository: `phpdockerio/readability-js-server`
- Image tag: `1.8.0`
- Container listen port: `3000`
- Service type: `ClusterIP`
- Replica count: `1`
- Liveness and readiness probes: `GET /healthz`

## Configuration

The chart exposes the settings most clusters need without requiring a fork:

| Area | Values |
| --- | --- |
| Image | `image.repository`, `image.tag`, `image.pullPolicy`, `imagePullSecrets` |
| Service account | `serviceAccount.create`, `serviceAccount.name`, `serviceAccount.annotations`, `serviceAccount.labels`, `serviceAccount.automountServiceAccountToken` |
| Pod metadata | `podLabels`, `podAnnotations`, `priorityClassName` |
| Security | `podSecurityContext`, `containerSecurityContext` |
| Scheduling | `nodeSelector`, `tolerations`, `affinity`, `topologySpreadConstraints` |
| Networking | `service.type`, `service.port`, `service.annotations`, `service.labels`, `ingress.*` |
| Capacity | `replicaCount`, `resources`, `autoscaling.*`, `pdb.*`, `terminationGracePeriodSeconds` |
| Probes | `probes.liveness.*`, `probes.readiness.*`, `probes.startup.*` |
| App config | `appConfig.PORT`, `appConfig.REQUEST_BODY_LIMIT`, `appConfig.FETCH_TIMEOUT_MS`, `appConfig.FETCH_MAX_BYTES`, `appConfig.FETCH_MAX_REDIRECTS`, `appConfig.BLOCK_PRIVATE_NETWORKS`, `appConfig.READABILITY_MAX_ELEMS`, `appConfig.MAX_CONCURRENT_REQUESTS`, `appConfig.CONTENT_FORMAT` |

`appConfig` maps directly to the environment variables already supported by `src/config.js`. `READABILITY_MAX_ELEMS` is unset by default so the service preserves its current runtime behavior until you choose a limit.

## Optional resources

- `ingress.enabled=true` renders a Kubernetes `Ingress`. Configure hostnames, annotations, class name, paths, and TLS through `ingress.*`.
- `autoscaling.enabled=true` renders an `autoscaling/v2` `HorizontalPodAutoscaler`. You can use the built-in CPU and memory targets or provide a full `autoscaling.metrics` list plus `autoscaling.behavior`.
- `pdb.enabled=true` renders a `PodDisruptionBudget`. Set exactly one of `pdb.minAvailable` or `pdb.maxUnavailable`.

## Versioning policy

Chart and application versions are intentionally separate:

- `version` tracks chart packaging changes.
- `appVersion` tracks the default Readability JS Server image version.

When the chart changes without a new application release, only the chart `version` should move. When the default image tag changes, bump both the chart `version` and `appVersion`.

## Artifact Hub expectations

This chart is structured for a conventional Helm repository published via GitHub Pages. Once that repository is in place, Artifact Hub should index the repository URL rather than individual GitHub Release assets. Consumers should expect standard Helm metadata, independent chart and app versioning, and release notes attached to chart packages.

## Verification

Render and lint the chart locally:

```bash
helm lint charts/readability-js-server
helm template readability-js-server charts/readability-js-server
```
