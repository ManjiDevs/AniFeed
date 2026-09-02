# AniFeed — Minimal AnimeSalt Live Feed

Minimal, optimized API that fetches **live** data from [AnimeSalt](https://animesalt.to) and exposes it in **RSS 2.0** and **JSON** formats. No database, no auth, no background jobs. Optimized for **Vercel serverless**.

Architecture: `AnimeSalt → live fetch → parse → normalize → format response`

---

## Endpoints

### `GET /feed/json?limit=20`
Returns clean structured JSON.

**Response:**
```json
{
  "meta": {
    "source": "AnimeSalt",
    "baseUrl": "https://animesalt.to",
    "generatedAt": "2026-09-02T10:48:42.340Z",
    "count": 20,
    "limit": 20
  },
  "items": [
    {
      "id": "8903",
      "title": "Raised by Demons: Panda Li - Ep 8 /18",
      "originalTitle": "Raised by Demons: Panda Li",
      "url": "https://animesalt.to/watch/raised-by-demons-panda-li-9ftzt/ep-8",
      "link": "https://animesalt.to/watch/raised-by-demons-panda-li-9ftzt/ep-8",
      "guid": "https://animesalt.to/watch/raised-by-demons-panda-li-9ftzt/ep-8",
      "pubDate": "Wed, 02 Sep 2026 10:48:39 GMT",
      "pubDateISO": "2026-09-02T10:48:39.095Z",
      "description": "Japanese: Li Xiongmao | Episode: Ep 8 /18 | Audio: SUB | Quality: HD",
      "image": "https://cdn.anipixcdn.co/thumbnail/....jpg",
      "episode": 8,
      "totalEpisodes": 18,
      "episodeLabel": "Ep 8 /18",
      "language": "SUB",
      "quality": "HD",
      "metadata": {
        "slug": "raised-by-demons-panda-li-9ftzt",
        "animeSaltId": "8903",
        "image": "https://cdn.anipixcdn.co/thumbnail/....jpg",
        "japaneseTitle": "Li Xiongmao"
      }
    }
  ]
}
```

### `GET /feed/rss?limit=20`
Returns valid **RSS 2.0 XML** (`Content-Type: application/rss+xml`).

Includes `title`, `link`, `guid`, `pubDate`, `description`, `enclosure` (image).

### `GET /`
Health / info.

---

## Limit Rules

| Param | Behavior |
|-------|----------|
| `?limit=20` | Returns 20 items |
| `?limit=1`  | Minimum 1 |
| `?limit=100`| Maximum 100 |
| Missing / invalid (`abc`, `0`, `-5`, `200`, `""`) | Falls back safely to **20** |
| `?limit` not set | Default **20** |

Invalid values **do not** clamp — they fallback to default per spec. Valid values inside `[1,100]` are used.

Tested:
```
limit=1      -> 1 item
limit=20     -> 20 items
limit=100    -> up to 100 (30 available on AnimeSalt, returns 30)
limit=abc    -> 20 (fallback)
limit=200    -> 20 (fallback, above max)
limit=0      -> 20 (fallback)
```

---

## Architecture & Code Structure

```
AnimeSalt (https://animesalt.to/latest-updated)
   ↓ live fetch (fetch + 7s timeout, UA header, redirect follow)
   ↓ parse (regex over flw-item blocks, no heavy deps)
   ↓ normalize (shared array: id, title, link, guid, pubDate, metadata)
   ↓ format
     → JSON (/feed/json)
     → RSS 2.0 XML (/feed/rss)
```

```
.
├── lib/
│   ├── animeSalt.js   # fetch → parse → normalize + 60s in-memory cache
│   ├── limit.js       # parseLimit() with fallback logic
│   └── formatters.js  # toJsonFeed() + toRssXml()
├── api/
│   ├── index.js       # GET /
│   └── feed/
│       ├── json.js    # Vercel handler: GET /feed/json
│       └── rss.js     # Vercel handler: GET /feed/rss
├── server.js          # Local dev server (also used to test)
├── vercel.json        # Vercel build, headers, rewrites
└── package.json       # zero dependencies, Node >=18
```

**Key design choices:**
- **No database, no auth, no jobs** — pure live fetch per request.
- **No caching unless needed** — 60s in-memory cache only for Vercel performance (`s-maxage=60, stale-while-revalidate=30`), not persistent storage.
- **Same normalized data** — both endpoints call `fetchNormalizedFeed()` then format.
- **Preserves original** `title`, `url`, `pubDate`, `guid/id`, `image`, `episode`, `language`, `quality`, `japaneseTitle`.
- **Minimal deps** — `0` npm dependencies, uses native `fetch` (Node 18+), regex parsing (no cheerio).
- **Small functions** — each file < 150 lines, single responsibility.

---

## Local Development

```bash
npm install   # no deps to install, just for completeness
npm run dev   # or: node server.js  (PORT=3000)
# or
PORT=3002 node server.js

curl http://localhost:3000/feed/json?limit=5 | jq
curl http://localhost:3000/feed/rss?limit=5
```

**Test limit values:**
```bash
curl "http://localhost:3002/feed/json?limit=1" | jq '.meta'
curl "http://localhost:3002/feed/json?limit=100" | jq '.meta'
curl "http://localhost:3002/feed/json?limit=abc" | jq '.meta'
curl "http://localhost:3002/feed/json?limit=200" | jq '.meta'
curl "http://localhost:3002/feed/rss?limit=1" | grep -c "<item>"
curl "http://localhost:3002/feed/rss?limit=100" | grep -c "<item>"

# RSS validity (python)
python3 -c "import xml.etree.ElementTree as ET; ET.fromstring(open('/tmp/rss.xml').read()); print('valid')"
```

**Error handling:**
- If AnimeSalt is unreachable or returns invalid HTML, `/feed/json` returns `502` JSON with `{error, message}`, `/feed/rss` returns `502` RSS XML with error item.

---

## Vercel Deployment

**Zero-config:** push to Vercel, it detects `vercel.json` + `api/` functions.

```bash
# Install Vercel CLI
npm i -g vercel
vercel --prod
```

**vercel.json highlights:**
- Functions: `memory 256MB`, `maxDuration 10s`
- Headers: `Cache-Control: s-maxage=60` + `CORS: *`
- Rewrites: `/feed/rss` → `/api/feed/rss`, `/feed/json` → `/api/feed/json`

**Env var (optional):**
```
ANIMESALT_URL=https://animesalt.to   # override source if domain changes
```

No build step, no DB, ready to deploy.

---

## Production Notes

- **Fresh fetch per request** (no permanent storage) — data is live.
- **Vercel serverless** — each request runs isolated, in-memory cache per instance (not shared).
- **Falls back** through `/latest-updated` → `/home` → `/new-release` if one page fails.
- **Timeout** 7s + proper error mapping to 502.

---

## License

MIT
