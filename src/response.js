const RESPONSE_FIELDS = Object.freeze([
  "url",
  "title",
  "byline",
  "dir",
  "content",
  "length",
  "excerpt",
  "siteName",
  "textContent",
  "lang",
  "publishedTime",
]);

function getPublishedTime(document) {
  return (
    document
      .querySelector(
        'meta[property="article:published_time"], meta[name="article:published_time"], meta[name="pubdate"], meta[property="og:published_time"]',
      )
      ?.getAttribute("content") || null
  );
}

function mapArticleResponse(url, parsed, document) {
  const article = parsed || {};
  const documentLanguage = document?.documentElement?.lang || null;

  return {
    url,
    title: article.title ?? null,
    byline: article.byline ?? null,
    dir: article.dir ?? null,
    content: article.content ?? null,
    length: article.length ?? null,
    excerpt: article.excerpt ?? null,
    siteName: article.siteName ?? null,
    textContent: article.textContent ?? null,
    lang: article.lang ?? documentLanguage,
    publishedTime: article.publishedTime ?? getPublishedTime(document),
  };
}

module.exports = {
  mapArticleResponse,
  RESPONSE_FIELDS,
};
