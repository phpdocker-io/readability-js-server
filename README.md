[![Build status](https://ci.auronconsulting.co.uk/api/v1/teams/main/pipelines/readability-js-server/jobs/build-and-publish-master/badge)](https://ci.auronconsulting.co.uk/teams/main/pipelines/readability-js-server)

# Readability JS server

Mozilla's Readability.js as a service

# What

This project packages [Mozilla's Readability JS](https://github.com/mozilla/readability) as an HTTP service that can be 
deployed via Docker anywhere.

# How to query

There's only one endpoint, which consumes and delivers json. You send in a URL to some page you want content extracted, 
you get back a json payload echoing the URL and containing the stripped out content.

You'll get back [all properties parsed out by Mozilla's Readability](https://github.com/mozilla/readability#parse).

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
  "title": "",
  "byline": null,
  "dir": "ltr",
  "content": "<div id=\"readability-page-1\" class=\"page\"><div dir=\"ltr\" lang=\"en\" id=\"mw-content-text\">\n\n\n<table><caption>Mozilla Firefox</caption><tbody><tr><td colspan=\"2\"><a href=\"/wiki/File:Firefox_logo,_2019.svg\"><img data-file-height=\"80\" data-file-width=\"77\" srcset=\"//upload.wikimedia. [...],
  "length": 101272,
  "excerpt": "Firefox 89 on Windows 10 displaying Wikipedia with the default system theme.",
  "siteName": null
}
```

# How to run

## Docker

The container image lives at `phpdockerio/readability-js-server`. At the moment, it takes no configuration for anything,
although this might change if and when the use case arises.

### CPU arch supported

 * `linux/amd64`
 * `linux/arm64`

If you require `linux/arm/v7` (32 bit), the newest supported version is `1.5.0`.

### Versioning

We tag each image as `latest`, `x.x.x`, `x.x` and `x`. Since Semver is in use, you can peg to, say, 
`phpdockerio/readability-js-server:1` with the confidence that no breaking changes will come to ruin your day. You can
also peg to `phpdockerio/readability-js-server:1.x` if there's a specific minor version that introduces a new feature
you need.

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
  * The docker image runs via `pm2` and `node 20` with 5 processes.
