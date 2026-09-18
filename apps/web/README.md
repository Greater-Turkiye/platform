# apps/web

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: ilk sürüm yayında — ana sayfa + OSINT paneli + yöntem sayfası. / Status: first release is live — home page, OSINT dashboard and methodology page.
> https://greater-turkiye.github.io/platform/

## Türkçe

Derleme adımı olmayan statik site: düz HTML, CSS ve JavaScript (D3 + TopoJSON). Veriyi `datasets` deposunun GitHub Pages export'undan (`python tools/gt.py build` çıktısı) okur; iki site aynı kökte yayınlandığı için (`greater-turkiye.github.io`) CORS gerekmez. Çerez, analitik veya üçüncü taraf isteği yoktur: fontlar, kütüphaneler ve harita verisi depodadır.

- `index.html` — ana sayfa: Türkiye merkezli küre haritası, kayıt akışı, izleme bölgeleri, yöntem, canlı sayılar, kırmızı çizgiler, katılım.
- `panel.html` — OSINT paneli: yakınlaştırılabilir harita, bölge/tür/durum filtreleri, arama, katmanlar, kayıt listesi ve ayrıntı çekmecesi. Derin bağlantı: `panel.html?region=aegean`, `panel.html?id=evt_…`.
- `method.html` — yöntem sayfası: projenin ne iddia edip etmediği, bir kaydın oluşma akışı (öneri → triyaj → kaynak ve arşiv → doğrulama ölçeği → insan onayı), durum değerlerinin anlamı, sade dille kırmızı çizgiler, harita katmanlarının kaynakları ve "şematik" etiketi, lisans ve düzeltme yolları. Her bölüm El Kitabı'ndaki kaynağına bağlanır; el kitabı bağlantıları seçilen dile göre `tr/` veya `en/` sürümüne gider.
- Örnek (kurgusal) kayıtlar yalnızca panelde, "Örnek veriler" katmanı açıkken ve açıkça etiketlenmiş olarak gösterilir; gerçek kayıt yokken bu katman varsayılan olarak açıktır.

## English

A static site with no build step: plain HTML, CSS and JavaScript (D3 + TopoJSON). It reads data from the GitHub Pages export of the `datasets` repository (the output of `python tools/gt.py build`). Both sites are served from the `greater-turkiye.github.io` origin, so CORS is not needed. There are no cookies, analytics or third-party requests: fonts, libraries and map data are all vendored in the repository.

- `index.html` — home page: Türkiye-centred globe, live record feed, watch regions, method, live counts, red lines and how to join.
- `panel.html` — OSINT dashboard: zoomable map, region/type/status filters, search, layers, record list and detail drawer. Deep links: `panel.html?region=aegean`, `panel.html?id=evt_…`.
- `method.html` — the methodology page: what the project does and does not claim to be, how a record is made (proposal → triage → sources and archive → verification scale → human approval), what the status values mean, the red lines in plain language, where the map layers come from and what "schematic" means, licensing, and how to report an error. Each section links to its handbook source, and handbook links follow the chosen language (`tr/` or `en/`).
- Fictional example records appear only in the dashboard, only when the "Example data" layer is on, and are always clearly labelled. The layer is on by default while there are no real records.

---

## Teknik başvuru / Technical reference

### Yerelde çalıştırma / Run locally

```bash
# datasets export → ../datasets/ olarak servis edilmeli / must be served as ../datasets/
mkdir -p /tmp/gt-site
cp -r apps/web /tmp/gt-site/platform
(cd ../datasets && python tools/gt.py build && cp -r dist /tmp/gt-site/datasets)
python -m http.server 8000 -d /tmp/gt-site
# http://localhost:8000/platform/
```

Farklı bir veri kökü için sayfada `window.GT_DATA_BASE = 'https://…/'` tanımlanabilir. / Set `window.GT_DATA_BASE` on the page to use a different data root.

### Dosyalar / Files

| Yol / Path | İçerik / Content |
|---|---|
| `assets/css/site.css` | Tasarım belirteçleri ve tüm stiller / design tokens and all styles |
| `assets/js/gt.js` | Ortak: i18n (TR/EN), veri yükleme, coğrafya, harita yardımcıları / shared helpers |
| `assets/js/home.js`, `assets/js/panel.js`, `assets/js/method.js` | Sayfa mantığı / page logic |
| `assets/js/basemap.js` | Vektör altlık prototipi; yalnızca `?basemap=…` ile yüklenir / the vector basemap prototype, loaded only with `?basemap=…` |
| `assets/vendor/`, `assets/fonts/`, `assets/data/` | Barındırılan üçüncü taraf varlıklar — [LICENSES.md](assets/LICENSES.md) |

### Harita katmanları / Map layers

| Katman / Layer | Kaynak / Source | Not / Note |
|---|---|---|
| Ülkeler / Countries | `assets/data/countries-50m.json`, `countries-110m.json` (Natural Earth, kamu malı) | Küre dönerken 110m, Türkiye odağında 50m / 110m while the globe rotates, 50m once it settles on Türkiye |
| Türkiye'nin tutumuna göre sınırlar / Borders per Türkiye's position | `assets/data/disputed-tur-view.geojson` + `gt.js` (`NAMELESS`) | Kırım→Ukrayna, Golan→Suriye, Somaliland→Somali |
| Anlaşmalar / Agreements | `GT.AGREEMENTS`, `GT.PARTNERS` in `assets/js/gt.js` | Her giriş kaynaklı; yalnızca imzalı anlaşmalar / sourced, signed agreements only. Katmanlar / tiers: `ally`, `coop`, `frame` (çerçeve / savunma sanayii, çoğu TBMM onayında / framework or defence-industry, many pending TBMM approval), `kin` |
| NATO | `GT.NATO` in `assets/js/gt.js` | Açık mavi kontur, ikili katman yoksa açık mavi dolgu; md. 5 / light-blue outline, light-blue tint where no bilateral tier; Art. 5 |
| Resmî TSK varlığı / Official Turkish military presence | `GT.PRESENCE_SOURCES` | Yalnızca ülke düzeyi — kırmızı çizgi / country level only — red line |
| Mavi Vatan | `assets/data/maritime-tur.geojson` — [MARITIME-SOURCES.md](assets/data/MARITIME-SOURCES.md) | `agreed` / `claimed` (Türkiye'nin tutumu) / `schematic` / `licence` (KKTC ruhsat sahaları A–G, `kind: "kktc-licence"`; birleşik alanın parçası; yalnızca panelde üzerine gelince çizilir / part of the merged area; outlined only on hover in the panel). Başka bir özelliğin `components` listesindeki şematik alanlar ayrıca çizilmez / schematic areas listed in another feature's `components` are not drawn separately |
| Harekât bölgeleri / Operation areas | `assets/data/tur-operation-areas.geojson` — [OPERATION-AREAS-SOURCES.md](assets/data/OPERATION-AREAS-SOURCES.md) | Yalnızca resmî ilan edilen bölgenin tamamı; yeşil, sona erenler kesikli; üs/birlik/hareket yok ([ADR 0015](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0015-announced-operation-areas.md)) / whole officially announced areas only; green, dashed once ended; no bases, units or movements |
| Adalar / Islands | `assets/data/islands-tur.geojson` | Kardak: Türkiye'nin tutumu / Türkiye's position |
| Dış temsilcilikler / Missions | `assets/data/missions-tur.geojson` — [MISSIONS-SOURCES.md](assets/data/MISSIONS-SOURCES.md) | Şehir düzeyi; dokunulmaz ama Türk toprağı değil / city level; inviolable, but not Turkish territory |
| Olaylar / Events | `../datasets/*.jsonl` | Koordinatsız olaylar bölge halkası / events without coordinates are drawn as a ring on their region |

Kurallar / Rules: [handbook ADR 0013](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0013-map-layers-turkiye-perspective.md).

### Vektör altlık — prototip / Vector basemap — prototype

> Durum: **prototip**, varsayılan kapalı. Bir karar verilmedi; ADR yazılmadan varsayılan olmaz. / Status: **prototype**, off by default. Nothing is decided; it does not become the default without an ADR.

Panel bugün ülke geometrisini D3 ile çizer: ülke ölçeğinde doğru, ama şehir, yol ve arazi gösteremez. `panel.html?basemap=…` haritanın altına MapLibre GL ile bir vektör altlık koyar. Parametre yoksa `basemap.js` hiç yüklenmez ve normal ziyaretçi için hiçbir şey değişmez — MapLibre de, altlık isteği de yoktur.

The dashboard draws country geometry with D3: right at country scale, but it cannot show cities, roads or terrain. `panel.html?basemap=…` puts a MapLibre GL vector basemap underneath the map. Without the parameter `basemap.js` is never loaded and nothing changes for a normal visitor — no MapLibre, no tile request.

| Parametre / Parameter | Altlık / Basemap | Anahtar / Key | Not / Note |
|---|---|---|---|
| `?basemap=1` | [OpenFreeMap](https://openfreemap.org) `dark` stili / style | yok / none | Anahtarsız, kotasız; tek kişinin bağışla işlettiği sunucular, SLA yok / no key, no quota; one person's donation-funded servers, no SLA |
| `?basemap=pmtiles&pmtiles=<url>` | Kendi barındırdığımız bir [Protomaps](https://protomaps.com) `.pmtiles` dosyası / a `.pmtiles` file we host | yok / none | Üçüncü taraf çalışma zamanı bağımlılığı yok; dosya HTTP Range isteklerini destekleyen bir yerde durmalı / no third-party runtime dependency; the file must sit somewhere that serves HTTP Range requests |

`.pmtiles` bölgesel kesiti üretmek / to cut a regional extract ([go-pmtiles](https://github.com/protomaps/go-pmtiles)):

```bash
# panelin görüş alanı, z0–8 ≈ 55 MB (z10 ≈ 349 MB, z12 ≈ 1,6 GB)
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles gt.pmtiles --bbox=13,22,74,48 --maxzoom=8
```

**Sınırlar ve tutumlar / Boundaries and positions.** Üçüncü taraf altlığın sınır ve ülke adı katmanları harita kurulmadan **önce** stilden atılır (`basemap.js` → `sanitise`): `boundary` kaynak katmanının tamamı ve `place` katmanının şehir/kasaba/köy dışındaki her etiketi. Ekranda görünen her sınır, ülke adı ve deniz adı bizim veri kaynağımızdan D3 ile çizilir; ülke renkleri altlığın okunabilmesi için yarı saydam bir tona iner. Yerleşim adları kalır (bir şehir adı egemenlik iddiası değildir) ve önce Türkçe (`name:tr`), sonra arayüz dili, sonra Latin harfli ad sorulur; başka bir alfabedeki tek adı olan yer etiketsiz kalır. Bu, ADR 0013'ün gereğidir: altlığın "İsrail" yazısı Filistin'in üzerine ya da adalarımızın Yunanca adları haritaya giremez.

The basemap's boundary and country-label layers are dropped from the style **before** the map is created (`basemap.js` → `sanitise`): the whole `boundary` source layer, and every `place` label that is not a city, town or village. Every border, country name and sea name on screen is still drawn by D3 from our own data; the country colours drop to a translucent tint so the basemap can be read through them. Settlement labels are kept (a city name is not a sovereignty claim) and are asked for in Turkish first (`name:tr`), then the interface language, then a Latin-script name; a place whose only name is in another script gets no label. That is what ADR 0013 requires: the basemap's own "Israel" over Palestine, or Greek names for our islands, cannot reach the map.

Ölçülen değerler ve seçeneklerin karşılaştırması: bu prototipi açan pull request. / Measurements and the comparison of the options: the pull request that opened this prototype.

### İnceleme / Review

`?globe-t=<saniye>` ana sayfa animasyonunu belirli bir anda başlatır (0–9 odak, ~12–32 dünya turu, ~32–36 yaklaşma). / starts the home page animation at a given second.

`?basemap=1` · `?basemap=pmtiles&pmtiles=<url>` vektör altlık prototipini açar (yukarıya bakın). / turn the vector basemap prototype on (see above).

### Yayın / Deploy

`.github/workflows/pages.yml` — `main`'e `apps/web/**` değişikliği gelince GitHub Pages'e yayınlar. / Deploys to GitHub Pages whenever `apps/web/**` changes on `main`.

### Sonraki adımlar / Next

- Kayıt başına statik sayfalar (SEO, paylaşım önizlemesi) / per-record static pages (SEO, share previews)
- Zaman çizelgesi ve yoğunluk görünümü / timeline and density views
- Cloudflare Access arkasında `/admin` (bkz. ARCHITECTURE.md) / `/admin` behind Cloudflare Access
