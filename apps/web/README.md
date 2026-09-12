# apps/web

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: ilk sürüm yayında — ana sayfa + OSINT paneli. / Status: first version live — home page + OSINT panel.
> https://greater-turkiye.github.io/platform/

## Türkçe

Derleme adımı olmayan statik site: düz HTML, CSS ve JavaScript (D3 + TopoJSON). Veriyi `datasets` deposunun GitHub Pages export'undan (`python tools/gt.py build` çıktısı) okur; iki site aynı kökte yayınlandığı için (`greater-turkiye.github.io`) CORS gerekmez. Çerez, analitik veya üçüncü taraf isteği yoktur: fontlar, kütüphaneler ve harita verisi depodadır.

- `index.html` — ana sayfa: Türkiye merkezli küre haritası, kayıt akışı, izleme bölgeleri, yöntem, canlı sayılar, kırmızı çizgiler, katılım.
- `panel.html` — OSINT paneli: yakınlaştırılabilir harita, bölge/tür/durum filtreleri, arama, katmanlar, kayıt listesi ve ayrıntı çekmecesi. Derin bağlantı: `panel.html?region=aegean`, `panel.html?id=evt_…`.
- Örnek (kurgusal) kayıtlar yalnızca panelde, "Örnek veriler" katmanı açıkken ve açıkça etiketlenmiş olarak gösterilir; gerçek kayıt yokken bu katman varsayılan olarak açıktır.

## English

A static site with no build step: plain HTML, CSS and JavaScript (D3 + TopoJSON). It reads data from the `datasets` GitHub Pages export (the output of `python tools/gt.py build`); both sites share the `greater-turkiye.github.io` origin, so no CORS is needed. No cookies, analytics or third-party requests: fonts, libraries and map data are vendored.

- `index.html` — home: Türkiye-centred globe, record ticker, watch regions, method, live counts, red lines, how to join.
- `panel.html` — OSINT panel: zoomable map, region/type/status filters, search, layers, record feed and detail drawer. Deep links: `panel.html?region=aegean`, `panel.html?id=evt_…`.
- Fictional example records appear only in the panel, only with the "Example data" layer on, and clearly tagged; the layer defaults to on while there are no real records.

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

Farklı bir veri kökü için sayfada `window.GT_DATA_BASE = 'https://…/'` tanımlanabilir. / Set `window.GT_DATA_BASE` to point at another data root.

### Dosyalar / Files

| Yol / Path | İçerik / Content |
|---|---|
| `assets/css/site.css` | Tasarım belirteçleri ve tüm stiller / design tokens and all styles |
| `assets/js/gt.js` | Ortak: i18n (TR/EN), veri yükleme, coğrafya, harita yardımcıları / shared helpers |
| `assets/js/home.js`, `assets/js/panel.js` | Sayfa mantığı / page logic |
| `assets/vendor/`, `assets/fonts/`, `assets/data/` | Barındırılan üçüncü taraf varlıklar — [LICENSES.md](assets/LICENSES.md) |

### Yayın / Deploy

`.github/workflows/pages.yml` — `main`'e `apps/web/**` değişikliği gelince GitHub Pages'e yayınlar. / Deploys to GitHub Pages on changes under `apps/web/**`.

### Sonraki adımlar / Next

- Kayıt başına statik sayfalar (SEO, paylaşım önizlemesi) / per-record static pages (SEO, share previews)
- Zaman çizelgesi ve yoğunluk görünümü / timeline and density views
- Cloudflare Access arkasında `/admin` (bkz. ARCHITECTURE.md) / `/admin` behind Cloudflare Access
