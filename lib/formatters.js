const ANIMESALT_BASE = "https://animesalt.cx";

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(str) {
  return `<![CDATA[${String(str).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export function toJsonFeed(items, { limit }) {
  const now = new Date().toISOString();

  return {
    meta: {
      source: "AnimeSalt",
      baseUrl: ANIMESALT_BASE,
      generatedAt: now,
      count: items.length,
      limit,
    },
    items: items.map((it) => ({
      id: it.id,
      title: it.title,
      originalTitle: it.originalTitle,
      url: it.link,
      link: it.link,
      guid: it.guid,
      pubDate: it.pubDate,
      pubDateISO: it.pubDateISO,
      description: it.description,
      image: it.image,
      episode: it.episode,
      totalEpisodes: it.totalEpisodes,
      episodeLabel: it.episodeLabel,
      language: it.language,
      quality: it.quality,
      metadata: it.metadata,
    })),
  };
}

export function toRssXml(items, { limit } = {}) {
  const now = new Date().toUTCString();
  const channelTitle = "AniFeed — AnimeSalt Live Updates";
  const channelLink = ANIMESALT_BASE;
  const channelDesc = "Minimal live feed from AnimeSalt — fresh anime updates in RSS 2.0";

  const itemsXml = items
    .map(
      (it) => `    <item>
      <title>${cdata(it.title)}</title>
      <link>${escapeXml(it.link)}</link>
      <guid isPermaLink="true">${escapeXml(it.guid)}</guid>
      <pubDate>${escapeXml(it.pubDate)}</pubDate>
      <description>${cdata(it.description)}</description>
      ${it.image ? `<enclosure url="${escapeXml(it.image)}" type="image/jpeg" />` : ""}
      ${it.image ? `<media:content url="${escapeXml(it.image)}" medium="image" />` : ""}
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${cdata(channelTitle)}</title>
    <link>${escapeXml(channelLink)}</link>
    <description>${cdata(channelDesc)}</description>
    <language>en-us</language>
    <lastBuildDate>${escapeXml(now)}</lastBuildDate>
    <pubDate>${escapeXml(now)}</pubDate>
    <ttl>60</ttl>
    <atom:link href="${escapeXml(channelLink + "/feed/rss?limit=" + limit)}" rel="self" type="application/rss+xml" />
    <generator>AniFeed 1.0</generator>
${itemsXml}
  </channel>
</rss>`;
}

export function errorRssXml(message) {
  const now = new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AniFeed — Error</title>
    <link>${ANIMESALT_BASE}</link>
    <description>Failed to fetch AnimeSalt live data</description>
    <lastBuildDate>${escapeXml(now)}</lastBuildDate>
    <item>
      <title>${cdata("Error: " + message)}</title>
      <link>${ANIMESALT_BASE}</link>
      <guid>error-${Date.now()}</guid>
      <pubDate>${escapeXml(now)}</pubDate>
      <description>${cdata(message)}</description>
    </item>
  </channel>
</rss>`;
}
