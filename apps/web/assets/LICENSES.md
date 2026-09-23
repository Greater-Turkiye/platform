# Third-party assets / Üçüncü taraf varlıklar

All assets are self-hosted. The panel additionally draws a vector basemap whose tiles come from our own `gt-tiles` Worker — our build of OpenStreetMap data, not a third party's map service — and it is credited in its own section below.
Tüm varlıklar sitede barındırılır. Panel ayrıca kendi `gt-tiles` Worker'ımızdan gelen bir vektör altlık çizer; karolar OpenStreetMap verisinden bizim ürettiğimiz kesittir, künyesi aşağıdadır.

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
| `data/places-10m.geojson` | [Natural Earth](https://www.naturalearthdata.com) 1:10m populated places (simple build) — filtered to the dashboard's view; Turkish names are ours (`tools/geo/place_names_tr.csv`) | 5.x, accessed 2026-09-18 | Public domain — see `data/PLACES-SOURCES.md` |
| `data/msi-activity.json`, `data/msi-density.json`, `data/msi-regions.json` | [NGA Maritime Safety Information](https://msi.nga.mil/NavWarnings) broadcast warnings — counted, classified and gridded by us, no warning text copied | accessed 2026-09-19 | Work of the United States Government: public domain — see `data/MSI-ACTIVITY-SOURCES.md` |
| `data/trade-il.json` | [UN Comtrade](https://comtradeapi.un.org/public/v1/preview/C/M/HS) monthly merchandise trade, reporters Türkiye and Israel — selected, checked and aggregated by us | accessed 2026-09-20 | United Nations; see [data usage](https://comtrade.un.org/data/AboutDataUsage) — derived aggregates published with attribution, see `data/TRADE-SOURCES.md` |
| `data/coast-10m.json` | [Natural Earth 1:10m physical land](https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip) — çerçeveye kırpılmış, birleştirilmiş ve 4 ondalığa yuvarlanmış tek kıyı çizgisi / one merged coastline, clipped to the frame and rounded | erişim / accessed 2026-09-23 | Kamu malı / public domain |
| `data/fir.json` | [VAT-Spy Data Project](https://github.com/vatsimnetwork/vatspy-data-project) uçuş bilgi bölgesi sınırları — kırpılmış, alanları ölçülmüş ve denizlere göre paylaştırılmış / FIR boundaries, clipped, measured and apportioned by us | erişim / accessed 2026-09-21 | **CC BY-SA 4.0** — türetilmiş bu dosya da aynı lisansla yayımlanır / this derived file is published under the same licence. Şematiktir, resmî havacılık kaynağı değildir, seyrüsefer için kullanılamaz / schematic, not an aeronautical source, not for navigation |
| `data/vessels-sanctioned.json`, `data/vessels-summary.json` | [OFAC SDN list](https://www.treasury.gov/ofac/downloads/sdn.xml) and the [UN Security Council consolidated list](https://scsanctions.un.org/resources/xml/en/consolidated.xml) — vessel identity fields only | accessed 2026-09-20 | OFAC: work of the United States Government, public domain. UN: published for implementation of the measures — see `data/TRADE-SOURCES.md` |
| `data/disputed-tur-view.geojson`, `data/concern-regions.geojson` | [Natural Earth](https://www.naturalearthdata.com) 1:50m breakaway/disputed areas, admin-0 (Palestine) and admin-1 (Xinjiang) | 5.x | Public domain |

Boundaries shown are Natural Earth's de facto boundaries and do not imply any position of the project on sovereignty.
Gösterilen sınırlar Natural Earth'ün fiilî sınırlarıdır; projenin egemenlik konusundaki bir tutumunu ifade etmez.

## Vector basemap / Vektör altlık

Drawn under the panel's map by default (`?basemap=0` turns it off). See [apps/web/README.md](../README.md) and `tools/geo/build_basemap.md`.
Panel haritasının altında varsayılan olarak çizilir (`?basemap=0` kapatır).

| File | Project | Version | License |
|---|---|---|---|
| `vendor/maplibre-gl.js` | [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | 5.24.0 | BSD-3-Clause (the 70 KB `maplibre-gl.css` is **not** vendored: a non-interactive map needs only two rules, which are in `css/site.css`) |
| `vendor/glyphs/Noto Sans Regular/{0-255,256-511,512-767}.pbf` | [Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans), SDF glyph ranges from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets) — Latin, Latin Extended-A and Extended-B only (298 KB), so no label in another script can be drawn | accessed 2026-09-18 | SIL Open Font License 1.1 |

Tiles are not vendored. Whichever source is on, its credit is shown on the map and must stay visible.
Karolar depoda değildir. Hangi kaynak açıksa künyesi haritada görünür ve görünür kalmalıdır.

| Source | Shown as | License / terms |
|---|---|---|
| **default** — our own archive `region-20260917` (z0–11 of 13°E–74°E, 22°N–48°N), cut from the [Protomaps](https://protomaps.com) planet build of 2026-09-17, published as a release asset of this repository and served by the `gt-tiles` Worker | "© OpenStreetMap · Protomaps" | A Produced Work of OpenStreetMap data under [ODbL 1.0](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors. Protomaps' own style code is BSD-3-Clause; the style in `basemap.js` is ours. The credit is served in the TileJSON and drawn on the map. |
| `?basemap=ofm` — [OpenFreeMap](https://openfreemap.org), `dark` style, tiles built with [OpenMapTiles](https://openmaptiles.org) from OpenStreetMap | "© OpenStreetMap · OpenFreeMap · OpenMapTiles" | Map data [ODbL 1.0](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors. No key, no account, no stated request limit; commercial use allowed. Donation-funded, no SLA. |
