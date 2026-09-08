/**
 * AnimeSalt live fetch → parse → normalize.
 * No DB, no auth, fetch fresh on request with small in-memory cache for Vercel.
 */

const BASE = "https://animesalt.cx";
const TIMEOUT_MS = 7000;

let cache = {
  data: null,
  expiresAt: 0,
};
const CACHE_TTL_MS = 60 * 1000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AniFeed/1.0; +https://github.com/ManjiDevs/AniFeed)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`AnimeSalt responded ${res.status} for ${url}`);
    }

    return await res.text();
  } finally {
    clearTimeout(id);
  }
}

function normalizeAnimeSaltUrl(href) {
  if (!href) return null;

  const url = new URL(href, `${BASE}/`);

  // AnimeSalt may expose an old canonical host in HTML. Always keep AniFeed
  // on the current .cx source while preserving the exact path and query.
  if (url.hostname === "animesalt.to" || url.hostname === "animesalt.cx") {
    return `${BASE}${url.pathname}${url.search}${url.hash}`;
  }

  return url.toString();
}

/**
 * Parse AnimeSalt listing HTML.
 */
function parseHtml(html) {
  const items = [];
  const parts = html.split('<div class="flw-item');

  for (let i = 1; i < parts.length; i++) {
    const chunk = '<div class="flw-item' + parts[i];
    const slice = chunk.slice(0, 8000);

    const idMatch = slice.match(/data-id="([^"]*)"/);
    const id = idMatch ? idMatch[1].trim() : "";

    const hrefMatch =
      slice.match(/<a href="([^"]+)"[^>]*class="[^"]*dynamic-name[^"]*"[^>]*>/) ||
      slice.match(/<a href="([^"]+)"[^>]*title="[^"]*"[^>]*>/) ||
      slice.match(/<a href="([^"#]*\/watch\/[^"#]+)"/);

    const rawHref = hrefMatch ? hrefMatch[1] : null;
    if (!rawHref) continue;

    const href = normalizeAnimeSaltUrl(rawHref);
    if (!href) continue;

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

    title = title
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    let jTitle = "";
    const jMatch = slice.match(/data-jname="([^"]*)"/);
    if (jMatch) {
      jTitle = jMatch[1]
        .trim()
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, "&");
    }

    const epsMatch = slice.match(/tick-eps">\s*([^<]+)\s*<\/div>/);
    const epsRaw = epsMatch ? epsMatch[1].trim() : "";

    let episode = null;
    let totalEpisodes = null;

    if (epsRaw) {
      const m = epsRaw.match(/Ep\s+(\d+)(?:\s*\/\s*(\d+))?/i);
      if (m) {
        episode = m[1] ? parseInt(m[1], 10) : null;
        totalEpisodes = m[2] ? parseInt(m[2], 10) : null;
      }
    }

    const imgMatch =
      slice.match(/data-src="([^"]+)"/) ||
      slice.match(/data-src='([^']+)'/);
    const image = imgMatch ? imgMatch[1] : "";

    const sub = slice.includes("tick-sub");
    const dub = slice.includes("tick-dub");
    const language = dub && sub ? "SUB/DUB" : dub ? "DUB" : sub ? "SUB" : "";

    const qualityMatch = slice.match(/tick-quality">\s*([^<]+)\s*</);
    const quality = qualityMatch ? qualityMatch[1].trim() : "";

    const slugMatch = href.match(/\/watch\/([^/?#]+)/);
    const slug = slugMatch ? slugMatch[1] : href;

    items.push({
      _raw: { id, slug, epsRaw, jTitle, language, quality, image },
      id: id || slug,
      title,
      jTitle,
      link: href,
      guid: href,
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

  return parsed.map((p, idx) => {
    // The listing has no per-item publication timestamp. The generated time
    // preserves source ordering without pretending to be an AnimeSalt timestamp.
    const pubDate = new Date(now.getTime() - idx * 1000);

    let displayTitle = p.title;
    if (p.epsRaw && !displayTitle.includes("Ep ")) {
      displayTitle = `${displayTitle} - ${p.epsRaw}`;
    }

    const descParts = [];
    if (p.jTitle && p.jTitle !== p.title) descParts.push(`Japanese: ${p.jTitle}`);
    if (p.epsRaw) descParts.push(`Episode: ${p.epsRaw}`);
    if (p.language) descParts.push(`Audio: ${p.language}`);
    if (p.quality) descParts.push(`Quality: ${p.quality}`);

    return {
      id: String(p.id),
      title: displayTitle,
      originalTitle: p.title,
      japaneseTitle: p.jTitle || null,
      link: p.link,
      guid: p.guid,
      pubDate: pubDate.toUTCString(),
      pubDateISO: pubDate.toISOString(),
      description: descParts.join(" | ") || p.title,
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

  const sources = [
    `${BASE}/latest-updated`,
    `${BASE}/home`,
    `${BASE}/new-release`,
  ];

  let html = null;
  let lastErr = null;

  for (const src of sources) {
    try {
      html = await fetchWithTimeout(src);
      if (html && html.includes("flw-item")) break;
      html = null;
    } catch (e) {
      lastErr = e;
      html = null;
    }
  }

  if (!html) {
    throw new Error(
      lastErr
        ? `AnimeSalt unavailable: ${lastErr.message}`
        : "AnimeSalt returned no data"
    );
  }

  const parsed = parseHtml(html);
  if (!parsed.length) {
    throw new Error("AnimeSalt returned invalid data (no items parsed)");
  }

  const normalized = normalizeItems(parsed, new Date());

  cache = {
    data: normalized,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return normalized.slice(0, limit || 20);
}

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
