## Question

Planning issue https://github.com/phpdocker-io/readability-js-server/issues/53: add a Helm chart, publish it for Artifact Hub discovery, and include a new health endpoint for Compose/chart probes.

## Findings

Helm has two separate version concepts. `Chart.yaml version` is the chart package version, must be SemVer, and is used by Helm packaging/repository tooling. `appVersion` is informational application version metadata and is explicitly unrelated to chart version calculations: https://helm.sh/docs/topics/charts/

Established charts mostly treat them as independent, even if both move during app releases:

- Bitnami nginx: chart `version: 22.1.1`, `appVersion: 1.29.1`: https://github.com/bitnami/charts/blob/main/bitnami/nginx/Chart.yaml
- ingress-nginx: chart `version: 4.15.1`, `appVersion: 1.15.1`: https://github.com/kubernetes/ingress-nginx/blob/main/charts/ingress-nginx/Chart.yaml
- kube-prometheus-stack: chart `version: 86.2.3`, `appVersion: v0.91.0`: https://github.com/prometheus-community/helm-charts/blob/main/charts/kube-prometheus-stack/Chart.yaml
- Grafana: chart `version: 10.5.14`, `appVersion: 12.3.1`: https://github.com/grafana/helm-charts/blob/main/charts/grafana/Chart.yaml

Artifact Hub indexes Helm chart repositories and OCI Helm charts, not arbitrary GitHub Releases by themselves. Most metadata comes from `Chart.yaml`, `README`, and `LICENSE`; optional Artifact Hub annotations and `artifacthub-repo.yml` improve presentation, ownership claim, and verified publisher support: https://artifacthub.io/docs/topics/repositories/helm-charts/ and https://artifacthub.io/docs/topics/annotations/helm/

Publishing options:

- GitHub Pages + `helm/chart-releaser-action`: conventional for GitHub-hosted projects; creates chart GitHub Releases, updates `index.yaml`, and serves a Helm repo from Pages. Artifact Hub can index that repo URL. Docs: https://helm.sh/docs/howto/chart_releaser_action/
- OCI registry: supported by Helm and Artifact Hub. Helm OCI chart refs require chart name as basename and chart SemVer as tag; Artifact Hub requires one OCI repository per chart and special handling for `artifacthub-repo.yml`. Docs: https://helm.sh/docs/topics/registries/ and https://artifacthub.io/docs/topics/repositories/helm-charts/
- GitHub Releases-only: insufficient for Artifact Hub discoverability unless paired with an `index.yaml` served as a Helm repo. This is what chart-releaser adds.
- Manual static Helm repo: possible, but chart-releaser automates the boring parts and matches GitHub Pages well.

## Implications

For this repo, the pragmatic path is to use a normal HTTP Helm repository on GitHub Pages, published by `helm/chart-releaser-action`, and register that repo URL in Artifact Hub. This fits the existing GitHub Release workflow without requiring an OCI registry decision or ORAS metadata flow.

Use `package.json` as the app source of truth and set chart `appVersion` plus default image tag from that app version. Keep chart `version` as a chart package version, not necessarily identical to app version.

Recommended versioning policy:

- Initial chart could be `0.1.0` or `1.8.0`; `0.1.0` is cleaner if treating the chart as a new artifact.
- On every app release where the chart's default image tag changes, bump chart `version` and `appVersion`.
- For chart-only fixes, bump only chart `version`; leave `appVersion` unchanged.
- Avoid lockstep-only chart versioning unless you are comfortable forcing app releases for chart-only fixes.

The health endpoint should be planned as part of the app contract before probes land. Current rules say `POST /` is the API and `GET /` must keep returning 400 guidance, so a separate endpoint such as `GET /healthz` or `GET /health` is the least disruptive option. It needs tests because it changes HTTP surface area and will be consumed by Docker Compose and Kubernetes probes.

## Risks and Uncertainties

Lockstep chart/app versions are simpler for humans but awkward for chart-only fixes.

Independent chart versions are standard Helm practice but require release documentation so maintainers know when to bump `version` versus `appVersion`.

OCI publishing is viable, but adds registry naming, auth, Artifact Hub metadata, and one-repo-per-chart considerations. It is probably unnecessary for this small repo unless the maintainer specifically wants registry-only distribution.

GitHub Pages introduces a new repo setting/branch dependency. Artifact Hub indexing depends on a stable public `index.yaml`.

## Sources

- Helm Chart.yaml version and appVersion docs: https://helm.sh/docs/topics/charts/
- Helm chart repository guide: https://helm.sh/docs/topics/chart_repository/
- Helm chart-releaser guide: https://helm.sh/docs/howto/chart_releaser_action/
- Helm OCI registry docs: https://helm.sh/docs/topics/registries/
- Artifact Hub Helm repository docs: https://artifacthub.io/docs/topics/repositories/helm-charts/
- Artifact Hub repository ownership/verified publisher docs: https://artifacthub.io/docs/topics/repositories/
- Artifact Hub Helm annotations: https://artifacthub.io/docs/topics/annotations/helm/
- Issue #53: https://github.com/phpdocker-io/readability-js-server/issues/53

## Open Questions

- Should the chart be versioned from `0.1.0` as a new artifact, or start at the current app version `1.8.0` for simpler release alignment?
- Preferred health path: `/healthz`, `/health`, or `/readyz`?
- Should chart publishing run only on app tags, or also on chart changes merged to `main`?
