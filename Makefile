install:
	npm ci

test:
	npm test

start:
	npm start

check: lint test helm-verify
lint:
	npm run lint

lint-fix:
	npm run lint:fix

HELM_CHART ?= charts/readability-js-server
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
