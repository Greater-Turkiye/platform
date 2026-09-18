# Third-party assets / Üçüncü taraf varlıklar

All assets are self-hosted, so the site as a visitor sees it makes no third-party requests. The one exception is the vector basemap prototype, which is off unless `panel.html` is opened with `?basemap=…`; it is credited in its own section below.
Tüm varlıklar sitede barındırılır; ziyaretçinin gördüğü site üçüncü taraflara istek göndermez. Tek istisna, yalnızca `panel.html?basemap=…` ile açılan vektör altlık prototipidir; künyesi aşağıda kendi bölümündedir.

| File | Project | Version | License |
|---|---|---|---|
| `vendor/d3.min.js` | [D3](https://d3js.org) | 7.9.0 | ISC |
| `vendor/topojson-client.min.js` | [topojson-client](https://github.com/topojson/topojson-client) | 3.1.0 | ISC |
| `data/countries-50m.json` | [world-atlas](https://github.com/topojson/world-atlas) from [Natural Earth](https://www.naturalearthdata.com) | 2.0.2 | ISC (package) · Natural Earth data is public domain |
| `fonts/montserrat-*.woff2` | [Montserrat](https://github.com/JulietaUla/Montserrat) via Fontsource | variable | SIL Open Font License 1.1 |
| `fonts/plexmono-*.woff2` | [IBM Plex Mono](https://github.com/IBM/plex) via Fontsource | 400, 500 | SIL Open Font License 1.1 |
| `data/maritime-tur.geojson` (Black Sea polygon; Cyprus 12 nm cut-out; Sea of Marmara and Turkish Straits) | [Marine Regions](https://www.marineregions.org) Maritime Boundaries and IHO Sea Areas ("Sea of Marmara"), Flanders Marine Institute (VLIZ) — modified (clipped, simplified) | WFS, accessed 2026-09-13 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · "Flanders Marine Institute (2026): MarineRegions.org" — see `data/MARITIME-SOURCES.md` |
| `data/islands-tur.geojson` | [Wikidata](https://www.wikidata.org) coordinates (P625) | accessed 2026-09-13 | CC0 1.0 |
| `data/tur-operation-areas.geojson` | [Syrian Arab Republic – Subnational Administrative Boundaries (COD-AB)](https://data.humdata.org/dataset/cod-ab-syr), OCHA / United Nations Cartographic Section and partners, via HDX — modified (sub-districts dissolved, clipped to Syria in `countries-50m.json`, simplified); depth limit measured from [Natural Earth](https://www.naturalearthdata.com) 10m admin-0 | `syr_admin_boundaries.shp.zip`, HDX update 2026-01-26, accessed 2026-09-13 | [CC BY-IGO 3.0](https://creativecommons.org/licenses/by/3.0/igo/legalcode) (boundaries do not imply official endorsement or acceptance by the United Nations) · Natural Earth: public domain — see `data/OPERATION-AREAS-SOURCES.md` |
| `data/disputed-tur-view.geojson`, `data/concern-regions.geojson` | [Natural Earth](https://www.naturalearthdata.com) 1:50m breakaway/disputed areas, admin-0 (Palestine) and admin-1 (Xinjiang) | 5.x | Public domain |

Boundaries shown are Natural Earth's de facto boundaries and do not imply any position of the project on sovereignty.
Gösterilen sınırlar Natural Earth'ün fiilî sınırlarıdır; projenin egemenlik konusundaki bir tutumunu ifade etmez.

## Vector basemap prototype / Vektör altlık prototipi

Loaded only with `panel.html?basemap=…` (see [apps/web/README.md](../README.md)). Nothing here is fetched on a normal visit.
Yalnızca `panel.html?basemap=…` ile yüklenir; normal bir ziyarette buradaki hiçbir şey istenmez.

| File | Project | Version | License |
|---|---|---|---|
| `vendor/maplibre-gl.js` | [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | 5.24.0 | BSD-3-Clause (the 70 KB `maplibre-gl.css` is **not** vendored: a non-interactive map needs only two rules, which are in `css/site.css`) |
| `vendor/pmtiles.js` | [PMTiles](https://github.com/protomaps/PMTiles) | 4.5.0 | BSD-3-Clause |
| `vendor/glyphs/Noto Sans Regular/{0-255,256-511,512-767}.pbf` | [Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans), SDF glyph ranges from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets) — Latin, Latin Extended-A and Extended-B only (298 KB), so no label in another script can be drawn | accessed 2026-09-18 | SIL Open Font License 1.1 |

Tiles are not vendored. Whichever source is on, its credit is shown on the map and must stay visible.
Karolar depoda değildir. Hangi kaynak açıksa künyesi haritada görünür ve görünür kalmalıdır.

| Source | Shown as | License / terms |
|---|---|---|
| `?basemap=1` — [OpenFreeMap](https://openfreemap.org), `dark` style, tiles built with [OpenMapTiles](https://openmaptiles.org) from OpenStreetMap | "© OpenStreetMap · OpenFreeMap · OpenMapTiles" | Map data [ODbL 1.0](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors. No key, no account, no stated request limit; commercial use allowed. Donation-funded, no SLA. |
| `?basemap=pmtiles&pmtiles=<url>` — a [Protomaps](https://protomaps.com) basemap build we host ourselves | "© OpenStreetMap · Protomaps" | A Produced Work of OpenStreetMap data under [ODbL 1.0](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors. Protomaps' own style code is BSD-3-Clause; the style in `basemap.js` is ours. |
