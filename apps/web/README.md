# apps/web

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: Aşama 5, henüz başlanmadı. / Status: Phase 5, not started.

## Türkçe

`web`, `datasets` sürümlerinden (`python tools/gt.py build` çıktısı) üretilen statik bir sitedir; Cloudflare Workers statik varlıkları veya Pages üzerinde yayımlanır. Kayıt sayfaları, arama, haritalar ve akış bağlantıları sunar. Site çerez ve üçüncü taraf izleyici kullanmaz. Aynı Worker'da, `/admin` altında, Cloudflare Access (ücretsiz, 50 kullanıcıya kadar) arkasında yöneticiler için bir arayüz bulunur: inceleme kuyruğu görünümü, kota defteri, toplayıcı durumu, acil durdurma durumu.

## English

`web` is a static site built from `datasets` releases (the output of `python tools/gt.py build`) and served from Cloudflare Workers static assets or Pages. It offers record pages, search, maps and feed links. The site uses no cookies and no third-party trackers. The same Worker hosts a maintainer interface under `/admin`, behind Cloudflare Access (free for up to 50 users): review queue view, usage ledger, collector status, kill switch status.

---

## Teknik başvuru / Technical reference

### Planlanan sayfalar / Planned pages

| Yol / Path | İçerik / Content |
|---|---|
| `/`, `/en/` | Son kayıtlar, bölgelere göre / latest records by region |
| `/kayit/<id>`, `/en/record/<id>` | Kayıt sayfası, kaynaklar ve arşiv bağlantıları / record page with sources and archive links |
| `/harita`, `/en/map` | Harita (açık lisanslı altlık) / map (openly licensed basemap) |
| `/veri`, `/en/data` | İndirmeler, sürümler, DOI / downloads, releases, DOI |
| `/admin/*` | Yönetim arayüzü (Access) / admin UI (Access) |

### Bağlamalar / Bindings

`ASSETS` (statik varlıklar / static assets) · D1 `OPS_DB` (yalnızca `/admin`, çoğunlukla okuma / `/admin` only, read-mostly) · KV `CONFIG`

### Yapılandırma ve sırlar (yalnızca adlar) / Config and secrets (names only)

- `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` — `/admin` isteklerinde `Cf-Access-Jwt-Assertion` JWT'si doğrulanır. / The `Cf-Access-Jwt-Assertion` JWT is verified on `/admin` requests.
- Herkese açık site için sır yoktur. / The public site has no secrets.
