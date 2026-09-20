# `apps/site` — `gt-site`

Statik siteyi Cloudflare'in kenarından sunan Worker. GitHub Pages'ten **kaçış değil**, kontrol
ettiğimiz kopya: kendi başlıklarımız, kendi önbellek sürelerimiz ve veri dışa aktarımının sayfayla
**aynı kökende** olması.

The Worker that serves the static site from Cloudflare's edge. Not a move away from GitHub Pages —
the copy we control: our own headers, our own cache lifetimes, and the dataset export on the **same
origin** as the page that reads it.

```
GET /                 -> apps/web, depodaki hâliyle / as it is in the repository (ASSETS binding)
GET /datasets/<dosya> -> veri dışa aktarımı, kenar önbelleğiyle / the dataset export, edge-cached
```

Yayındaki adres / deployed: `https://gt-site.brasilquart.workers.dev`

## Neden / Why

| | GitHub Pages | `gt-site` |
|---|---|---|
| Başlıklar / Headers | Sabit; CSP, referrer ve önbellek süresi bizde değil | Bizde: CSP, `referrer-policy`, `nosniff`, dosya türüne göre `cache-control` |
| Veri kökeni / Data origin | Panel `../datasets/`'i **başka bir kökenden** ister | Aynı köken: `/datasets/…` Worker tarafından çekilir ve kenarda önbelleklenir |
| Karolarla aynı hesap / Same account as the tiles | Hayır | Evet — harita, veri ve sayfa tek sistem |
| Maliyet / Cost | Ücretsiz | Ücretsiz (statik varlık istekleri Workers kotasına sayılmaz) |

Kanonik adres, bir alan adı buraya yönlendirilene kadar **GitHub Pages'te kalır**; ikisi de aynı
commit'ten aynı dosyaları sunar. Bu yüzden bu Worker bir geçiş değil, bir seçenektir: Pages düşerse
ya da bir başlık gerekirse hazırdır.

The canonical address stays on GitHub Pages until a domain is pointed here; both serve the same
files from the same commit.

## Güvenlik / Security

- **Sırrı yok, yazmıyor, veritabanı okumuyor.** Yol dışında girdi almaz.
- **Veri vekili beyaz listeyle çalışır:** yalnızca `DATA_FILES` içindeki dosya adları geçer
  (`manifest.json`, `*.jsonl`, `events.csv`, `events.geojson`, `feed.xml|json|md`, `vocab.json`).
  Ziyaretçinin verdiği hiçbir URL getirilmez; `/datasets/../…` denemesi 404'tür.
- **CSP** sayfanın yalnızca bu projenin gönderdiklerini yüklemesine izin verir: `script-src 'self'`,
  `connect-src` yalnızca kendi kökeni + `gt-tiles` + veri kökeni, `frame-ancestors 'none'`.

## Yapılandırma / Configuration

`wrangler.jsonc` → `vars`:

| Değişken / Variable | Ne işe yarar / What it does |
|---|---|
| `DATA_ORIGIN` | Veri dışa aktarımının yayımlandığı yer; taşınırsa tek satır değişir / where the dataset export is published |
| `DATA_MAX_AGE` | Veri yanıtlarının `cache-control` süresi, saniye (varsayılan 300) |

Önbellek süreleri (`src/index.js` → `cacheFor`): `assets/vendor` ve `assets/fonts` bir hafta,
diğer `assets/*` bir saat, sayfalar beş dakika — çünkü okuyucu bir değişikliği görmek için sayfayı
yeniler, yazı tipini değil.

## Çalıştırma / Running it

```bash
npm install
npx wrangler dev     # http://127.0.0.1:8787
npx wrangler deploy
```

Dağıtım sır istemez. `apps/web` neyse o yayımlanır: ayrı bir derleme adımı yoktur.

## Sınırlar / Limits

- Statik varlık istekleri Cloudflare tarafından karşılanır ve Workers ücretsiz katman sayacına
  girmez; Worker yalnızca başlık eklemek ve veri vekili için çalışır (`run_worker_first`).
- Veri vekili her dosya için kenar başına bir kez üst kaynağa gider; sonrası önbellektir.
- Alan adı bağlanana kadar adres `*.workers.dev`'dir ve bu adres **kanonik değildir**: paylaşılacak
  bağlantı GitHub Pages adresidir.
