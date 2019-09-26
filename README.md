# Readability JS server

Mozilla's Readability.js as a service

# What

This project packages [Mozilla's Readability JS](https://github.com/mozilla/readability) as an HTTP service that can be 
deployed via Docker anywhere.

# How to query

There's only one endpoint, which consumes and delivers json. You send in a URL to some page you want content extracted, 
you get back a json payload echoing the URL and containing the stripped out content.

```bash
~ curl -XPOST http://readability-js-server:3000/ \
    -H "Content-Type: application/json" \
    -d'{"url": "https://en.wikipedia.org/wiki/Firefox"}'
```

To which you will receive:
```
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
{
   "url": "https://en.wikipedia.org/wiki/Firefox",
   "content": "<div id=\"readability-page-1\" class=\"page\"><div id=\"mw-content-text\" lang=\"en\" dir=\"ltr\"><div>\n\n\n\n<table><caption>Firefox</caption><tbody><tr><td colspan=\"2\"><a href=\"/wiki/File:Firefox_Logo,_2017.svg\"><img alt=\"Firefox Logo, 2017.svg\" src=\"//upload.wikimedia.org/wikipedia/commons/thumb/6/67/Firefox [...]"
}
```

# How to run

## Docker

The container image lives at `phpdockerio/readability-js-server`. At the moment, it takes no configuration for anything,
although this might change if and when the use case arises.

### Example
You'll probably be using this if you're deploying the service somewhere. Simply run the equivalent to 
```bash
~ docker run -p3000:3000 phpdockerio/readability-js-server
``` 

## Locally

You'll need `node` >= 10 and `yarn`.

Once you clone the repo:
```bash
~ yarn install
~ yarn start
```

# Notes
  * No configuration required. This might change if the need arises.
  * The app requires `node 10`. There's nothing specific about node 10 we're using, but `yarn.lock` was created
  with it so some of the dependencies might require it. If you want to run this on say AWS lambda and node 8, it might
  work if you nuke `yarn.lock` and re-create it with that node version. 
  * The docker image runs via `pm2` and `node 10` with 5 processes. I might make this configurable if there's demand.
