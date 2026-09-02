export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(
    JSON.stringify(
      {
        name: "AniFeed",
        description: "Minimal AnimeSalt live feed — RSS & JSON",
        source: "https://animesalt.to",
        endpoints: {
          rss: "/feed/rss?limit=20",
          json: "/feed/json?limit=20",
        },
        limits: { default: 20, min: 1, max: 100 },
        vercel: true,
        uptime: new Date().toISOString(),
      },
      null,
      2
    )
  );
}
