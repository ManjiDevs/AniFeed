import { parseLimit } from "../../lib/limit.js";
import { fetchNormalizedFeed } from "../../lib/animeSalt.js";
import { toRssXml, errorRssXml } from "../../lib/formatters.js";

export default async function handler(req, res) {
  const url = new URL(req.url || `http://localhost/feed/rss?limit=${req.query?.limit || ""}`, "http://localhost");
  const rawLimit = req.query?.limit ?? url.searchParams.get("limit");
  const limit = parseLimit(rawLimit);

  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");

  try {
    const items = await fetchNormalizedFeed({ limit });
    const xml = toRssXml(items, { limit });
    res.statusCode = 200;
    res.end(xml);
  } catch (err) {
    const xml = errorRssXml(err.message);
    res.statusCode = 502;
    res.end(xml);
  }
}
