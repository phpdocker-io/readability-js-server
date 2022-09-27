install:
	yarn install

start:
	yarn start

lint:
	yarn prettier -c src/

lint-fix:
	yarn prettier -w src/

build-container:
	docker build -t readability-js . --load

run-container:
	docker run --rm -p3000:3000 readability-js

example-request:
	curl -XPOST http://localhost:3000/ \
		-H "Content-Type: application/json" \
		-d'{"url": "https://en.wikipedia.org/wiki/Firefox"}' | jq
