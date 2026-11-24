.PHONY: test

check: lint test helm-verify

install:
	npm ci

test:
	npm test

start:
	npm start

lint:
	npm run lint

lint-fix:
	npm run lint:fix

HELM_CHART ?= charts/readability-js-server
CHART_FILE ?= $(HELM_CHART)/Chart.yaml
HELM_RELEASE_NAME ?= readability-js-server

helm-lint:
	helm lint $(HELM_CHART)

helm-template:
	helm template $(HELM_RELEASE_NAME) $(HELM_CHART)

helm-verify: helm-lint helm-template

build-container:
	docker build -t readability-js .

run-container:
	docker run --rm -p3000:3000 readability-js

release-tag:
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make release-tag VERSION=x.y.z"; \
		exit 1; \
	fi
	@if ! printf '%s\n' "$(VERSION)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$'; then \
		echo "VERSION '$(VERSION)' is not strict MAJOR.MINOR.PATCH (digits only)"; \
		exit 1; \
	fi
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "Working tree is dirty; commit or stash changes before tagging"; \
		exit 1; \
	fi
	@git fetch origin main
	@if [ "$$(git rev-parse HEAD)" != "$$(git rev-parse origin/main)" ]; then \
		echo "HEAD does not match origin/main; check out main and pull before tagging"; \
		exit 1; \
	fi
	@chart_version="$$(awk '$$1 == "version:" { print $$2; exit }' $(CHART_FILE))"; \
	chart_app_version="$$(awk '$$1 == "appVersion:" { print $$2; exit }' $(CHART_FILE) | tr -d '"')"; \
	if [ "$$chart_version" != "$(VERSION)" ]; then \
		echo "$(CHART_FILE) version '$$chart_version' does not match VERSION $(VERSION)"; \
		exit 1; \
	fi; \
	if [ "$$chart_app_version" != "$(VERSION)" ]; then \
		echo "$(CHART_FILE) appVersion '$$chart_app_version' does not match VERSION $(VERSION)"; \
		exit 1; \
	fi
	git tag v$(VERSION)
	@echo "Created tag v$(VERSION). Push it with: git push origin v$(VERSION)"

example-request:
	curl -XPOST http://localhost:3000/ \
		-H "Content-Type: application/json" \
		-d'{"url": "https://en.wikipedia.org/wiki/Firefox"}' | jq

SOAK_REQUESTS ?= 100
SOAK_CONCURRENCY ?= 2
SOAK_SAMPLE_EVERY ?= 10

soak:
	node scripts/memory-soak.js --requests $(SOAK_REQUESTS) --concurrency $(SOAK_CONCURRENCY) --sample-every $(SOAK_SAMPLE_EVERY)
