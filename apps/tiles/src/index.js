// tiles — the Worker that serves our own vector basemap.
//
//   MapLibre GET /v1/<archive>/<z>/<x>/<y>.mvt
//     -> Cloudflare cache (a tile is immutable: the archive id carries the build date)
//     -> PMTiles directory lookup, then one HTTP range request into the archive
//     -> the vector tile, compressed on the way out by the edge
//
// **Why we host tiles at all.** The dashboard used to have two options: draw the world from the
// 50m Natural Earth file we ship (no detail past a country outline) or point MapLibre at somebody
// else's public tile service (no control, no guarantee, and every visitor's map requests leave our
// domain). This Worker is the third option: the tiles are an OpenStreetMap extract of our own
// region that we build, publish and serve ourselves, with nothing to sign up for.
//
// **Where the archive lives.** A single PMTiles file (one file, ~700 MB, z0–11 of the dashboard's
// view) published as a release asset of this repository. PMTiles is designed to be read with HTTP
// range requests, so the origin only has to serve ranges — a release asset does, R2 does, and the
// ARCHIVES variable in wrangler.jsonc is the only place that knows which. Every archive id is
// stamped with the build date, so a rebuild is a new id and a new URL, and nothing cached anywhere
// has to be invalidated.
//
// **What it does not do.** It writes nothing, reads no database, has no secret and takes no input
// beyond an archive id that must be in ARCHIVES and four integers. It is a read-only window onto
// one file.
//
// Attribution is not optional: the tiles are a Produced Work of OpenStreetMap data under ODbL 1.0,
// and the TileJSON this Worker serves carries the credit that has to stay visible on the map.

import { FetchSource, PMTiles, SharedPromiseCache } from "pmtiles";

/** Directories are shared between requests in the same isolate: a warm isolate serves a tile with one range request. */
const directories = new SharedPromiseCache();
/** One PMTiles instance per archive id, also per isolate. */
const archives = new Map();

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-max-age": "86400",
  // so the page that draws the map can read how many bytes its tiles cost (Resource Timing)
  "timing-allow-origin": "*",
};

const TILE_PATH = /^\/v1\/([a-z0-9][a-z0-9-]{0,63})\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.mvt$/;
const JSON_PATH = /^\/v1\/([a-z0-9][a-z0-9-]{0,63})\.json$/;

/** An R2 object read through the bucket binding, for the day the archive moves to R2. */
class R2Source {
  constructor(bucket, key) {
    this.bucket = bucket;
    this.key = key;
  }

  getKey() {
    return this.key;
  }

  async getBytes(offset, length) {
    const object = await this.bucket.get(this.key, { range: { offset, length } });
    if (!object) throw new Error(`archive not in the bucket: ${this.key}`);
    return { data: await object.arrayBuffer(), etag: object.etag };
  }
}

function archive(id, env) {
  const cached = archives.get(id);
  if (cached) return cached;
  let origin;
  try {
    origin = JSON.parse(env.ARCHIVES || "{}")[id];
  } catch {
    throw new Error("ARCHIVES is not valid JSON");
  }
  if (!origin) return null;
  const source = origin.startsWith("r2:")
    ? new R2Source(env.TILES, origin.slice(3))
    : new FetchSource(origin);
  const pm = new PMTiles(source, directories);
  archives.set(id, pm);
  return pm;
}

function text(status, body) {
  return new Response(body + "\n", {
    status,
    headers: { ...CORS, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

async function tile(request, env, ctx, [, id, z, x, y]) {
  const pm = archive(id, env);
  if (!pm) return text(404, `unknown archive: ${id}`);

  const cache = caches.default;
  // The cache key is ours, not the request: CACHE_VERSION lets a bad batch of cached tiles be
  // walked away from without waiting a week for them to expire or renaming the archive.
  const url = new URL(request.url);
  const key = new Request(`${url.origin}/_c${env.CACHE_VERSION || "1"}${url.pathname}`, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;

  const header = await pm.getHeader();
  const zoom = Number(z);
  if (zoom < header.minZoom || zoom > header.maxZoom) return text(404, "zoom level is not in this archive");
  const span = 2 ** zoom;
  if (Number(x) >= span || Number(y) >= span) return text(404, "tile is not on the map");

  const result = await pm.getZxy(zoom, Number(x), Number(y));
  // An empty tile is a real answer — most of a rectangle over this region is sea — and it is
  // cached like any other, so panning over water costs one request the first time and none after.
  //
  // The tile goes out uncompressed and the edge compresses it on the way: setting
  // `content-encoding` here gets the body encoded a second time, and MapLibre is then handed
  // something it cannot parse.
  //
  // The content type is `application/x-protobuf`, which a vector tile is, rather than
  // `application/vnd.mapbox-vector-tile`: Cloudflare compresses the first and not the second, and
  // that is worth 30% of every tile (a 3x3 viewport at z6: 524 KB -> 370 KB, brotli). MapLibre
  // does not care which of the two it is told.
  const response = new Response(result ? result.data : null, {
    status: result ? 200 : 204,
    headers: {
      ...CORS,
      "content-type": "application/x-protobuf",
      // the archive id carries the build date, so a tile at this URL never changes
      "cache-control": `public, max-age=${env.TILE_MAX_AGE || 604800}, immutable`,
    },
  });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

async function tilejson(request, env, [, id]) {
  const pm = archive(id, env);
  if (!pm) return text(404, `unknown archive: ${id}`);
  const header = await pm.getHeader();
  const metadata = await pm.getMetadata();
  const url = new URL(request.url);
  const body = {
    tilejson: "3.0.0",
    name: `Greater Türkiye basemap · ${id}`,
    description: metadata.description || "OpenStreetMap extract of the dashboard's region",
    scheme: "xyz",
    tiles: [`${url.origin}/v1/${id}/{z}/{x}/{y}.mvt`],
    minzoom: header.minZoom,
    maxzoom: header.maxZoom,
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
    center: [header.centerLon, header.centerLat, header.centerZoom],
    vector_layers: metadata.vector_layers || [],
    // ODbL 1.0: this credit has to stay visible wherever the tiles are drawn
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>',
  };
  return new Response(JSON.stringify(body), {
    headers: {
      ...CORS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET" && request.method !== "HEAD") return text(405, "GET or HEAD only");

    const { pathname } = new URL(request.url);
    const asTile = TILE_PATH.exec(pathname);
    if (asTile) {
      try {
        return await tile(request, env, ctx, asTile);
      } catch (err) {
        // a range read that fails is the origin's problem, not the client's: say so and do not cache it
        return text(502, `archive read failed: ${err.message}`);
      }
    }
    const asJson = JSON_PATH.exec(pathname);
    if (asJson) {
      try {
        return await tilejson(request, env, asJson);
      } catch (err) {
        return text(502, `archive read failed: ${err.message}`);
      }
    }
    if (pathname === "/" || pathname === "/v1") {
      const ids = Object.keys(JSON.parse(env.ARCHIVES || "{}"));
      return text(200, `Greater Türkiye vector basemap\n\n  /v1/<archive>.json\n  /v1/<archive>/{z}/{x}/{y}.mvt\n\narchives: ${ids.join(", ") || "none"}\n\n© OpenStreetMap contributors, ODbL 1.0 · tiles built with Protomaps`);
    }
    return text(404, "not a tile URL");
  },
};

export { R2Source };
