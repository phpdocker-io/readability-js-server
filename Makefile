install:
	yarn install

start:
	yarn start

example-request:
	curl -XPOST http://localhost:3000/ \
		-H "Content-Type: application/json" \
    	-d'{"url": "https://en.wikipedia.org/wiki/Firefox"}'
