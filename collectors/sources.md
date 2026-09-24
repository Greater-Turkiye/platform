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

## Canlı seyir ihbarı: neden hâlâ yok / A live navigational-warning feed: why there is still none

2026-09-20'de arandı ve bulunamadı. Bunu buraya yazmak, aramayı tekrar etmemek içindir.

| Aday / Candidate | Bulunan / What was found |
|---|---|
| NGA MSI `status=active` | Uç nokta çalışıyor (386 ihbar) ama **en yeni kaydı 2024**. Akdeniz aktarımı 2021'den sonra zaten seyrekleşiyor; "şu anda yürürlükte" sorusunu bizim denizlerimiz için cevaplamıyor. |
| HNHS RSS (`/en/category/navtex-messages/feed/`) | Yalnızca **8 öğe**, en yenisi 20 Şubat 2026; sayfalama yok (`?paged=2` yanıt vermiyor). Ayrıca kullanım şartları "exchange, modification, sale, transmission" yasaklıyor: mesaj **metni** alıntılanamaz. |
| HNHS "NAVTEX messages on the map" | Sayfa, üçüncü taraf bir uygulamaya (`pn.valmore.gr`) iframe'dir. `robots.txt` her şeye izin veriyor ama `view-points` uç noktası Laravel CSRF belirteci istiyor ve servisin kendi kullanım şartları okunamıyor. **Bağlanmadı:** şartını okuyamadığımız bir uygulamaya bağımlılık kurmuyoruz. |
| NAVAREA III koordinatörü (İspanya, IHM) | `armada.defensa.gob.es` radyo-ihbar sayfaları bizim ağımızdan yanıt vermedi (zaman aşımı); yalnızca `robots.txt` döndü. Bir GitHub runner'ından yeniden denenmeli. |

Sonuç: panelin "ilan edilen faaliyet" sütunu **2015–2021 tarihsel taban çizgisidir** ve öyle etiketlenir. Güncel sapma ancak yukarıdakilerden biri açıldığında hesaplanabilir; o zamana kadar güncelmiş gibi gösterilmez.

Searched on 2026-09-20 and not found; recorded so the search is not repeated. The NGA active endpoint stops in 2024; the Hellenic hydrographic feed carries eight items and forbids transmitting its text; its map is a third-party application behind a CSRF token whose own terms we cannot read; Spain's NAVAREA III pages did not answer from this network. Until one of these opens, the panel's activity column stays labelled as the 2015–2021 baseline it is.

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
7. Retry Spain's IHM NAVAREA III pages from a GitHub runner; if they answer, that is the live warning feed the panel is missing.
8. Many ministries publish mainly on Telegram/X. The planned `telegram-web` collector (public `t.me/s/…` previews) may cover them better than RSS.

## 2026-09-23 — kaynak taraması / source survey

35 aday akış, toplayıcının kendi kimliğiyle (`GreaterTurkiyeCollectors/…`, tarayıcı taklidi yok)
sorgulandı; şartları okunabilen ve alıntıya izin verenler kuyruğa alındı.

| kaynak | akış | şartlar | karar |
|---|---|---|---|
| gov.uk — Ministry of Defence | Atom, 20 öğe/çekim | Open Government Licence v3: kopyala, yayımla, uyarla; atıf şartıyla | **kuyruk** |
| defense.gov (war.gov'a yönlendiriyor) | RSS ×2, 20 öğe/çekim | ABD hükümeti eseri, telif dışı (17 U.S.C. § 105); sitenin kendi şartlar sayfası 403 | **kuyruk** |
| tass.com | RSS, 100 öğe | "RSS akışlarında, veri tabanlarında … yazılı izin olmadan kullanım yasaktır" | kapalı |
| icrc.org | RSS, 100 öğe | yalnızca "bütünüyle" ve "değişiklik yapmadan" kopyalama; alıntı bir değişikliktir | kapalı |
| reliefweb.int | RSS, 20 öğe | üçüncü taraf içeriği kendi hakları altında toplar; şartlar sayfası 403 | kapalı |
| en.irna.ir | RSS, 30 öğe | şartlar sayfası bulunamadı | kapalı |
| kyivindependent.com | RSS, 15 öğe | şartlar sayfası 404 | kapalı |
| aa.com.tr | RSS, 11–21 öğe | şartlar sayfası 404; ücretli ajans | kapalı |
| iaea.org | RSS, 15 öğe | şartlar sayfası 402/403 | kapalı |
| nato.int, defense.gouv.fr, bmvg.de, mod.bg, mapn.ro, mod.gov.ua, gov.kz, osce.org, eeas.europa.eu, peacekeeping.un.org | — | otomatik keşifle de bilinen yollarla da akış bulunamadı | — |
| mod.mil.gr, geetha.mil.gr, mfa.gr, mod.gov.ge, msb.gov.tr, gov.il, timesofisrael.com | — | istemcimize 403 | — |

Ölçülen verim (gerçek skorlayıcı, eşik 0,5): İngiltere MSB 20 öğeden **4** kuyruğa; ABD 40 öğeden
**0** — filtre bölge kapılı, bu haftanın ABD duyuruları yurt içi. Yani darboğaz filtre değil,
kaynak: bölgedeki savunma bakanlıklarının çoğu ya akış sunmuyor ya da dürüst istemciyi engelliyor.

## 2026-09-24 — ikinci tarama / second survey

40 aday daha. Geçenler: **İngiltere Dışişleri (FCDO)** — OGL v3, MSB ile aynı sayfa; **Avrupa
Komisyonu basın köşesi** — 2011/833/EU kararı ve CC BY 4.0, yasal uyarı okundu. Geçmeyenler:
regjeringen.no akış veriyor (99 öğe) ama telif sayfası iki istemciye de 403; consilium, EEAS,
Parlamento ve OSCE okunabilir bir akış sunmuyor; canada.ca io-server atom döndürüyor ama bakanlık
sorgusuyla sıfır öğe; gov.pl'nin belgelenmiş rss yolu HTML döndürüyor; centcom/eucom/navy.mil adları
buradan da ikinci bir ağdan da çözümlenmiyor (sonuçlanmadı, runner'dan denenecek); Baltık ve Finlandiya
bakanlıkları 403; Hollanda, Çekya, İsveç, Romanya, Bulgaristan, İtalya, İspanya akış sunmuyor.

Ölçülen verim: FCDO 20 öğeden 1 (Bab-ül Mendep G7 açıklaması); Komisyon 10 öğeden 0. Dikkat: FCDO'nun
"Ukrayna üzerine BMGK konuşması" bölgeyi (black-sea) tutturdu ama konu tablosuna takılıp 0 aldı —
darboğazın bir kısmı elimizdeki konu terimlerinde, kaynakta değil.

## 2026-09-24 — konu tablosu ölçümü / measuring the topic table

Günün partisi (195 satır) yeniden puanlandı: elenen 189 öğenin **141'i** bir izleme bölgesini
tutturmuş ama hiçbir konu terimine değmemişti. Çoğu doğru elenmişti (maraton, doğum günü tebriği,
anma ziyareti); aralarında BMGK'nın Husi saldırılarını kınaması, FCDO'nun Ukrayna konuşması ve Rusya
cumhurbaşkanının Suudi Arabistan ve üç Orta Asya ülkesiyle telefon görüşmeleri de vardı. Tabloya iki
grup eklendi, `diplomatic.statement` (mevcut kod) ve `diplomatic.talks` (yeni kod, datasets #35):

| tablo | kuyruk |
|---|---|
| önceki | 6 |
| + statement | 9 |
| + talks | 13 |
| ikisi | **16** |

Replayed the day's batch: 141 of 189 rejected items had a region and no topic. Two groups added
(platform #111); the day's queue goes from 6 to 16, two of them digests the reviewer will dismiss.
Yöntem `collectors/README.md`'de: terim tahminle değil, partiyi yeniden puanlayıp kazanılanları
okuyarak eklenir.

## 2026-09-24 — üçüncü tarama / third survey

115 aday, toplayıcının kendi kimliğiyle. 32'si akış verdi; şartları okunabilen ve bağlantı +
alıntıya izin verenler kuyruğa alındı. Yayıncıya göre güvenilirlik notu `feeds.yaml`'da, gerekçesiyle.

| kaynak | akış | şartlar | karar |
|---|---|---|---|
| government.ru (en, ru) | RSS, 20 öğe / 2 hafta | "Все материалы сайта доступны по лицензии: Creative Commons Attribution 4.0" | **kuyruk**, C |
| ukrinform.net — savaş bölgesi | RSS, ~30/gün | alıntıda ukrinform.net bağlantısı "ilk paragraftan aşağıda olmamak üzere" zorunlu | **kuyruk**, C |
| balkaninsight.com (BIRN) | RSS, 90 öğe | yeniden yayın politikası: kısa alıntı + atıf + bağlantı serbest; toplu kopyalama ve yapay zekâ eğitimi yasak | **kuyruk**, B; 3 saatte bir |
| atlanticcouncil.org | RSS, 100 öğe | ticari olmayan kopyaya izin, telif notu korunarak; insan hızını aşan otomatik erişim yasak | **kuyruk**, C; 6 saatte bir |
| aljazeera.com | RSS, 25 | "spider, scraper, bot" ile erişim yazılı izinsiz yasak | kapalı |
| civil.ge | RSS, 10 | "kopyalama, yeniden yayın" ve "otomatik araçlar" yasak; lisans için iletişim | kapalı |
| defensenews.com, twz.com (Recurrent) | RSS | izinsiz kopya/yeniden yayın yasak | kapalı |
| cyprus-mail.com | RSS, 20 | içerik "yalnızca kişisel kullanım ve bilgi için" | kapalı |
| csis.org | RSS, 10 | yalnızca sınıf/konferans için talep üzerine yeniden basım izni | kapalı |
| crisisgroup.org | RSS, 7 | telif bildirimi sayfası istemcimize 403 | okunamadı |
| esteri.it | RSS, 10 | yasal uyarı sayfası bot yöneticisine (Radware) yönlendiriyor | okunamadı |
| president.az, akorda.kz, azertag.az, operationirini.eu (Fabaris SpA), navalnews.com, orsam.org.tr, savunmasanayist.com | RSS | şartlar sayfası yok; yalnızca "tüm hakları saklıdır" | şartlar yok, kapalı |
| en.mehrnews.com | RSS, 30 | şartlar yok | kapalı; not sınırının altında kalırdı |
| haaretz.com | RSS, 100 | kullanıcı içeriği şartları; yeniden kullanım maddesi yok | kapalı |
| state.gov, whitehouse.gov, consilium, diplomatie.gouv.fr, gov.il, ispr.gov.pk, pib.gov.in, mfa.gr, primeminister.gr, pio.gov.cy, mfa.gov.ua, president.gov.ua, mod.gov.al, suna-sd.net, nna-leb.gov.lb, understandingwar.org, iiss.org, ecfr.eu, chathamhouse.org, timesofisrael.com, ekathimerini.com, arabnews.com, breakingdefense.com | — | istemcimize 403/404 | — |
| navy.mil, centcom.mil, eucom.mil, africom.mil, c6f.navy.mil | — | ad çözümlenmiyor (üçüncü ağ) | runner'dan denenecek |
| shape.nato.int, sis.gov.eg, gnu.gov.ly | — | TLS zinciri doğrulanmıyor | kapalı (doğrulama kapatılmaz) |
| nato.int, osce.org, unifil/unficyp/unsmil, unocha, eeas, europarl, sipri, rusi, janes, trtworld, mfa.gov.tr, tccb.gov.tr, msb.gov.tr, resmigazete.gov.tr, spa.gov.sa, wam.ae, petra.gov.jo, mid.ru | — | bilinen yollarda akış yok ya da HTML | — |

Ölçülen verim (gerçek skorlayıcı, eşik 0,5), beş akışın ilk çekimi: 260 öğeden **61** kuyruğa —
Ukrinform 24/30, Balkan Insight 19/90, Atlantic Council 15/100, government.ru 3/20 (en), 0/20 (ru).
Bir gün önce günlük kuyruk 6'ydı; konu tablosuyla 16; bu beş akışla ilk gün 60'ın üzerinde, sonra
Ukrinform'un ~25/gün'ü ile Balkan Insight ve Atlantic Council'ın haftalık birkaç düzinesi. `--max-items 40`
fazlasını sonraki çalıştırmaya erteler; sıralama puanla, karar gözden geçirenin.

Third survey: 115 candidates, 32 served a feed, five queued (government.ru en/ru under CC BY 4.0,
Ukrinform's war-zone rubric with the mandatory link, Balkan Insight under its excerpt-and-credit
policy, the Atlantic Council under its noncommercial-copies clause). First fetch: 61 of 260 items
reached the queue. The rest are closed by their terms, unreadable to our client, or have no terms
page at all, which under the queue rule is the same as no.

### Runner'dan yoklama / probed from the runner (2026-09-24)

`probe-feeds.yml` ile GitHub runner'ından, aynı kimlikle. `.mil` adları orada çözümleniyor:
`navy.mil`, `centcom.mil` ve `cusnc.navy.mil`'in `ArticleCS/RSS.ashx` uçları 200 döndürüyor ama
denediğimiz `Site` kimlikleriyle gövde boş; `c6f.navy.mil` `Site=1000` başka bir kurumun (bir ordu
kliniğinin) akışını veriyor, yani kimlik uzayı paylaşımlı ve doğru kimlik sitenin basın sayfasında —
o sayfalar (`/Press-Office/`, `/MEDIA/PRESS-RELEASES/`, `/Press-Room/`) istemcimize 403. `eucom.mil`
ve `africom.mil` runner'dan da 403. Sonuç: **çözümlenmiyor değil, kapalı**; doğru `Site` kimliğini
yayıncıdan ya da bir bakımcının tarayıcısından öğrenmek gerekir, tahmin edilmez.
Runner'dan da 403: state.gov, ISW, gov.il, mfa.gr, primeminister.gr, geetha, mod.mil.gr, msb.gov.tr,
mfa.gov.ua, president.gov.ua, consilium, diplomatie.gouv.fr, ispr, timesofisrael, ekathimerini, IISS,
Chatham House, ECFR, Breaking Defense, gov.cy. Romanya (presidency.ro, mae.ro) runner'dan "ağ
erişilemez". Rudaw ve Kurdistan24 akış yolunda HTML. Yalnızca **arabnews.com** runner'dan akış verdi
(RSS, 50 öğe; buradan 403).

From the runner the `.mil` hosts resolve; the RSS endpoints answer 200 with an empty body for the
site ids we tried, and the press pages that would name the right id are 403 to our client. Closed,
not unresolved. Everything else that refused us here refused the runner too; only Arab News differed.
Arab News: şartlar sayfası (`/terms-conditions`, `/termsandconditions`) `backup.arabnews.com`'a
yönlendirip 404 veriyor; akışta telif ögesi yok. Şartlar okunmadan kuyruk yok — kapalı.

