/**
 * AnimeSalt live fetch → parse → normalize
 * No DB, no auth, fetch fresh on request with small in-memory cache for Vercel.
 */

const BASE = (process.env.ANIMESALT_URL || "https://animesalt.to").replace(/\/$/, "");
const TIMEOUT_MS = 7000;

// simple in-memory cache (per instance)
let cache = {
  data: null,
  expiresAt: 0,
};
const CACHE_TTL_MS = 60 * 1000; // 60s for Vercel performance

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AniFeed/1.0; +https://github.com/anomalyco/opencode)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`AnimeSalt responded ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(id);
  }
}

/**
 * Parse HTML to extract flw-item blocks.
 * Uses regex to avoid extra dependencies (cheerio).
 */
function parseHtml(html) {
  const items = [];
  // split by flw-item blocks
  const blockRegex = /<div class="flw-item[^>]*data-id="([^"]*)"[^>]*>([\s\S]*?)(?=<div class="flw-item|<div class="clearfix"><\/div>\s*<\/div>\s*<div class="clearfix">)/g;
  // fallback simpler: find all anchor with /watch/
  // We'll use global approach: find each film-detail block combined with poster block
  const flwRegex = /<div class="flw-item[^>]*data-id="([^"]*)"[\s\S]*?<a href="([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="tick-item tick-eps">([^<]*)<\/div>[\s\S]*?data-src="([^"]+)"|data-src='([^']+)'/g;

  // Better: iterate with indexOf approach for reliability
  const parts = html.split('<div class="flw-item');
  for (let i = 1; i < parts.length; i++) {
    const chunk = '<div class="flw-item' + parts[i];
    // limit to first 3000 chars for efficiency but enough to capture data
    const slice = chunk.slice(0, 8000);

    const idMatch = slice.match(/data-id="([^"]*)"/);
    const id = idMatch ? idMatch[1].trim() : "";

    const hrefMatch = slice.match(/<a href="([^"]+)"[^>]*class="[^"]*dynamic-name[^"]*"[^>]*>/)
      || slice.match(/<a href="([^"]+)"[^>]*title="[^"]*"[^>]*>/)
      || slice.match(/<a href="(https:\/\/animesalt\.to\/watch[^"]+)"/);
    const href = hrefMatch ? hrefMatch[1] : null;
    if (!href) continue;

    // title: from anchor text or title attr
    let title = "";
    const titleAttrMatch = slice.match(/title="([^"]+)"\s+class="dynamic-name"/);
    const anchorTextMatch = slice.match(/class="dynamic-name"[^>]*>\s*([^<]+)\s*<\/a>/);
    if (anchorTextMatch) title = anchorTextMatch[1].trim();
    else if (titleAttrMatch) title = titleAttrMatch[1].trim();
    else {
      const generic = slice.match(/<a href="[^"]+"[^>]*>\s*([^<]{3,80})\s*<\/a>/);
      if (generic) title = generic[1].trim();
    }
    if (!title) continue;
    // decode html entities simple
    title = title.replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

    let jTitle = "";
    const jMatch = slice.match(/data-jname="([^"]*)"/);
    if (jMatch) jTitle = jMatch[1].trim().replace(/&#039;/g, "'").replace(/&amp;/g, "&");

    const epsMatch = slice.match(/tick-eps">\s*([^<]+)\s*<\/div>/);
    const epsRaw = epsMatch ? epsMatch[1].trim() : "";
    // epsRaw like "Ep 9 /12" or "Ep 9" or "Ep 1 /1"
    let episode = null;
    let totalEpisodes = null;
    if (epsRaw) {
      const m = epsRaw.match(/Ep\s+(\d+)(?:\s*\/\s*(\d+))?/i);
      if (m) {
        episode = m[1] ? parseInt(m[1], 10) : null;
        totalEpisodes = m[2] ? parseInt(m[2], 10) : null;
      }
    }

    const imgMatch = slice.match(/data-src="([^"]+)"/) || slice.match(/data-src='([^']+)'/);
    const image = imgMatch ? imgMatch[1] : "";

    const sub = slice.includes("tick-sub");
    const dub = slice.includes("tick-dub");
    const language = dub && sub ? "SUB/DUB" : dub ? "DUB" : sub ? "SUB" : "";

    const qualityMatch = slice.match(/tick-quality">\s*([^<]+)\s*</);
    const quality = qualityMatch ? qualityMatch[1].trim() : "";

    // derive guid: use href as guid (stable), or id if href missing
    const guid = href;
    // slug for id fallback
    const slugMatch = href.match(/\/watch\/([^\/]+)/);
    const slug = slugMatch ? slugMatch[1] : href;

    items.push({
      _raw: { id, slug, epsRaw, jTitle, language, quality, image },
      id: id || slug,
      title,
      jTitle,
      link: href,
      guid,
      image,
      episode,
      totalEpisodes,
      epsRaw,
      language,
      quality,
    });
  }
  return items;
}

function normalizeItems(parsed, fetchTime) {
  const now = fetchTime || new Date();
  // create normalized items with pubDate staggered by index to preserve order
  return parsed.map((p, idx) => {
    // Use fetch time minus idx minutes so recent items are newest
    const pubDate = new Date(now.getTime() - idx * 60000);
    // Build title with episode suffix if available
    let displayTitle = p.title;
    if (p.epsRaw) {
      // Avoid duplicate if title already contains Ep
      if (!displayTitle.includes("Ep ")) {
        displayTitle = `${displayTitle} - ${p.epsRaw}`;
      }
    }
    // description: rich but safe
    const descParts = [];
    if (p.jTitle && p.jTitle !== p.title) descParts.push(`Japanese: ${p.jTitle}`);
    if (p.epsRaw) descParts.push(`Episode: ${p.epsRaw}`);
    if (p.language) descParts.push(`Audio: ${p.language}`);
    if (p.quality) descParts.push(`Quality: ${p.quality}`);
    const description = descParts.join(" | ") || p.title;

    return {
      id: String(p.id),
      title: displayTitle,
      originalTitle: p.title,
      japaneseTitle: p.jTitle || null,
      link: p.link,
      guid: p.guid,
      pubDate: pubDate.toUTCString(),
      pubDateISO: pubDate.toISOString(),
      description,
      image: p.image || null,
      episode: p.episode,
      totalEpisodes: p.totalEpisodes,
      episodeLabel: p.epsRaw || null,
      language: p.language || null,
      quality: p.quality || null,
      metadata: {
        slug: p._raw.slug,
        animeSaltId: p._raw.id || null,
        image: p.image || null,
        japaneseTitle: p.jTitle || null,
      },
    };
  });
}

export async function fetchNormalizedFeed({ limit } = {}) {
  const now = Date.now();
  const isCacheValid = cache.data && now < cache.expiresAt;
  if (isCacheValid) {
    return cache.data.slice(0, limit || 20);
  }

  // Try primary source
  const sources = [`${BASE}/latest-updated`, `${BASE}/home`, `${BASE}/new-release`];
  let html = null;
  let lastErr = null;
  for (const src of sources) {
    try {
      html = await fetchWithTimeout(src);
      if (html && html.includes("flw-item")) break;
      // if html doesn't contain items, try next
    } catch (e) {
      lastErr = e;
      html = null;
    }
  }
  if (!html) {
    throw new Error(
      lastErr ? `AnimeSalt unavailable: ${lastErr.message}` : "AnimeSalt returned no data"
    );
  }

  const parsed = parseHtml(html);
  if (!parsed.length) {
    throw new Error("AnimeSalt returned invalid data (no items parsed)");
  }

  const normalized = normalizeItems(parsed, new Date());

  // store in cache full list (up to 100)
  cache = {
    data: normalized,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return normalized.slice(0, limit || 20);
}

// for testing: allow clearing cache
export function __clearCache() {
  cache = { data: null, expiresAt: 0 };
}

export function __parseHtml(html) {
  return parseHtml(html);
}

export function __normalize(parsed) {
  return normalizeItems(parsed, new Date());
}

export const ANIMESALT_BASE = BASE;
