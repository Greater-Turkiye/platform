// site — the Worker that serves the static site from Cloudflare's edge.
//
//   GET /                      -> apps/web, as it is in the repository (the ASSETS binding)
//   GET /datasets/<file>       -> the dataset export, fetched once per edge and cached
//
// **Why not just GitHub Pages.** Pages serves the site well and will keep serving it: this Worker
// is not a migration away from it, it is the copy we control. Three things it can do that Pages
// cannot: send our own headers (a content security policy, a referrer policy, cache lifetimes that
// match how each kind of file actually changes), put the dataset export on the *same origin* as the
// page that reads it, and sit next to `gt-tiles` in the same account so the map, the data and the
// page are one system rather than three addresses.
//
// **What it does not do.** It has no secret, writes nothing, reads no database and takes no input
// beyond a path. The dataset proxy is allow-listed by file name: nothing else on that origin can be
// reached through it, and no URL a visitor supplies is ever fetched.
//
// The canonical address stays the GitHub Pages one until a domain is pointed here; both serve the
// same files from the same commit.

const DATA_FILES = new Set([
  "manifest.json",
  "vocab.json",
  "event.jsonl",
  "actor.jsonl",
  "site.jsonl",
  "source.jsonl",
  "equipment.jsonl",
  "examples.jsonl",
  "withdrawn.jsonl",
  "events.csv",
  "events.geojson",
  "feed.xml",
  "feed.json",
  "feed.md",
]);

/* How long each kind of file may be held. The data export changes when a record is merged, so it is
   short and revalidated; the site's own assets are rebuilt with the site, so they are longer; the
   pages themselves are short, because a page is the thing a reader reloads to see a change. */
function cacheFor(pathname) {
  if (pathname.startsWith("/assets/vendor/") || pathname.startsWith("/assets/fonts/")) {
    return "public, max-age=604800";
  }
  if (pathname.startsWith("/assets/")) return "public, max-age=3600";
  return "public, max-age=300";
}

/* A page may load only what this project ships. The map, the tiles and the dataset export are named
   explicitly; everything else — an analytics script, a font from a CDN, an iframe — is refused by
   the browser before it is requested. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://gt-tiles.brasilquart.workers.dev https://greater-turkiye.github.io",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const SECURITY = {
  "content-security-policy": CSP,
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=(), interest-cohort=()",
};

async function dataset(request, env, ctx, name) {
  if (!DATA_FILES.has(name)) return new Response("not a dataset file\n", { status: 404 });
  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + "/_d/" + name, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;

  const upstream = await fetch(new URL(name, env.DATA_ORIGIN), {
    headers: { accept: request.headers.get("accept") || "*/*" },
  });
  if (!upstream.ok) {
    return new Response(`dataset upstream: ${upstream.status}\n`, { status: 502 });
  }
  const response = new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/octet-stream",
      // the export changes when a record is merged; a few minutes is the right distance
      "cache-control": `public, max-age=${env.DATA_MAX_AGE || 300}`,
      ...SECURITY,
    },
  });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("GET or HEAD only\n", { status: 405 });
    }
    const url = new URL(request.url);

    if (url.pathname.startsWith("/datasets/")) {
      return dataset(request, env, ctx, url.pathname.slice("/datasets/".length));
    }

    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    for (const [k, v] of Object.entries(SECURITY)) headers.set(k, v);
    headers.set("cache-control", cacheFor(url.pathname));
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  },
};
