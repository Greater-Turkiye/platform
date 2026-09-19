# Building the basemap archive

The dashboard draws on our own tiles. They are one PMTiles file — an OpenStreetMap extract of the
region the panel shows — published as a release asset of this repository and served by the
`gt-tiles` Worker (`apps/tiles`). Nothing about it runs on a schedule: the archive is rebuilt by
hand when the data is old enough to matter, which is a decision, not a cron job.

Bu altlık bizimdir: paneldeki bölgenin OpenStreetMap çıkarımı tek bir PMTiles dosyası olarak bu
deponun sürüm varlığında yayımlanır ve `gt-tiles` Worker'ı tarafından sunulur. Yenileme elle
yapılır.

## What is in it

| | |
|---|---|
| Area | 13°E–74°E, 22°N–48°N — the panel's `fitExtent`, Balkans to Pakistan, Black Sea to the Gulf |
| Zoom | 0–11 (MapLibre scales the last level for deeper zooms) |
| Size | ~709 MB |
| Tiles | MVT, gzip, Protomaps basemap schema (`earth`, `water`, `landcover`, `landuse`, `roads`, `places`, …) |
| Source | [Protomaps](https://protomaps.com) daily planet build, itself built from OpenStreetMap with planetiler |
| Licence | A Produced Work of OpenStreetMap data — © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). The credit is served in the TileJSON and drawn on the map. |

We do not redraw or re-license anything: the extract is a byte-range copy of the upstream build for
one rectangle and eleven zoom levels.

## Rebuilding

Needs [`go-pmtiles`](https://github.com/protomaps/go-pmtiles) (a single binary) and `gh`. The
download is a few hundred range requests against the upstream build; it does not download the
planet.

```sh
DATE=20260917   # a daily build that exists on build.protomaps.com

# 1. estimate first: --dry-run prints the archive size without fetching a tile
pmtiles extract "https://build.protomaps.com/$DATE.pmtiles" region-z0-11.pmtiles \
  --bbox=13,22,74,48 --maxzoom=11 --dry-run

# 2. build it
pmtiles extract "https://build.protomaps.com/$DATE.pmtiles" region-z0-11.pmtiles \
  --bbox=13,22,74,48 --maxzoom=11 --download-threads=8

# 3. check it before it goes anywhere: bounds, zoom range, tile type, OSM timestamp
pmtiles show region-z0-11.pmtiles

# 4. publish it as its own release, tagged with the build date
gh release create "basemap-$DATE" --repo Greater-Turkiye/platform --target main \
  --title "Basemap archive · OSM ${DATE:0:4}-${DATE:4:2}-${DATE:6:2}" --notes-file notes.md
gh release upload "basemap-$DATE" region-z0-11.pmtiles --repo Greater-Turkiye/platform
```

Then point the Worker at the new archive and deploy it:

```sh
# apps/tiles/wrangler.jsonc → vars.ARCHIVES: { "region-<DATE>": "https://github.com/.../region-z0-11.pmtiles" }
cd ../../apps/tiles && npx wrangler deploy
# assets/js/basemap.js → GT_TILES: .../v1/region-<DATE>/{z}/{x}/{y}.mvt
```

The archive id carries the build date, so a new archive is a new set of URLs: nothing cached in a
browser or at the edge has to be invalidated, and the old archive keeps working until its release
is deleted. Keep the previous one until the new one has been seen working.

## Why a release asset

R2 is the obvious home for this file and the Worker already reads an `r2:<key>` origin, but R2 has
to be enabled on the Cloudflare account first, which needs a card on file. A release asset is free,
supports HTTP range requests, and holds up to 2 GB per file — enough for this archive with room to
spare. Moving to R2 later is a bucket binding plus one line in `ARCHIVES`; no client URL changes.

R2 hesapta açıldığında taşıma tek satırdır: `ARCHIVES` içinde `r2:<anahtar>` ve `TILES` bağlaması.

## Limits worth knowing

- **Workers free plan**: 100k requests/day. One tile is one request; the edge cache answers repeats
  for a week (`TILE_MAX_AGE`), so a returning visitor costs almost nothing.
- **Zoom 11** is where the archive stops. Deeper zooms are the same tiles scaled, so labels stay
  sharp but no new detail appears. Going to z12 roughly doubles the file (~1.6 GB), which still fits
  a release asset if the detail is ever worth it.
- **Coverage stops at the bbox.** Outside it the basemap is empty by design; the panel cannot pan
  there (`translateExtent`).
