# `apps/tiles` — `gt-tiles`

Panelin altındaki haritayı sunan Cloudflare Worker'ı. Karolar bizimdir: paneldeki bölgenin
OpenStreetMap kesitini kendimiz üretir, tek bir PMTiles arşivi olarak yayımlar ve bu Worker ile
karo karo sunarız. Anahtar yok, hesap yok, üçüncü taraf harita servisi yok.

The Cloudflare Worker that serves the map under the dashboard. The tiles are ours: we cut the
OpenStreetMap extract of the panel's region, publish it as one PMTiles archive and serve it one
tile per request from here. No key, no account, no third-party map service.

```
MapLibre  GET /v1/<archive>/<z>/<x>/<y>.mvt
  -> Cloudflare cache (a tile at this URL never changes)
  -> PMTiles directory lookup
  -> one HTTP range request into the archive
  -> the vector tile
```

## Uçlar / Endpoints

| Yol / Path | Ne döner / What it returns |
|---|---|
| `/v1/<archive>/{z}/{x}/{y}.mvt` | Vektör karo; boş karo için `204` / a vector tile, `204` where the archive has none |
| `/v1/<archive>.json` | TileJSON 3.0 — sınırlar, zum aralığı, katmanlar ve **künye** / bounds, zoom range, layers and the **attribution** |
| `/` | Arşiv listesi ve künye / the archive list and the credit |

`<archive>` yalnızca `ARCHIVES` içinde tanımlı bir kimlik olabilir; başka her şey `404`'tür. Worker
hiçbir şey yazmaz, hiçbir veritabanına bakmaz ve **hiçbir sırrı yoktur**.

## Arşiv / The archive

| | |
|---|---|
| Kimlik / Id | `region-20260917` |
| Alan / Area | 13°E–74°E, 22°N–48°N (panelin görüş alanı / the panel's view) |
| Zum / Zoom | 0–11 (üstü ölçeklenir / deeper zooms are scaled) |
| Boyut / Size | ~709 MB |
| Kaynak / Source | [Protomaps](https://protomaps.com) gezegen derlemesi, OSM 2026-09-17 / planet build |
| Lisans / Licence | OpenStreetMap türevi çalışma — © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright) |

Arşiv bu deponun [`basemap-20260917`](https://github.com/Greater-Turkiye/platform/releases/tag/basemap-20260917)
sürüm varlığında durur. Nasıl üretildiği: [`tools/geo/build_basemap.md`](../../tools/geo/build_basemap.md).

**R2.** Hesapta R2 açık değildir (Cloudflare panelinden açılması ve karta bağlanması gerekir), bu
yüzden arşiv bugün bir sürüm varlığındadır: ücretsizdir, HTTP Range destekler ve dosya başına 2 GB'a
kadar çıkar. R2 açıldığında değişiklik iki satırdır — `TILES` adında bir bucket bağlaması ve
`ARCHIVES` içinde `r2:<anahtar>` — istemci URL'leri aynı kalır.

R2 is not enabled on the account (that needs the Cloudflare dashboard and a card), so the archive
lives in a release asset today: free, range-capable, up to 2 GB per file. Moving it is a bucket
binding named `TILES` plus an `r2:<key>` origin in `ARCHIVES`; no client URL changes.

## Yapılandırma / Configuration

`wrangler.jsonc` → `vars`:

| Değişken / Variable | Ne işe yarar / What it does |
|---|---|
| `ARCHIVES` | `{"<kimlik>": "<https url veya / or r2:<anahtar>>"}` — sunulabilecek arşivlerin tamamı / the whole list of archives that can be served |
| `TILE_MAX_AGE` | Karo `Cache-Control` süresi, saniye (varsayılan 604800) / tile cache lifetime in seconds |
| `CACHE_VERSION` | Önbellek anahtarının parçası; yanlış bir partiden dönmek için artırılır / part of the cache key, bumped to walk away from a bad batch |

## Çalıştırma / Running it

```bash
npm install
npx wrangler dev            # http://127.0.0.1:8787/v1/region-20260917/8/148/95.mvt
npx wrangler deploy
```

Dağıtım bir sır istemez. Yayındaki adres / the deployed endpoint:
`https://gt-tiles.brasilquart.workers.dev`.

## Sınırlar / Limits

- **Workers ücretsiz katmanı / free plan:** günde 100k istek. Bir karo bir istektir; kenar önbelleği
  tekrarları bir hafta boyunca karşılar, yani dönen ziyaretçi neredeyse hiçbir şeye mal olmaz.
- **Soğuk istek ~1 s, sıcak ~0,3 s.** İlk istek arşivin dizinini de okur; aynı isolate'teki sonraki
  karolar tek bir aralık isteğiyle gelir.
- **Zum 11'de biter.** Daha derin zumlarda aynı karolar ölçeklenir: etiketler keskin kalır, yeni
  ayrıntı gelmez.
- **Kutunun dışı boştur.** Panel oraya kaydıramaz (`translateExtent`), altlık da orada hiçbir şey
  çizmez.

## Kırmızı çizgiler / Red lines

Altlık yalnızca coğrafyayı taşır. Sınır katmanları ve ülke/bölge adları stilden **harita
kurulmadan önce** atılır ([ADR 0013](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0013-map-layers-turkiye-perspective.md));
ekranda görünen her sınır, ülke adı ve deniz adı bizim verimizden D3 ile çizilir. Bu Worker karoyu
olduğu gibi sunar, süzmeye çalışmaz: süzme işi stilde ve gözle görülebilir yerdedir
([`apps/web/assets/js/basemap.js`](../web/assets/js/basemap.js)).

The basemap carries geography only. Boundary layers and country/region names are dropped from the
style **before** the map is created; every border, country name and sea name on screen is drawn by
D3 from our own data. This Worker serves the tile as it is — the filtering lives in the style,
where it can be read.
