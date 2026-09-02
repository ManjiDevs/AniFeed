import http from "node:http";
import { parse as parseUrl } from "node:url";
import jsonHandler from "./api/feed/json.js";
import rssHandler from "./api/feed/rss.js";
import indexHandler from "./api/index.js";

const PORT = process.env.PORT || 3000;

function adapt(req, res) {
  // emulate Vercel req.query
  const parsed = parseUrl(req.url, true);
  req.query = parsed.query;
  const pathname = parsed.pathname;

  if (pathname === "/" || pathname === "/api" || pathname === "/api/index") {
    return indexHandler(req, res);
  }
  if (pathname === "/feed/json" || pathname === "/api/feed/json") {
    return jsonHandler(req, res);
  }
  if (pathname === "/feed/rss" || pathname === "/api/feed/rss") {
    return rssHandler(req, res);
  }
  if (pathname === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
    return;
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not Found", path: pathname, endpoints: ["/feed/rss", "/feed/json"] }, null, 2));
}

const server = http.createServer(adapt);

server.listen(PORT, () => {
  console.log(`AniFeed listening on http://localhost:${PORT}`);
  console.log(`  JSON: http://localhost:${PORT}/feed/json?limit=20`);
  console.log(`  RSS : http://localhost:${PORT}/feed/rss?limit=20`);
});
