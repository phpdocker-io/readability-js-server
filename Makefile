install:
	pnpm install --frozen-lockfile

start:
	pnpm start

lint:
	pnpm lint

lint-fix:
	pnpm lint:fix

build-container:
	docker build -t readability-js .

run-container:
	docker run --rm -p3000:3000 readability-js

example-request:
	curl -XPOST http://localhost:3000/ \
		-H "Content-Type: application/json" \
		-d'{"url": "https://en.wikipedia.org/wiki/Firefox"}' | jq
