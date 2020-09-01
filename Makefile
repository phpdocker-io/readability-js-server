install:
	yarn install

start:
	yarn start

lint:
	yarn prettier -c src/

lint-fix:
	yarn prettier -w src/

example-request:
	curl -XPOST http://localhost:3000/ \
		-H "Content-Type: application/json" \
		-d'{"url": "https://en.wikipedia.org/wiki/Firefox"}'
