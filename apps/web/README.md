# apps/web

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: ilk sürüm yayında — ana sayfa, OSINT paneli, yöntem sayfası ve Ege sicili. / Status: first release is live — home page, OSINT dashboard, methodology page and the Aegean register.
> https://greater-turkiye.github.io/platform/

## Türkçe

Derleme adımı olmayan statik site: düz HTML, CSS ve JavaScript (D3 + TopoJSON). Veriyi `datasets` deposunun GitHub Pages export'undan (`python tools/gt.py build` çıktısı) okur; iki site aynı kökte yayınlandığı için (`greater-turkiye.github.io`) CORS gerekmez. Çerez, analitik veya üçüncü taraf isteği yoktur: fontlar, kütüphaneler ve harita verisi depodadır.

- `index.html` — ana sayfa: Türkiye merkezli küre haritası, kayıt akışı, izleme bölgeleri, yöntem, canlı sayılar, kırmızı çizgiler, katılım.
- `panel.html` — OSINT paneli. Kenar çubuğu **önce bilgi, sonra kontrol** sırasındadır: üstte dönem çipleri, **dört rakam** (dönemdeki kayıt, doğrulanmış/toplam, öne çıkan bölge, son kayıt — sayfa kaydırılırken yerinde kalır) ve verinin kendi künyesi (`manifest.json`'dan derleme zamanı ve sayılar), altında **bölge durumu tablosu** (her izleme bölgesi için dönemdeki kayıt sayısı, ilan edilen faaliyet payı ve en yeni kaydın tarihi; satır tıklanınca o bölgeye süzer ve haritayı oraya götürür; kayda ya da faaliyete göre sıralanır), sonra katlanmış **süzgeç ve katmanlar** (kaç süzgeç açık olduğu rozette yazar), en altta kayıt listesi. Listede tek bir yayıncıya dayanan kayıt **tek kaynak** rozetiyle işaretlenir: bir kaynak rapordur, iki kaynak bulgudur. Ayrıca açılır **harita anahtarı** (kapalı katmanın satırı gösterilmez) ve **brifing çıktısı** (`Brifing` düğmesi: başlık + süzgeç + zaman damgası, harita, dört rakam, bölge tablosu ve liste). Derin bağlantı: `panel.html?region=aegean`, `panel.html?period=30`, `panel.html?id=evt_…`. / The OSINT dashboard, ordered **information first, controls second**: period chips and four figures at the top (sticky while the sidebar scrolls), a **region board** below them — records in the period, a share of the announced activity and the newest record's date for every watch region, each row a filter — then the filters and layers folded away with a badge saying how many are in force, and the record list last.
- `method.html` — yöntem sayfası: projenin ne iddia edip etmediği, bir kaydın oluşma akışı (öneri → triyaj → kaynak ve arşiv → doğrulama ölçeği → insan onayı), durum değerlerinin anlamı, sade dille kırmızı çizgiler, harita katmanlarının kaynakları ve "şematik" etiketi, lisans ve düzeltme yolları. Her bölüm El Kitabı'ndaki kaynağına bağlanır; el kitabı bağlantıları seçilen dile göre `tr/` veya `en/` sürümüne gider.
- `sicil.html` — Ege sicili: Lozan 1923 ve Paris 1947 ile askerden arındırılmış adalarda belgelenen askerî varlık, kayıt kayıt. Veriyi `site.jsonl`'den okur ve `ege-silahsizlandirilmis-statu` etiketli kayıtları kart olarak gösterir; **harita ve koordinat yoktur** — koordinat, birincil kaynağıyla doğrulanmadan hiçbir kayda yazılmaz ([ADR 0019](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0019-foreign-installations-register.md)). / The Aegean register: what is documented on the islands demilitarised by the 1923 and 1947 treaties, record by record, read from `site.jsonl`. **No map and no coordinates**, by decision.
- `ticaret.html` — **İsrail ticareti**: Türkiye'nin 2024'te ilan ettiği ticaret durdurma kararı ile iki devletin kendi aylık beyanlarının karşılaştırması (`assets/data/trade-il.json`). İki çizgi, aralarındaki fark, **fasıl bazında hangi malların gitmeye devam ettiği** ve Türkiye'nin komşu satırlarının yasak öncesi/sonrası 12 aylık ortalamaları. Sayfa ayrıca, yaptırım listelerinden **gemi kimliği ve kayıtlı önceki bayrak** bölümü taşır. Hiçbir gemi izlenmez ([ADR 0022](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0022-trade-compliance-not-vessel-tracking.md)). / **Trade with Israel**: Türkiye's declared halt against both states' own monthly returns; two lines, the gap between them, and the neighbours' lines before and after. No vessel is tracked. Ürünler tablosunda en çok taşıyan dört fasıl (72, 73, 68, 25) tıklanınca dört haneye açılır / the four chapters that carry the most open to four digits.
- `deniz.html` — **Deniz paneli**: denize ayrılmış, **açık temalı ayrı bir pano**. Solda durum (ilan edilen askerî faaliyet, sicildeki tesis, kayıtlı bayrak değişikliği, durdurulan ticaretin denizyolu payı), **denizler tablosu** (satıra basmak haritayı o denize götürür), katmanlar ve sicil kayıtları listesi; ortada harita; sağda kayıt çekmecesi (koordinat, hata payı, yöntem, açıklama, arşivli kaynaklar). Katmanlar: deniz yetki alanları, Boğazlar, KKTC ruhsat sahaları, ilan edilen faaliyet ızgarası, Türk adaları ve Ege sicili — her nokta kendi hata payı dairesiyle. D3 ile çizilir, karo/MapLibre kullanmaz. Derin bağlantı: `deniz.html?sea=aegean`, `deniz.html?id=sit_…`. **Hiçbir geminin konumu yoktur** ([ADR 0022](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0022-trade-compliance-not-vessel-tracking.md)). / **The sea dashboard**: a separate, light console for the sea — situation figures, a sea board that takes the map where you press, layer switches, the register list, and a drawer that opens a record down to its uncertainty and its archived sources. Drawn with D3, no tiles, and no vessel positions.
- `hava.html` — Hava paneli. Türkiye çevresindeki **uçuş bilgi bölgeleri** (FIR) ve her deniz kutusunun hava sahasının hangi FIR'lara düştüğü; bir FIR'a ya da bir denize basmak haritayı oraya götürür. Sınırlar **şematiktir**, resmî havacılık kaynağı değildir, seyrüsefer için kullanılamaz; uyarı kenar çubuğundadır. Hiçbir uçağın konumu yoktur. Derin bağlantı: `hava.html?fir=LGGG`, `hava.html?sea=aegean`. / The air dashboard: flight information regions and how each sea's airspace is divided between them. Schematic, not an aeronautical source, not for navigation. No aircraft positions.
  Sayfa ayrıca `assets/data/msi-activity.json` varsa **ilan edilen deniz faaliyeti** grafiğini çizer (NGA seyir ihbarları arşivinden sayım; [MSI-ACTIVITY-SOURCES.md](assets/data/MSI-ACTIVITY-SOURCES.md)). Dosya yoksa bölüm gizli kalır. / The page also draws the **announced activity** chart when `assets/data/msi-activity.json` is present, and hides the section when it is not.
- Örnek (kurgusal) kayıtlar yalnızca panelde, "Örnek veriler" katmanı açıkken ve açıkça etiketlenmiş olarak gösterilir; gerçek kayıt yokken bu katman varsayılan olarak açıktır.

## English

A static site with no build step: plain HTML, CSS and JavaScript (D3 + TopoJSON). It reads data from the GitHub Pages export of the `datasets` repository (the output of `python tools/gt.py build`). Both sites are served from the `greater-turkiye.github.io` origin, so CORS is not needed. There are no cookies, analytics or third-party requests: fonts, libraries and map data are all vendored in the repository.

- `index.html` — home page: Türkiye-centred globe, live record feed, watch regions, method, live counts, red lines and how to join.
- `panel.html` — OSINT dashboard: situation figures, a region board, zoomable map, filters, search, layers, record list and detail drawer. Deep links: `panel.html?region=aegean`, `panel.html?id=evt_…`.
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
| `assets/js/gtmap.js` | Harita motoru, **tek kopya**: çerçeveleme, zoom (ağır haritalarda `live: true` ile ertelenmiş çizim), ters-ölçeklenen işaretler, hata payı dairesi ve **kara maskesi**. `panel.js` ve `deniz.js` bunu kullanır; yeni bir harita sayfası da bunu kullanır / the map engine, written once: framing, zoom with deferred rendering for heavy maps, marks that keep their size, the uncertainty circle and the land mask |
| `assets/js/home.js`, `assets/js/panel.js`, `assets/js/deniz.js`, `assets/js/ticaret.js`, `assets/js/method.js`, `assets/js/sicil.js` | Sayfa mantığı / page logic |
| `assets/js/basemap.js` | Vektör altlık (MapLibre); panelde varsayılan açık, `?basemap=0` ile kapanır / the vector basemap, on by default in the panel |
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
| Vektör altlık / Vector basemap | `gt-tiles` Worker'ı, `region-20260917` (OpenStreetMap, ODbL 1.0) — [LICENSES.md](assets/LICENSES.md) | Yalnızca coğrafya: sınır ve ülke adı katmanları stilden atılır ([ADR 0013](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0013-map-layers-turkiye-perspective.md), [ADR 0018](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0018-self-hosted-vector-basemap.md)) / geography only; boundary and country-name layers are dropped from the style |
| Belirsizlik dairesi / Uncertainty circle | Kaydın kendi `location.uncertainty_m` değeri — [ADR 0021](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0021-coordinates-with-provenance.md) | Tesis işaretinin altında, harita birimiyle çizilir: yakınlaştıkça gerçek boyutunu korur. 1,5 km'den küçük hata payı çizilmez (işaretin altında kalır). Ada düzeyinde bir kayıt böylece metre düzeyinde bir kayıt gibi görünmez / drawn under the site marker in map units, so it keeps its real size as the map zooms; anything under 1.5 km is not drawn |
| Bölge durumu tablosu / Region board | `assets/data/msi-regions.json` — [MSI-ACTIVITY-SOURCES.md](assets/data/MSI-ACTIVITY-SOURCES.md) (aynı ızgaradan bölge toplamları, ~1 KB) | Kenar çubuğunda, katman değil; kutular örtüştüğü için toplamları bölgelerin toplamı vermez, sayılan denizi olmayan bölge “—” gösterir / in the sidebar, not a map layer; the boxes overlap so the regions do not sum to the total, and a region with no counted sea reads “—” |
| İlan edilen faaliyet / Announced activity | `assets/data/msi-density.json` — [MSI-ACTIVITY-SOURCES.md](assets/data/MSI-ACTIVITY-SOURCES.md) (NGA seyir ihbarları, kamu malı) | Panelde kapalı gelir; 2015–2021 penceresi, 0,25° ızgara, yalnızca deniz, Türk ihbarları sayılmaz / off by default in the panel; a 2015–2021 window on a 0.25° grid, sea only, Turkish warnings not counted |
| İsrail ticareti / Trade with Israel | `assets/data/trade-il.json` — [TRADE-SOURCES.md](assets/data/TRADE-SOURCES.md) (UN Comtrade, iki raportör / two reporters) | Ayrı sayfada (`ticaret.html`), harita katmanı değil: aylık seri, taşıma türü kırılımı ve komşu satırları. Gemi konumu hiçbir biçimde yok / on its own page, not a map layer; no vessel positions, ever |
| Gemi kimliği / Vessel identity | `assets/data/vessels-summary.json` (sayfalar) · `vessels-sanctioned.json` (tam liste) — [TRADE-SOURCES.md](assets/data/TRADE-SOURCES.md) (OFAC SDN kamu malı + BM GK listesi) | `ticaret.html` içinde “Bayrak” bölümü; ad, IMO, bayrak ve **kayıtlı önceki bayrak**. Konum/rota/mürettebat alanı hiç tanımlanmamıştır / the “Flag” section of `ticaret.html`; identity and former flag only, with no field for a position |
| Şehirler / Cities | `assets/data/places-10m.geojson` — [PLACES-SOURCES.md](assets/data/PLACES-SOURCES.md) (Natural Earth 10m; Türkçe adlar bizim / the Turkish names are ours) | Yalnızca altlık kapalıyken; zuma göre kademeli / only when the basemap is off, in tiers as the map zooms |

Kurallar / Rules: [handbook ADR 0013](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0013-map-layers-turkiye-perspective.md).

### Vektör altlık / Vector basemap

> Durum: **canlı, varsayılan açık.** Karolar bizimdir: paneldeki bölgenin OpenStreetMap kesitini kendimiz üretir, kendi Worker'ımızdan sunarız ([ADR 0018](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0018-self-hosted-vector-basemap.md)). / Status: **live, on by default.** The tiles are ours: we cut the OpenStreetMap extract of the panel's region ourselves and serve it from our own Worker.

Panel ülke geometrisini D3 ile çizmeye devam eder — ama artık altında gerçek bir harita vardır: kıyı çizgisi, yollar, araziler ve yerleşim adları. Anlam taşıyan her katman (sınırlar, Mavi Vatan, harekât bölgeleri, işaretçiler) hâlâ bizim verimizden D3 ile üstte çizilir; altlık yalnızca coğrafyayı taşır.

The panel still draws country geometry with D3 — but now there is a real map underneath it: coastline, roads, land cover and settlement names. Everything that carries meaning (borders, Blue Homeland, operation areas, markers) is still drawn on top by D3 from our own data; the basemap only carries the geography.

| Parametre / Parameter | Altlık / Basemap | Not / Note |
|---|---|---|
| (yok / none) | **Kendi karolarımız / our own tiles** — `gt-tiles` Worker'ı, `region-20260917` arşivi (z0–11, OSM 2026-09-17) | Varsayılan. Anahtar yok, hesap yok, üçüncü taraf harita servisi yok / the default: no key, no account, no third-party map service |
| `?basemap=0` | Kapalı / off | Harita yalnızca depodaki 50m dosyadan çizilir; şehir adları `assets/data/places-10m.geojson`'dan gelir / drawn only from the 50m file in the repository; city names come from `places-10m.geojson` |
| `?basemap=ofm` | [OpenFreeMap](https://openfreemap.org) `dark` stili / style | Karşılaştırma için; anahtarsız ama bağışla işletilen üçüncü taraf sunucular, SLA yok / for comparison; no key, but third-party donation-funded servers, no SLA |
| `?tiles=<url>` | Aynı stil, başka bir karo uç noktası / the same style, another tile endpoint | Yerel `wrangler dev` veya yeni bir arşivi denemek için / for `wrangler dev` or trying a new archive |

**İlk açılışta altlık yüklenmez.** MapLibre ve karolar, harita gerçekten yakınlaştırıldığında (k ≥ 1,6) istenir; genel görünüm, altlık hiç yokmuş gibi ağırdadır — telefon boyutunda ölçülen değer iki durumda da 1.764 KB'dır. Tarayıcı `Save-Data` istiyorsa altlık hiç yüklenmez (`?basemap=gt` bunu geçersiz kılar). Karolar erişilemezse altlık düşürülür ve harita kendiliğinden D3 moduna döner; sayfa hata vermez.

**Nothing of the basemap loads on a first paint.** MapLibre and the tiles are requested when the map is actually zoomed (k ≥ 1.6), so the overview weighs what it did before — 1,764 KB at phone size either way. A browser asking for `Save-Data` gets no basemap (`?basemap=gt` overrides). If the tiles cannot be reached the basemap is dropped and the map falls back to D3 on its own; nothing breaks.

Ölçülen karo ağırlığı / measured tile weight (3×3 görünüm, brotli): z6 ≈ 370 KB, z8 ≈ 206 KB, z10 ≈ 21 KB.

Arşivin nasıl üretildiği, boyutları ve R2'ye taşıma: [`tools/geo/build_basemap.md`](../../tools/geo/build_basemap.md). Worker: [`apps/tiles`](../tiles/README.md). / How the archive is built, what it costs and how it moves to R2: `tools/geo/build_basemap.md`; the Worker: `apps/tiles`.

**Sınırlar ve tutumlar / Boundaries and positions.** Üçüncü taraf altlığın sınır ve ülke adı katmanları harita kurulmadan **önce** stilden atılır (`basemap.js` → `sanitise`): `boundary` kaynak katmanının tamamı ve `place` katmanının şehir/kasaba/köy dışındaki her etiketi. Ekranda görünen her sınır, ülke adı ve deniz adı bizim veri kaynağımızdan D3 ile çizilir; ülke renkleri altlığın okunabilmesi için yarı saydam bir tona iner. Yerleşim adları kalır (bir şehir adı egemenlik iddiası değildir) ve önce Türkçe (`name:tr`), sonra arayüz dili, sonra Latin harfli ad sorulur; başka bir alfabedeki tek adı olan yer etiketsiz kalır. Bu, ADR 0013'ün gereğidir: altlığın "İsrail" yazısı Filistin'in üzerine ya da adalarımızın Yunanca adları haritaya giremez.

The basemap's boundary and country-label layers are dropped from the style **before** the map is created (`basemap.js` → `sanitise`): the whole `boundary` source layer, and every `place` label that is not a city, town or village. Every border, country name and sea name on screen is still drawn by D3 from our own data; the country colours drop to a translucent tint so the basemap can be read through them. Settlement labels are kept (a city name is not a sovereignty claim) and are asked for in Turkish first (`name:tr`), then the interface language, then a Latin-script name; a place whose only name is in another script gets no label. That is what ADR 0013 requires: the basemap's own "Israel" over Palestine, or Greek names for our islands, cannot reach the map.

Ölçülen değerler ve seçeneklerin karşılaştırması: altlığı açan pull request'ler. / Measurements and the comparison of the options: the pull requests that brought the basemap in.

### İnceleme / Review

`?globe-t=<saniye>` ana sayfa animasyonunu belirli bir anda başlatır (0–9 odak, ~12–32 dünya turu, ~32–36 yaklaşma). / starts the home page animation at a given second.

`?period=7|30|90|365` listeyi son N güne daraltır. / narrows the list to the last N days.

`?basemap=0` altlığı kapatır, `?basemap=ofm` OpenFreeMap'e geçer, `?tiles=<url>` başka bir karo uç noktası kullanır (yukarıya bakın). / turn the basemap off, swap in OpenFreeMap, or point the style at another tile endpoint (see above).

### Yayın / Deploy

`.github/workflows/pages.yml` — `main`'e `apps/web/**` değişikliği gelince GitHub Pages'e yayınlar. / Deploys to GitHub Pages whenever `apps/web/**` changes on `main`.

### Sonraki adımlar / Next

- Kayıt başına statik sayfalar (SEO, paylaşım önizlemesi) / per-record static pages (SEO, share previews)
- Zaman çizelgesi ve yoğunluk görünümü / timeline and density views
- Cloudflare Access arkasında `/admin` (bkz. ARCHITECTURE.md) / `/admin` behind Cloudflare Access
