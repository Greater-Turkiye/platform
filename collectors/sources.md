# Resmî RSS/Atom kaynakları / Official RSS/Atom sources

[Türkçe](#türkçe) · [English](#english) · [Doğrulanan akışlar / Confirmed feeds](#doğrulanan-akışlar--confirmed-feeds) · [Bulunamayanlar / Not found](#akış-bulunamayanlar--no-feed-confirmed)

Issue #2 · Kontrol tarihi / Checked on: **2026-09-13**

## Türkçe

Bölge devletlerinin savunma bakanlığı, genelkurmay ve dışişleri siteleri ile birkaç resmî yayın organı tarandı. Bir akış yalnızca **gerçekten indirilip RSS veya Atom olarak ayrıştırıldıysa** "doğrulandı" sayıldı. Akışlar `config/feeds.yaml` dosyasındadır. Hepsi `enabled: false` durumundadır: Bir akışın açılması için bir bakımcının kullanım koşullarını onaylaması ve kaynağın `datasets` kaynak sicilinde (`datasets` issue #4) `source_id` almış olması gerekir.

Yöntem ve sınırlar:

- Her URL toplayıcının tanımlayıcı `User-Agent`'ı ile çekildi. Tanı amacıyla bir tarayıcı `User-Agent`'ı ile de denendi. Toplayıcılar **asla** tarayıcı taklidi yapmaz; yalnızca tarayıcıya yanıt veren siteler kapalı kalır.
- Tüm denemeler tek bir ağ konumundan yapıldı. 403 ve zaman aşımı hataları IP'ye veya coğrafyaya bağlı olabilir; GitHub Actions çalıştırıcılarından sonuç farklı çıkabilir.
- Sıklık, tek bir çekimdeki öğe tarihlerinden kabaca hesaplandı.

## English

We surveyed the defence-ministry, general-staff and foreign-ministry sites of regional states, plus a few official outlets. A feed counts as **confirmed** only if we actually fetched it and it parsed as RSS or Atom. Confirmed feeds are in `config/feeds.yaml`, all with `enabled: false`. A feed may be switched on only after a maintainer confirms its terms of use and the source has a `source_id` in the `datasets` source registry (datasets issue #4).

Method and limits:

- Each URL was fetched with the collector's descriptive `User-Agent`. For diagnosis only, we also tried a browser `User-Agent`. Collectors **never** spoof a browser, so sites that only answer browsers stay off.
- Everything was fetched from a single network location. Some 403s and timeouts may be IP or geo based and could look different from GitHub Actions runners.
- Frequency is a rough estimate from the item dates in one fetch.

---

## Doğrulanan akışlar / Confirmed feeds

| Ülke / Country | Yayıncı / Publisher | Akış / Feed | Biçim / Format | Dil / Lang | Gözlenen sıklık / Observed frequency | Notlar / Notes | Koşullar / Terms | `feeds.yaml` id |
|---|---|---|---|---|---|---|---|---|
| AZE | Savunma Bakanlığı / Ministry of Defence | `https://mod.gov.az/az/rss/` | RSS 2.0 | az | ~3/day (240 items span 25 Jun–12 Sep 2026) | `/en/rss/` and `/ru/rss/` return the same Azerbaijani feed. ~1.1 MB per fetch, no `ETag`/`Last-Modified`, so cadence ≥ 60 min. | No terms page found; footer: "© Ministry of Defense of Azerbaijan". Needs confirmation. | `rss-aze-mod` |
| RUS | Rusya Devlet Başkanlığı / President of Russia (Kremlin) | `http://en.kremlin.ru/events/president/news/feed` | Atom | en | ~5–9/day (20 entries) | HTTPS timed out from our location; only plain HTTP answered (no transport integrity, so treat as a lead). | Terms page `http://en.kremlin.ru/about/copyrights` returned 403 to us, so the licence is **not confirmed**. | `rss-rus-kremlin-news-en` |
| RUS | 〃 | `http://kremlin.ru/events/president/news/feed` | Atom | ru | ~5/day | Same as above. | Same as above. | `rss-rus-kremlin-news-ru` |
| RUS | 〃 (all publications) | `http://en.kremlin.ru/events/all/feed`, `http://kremlin.ru/events/all/feed` | Atom | en, ru | ~9/day | Superset of the news feeds (letters, greetings, speeches). Not added, to avoid duplicates. | Same as above. | — |
| LBN | Lübnan Ordusu / Lebanese Army | `https://www.lebarmy.gov.lb/en/rss.xml` | RSS 2.0 | en | ~2–3/day | Sends `Last-Modified`. **The TLS chain did not verify** with Python's default trust store; the collector never disables verification, so it fails until the site fixes its chain. | [Privacy and Security](https://www.lebarmy.gov.lb/en/content/privacy-and-security): site information "may be distributed or copied unless otherwise specified", credit requested. | `rss-lbn-army-en` |
| LBN | 〃 | `https://www.lebarmy.gov.lb/ar/rss.xml` (also `/rss.xml`) | RSS 2.0 | ar | ~8/day | Same TLS caveat. | Same as above. | `rss-lbn-army-ar` |
| SYR | SANA (resmî haber ajansı / state news agency, Ministry of Information) | `https://sana.sy/en/feed/` | RSS 2.0 | en | **Stale**: newest item 2026-07-28 | Not an MoD/MFA source; we found no Syrian MoD or MFA feed (see below). Sends `ETag`. | [Terms of use](https://sana.sy/en/terms-of-use/); "All rights reserved". | `rss-syr-sana-en` |
| SYR | 〃 | `https://sana.sy/tr/feed/` | RSS 2.0 | tr | **Stale**: newest item 2026-06-26 | The Arabic feed `https://sana.sy/feed/` is not well-formed XML (duplicate attribute). | Same as above. | — |
| CYP | Savunma Bakanlığı / Ministry of Defence | `https://www.gov.cy/mod/feed/` | RSS 2.0 (WordPress) | el | ~1–2/week | **403 to our descriptive User-Agent**, 200 to a browser. Off until the publisher allows it. | gov.cy footer: "© Κυπριακή Δημοκρατία". Needs confirmation. | `rss-cyp-mod` |
| CYP | Dışişleri Bakanlığı / Ministry of Foreign Affairs | `https://www.gov.cy/mfa/feed/` | RSS 2.0 | el | Low (10 items span Jan–Jul 2026) | Same User-Agent block. | Same as above. | `rss-cyp-mfa` |
| CYP | Basın ve Enformasyon Ofisi / Press and Information Office | `https://www.gov.cy/pio/feed/`, `https://www.gov.cy/pio/en/feed/` | RSS 2.0 | el, en | **Stale** since 2025-03-28 | Same User-Agent block. | Same as above. | — |
| ROU | Dışişleri Bakanlığı / Ministry of Foreign Affairs | `https://www.mae.ro/rss.xml` | RSS 2.0 | ro | ~2–3/day | **Resets the connection for our descriptive User-Agent**; answers only a browser. Sends `Last-Modified`. | Needs confirmation. | `rss-rou-mfa` |
| ROU | 〃 | `https://www.mae.ro/en/rss.xml` | RSS 2.0 | en | Low (10 items span Mar–Jul 2026) | Same User-Agent block. | Same as above. | — |

Kapsam dışı ama çalışıyor / Out of scope but working: the US Department of War news feed (`https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10`) answered normally. It is not a regional state, so it was not added.

## Akış bulunamayanlar / No feed confirmed

| Ülke / Country | Denenen / Tried | Sonuç / Result |
|---|---|---|
| GRC | geetha.mil.gr (GEETHA, `datasets` `src_01m2bez3wwemyrvmxnmrsrwczp`), mod.mil.gr, mfa.gr, hellenicnavy.gr, haf.gr: homepage, `/feed/`, `/rss`, … | **403 to both User-Agents**, site-wide (likely an IP or geo WAF). army.gr: DNS failure. Worth retrying from a GitHub runner with a one-off `--dry-run`. |
| CYP | mod.gov.cy, pio.gov.cy (legacy domains), mfa.gov.cy | 403 / timeout. The live portal is gov.cy (above). |
| SYR | mod.gov.sy, mofaex.gov.sy | Connection refused / no feed (404/500). |
| IRQ | mod.mil.iq, mofa.gov.iq | Redirect loop, or HTML for feed paths / HTTP 530. |
| IRN | mfa.ir, en.mfa.ir, mod.ir | Cookie redirect loop and `/rss` 404 / DNS failure. |
| ARM | mil.am, mfa.am, gov.am | mil.am serves HTML for every feed path; mfa.am 404. `https://www.gov.am/en/rss/` is RSS but **not well-formed XML**, even after HTML-entity repair, so it is unusable. |
| AZE | mfa.gov.az | Feed paths return 500. |
| GEO | mod.gov.ge, mfa.gov.ge | 403 / 522. |
| RUS | mil.ru, eng.mil.ru, function.mil.ru, mid.ru | Timeout / DNS failure; mid.ru serves HTML for feed paths. |
| UKR | mod.gov.ua, mil.gov.ua, mfa.gov.ua, zsu.gov.ua, president.gov.ua | No feed (404), HTML, or 403. |
| ISR | idf.il, gov.il, mod.gov.il | No feed / 403 / 404. |
| EGY | mfa.gov.eg, mod.gov.eg, sis.gov.eg | Intermittent DNS failure / 404 / TLS EOF. |
| BGR | mod.bg, mfa.bg | No feed (404); mfa.bg serves an anti-bot page. |
| ROU | mapn.ro, defense.ro | Feed paths 404/410. |
| LBY | foreign.gov.ly | 403 for feed paths. |
| JOR | jaf.mil.jo | No feed found. |

## Sonraki adımlar / Next steps

1. Register the confirmed publishers in `datasets` (issue #4) and fill in `source_id`.
2. Have a maintainer read each publisher's terms. Store only link, title and a ≤500-character excerpt. `terms: restricted` sources are leads only.
3. For User-Agent-blocked sites (gov.cy, mae.ro), contact the publisher or leave them off. **Do not spoof.**
4. Retry the 403/timeout sites from a GitHub runner, since results may differ by network.
5. Many ministries publish mainly on Telegram/X. The planned `telegram-web` collector (public `t.me/s/…` previews) may cover them better than RSS.
