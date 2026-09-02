import { parseLimit } from "../../lib/limit.js";
import { fetchNormalizedFeed } from "../../lib/animeSalt.js";
import { toJsonFeed } from "../../lib/formatters.js";

export default async function handler(req, res) {
  // Vercel provides req.query, but also support URL parsing for local server
  const url = new URL(req.url || `http://localhost/feed/json?limit=${req.query?.limit || ""}`, "http://localhost");
  const rawLimit = req.query?.limit ?? url.searchParams.get("limit");
  const limit = parseLimit(rawLimit);

  // headers
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");

  try {
    const items = await fetchNormalizedFeed({ limit });
    const payload = toJsonFeed(items, { limit });
    res.statusCode = 200;
    res.end(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.statusCode = 502;
    res.end(
      JSON.stringify(
        {
          error: "Failed to fetch AnimeSalt",
          message: err.message,
          limit,
          generatedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
  }
}
