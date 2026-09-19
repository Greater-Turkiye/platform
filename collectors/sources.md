# Resmî RSS/Atom kaynakları / Official RSS/Atom sources

[Türkçe](#türkçe) · [English](#english) · [Doğrulanan akışlar / Confirmed feeds](#doğrulanan-akışlar--confirmed-feeds) · [İnceleme kuyruğundakiler / In the review queue](#i̇nceleme-kuyruğundaki-kaynaklar--sources-in-the-review-queue) · [Bulunamayanlar / Not found](#akış-bulunamayanlar--no-feed-confirmed)

Issue #2 · Kontrol tarihleri / Checked on: **2026-09-13** (bölge devletleri / regional states), **2026-09-16** (BM ve uluslararası kuruluşlar / UN and international organisations)

## Türkçe

Bölge devletlerinin savunma bakanlığı, genelkurmay ve dışişleri siteleri ile birkaç resmî yayın organı tarandı. Bir akış yalnızca **gerçekten indirilip RSS veya Atom olarak ayrıştırıldıysa** "doğrulandı" sayıldı. Akışlar `config/feeds.yaml` dosyasındadır. Hepsi `enabled: false` durumundadır: Bir akışın ingest'e göndermek üzere açılması için bir bakımcının kullanım koşullarını onaylaması ve kaynağın `datasets` kaynak sicilinde (`datasets` issue #4) `source_id` almış olması gerekir. Ayrı bir kapı olan `queue: true`, akışın yalnızca insan inceleme kuyruğuna (bağlantı + başlık + kısa alıntı) girmesine izin verir ve koşulların kayda geçmiş olmasını şart koşar; bkz. [İnceleme kuyruğundaki kaynaklar](#i̇nceleme-kuyruğundaki-kaynaklar--sources-in-the-review-queue).

Yöntem ve sınırlar:

- Her URL toplayıcının tanımlayıcı `User-Agent`'ı ile çekildi. Tanı amacıyla bir tarayıcı `User-Agent`'ı ile de denendi. Toplayıcılar **asla** tarayıcı taklidi yapmaz; yalnızca tarayıcıya yanıt veren siteler kapalı kalır.
- Tüm denemeler tek bir ağ konumundan yapıldı. 403 ve zaman aşımı hataları IP'ye veya coğrafyaya bağlı olabilir; GitHub Actions çalıştırıcılarından sonuç farklı çıkabilir.
- Sıklık, tek bir çekimdeki öğe tarihlerinden kabaca hesaplandı.

## English

We surveyed the defence-ministry, general-staff and foreign-ministry sites of regional states, plus a few official outlets. A feed counts as **confirmed** only if we actually fetched it and it parsed as RSS or Atom. Confirmed feeds are in `config/feeds.yaml`, all with `enabled: false`. A feed may be switched on **for ingest** only after a maintainer confirms its terms of use and the source has a `source_id` in the `datasets` source registry (datasets issue #4). A second, independent gate, `queue: true`, lets a feed into the human review queue only (link + title + short excerpt) and requires its terms to be on record; see [Sources in the review queue](#i̇nceleme-kuyruğundaki-kaynaklar--sources-in-the-review-queue).

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

| GRC | Seyir Hidrografi ve Oşinografi Dairesi / Hellenic Navy Hydrographic Service | `https://hnhs.gr/en/category/navtex-messages/feed/` | RSS 2.0 (WordPress) | en | Low (8 items, mixes recent and pinned older messages) | Whole NAVTEX messages (ZCZC … NNNN) from the Kerkyra, Limnos and Irakleio stations, with positions. **Not a complete NAVTEX log**, so counts from it are a floor, not a total. Sends `Last-Modified`, no `ETag`. | [Terms of use](https://hnhs.gr/en/terms-of-use/): viewing and printing "solely for information purposes"; exchange, modification and transmission forbidden → **no redistribution**, facts only, never the text. | `navtex-grc-hnhs` |

## İnceleme kuyruğundaki kaynaklar / Sources in the review queue

Bunlar `queue: true` olan ilk akışlardır: zamanlanmış çalışma bunları toplar ve adayları bir
GitHub konusuna yazar. `queue`, `enabled`'dan ayrı bir kapıdır — `enabled` yalnızca ingest'e
göndermeyi açar ve `source_id` ister; `queue` yalnızca bağlantı, başlık ve ≤500 karakterlik
alıntının insan kuyruğuna girmesine izin verir. Hiçbiri yayımlanmış iddia değildir.

These are the first feeds with `queue: true`: the scheduled run collects them and writes the
candidates into a GitHub issue. `queue` is a separate gate from `enabled` — `enabled` only opens
sending to ingest and needs a `source_id`, while `queue` only allows a link, a title and a
≤500-character excerpt into the human queue. Nothing in it is a published claim.

| Yayıncı / Publisher | Akış / Feed | Biçim / Format | Dil / Lang | Gözlenen sıklık / Observed frequency | Notlar / Notes | Koşullar / Terms | `feeds.yaml` id | `queue` |
|---|---|---|---|---|---|---|---|---|
| BM Haber / UN News (DGC) | `https://news.un.org/feed/subscribe/en/news/all/rss.xml` | RSS 2.0 | en | ~15–20/day (30 items, ~34 kB) | Bölgesel akışlar (`/region/middle-east/`, `/region/europe/`) HTTP 200 ile **boş gövde** döndürüyor; yalnızca "all news" akışı kullanılabilir. `ETag` yok. | [UN copyright](https://www.un.org/en/about-us/copyright): "News-related material can be used as long as the appropriate credit is given and the United Nations is advised." | `un-news-en` | ✅ |
| 〃 | `…/ar/news/all/rss.xml`, `…/ru/news/all/rss.xml` | RSS 2.0 | ar, ru | ~15–20/day each | Aynı koşullar. Şimdilik kapalı: İngilizce akış zaten çalışma başına 40 öğelik tavanın çoğunu dolduruyor ve aynı haberin iki dildeki kopyası SimHash ile yakalanmaz. / Same terms; off for now (volume, and cross-language copies are not caught as duplicates). | 〃 | `un-news-ar`, `un-news-ru` | ❌ |
| BM Toplantı Tutanakları ve Basın Bültenleri / UN Meetings Coverage and Press Releases | `https://press.un.org/en/rss.xml` | RSS 2.0 | en | ~10/day (10 items, ~7 kB, `ETag`) | Güvenlik Konseyi ve Genel Kurul toplantı tutanakları — ayrıştırılabilen en yakın "BM belgesi" akışı. `…/content/security-council/press-release/feed` geçerli XML değil. | 〃 | `un-press-en` | ✅ |
| BM Genel Sekreteri / UN Secretary-General | `https://www.un.org/sg/en/rss.xml` | RSS 2.0 | en | Düşük / low (10 items, ~52 kB, `ETag`) | 10 öğelik pencere aylara yayılabiliyor; ilk çalışmada eski öğeler de aday olur. | 〃 | `un-sg-en` | ✅ |
| UAEA / IAEA | `https://www.iaea.org/feeds/news` | RSS 2.0 | en | 150 öğe/çekim, tarih alanı yok / 150 items per fetch, no `<pubDate>` | `iaea.org/terms-of-use` denediğimiz her `User-Agent`'a 403 döndü, lisans **teyit edilemedi**: yalnızca ipucu. | Teyit edilmedi / not confirmed | `iaea-news-en` | ❌ |

Lisansı yeniden yayıma izin vermeyen kaynaklar yalnızca **ipucu** olarak not edilir, `feeds.yaml`'a
eklenmez: Anadolu Ajansı (`https://www.aa.com.tr/tr/rss/default?cat=guncel`, 30 öğe, çalışıyor) ve
TRT Haber (`https://www.trthaber.com/sondakika.rss`, 50 öğe, çalışıyor) her hakkını saklı tutuyor;
ACLED gibi yeniden dağıtımı yasaklayan kaynaklar da aynı kategoridedir. / Sources whose licence
does not allow redistribution are recorded as **leads** only and are not added to `feeds.yaml`:
Anadolu Agency and TRT Haber both parse and both reserve all rights, as does ACLED.

Kapsam dışı ama çalışıyor / Out of scope but working: the US Department of War news feed (`https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10`) answered normally. It is not a regional state, so it was not added.

## NAVTEX: ilan edilen deniz faaliyeti / announced activity at sea

Bir devletin seyre kapattığı alanlar ve bunu ne sıklıkla yaptığı, o devletin kendi yayımladığı
ölçülebilir bir askerî faaliyet göstergesidir: atış eğitimi, füze denemesi, tatbikat, denizaltı
faaliyeti ve araştırma gemisi çalışması NAVTEX ile, konumu ve zaman aralığıyla duyurulur.
`gt_collectors.navtex` bir NAVTEX mesajını yapılandırılmış kayda çevirir (istasyon, konu, seri
numarası, saat, konumlar, faaliyet türü) ve **metni saklamaz**: koşulları yeniden dağıtıma izin
vermeyen kaynaklarda olgular kalır, metin kalmaz.

**Türkiye'nin kendi NAVTEX yayınları (kiyiemniyeti.gov.tr) bilerek toplanmaz.** Türk kuvvetlerinin
güncel atış ve tatbikat alanlarını yayımlamak, kim önce duyurmuş olursa olsun, ADR 0013'ün yasakladığı
şeydir. Sicil, *başka* devletlerin ilan ettiği faaliyeti ölçer (ADR 0019).

The areas a state closes to navigation, and how often, are a measure of its military activity that it
publishes itself: firing practice, missile tests, exercises, submarine activity and survey work are all
announced by NAVTEX with a position and a time window. `gt_collectors.navtex` turns a message into a
structured record (station, subject, serial, time, positions, kind of activity) and **keeps no text**:
where the terms forbid redistribution, the facts stay and the wording does not.

**Türkiye's own NAVTEX broadcasts are deliberately not collected.** Publishing the current firing and
exercise areas of Turkish forces is what ADR 0013 forbids, whoever announced them first. The register
measures what *other* states announce.

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

1. Register the confirmed publishers in `datasets` (issue #4) and fill in `source_id`. Until then
   nothing is sent to ingest; the review queue works without a `source_id`.
2. Have a maintainer read each publisher's terms. Store only link, title and a ≤500-character excerpt. `terms: restricted` sources are leads only.
3. For User-Agent-blocked sites (gov.cy, mae.ro), contact the publisher or leave them off. **Do not spoof.**
4. Retry the 403/timeout sites from a GitHub runner, since results may differ by network.
5. Advise the United Nations that we link to and quote UN News / press releases, as its copyright
   page asks, before anything derived from them is published anywhere.
6. Ask a maintainer to read the IAEA terms (their site blocks us) and, if they allow it, set
   `queue: true` for `iaea-news-en`.
7. Many ministries publish mainly on Telegram/X. The planned `telegram-web` collector (public `t.me/s/…` previews) may cover them better than RSS.
