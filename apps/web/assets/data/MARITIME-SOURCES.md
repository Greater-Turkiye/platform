# Deniz yetki alanları ve adalar — kaynaklar / Maritime jurisdiction and islands — sources

[Türkçe](#türkçe) · [English](#english) · [Şematik alanlar / Schematic areas](#şematik-alanlar--schematic-areas) · [KKTC ruhsat sahaları / TRNC licence areas](#kktc-ruhsat-sahaları--trnc-licence-areas) · [Kaynak belgeler / Source documents](#kaynak-belgeler--source-documents) · [Doğrulama / Validation](#doğrulama--validation)

Dosyalar / Files: `maritime-tur.geojson`, `islands-tur.geojson`
Üretim / Build: `python tools/geo/build_maritime.py [--cache DIR] [--preview out.png] [--no-schematic] [--no-kktc]` (shapely ≥ 2.1, pyshp; şematik alanlar için ayrıca / for the schematic areas also numpy, scipy, contourpy; KKTC ruhsat sahaları için / for the TRNC licence areas pyproj ≥ 3.6; matplotlib yalnızca önizleme için / only for the preview). Yalnızca şematik alanları yeniden üretmek için / To rebuild only the schematic areas: `python tools/geo/build_maritime_schematic.py [--cache DIR]` (KKTC ruhsat sahalarını korur, birleşik alanı yeniden üretir / keeps the TRNC licence areas and rebuilds the merged area). Yalnızca KKTC ruhsat sahaları ve birleşik alan / Only the TRNC licence areas and the merged area: `python tools/geo/build_kktc_licences.py [--cache DIR]` (köşe tabloları / corner tables: `tools/geo/kktc_licences.csv`)
Erişim tarihi / Accessed: 2026-09-13

> **Türkiye'nin tutumu / Türkiye's position.** `status: "claimed"` taşıyan ve `position_tr/position_en` alanı olan her öğe Türkiye'nin BM'ye bildirdiği ya da Dışişleri Bakanlığı'nın açıkladığı tutumdur; tartışmasız bir olgu olarak sunulmamalıdır. Harita bu öğeleri "Türkiye'nin tutumu / Türkiye's position" etiketiyle göstermelidir.
> Every feature with `status: "claimed"` or a `position_tr/position_en` field is Türkiye's position as notified to the UN or stated by the Ministry of Foreign Affairs, not undisputed fact. The map should label it "Türkiye'nin tutumu / Türkiye's position".

> **Şematik / Schematic.** `status: "schematic"` taşıyan alanlar (`tur-aegean-schematic`, `tur-med-schematic` ve bunun KKTC ruhsat sahalarıyla birleşimi `tur-kktc-med-merged`) **resmî koordinat değildir**. Türkiye bu alanların sınırlarını yayımlamamıştır; poligonlar, Türkiye'nin açıkladığı hukuki tutumdan bu projenin türettiği geometrik yapılardır. Harita bunları resmî hatlardan (`claimed`) farklı bir biçimde ve "şematik" uyarısıyla göstermelidir.
> The `status: "schematic"` areas (`tur-aegean-schematic`, `tur-med-schematic` and its union with the TRNC licence areas, `tur-kktc-med-merged`) are **not official coordinates**. Türkiye has not published their boundaries; the polygons are this project's geometric construction from Türkiye's stated legal position. The map should style them differently from the official (`claimed`) lines and label them as schematic.

> **KKTC ruhsat sahası / TRNC licence area.** `status: "licence"` (`kind: "kktc-licence"`) taşıyan yedi poligon (`kktc-licence-A` … `-G`), KKTC Bakanlar Kurulu'nun TPAO'ya verdiği deniz ruhsat sahalarıdır; köşeleri **resmî** (KKTC Resmî Gazete Sayı 161, 22.9.2011). Bunlar KKTC'nin ve Türkiye'nin tutumudur; GKRY ve Yunanistan itiraz eder. Yeni durum değeri henüz sitede ayrıca biçimlendirilmemiştir (şimdilik `schematic` dışı her poligon gibi düz dolgu); harita bunları "KKTC ruhsat sahası — KKTC'nin ve Türkiye'nin tutumu" diye etiketlemelidir.
> The seven `status: "licence"` (`kind: "kktc-licence"`) polygons (`kktc-licence-A` … `-G`) are the offshore licence areas the TRNC Council of Ministers granted to TPAO; their corners are **official** (TRNC Official Gazette No. 161, 22 Sep 2011). They are the TRNC's and Türkiye's position, contested by the Greek Cypriot Administration and Greece. The new status value is not yet styled on the site (for now it gets the solid fill of every non-`schematic` polygon); the map should label them "TRNC licence area — the TRNC's and Türkiye's position".

---

## Türkçe

### Kapsam

| Öğe (`id`) | Geometri | Durum | Dayanak | Koordinat kaynağı |
|---|---|---|---|---|
| `tur-blacksea-eez` | Poligon (930 köşe) | `agreed` | 1973, 1978, 1986/87 (SSCB), 1997 (Bulgaristan, Gürcistan) anlaşmaları; 86/11264 sayılı BKK | Marine Regions (VLIZ) "Turkish Exclusive Economic Zone", MRGID 5697 — CC BY 4.0; antlaşma koordinatlarıyla karşılaştırıldı |
| `tur-med-cs-a74550-a` | Çizgi (23 nokta) | `claimed` | A/74/550 ek, bölüm A — 2011 Türkiye–KKTC Kıta Sahanlığı Sınırlandırma Anlaşması | A/74/550 (resmî koordinat listesi) |
| `tur-med-cs-a74550-b` | Çizgi (14 nokta, A–N) | `claimed` | A/74/550 ek, bölüm B — Türkiye ve Mısır kıyıları arası orta hat, 28°D – 32°16'18"D | A/74/550 |
| `tur-med-cs-a74550-c` | Çoklu çizgi | `claimed` | A/74/550 ek, bölüm C — 32°16'18"D boylamı, "yabancı karasuları hariç" | A/74/550; Kıbrıs 12 dm karasuları Marine Regions (CC BY 4.0) ile çıkarıldı |
| `tur-med-libya-mou` | Çizgi (2 nokta) | `agreed` (ikili; itiraz ediliyor) | Türkiye–Libya Mutabakat Muhtırası, 27 Kasım 2019, md. I(1); BM tescil 56119; A/74/757 | Mutabakat Muhtırası metni (DOALOS), A/74/757 |
| `tur-aegean-schematic` | Çoklu poligon | `schematic` | Türkiye'nin Ege tutumu (hakkaniyet; Türkiye kıyısına yakın adalar yalnızca 6 dm karasuları) | **Bu projenin yapısı** — bkz. [Şematik alanlar](#şematik-alanlar--schematic-areas) |
| `tur-med-schematic` | Çoklu poligon | `schematic` | A/74/550 bölüm A–D + Libya Mutabakatı | **Bu projenin yapısı** — bkz. [Şematik alanlar](#şematik-alanlar--schematic-areas) |
| `kktc-licence-A` … `kktc-licence-G` | 7 poligon (59 resmî köşe) | `licence` (`kind: "kktc-licence"`) | KKTC Bakanlar Kurulu Kararı K(II)1195-2011 (22.9.2011): TPAO'ya petrol ve doğal gaz arama ruhsatı | KKTC Resmî Gazete Sayı 161, EK IV Bölüm I, s. 1064–1066 (AR/KKTC/A–G tabloları, ED50) — bkz. [KKTC ruhsat sahaları](#kktc-ruhsat-sahaları--trnc-licence-areas) |
| `tur-kktc-med-merged` | Çoklu poligon | `schematic` | Türkiye + KKTC birleşik tutumu | **Bu projenin yapısı**: `tur-med-schematic` ∪ ruhsat sahaları A–G — bkz. [KKTC ruhsat sahaları](#kktc-ruhsat-sahaları--trnc-licence-areas) |
| `islands-tur.geojson` (10 ada) | Nokta | `tur` | — | Wikidata P625 (CC0) |
| Kardak Kayalıkları | Nokta | `tur-position` | T.C. Dışişleri Bakanlığı açıklamaları | Konum: Wikidata Q2119012 (CC0); tutum: mfa.gov.tr |

### İşleme adımları

1. **Karadeniz.** Marine Regions WFS'ten `MarineRegions:eez`, `mrgid=5697` ("Turkish Exclusive Economic Zone") indirildi. Bu poligon Türkiye'nin tüm kıyılarını kapsar ve Ege/Akdeniz'de VLIZ'in kendi orta hatlarını kullanır; bu nedenle **yalnızca Karadeniz kısmı** alındı:
   - 27–42°D, 40,5–44,5°K çerçevesiyle kesildi; Marmara ve İstanbul Boğazı, IHO S-23 (1953) Karadeniz sınırı olan Rumeli Feneri–Anadolu Feneri hattında (41°13'K) çıkarıldı.
   - Natural Earth 10m kara poligonu (kamu malı) çıkarıldı, en büyük parça tutuldu.
   - Douglas–Peucker sadeleştirmesi (0,001° ≈ 100 m, topoloji korunarak) → 930 köşe; 1e-4° ızgaraya oturtuldu, RFC 7946 yönü (dış halka saat yönü tersine) uygulandı.
   - **Doğrulama:** 1978 anlaşmasının 12 dönüm noktasının tamamı ve 1997 Bulgaristan anlaşmasının 2–10. noktaları poligon sınırına ≤ 5 m uzaklıktadır (tablo aşağıda).
   - Poligon karasularını (Karadeniz'de 12 dm) da içerir; yani kıyıdan MEB dış sınırına kadar olan alanı gösterir.
2. **Doğu Akdeniz.** A/74/550 ve Mutabakat Muhtırası'ndaki derece-dakika-saniye koordinatları betikte harfiyen yazılı (`A74550_A`, `A74550_B`, `A74550_C`, `MOU_LBY`) ve ondalık dereceye çevrildi. Bölüm B'nin son noktası (N) bölüm C'nin güney ucu, bölüm C'nin kuzey ucu bölüm A'nın 1. noktasıdır; üç bölüm birlikte kesintisiz bir hat oluşturur. Bölüm C'den, belgedeki "yabancı karasuları hariç" ifadesi gereği Kıbrıs adasının 12 dm karasuları (Marine Regions "Cypriot 12 NM") çıkarıldı (34,5846–35,3139°K arası).
3. **Adalar.** Her ada için Wikidata P625 (ilk değer) kullanıldı; Vikipedi sayfasıyla karşılaştırıldı (QID ve sayfa `sources` alanında).
4. Tüm koordinatlar WGS84 [boylam, enlem], 4 ondalık basamak (~11 m).
5. **Şematik alanlar.** `tools/geo/build_maritime_schematic.py` ile üretilir; bkz. [Şematik alanlar](#şematik-alanlar--schematic-areas).

### Neden çizgi, poligon değil (Akdeniz)

Türkiye'nin bildirdiği koordinatlar bir alanı kapatmaz:
- A/74/550 bölüm A, 34°36'28"D'de (nokta 23) biter; bu noktadan Türkiye–Suriye kıyısına kadar bir hat yayımlanmamıştır.
- Bölüm B, 28°00'00"D'de başlar. Türkiye, 28°D'nin batısındaki koordinatları "daha sonra bildirme hakkını saklı tuttuğunu" belirtir (bölüm D). Libya Mutabakatı'nın 26°19'–26°39'D arasındaki bölümü ile 28°D arasında resmî koordinat yoktur.
- Türkiye'nin kıyıya doğru kuzey sınırı, 28°D batısında adaların karasuları dış sınırıdır (bölüm D); bunun koordinatları yayımlanmamıştır.

Bu boşlukları kapatmak için çizgi uydurmak projenin kuralına aykırı olacağından Akdeniz bileşenleri **resmî sınır çizgileri** olarak verildi. Harita bunları kesikli çizgi olarak ve "Türkiye'nin tutumu" etiketiyle göstermelidir. Libya Mutabakatı çizgisi yalnızca iki uç noktayla tanımlanmıştır; D3 bunu jeodezik (büyük daire) olarak çizer.

Bu çizgiler değiştirilmedi. Alanı dolgu olarak göstermek için ayrıca **şematik** bir poligon (`tur-med-schematic`) eklendi; boşlukları kapatan bağlantılar orada açıkça "bu projenin yapısı" olarak işaretlidir ve resmî çizgilerle karıştırılmamalıdır.

### Dışarıda bırakılanlar

- **Ege kıta sahanlığı.** Türkiye'nin Ege'deki kıta sahanlığı tutumu hukuki ilkelerle ifade edilir; Dışişleri Bakanlığı'nın "The Delimitation of the Aegean Continental Shelf" sayfasında ve A/74/550'de koordinat yoktur (A/74/550 yalnızca Ege'deki "gelecekteki sınırlandırma anlaşmalarına" atıf yapar). Resmî bir poligon yoktur; bunun yerine ilkelerden türetilmiş **şematik** bir alan (`tur-aegean-schematic`) eklendi.
- **Ege'de 6 deniz millik karasuları.** 2674 sayılı Kanun (1982) genişliği 6 dm olarak belirler, Bakanlar Kurulu'na belirli denizlerde bunu aşma yetkisi verir ve esas hatların resmî haritalarda gösterileceğini söyler; ancak bu esas hatların/dış sınırın yayımlanmış koordinat veri seti bulunamadı. Marine Regions'ın "Turkish 12 NM" katmanı Ege'de 6 dm'yi tutarlı biçimde yansıtmıyor (örnek ölçümler: Kuşadası açığı 3,6 dm, Saros 7,2 dm, Gelibolu batısı 23 dm). Normal hattan 6 dm tampon üretmek belgelenmiş bir veri seti olmayacağı ve karşı kıyıdaki adalarla sınırlandırma gerektireceği için Ege karasuları eklenmedi.
- **Türkiye–KKTC hattının doğusu (34°36'28"D → Suriye)** ve **28°D batısı**: resmî çizgi yoktur (yukarıya bakınız); yalnızca şematik alanda en kısa düz bağlantılarla kapatıldı.
- (Şematik Ege alanında Türkiye kıyısından ölçülen ayrı bir 6 dm karasuları çizilmedi; alan kıyıdan başlar ve Türk karasularını da içerir.)

### Uyarılar

- Marine Regions verisi "hiçbir hukuki değer taşımaz" ve VLIZ sınırlar hakkında görüş bildirmez (lisans sayfası). Karadeniz poligonu antlaşma dönüm noktalarıyla metre düzeyinde örtüşür; kıyı çizgisi ise VLIZ ve Natural Earth kıyılarının kesişimidir.
- 1978 anlaşması hattı 32°00'D'de bitirir; 43°20'43"K 32°00'D ile 43°26'59"K 31°20'48"D arası "daha sonra müzakere edilecek" olarak bırakılmıştır. Poligonun bu kesimdeki sınırı (ve Bulgaristan 10. noktasına bağlantı) Marine Regions'ın kendi yapısıdır.
- 1997 Bulgaristan anlaşmasında karasuları yanal sınırının son noktası 41°58'52.8"K, kıta sahanlığı/MEB hattının 1. noktası ise 41°59'52"K olarak verilmiştir (DOALOS metni); aradaki 1' fark nedeniyle 1. nokta poligona 1,7 km uzaktadır. Marine Regions karasuları son noktasını izler.
- 1978 hattı bugün DOALOS'ta Gürcistan, Rusya Federasyonu ve Ukrayna altında listelenir; Marine Regions segmentleri "Turkey – Russia", "Turkey – Ukraine", "Georgia – Turkey" diye adlandırır. Bu katman kıyıdaş devletleri adlandırmaz.
- Kardak için Dışişleri Bakanlığı metinleri yalnızca İngilizce bulunabildi (sitenin Türkçe dil bağlantısı ana sayfaya yönleniyor); `basis_tr` bu metnin çevirisidir ve öyle belirtilmiştir. Yunanistan bu tutumu kabul etmez ve kayalıkları "Imia" adıyla kendi toprağı sayar. `kind: "rocks"` (Bakanlığın "Kardak Rocks" ifadesi).
- Avşa'nın Wikidata öğesi (Q791572) aynı zamanda mahalleyi temsil eder; koordinatı adanın üzerindedir ve İngilizce Vikipedi'deki ada koordinatından ~1,2 km uzaktadır. Tavşan Adaları, Türkçe Vikipedi'de "Karayer Adaları" (Q6977903) olarak geçer. Karaada, Bodrum açığındaki adadır (Q2254939).

---

## English

### Scope

| Feature (`id`) | Geometry | Status | Basis | Coordinate source |
|---|---|---|---|---|
| `tur-blacksea-eez` | Polygon (930 vertices) | `agreed` | 1973, 1978, 1986/87 (USSR), 1997 (Bulgaria, Georgia) agreements; Decree 86/11264 | Marine Regions (VLIZ) "Turkish Exclusive Economic Zone", MRGID 5697 — CC BY 4.0; cross-checked against treaty coordinates |
| `tur-med-cs-a74550-a` | Line (23 points) | `claimed` | A/74/550 annex, section A — 2011 Türkiye–TRNC Continental Shelf Delimitation Agreement | A/74/550 (official coordinate list) |
| `tur-med-cs-a74550-b` | Line (14 points, A–N) | `claimed` | A/74/550 annex, section B — median line between the Turkish and Egyptian coasts, 28°E – 32°16'18"E | A/74/550 |
| `tur-med-cs-a74550-c` | MultiLine | `claimed` | A/74/550 annex, section C — meridian 32°16'18"E, "except foreign territorial waters" | A/74/550; Cyprus 12-nm territorial sea removed using Marine Regions (CC BY 4.0) |
| `tur-med-libya-mou` | Line (2 points) | `agreed` (bilateral; contested) | Türkiye–Libya MoU, 27 Nov 2019, Art. I(1); UN registration 56119; A/74/757 | MoU text (DOALOS), A/74/757 |
| `tur-aegean-schematic` | MultiPolygon | `schematic` | Türkiye's Aegean position (equitable principles; islands close to the Turkish coast get only a 6-nm territorial sea) | **This project's construction**, see [Schematic areas](#şematik-alanlar--schematic-areas) |
| `tur-med-schematic` | MultiPolygon | `schematic` | A/74/550 sections A–D + Libya MoU | **This project's construction**, see [Schematic areas](#şematik-alanlar--schematic-areas) |
| `kktc-licence-A` … `kktc-licence-G` | 7 Polygons (59 official corners) | `licence` (`kind: "kktc-licence"`) | TRNC Council of Ministers decision K(II)1195-2011 (22 Sep 2011): oil and gas exploration licence to TPAO | TRNC Official Gazette No. 161, Annex IV Part I, pp. 1064–1066 (tables AR/KKTC/A–G, ED50), see [TRNC licence areas](#kktc-ruhsat-sahaları--trnc-licence-areas) |
| `tur-kktc-med-merged` | MultiPolygon | `schematic` | Combined Türkiye + TRNC position | **This project's construction**: `tur-med-schematic` ∪ licence areas A–G, see [TRNC licence areas](#kktc-ruhsat-sahaları--trnc-licence-areas) |
| `islands-tur.geojson` (10 islands) | Point | `tur` | — | Wikidata P625 (CC0) |
| Kardak Rocks | Point | `tur-position` | Turkish MFA statements | Location: Wikidata Q2119012 (CC0); position: mfa.gov.tr |

### Processing

1. **Black Sea.** Downloaded `MarineRegions:eez`, `mrgid=5697` ("Turkish Exclusive Economic Zone") from the Marine Regions WFS. That polygon covers all Turkish coasts and uses VLIZ's own median lines in the Aegean/Mediterranean, so **only the Black Sea part** is kept:
   - clipped to 27–42°E, 40.5–44.5°N; the Marmara and the Bosphorus are cut at the IHO S-23 (1953) Black Sea limit, the Rumeli Feneri–Anadolu Feneri line (41°13'N);
   - Natural Earth 10m land (public domain) subtracted, largest part kept;
   - Douglas–Peucker simplification (0.001° ≈ 100 m, topology-preserving) → 930 vertices; snapped to a 1e-4° grid; RFC 7946 winding (exterior counter-clockwise).
   - **Check:** all 12 turning points of the 1978 agreement and points 2–10 of the 1997 Bulgaria agreement lie ≤ 5 m from the polygon boundary (table below).
   - The polygon includes the territorial sea (12 nm in the Black Sea): it shows the area from the coast to the outer EEZ limits.
2. **Eastern Mediterranean.** The degree-minute-second coordinates in A/74/550 and the MoU are transcribed verbatim in the script (`A74550_A`, `A74550_B`, `A74550_C`, `MOU_LBY`) and converted to decimal degrees. Section B's last point (N) is section C's southern end, and section C's northern end is section A's point 1, so the three sections form one continuous line. Following the document's words "except foreign territorial waters", the island of Cyprus's 12-nm territorial sea (Marine Regions "Cypriot 12 NM") is removed from section C (34.5846–35.3139°N).
3. **Islands.** Wikidata P625 (first value) for each island, cross-checked with its Wikipedia article (QID and page in `sources`).
4. All coordinates WGS84 [lon, lat], 4 decimals (~11 m).
5. **Schematic areas.** Built by `tools/geo/build_maritime_schematic.py`; see [Schematic areas](#şematik-alanlar--schematic-areas).

### Why lines, not polygons (Mediterranean)

Türkiye's notified coordinates do not close an area:
- A/74/550 section A ends at 34°36'28"E (point 23); no line from there to the Turkish–Syrian coast has been published.
- Section B starts at 28°00'00"E. Türkiye "reserves its rights to further submit" coordinates west of 28°E (section D); there are no official coordinates between 28°E and the Libya MoU segment at 26°19'–26°39'E.
- West of 28°E, Türkiye's limit towards its own coast is the outer limit of the islands' territorial waters (section D); those coordinates are not published.

Closing these gaps would mean inventing lines, which the project forbids, so the Mediterranean components are **official limit lines**. The map should draw them dashed and labelled "Türkiye's position". The MoU line is defined only by its two end points; D3 renders it as a geodesic (great circle).

These lines are unchanged. To show the area as a fill, a separate **schematic** polygon (`tur-med-schematic`) has been added; the connectors that close the gaps are explicitly marked there as this project's construction and must not be confused with the official lines.

### Omitted

- **Aegean continental shelf.** Türkiye's Aegean shelf position is expressed as legal principles. The MFA page "The Delimitation of the Aegean Continental Shelf" and A/74/550 contain no coordinates; A/74/550 refers only to "future delimitation agreements in the Aegean Sea". There is no official polygon; a **schematic** area derived from the principles (`tur-aegean-schematic`) has been added instead.
- **Aegean 6-nm territorial sea.** Act No. 2674 (1982) sets the breadth at 6 nm, lets the Council of Ministers exceed it in certain seas, and says the baselines are to be marked on official large-scale maps. No published coordinate dataset of those baselines or of the outer limit was found. Marine Regions' "Turkish 12 NM" layer does not consistently reflect 6 nm in the Aegean (sample measurements: off Kuşadası 3.6 nm, Saros 7.2 nm, west of Gelibolu 23 nm). A home-made 6-nm buffer from a normal baseline would not be a documented dataset and would need delimitation against the islands opposite, so it is not included.
- **East of the Türkiye–TRNC line (34°36'28"E → Syria)** and **west of 28°E**: no official line (see above); closed with shortest straight connectors in the schematic area only.
- (The schematic Aegean area does not draw a separate 6-nm Turkish territorial sea; it starts at the coast and includes Turkish territorial waters.)

### Caveats

- Marine Regions data "has no legal value whatsoever" and VLIZ expresses no opinion on boundaries (licence page). The Black Sea polygon matches the treaty turning points to the metre; its coastline is the intersection of the VLIZ and Natural Earth coasts.
- The 1978 agreement stops the line at 32°00'E; the stretch between 43°20'43"N 32°00'E and 43°26'59"N 31°20'48"E was "to be settled later". The polygon's edge there (and the link to Bulgaria point 10) is Marine Regions' construction.
- In the 1997 Bulgaria agreement the territorial-sea lateral boundary ends at 41°58'52.8"N, while continental-shelf/EEZ point 1 is given as 41°59'52"N (DOALOS text). Because of this 1′ difference, point 1 lies 1.7 km from the polygon; Marine Regions follows the territorial-sea terminal point.
- DOALOS now lists the 1978 line under Georgia, the Russian Federation and Ukraine; Marine Regions labels the segments "Turkey – Russia", "Turkey – Ukraine", "Georgia – Turkey". This layer does not name the opposite states.
- The MFA texts on Kardak are available only in English (the site's Turkish link redirects to the home page). `basis_tr` is a translation and says so. Greece rejects the position and regards the rocks ("Imia") as Greek territory. `kind: "rocks"` follows the MFA's wording ("Kardak Rocks").
- Avşa's Wikidata item (Q791572) also represents the neighbourhood; its point lies on the island, ~1.2 km from the island coordinate on English Wikipedia. Tavşan Adaları appears on Turkish Wikipedia as "Karayer Adaları" (Q6977903). Karaada is the island off Bodrum (Q2254939).

---

## Şematik alanlar / Schematic areas

> **ŞEMATİK — RESMÎ KOORDİNAT DEĞİLDİR / SCHEMATIC — NOT OFFICIAL COORDINATES.**
> Türkiye, Ege'de ve 28°D batısında / A/74/550 bölüm A'nın doğusunda hiçbir sınır koordinatı yayımlamamıştır. Aşağıdaki alanlar Türkiye'nin **açıkladığı hukuki tutumdan** bu projenin türettiği geometrik yapılardır. Başka bir devletin tutumunu, bir mahkeme kararını ya da müzakere sonucunu göstermez; Yunanistan, GKRY, Mısır ve diğer kıyıdaş devletler bu tutuma itiraz etmektedir.
> Türkiye has published no boundary coordinates in the Aegean, west of 28°E, or east of A/74/550 section A. The areas below are this project's geometric construction from Türkiye's **stated legal position**. They do not show any other state's position, a court ruling or a negotiated outcome; Greece, the Greek Cypriot Administration, Egypt and other coastal states contest this position.

| `id` | Geometri / Geometry | Alan / Area | Köşe / Vertices | Parça, delik / Parts, holes |
|---|---|---|---|---|
| `tur-aegean-schematic` | MultiPolygon | ≈ 61 500 km² | 1 065 | 3, 10 |
| `tur-med-schematic` | MultiPolygon | ≈ 162 300 km² | 508 | 2, 4 |
| `tur-kktc-med-merged` (bkz. / see [KKTC](#kktc-ruhsat-sahaları--trnc-licence-areas)) | MultiPolygon | ≈ 192 300 km² | 641 | 2, 4 |

Özellikler / Properties: `id, name_tr, name_en, status: "schematic", basis_tr, basis_en, method_tr, method_en, sources` (+ `position_tr/en`, `contested`, `contested_by`, `attribution`, as on the other features). Yön / Winding: dış halka **saat yönünde**, delikler saat yönü tersine (d3-geo kuralı) / exterior rings **clockwise**, holes counter-clockwise (d3-geo convention), unlike the RFC 7946 order of the older features; the site's `rewind()` handles both.

### Türkçe

**Ortak yöntem.**
1. **Kıyılar ve sınıflandırma.** Natural Earth 10m ülkeler (admin-0) ve küçük adalar (kamu malı). Türkiye ana karası = Anadolu + Doğu Trakya poligonları; Yunanistan ana karası = Atina ve Selanik'i içeren poligon (Mora, Atika, Teselya, Makedonya, Trakya). Diğer tüm Yunan poligonları "Yunan adası" sayıldı (101 poligon; 28'i küçük adalar katmanından). Küçük adalar katmanındaki adacıklar, en yakın ülke (Türkiye/Yunanistan) poligonuna atandı (Türk: 19).
2. **Mesafe dönüşümü (raster).** Her kıyı kümesi ~200 m aralıkla örneklendi, 3 boyutlu k-d ağacına kondu; 22–30,4°D × 33,6–41,3°K arasındaki 0,005°'lik ızgaranın (1 681 × 1 541 düğüm) her düğümüne **küre üzerindeki** en kısa (büyük daire) uzaklık hesaplandı. Eşit uzaklık çizgileri ve karasuları sınırları marching squares (contourpy) ile doğrusal ara değerlemeyle çıkarıldı.
3. **Yunan adalarının karasuları: 6 dm** (Türkiye'nin tutumu; 2674 sayılı Kanun ve Dışişleri Bakanlığı "iki ülke de Ege'de 6 millik karasuları uygular"), adanın kıyısından (normal esas hat; düz esas hat yok) ölçüldü ve Girit, Rodos, Meis dahil **tüm** Yunan adalarına uygulandı. Türkiye kıyısına 12 dm'den yakın olduğu yerde (Midilli, Sakız, Sisam, İstanköy, Meis vb.) iki kıyı arası orta hatta kesildi; böylece dar boğazlarda Türk karasuları korunur.
4. **Genelleştirme.** Çıkarılacak küme (kara + yabancı karasuları) 600 m büyütüldü ve 450 m toleransla sadeleştirildi (Douglas–Peucker, LAEA metrik izdüşümde), ardından alandan çıkarıldı. Böylece alan karaya/yabancı karasularına hiçbir yerde değmez (en az ~145 m boşluk), resmî çizgiler (A/74/550, Mutabakat) ise olduğu gibi kalır. 5 km²'den küçük kopuk cepler atıldı (Ege: 4 cep, 0,8 km²; Akdeniz: 4 cep, 6,5 km²). 1e-4° ızgaraya oturtuldu; `is_valid` doğrulandı.
5. **Ege/Akdeniz ayrımı.** IHO S-23 (1953) deniz alanları, Marine Regions yayımıyla (CC BY 4.0): "Aegean Sea" (MRGID 3315) ve "Mediterranean Sea – Eastern Basin" (MRGID 4280). Bu, hukuki değil kartografik bir ayrımdır (Aspro Burnu – Rodos – Kerpe – Kaşot – Girit).

**Ege (`tur-aegean-schematic`).**
- Türkiye ana karası ile Yunanistan ana karası kıyıları arasındaki **orta (eşit uzaklık) hattı**, iki taraftaki **tüm adalar yok sayılarak** hesaplandı. Hat, Meriç ağzındaki kara sınırı ucundan (NE 10m: 40,7385°K 26,0440°D; hatta uzaklığı 117 m) güneye iner ve Girit'i ~25,40°D'de keser; Türkiye tarafı alındı.
- Her Yunan adası ve adacığının 6 dm karasuları çıkarıldı (yukarıdaki 3. madde). **Türk adaları** (Gökçeada, Bozcaada vb.) alan içinde kaldı; yalnızca kara parçaları çıkarıldı. Natural Earth 10m'de bulunmayan küçük Türk adacıkları (ör. Tavşan Adaları) kara olarak çıkarılamadığından dolgunun altında kalır.
- Kuzeyde Çanakkale Boğazı, IHO'nun Kumkale–Seddülbahir (Cape Helles) hattında kesildi (40,0428°K 26,1741°D – 40,0060°K 26,2114°D); Marmara alana dahil değildir.
- Alan kıyıdan başlar; Türk iç suları ve karasuları dahildir.

**Doğu Akdeniz (`tur-med-schematic`).**
- Alan, Türkiye'nin güney kıyısı (İskenderun Körfezi dahil) ile bildirilen dış sınırlar arasındaki denizdir: A/74/550 bölüm A (2011 Türkiye–KKTC hattı), bölüm C (32°16'18"D) ve bölüm B (Türkiye–Mısır orta hattı), ayrıca Libya Mutabakatı parçası.
- **En kısa düz bağlantılar (bu projenin yapısı):**
  1. Mutabakat **B** noktası → A/74/550 bölüm B'nin 28°D'deki batı ucu (A noktası): 127,7 km.
  2. Mutabakat **A** noktası → Girit ve güneydoğusundaki adacıkların 6 dm karasuları sınırındaki en yakın nokta (34,8274°K 26,1700°D): 63,1 km. Buradan batıya/kuzeye alan, Girit karasularının sınırını ve (Girit'in kuzeyinde) Ege alanını izler. Bu, bölüm D'deki "28°D batısında Türk kıta sahanlığı adaların karasularının dış sınırına uzanır" ifadesinin şematik uygulamasıdır.
  3. A/74/550 bölüm A'nın doğu ucu (23. nokta, 35°54'42"K 34°36'28"D) → Türkiye–Suriye kara sınırının kıyıdaki ucu (NE 10m: 35,9178°K 35,9113°D): 117,5 km.
- **Çıkarılanlar:** Kıbrıs adası ve 12 dm karasuları (Marine Regions "Cypriot 12 NM"); Yunan adalarının 6 dm karasuları (Rodos, Meis ve çevresi, Kerpe, Kaşot, Girit vb.; Türkiye kıyısına bindiği yerde orta hatla sınırlı); Suriye'nin 12 dm karasuları (UNCLOS azamisi; Türkiye ile orta hatla sınırlı). Bu, A/74/550'deki "yabancı karasuları hariç" mantığının uygulamasıdır.
- **KKTC:** 2011 Türkiye–KKTC Kıta Sahanlığı Sınırlandırma Anlaşması hattı (bölüm A), Türkiye'nin ve KKTC'nin kıta sahanlıklarını ayırır. KKTC'nin kendi deniz yetki alanı bu hattın **güneyinde** (KKTC tarafında) kalır; dolayısıyla bölüm A'nın Türkiye tarafına düşmez ve bu alana **dahil edilmedi**. (Ayrıca Kıbrıs adasının 12 dm karasuları tümüyle çıkarılmıştır.) KKTC'nin resmî ruhsat sahaları ayrı öğelerdir (`kktc-licence-A` … `-G`); Türkiye + KKTC birleşik alanı `tur-kktc-med-merged` öğesidir — bkz. [KKTC ruhsat sahaları](#kktc-ruhsat-sahaları--trnc-licence-areas).

**Uyarılar.**
- "Ana karalar arası orta hat", Türkiye'nin "hakkaniyet ilkeleri"nin basitleştirilmiş bir geometrik ifadesidir; gerçek bir sınırlandırma orantılılık, kıyı uzunlukları ve diğer özel koşulları da tartar. Adalar orta hat hesabında tamamen yok sayıldı, yalnızca 6 dm ile çevrelendi.
- EGAYDAAK kapsamındaki (egemenliği Türkiye'ye göre belirlenmemiş) adacıklar ayrıca işlenmedi: Natural Earth'ün atamasına göre Yunan sayıldı (temkinli seçim). Natural Earth 10m binlerce küçük adacığın hepsini içermez; eksik adacıkların karasuları çıkarılmamıştır. Kardak Kayalıkları Natural Earth'te yoktur; çevresi yakındaki Yunan adalarının 6 dm karasuları içinde kalır.
- Karasuları normal esas hattan (NE 10m kıyısı, ~1:10 milyon) ölçüldü; düz esas hatlar, alçak su çizgisi ayrıntısı ve Türk karasuları dış sınırı ayrıca çizilmedi.
- Kıbrıs 12 dm katmanı Marine Regions'ın yapısıdır ve hukuki değer taşımaz. Türkiye–Suriye yan sınırı belirlenmemiştir; doğu ucundaki bağlantı ve Suriye karasuları kesimi şematiktir.
- Ege/Akdeniz ayrımı IHO kartografik sınırıdır; hukuki bir ayrım değildir.
- Genelleştirme nedeniyle alan kıyıdan ve yabancı karasularından ~150 m ile ~1 km arası geri durur; bu bir yetki boşluğu anlamına gelmez.

### English

**Common method.**
1. **Coasts and classification.** Natural Earth 10m admin-0 countries and minor islands (public domain). Turkish mainland = the Anatolia + Eastern Thrace polygons; Greek mainland = the polygon containing Athens and Thessaloniki (Peloponnese, Attica, Thessaly, Macedonia, Thrace). Every other Greek polygon counts as a "Greek island" (101 polygons, 28 of them from the minor-islands layer). Minor-island features were assigned to the nearer of the Turkish/Greek polygons (Turkish: 19).
2. **Distance transform (raster).** Each coast set was sampled every ~200 m and put in a 3-D k-d tree; for every node of a 0.005° grid over 22–30.4°E × 33.6–41.3°N (1,681 × 1,541 nodes) the **spherical** (great-circle) distance to the nearest sample was computed. Equidistance lines and territorial-sea limits were extracted by marching squares (contourpy) with linear interpolation.
3. **Greek islands' territorial sea: 6 nm** (Türkiye's position; Act No. 2674 and the MFA: "both Türkiye and Greece presently exercise a 6 nautical miles breadth of territorial waters in the Aegean"), measured from the island coast (normal baseline; no straight baselines) and applied to **all** Greek islands, incl. Crete, Rhodes and Kastellorizo/Meis. Where it comes within 12 nm of the Turkish coast (Lesbos, Chios, Samos, Kos, Kastellorizo, etc.) it is cut at the median line between the two coasts, so Turkish waters in the narrow straits are kept.
4. **Generalisation.** The set to remove (land + foreign territorial seas) was grown by 600 m and simplified with a 450 m tolerance (Douglas–Peucker, in a LAEA metric projection), then subtracted. So the areas touch land or foreign territorial seas nowhere (minimum clearance ~145 m), while the official lines (A/74/550, MoU) stay exact. Detached pockets under 5 km² were dropped (Aegean: 4 pockets, 0.8 km²; Mediterranean: 4 pockets, 6.5 km²). Snapped to a 1e-4° grid; `is_valid` checked.
5. **Aegean/Mediterranean split.** IHO S-23 (1953) sea areas as published by Marine Regions (CC BY 4.0): "Aegean Sea" (MRGID 3315) and "Mediterranean Sea – Eastern Basin" (MRGID 4280). This split is cartographic, not legal (Cape Aspro – Rhodes – Karpathos – Kasos – Crete).

**Aegean (`tur-aegean-schematic`).**
- **Median (equidistance) line** between the Turkish mainland and Greek mainland coasts, **ignoring all islands** on both sides. It starts at the land-border terminus at the Evros/Meriç mouth (NE 10m: 40.7385°N 26.0440°E; 117 m from the line), runs south and crosses Crete at ~25.40°E; Türkiye's side is kept.
- The 6-nm territorial sea of every Greek island and islet is removed (item 3 above). **Turkish islands** (Gökçeada, Bozcaada, etc.) stay inside the area; only their land is removed. Small Turkish islets that are not in Natural Earth 10m (e.g. Tavşan Adaları) cannot be removed as land and lie under the fill.
- In the north the Dardanelles are cut at the IHO Kumkale–Cape Helles line (40.0428°N 26.1741°E – 40.0060°N 26.2114°E); the Sea of Marmara is not included.
- The area starts at the coast and includes Turkish internal waters and territorial sea.

**Eastern Mediterranean (`tur-med-schematic`).**
- The area is the sea between Türkiye's southern coast (incl. the Gulf of İskenderun) and the notified outer limits: A/74/550 section A (2011 Türkiye–TRNC line), section C (32°16'18"E) and section B (Türkiye–Egypt median line), plus the Libya MoU segment.
- **Shortest straight connectors (this project's construction):**
  1. MoU point **B** → western end of A/74/550 section B at 28°E (point A): 127.7 km.
  2. MoU point **A** → nearest point on the 6-nm territorial-sea limit of Crete and its south-eastern islets (34.8274°N 26.1700°E): 63.1 km. From there the area follows Crete's territorial-sea limit and, north of Crete, meets the Aegean area. This is a schematic reading of section D: west of 28°E Türkiye's shelf "extends to the outer limits of territorial waters of the islands".
  3. Eastern end of A/74/550 section A (point 23, 35°54'42"N 34°36'28"E) → Türkiye–Syria land-border terminus on the coast (NE 10m: 35.9178°N 35.9113°E): 117.5 km.
- **Removed:** the island of Cyprus and its 12-nm territorial sea (Marine Regions "Cypriot 12 NM"); the 6-nm territorial sea of Greek islands (Rhodes, Kastellorizo/Meis and neighbours, Karpathos, Kasos, Crete, etc.; cut at the median where it overlaps the Turkish coast); Syria's 12-nm territorial sea (UNCLOS maximum; median-line cut against Türkiye). This applies the "except foreign territorial waters" logic of A/74/550.
- **TRNC:** the 2011 Türkiye–TRNC Continental Shelf Delimitation Agreement line (section A) separates the shelves of Türkiye and the TRNC. The TRNC's own maritime area lies **south** of that line (on the TRNC side), so it does not fall on Türkiye's side of section A and is **not included**. (The island's 12-nm territorial sea is also removed in full.) The TRNC's official licence areas are separate features (`kktc-licence-A` … `-G`); the combined Türkiye + TRNC area is `tur-kktc-med-merged`, see [TRNC licence areas](#kktc-ruhsat-sahaları--trnc-licence-areas).

**Caveats.**
- The "mainland-to-mainland median" is a simplified geometric expression of Türkiye's "equitable principles"; a real delimitation would also weigh proportionality, coastal lengths and other special circumstances. Islands are ignored entirely in the median and only enclaved with 6 nm.
- Islets covered by Türkiye's EGAYDAAK position (sovereignty not determined, in Türkiye's view) are not treated separately: they follow Natural Earth's attribution and count as Greek (a conservative choice). Natural Earth 10m does not contain every one of the thousands of Aegean islets; the territorial seas of missing islets are not removed. The Kardak Rocks are not in Natural Earth; their surroundings fall inside the 6-nm territorial seas of nearby Greek-held islands.
- Territorial seas are measured from the normal baseline (NE 10m coast, ~1:10 million); straight baselines, low-water detail and the Turkish territorial-sea limit are not drawn.
- The Cyprus 12-nm layer is Marine Regions' construction and has no legal value. The Türkiye–Syria lateral boundary is undelimited; the eastern connector and the Syrian territorial-sea cut are schematic.
- The Aegean/Mediterranean split is the IHO cartographic limit, not a legal one.
- Because of generalisation the areas stand ~150 m to ~1 km off coasts and foreign territorial seas; this does not imply a jurisdictional gap.

---

## KKTC ruhsat sahaları / TRNC licence areas

> **Resmî köşe koordinatları; KKTC'nin ve Türkiye'nin tutumu / Official corner coordinates; the TRNC's and Türkiye's position.** Yedi saha (`kktc-licence-A` … `-G`) KKTC Resmî Gazetesi'nde yayımlanmış tablolardan harfiyen aktarılmıştır; hiçbir köşe haritadan ya da görselden alınmamıştır. KKTC'yi yalnızca Türkiye tanır; GKRY ve Yunanistan sahalara itiraz eder. Türkiye'nin ve KKTC'nin tutumuna göre Kıbrıs Türkleri adanın doğal kaynakları üzerinde eşit haklara sahiptir. Birleşik alan `tur-kktc-med-merged` ise **şematiktir** (bu projenin yapısı).
> The seven areas (`kktc-licence-A` … `-G`) are transcribed verbatim from tables published in the TRNC Official Gazette; no corner was taken from a map or picture. The TRNC is recognised only by Türkiye; the Greek Cypriot Administration and Greece contest the areas. In Türkiye's and the TRNC's position, Turkish Cypriots have equal rights over the island's natural resources. The merged area `tur-kktc-med-merged` is **schematic** (this project's construction).

| Saha / Area (`id`) | Resmî köşe / Official corners | Yayımlanan poligon / Published polygon | NE 10m kara / land | Kırpılmış / Clipped (`area_km2`) | Çıktı köşe / Output vertices |
|---|---|---|---|---|---|
| A (`kktc-licence-A`) | 7 | 765 km² | 0.0 km² | 766 km² ¹ | 8 |
| B (`kktc-licence-B`) | 4 | 746 km² | 0.0 km² | 746 km² | 9 |
| C (`kktc-licence-C`) | 13 | 2,856 km² | 2.2 km² | 2,853 km² | 15 |
| D (`kktc-licence-D`) | 16 | 1,727 km² | 49.1 km² | 1,670 km² | 27 |
| E (`kktc-licence-E`) | 6 | 3,456 km² | 7.6 km² | 3,445 km² | 18 |
| F (`kktc-licence-F`) | 7 | 11,500 km² | 0.0 km² | 11,499 km² | 8 |
| G (`kktc-licence-G`) | 6 | 8,907 km² | 0.0 km² | 8,907 km² | 7 |
| **Toplam / Total** | **59** | **29,957 km²** | **58.9 km²** | **29,887 km²** | **92** |
| `tur-kktc-med-merged` | — | — | — | ≈ 192,293 km² | 641 (2 parça / parts, 4 delik / holes) |

Alanlar WGS84 elipsoidi üzerinde jeodezik (pyproj `Geod`). / Areas are geodesic on the WGS84 ellipsoid (pyproj `Geod`). ¹ 4 ondalığa yuvarlama / rounding to 4 decimals (±1 km²). Yedi saha birbirine değer, örtüşmez ve tek bir bitişik alan oluşturur. / The seven areas touch without overlapping and form one contiguous area.

### Türkçe

**Kaynak (koordinatlar).** KKTC Bakanlar Kurulu'nun 22.9.2011 tarihli **K(II)1195-2011** sayılı "Türkiye Petrolleri Anonim Ortaklığı (TPAO)'nın Ruhsat Talebi" kararı (Önerge No: 1923/2011, KKTCBb.): "Bakanlar Kurulu, Türkiye Petrolleri Anonim Ortaklığı (TPAO)'ya ekte sunulan saha tarifleri alanlarında petrol ve doğal gaz araştırma ruhsatı verilmesini onayladı." Yayım: **KKTC Resmî Gazete Sayı 161, 22 Eylül 2011, EK IV Bölüm I (Sayı 105)**, s. 1063 (karar) ve s. 1064–1066 (tablolar **AR/KKTC/A … AR/KKTC/G**: köşe no, enlem, boylam, X, Y). PDF: <https://basimevi.gov.ct.tr/Portals/6/2011/161.pdf> (KKTC Devlet Basımevi, 2011 arşiv dizini: <https://basimevi.gov.ct.tr/AR%C5%9E%C4%B0V/2011>). Erişim: 2026-09-13.

**Sonraki kararlar (koordinat içermez).**
- **K(II)1571-2011** (11.11.2011): Ekonomi ve Enerji Bakanı Sunat Atun ile TPAO Genel Müdürü Mehmet Uysal'ın 2 Kasım 2011'de imzaladığı "Petrol Sahası Hizmetleri ve Üretim ve Paylaşımı Sözleşmesi" onaylandı — RG Sayı 198, 23 Kasım 2011, EK IV Bölüm I, s. 1280 (<https://basimevi.gov.ct.tr/Portals/6/2011/198.pdf>).
- **H(K-I)2820-2017** (24.10.2017): sözleşmenin 1. maddesini değiştiren "Değişiklik Mutabakatı" onaylandı — RG Sayı 182, 6 Kasım 2017, EK IV Bölüm I, s. 1552 (<https://basimevi.gov.ct.tr/Portals/6/2017/182.pdf>). Mutabakatın metni Resmî Gazete'de yoktur (bkz. Uyarılar).
- **Ö(K-I)1610-2023** (18.10.2023): 11.11.2023'te sona erecek arama ruhsatı süresi altı yıl uzatıldı — RG Sayı 219, 19 Ekim 2023, EK IV Bölüm I, s. 998 (<https://basimevi.gov.ct.tr/Portals/6/2023/219.pdf>).
- Devlet Basımevi'nin 2011–2025 arşiv dizinlerindeki karar başlıklarında "TPAO", "Petrolleri Anonim", "AR/KKTC", "arama ruhsat", "hidrokarbon", "petrol sahası" araması başka bir saha kararı ya da koordinat değişikliği göstermedi.

**Aktarım ve denetim.** PDF bir taramadır; içindeki OCR metin katmanı bozuktur ve **kullanılmadı**. Tablolar 300 dpi sayfa görüntülerinden okunarak `tools/geo/kktc_licences.csv` dosyasına harfiyen aktarıldı. Saniyeler SS"ss biçiminde basılıdır: 35°36'55"80''' = 35°36'55,80". Her köşe için hem coğrafi (enlem/boylam) hem grid (X/Y) değeri basılı olduğundan her satır kendi içinde denetlenir: enlem/boylam ED50 kabul edilip UTM 36K'ye çevrildiğinde basılı X/Y'yi **59 köşenin tamamında ≤ 0,62 m** farkla verir (ortalama 0,0 m; aşağıdaki tabloda "Δ grid"). Yanlış okunmuş tek bir rakam metreler–kilometreler düzeyinde fark olarak görünürdü. `build_kktc_licences.py` bu denetimi her üretimde yapar (eşik 1 m).

**Datum.** Resmî Gazete datum adı vermez. X/Y sütunları **ED50 / UTM 36K (EPSG:23036)** grid koordinatlarıdır (enlem/boylam WGS84 kabul edilseydi fark ~62 m olurdu); dolayısıyla yayımlanan enlem/boylam **ED50**'dir. WGS84'e EPSG **"ED50 to WGS 84 (4)"** dönüşümüyle çevrildi (kullanım alanı: Kıbrıs, kara ve deniz; üç parametre dX −104, dY −101, dZ −140 m; EPSG doğruluğu 26 m). Köşeler bu dönüşümle 118–123 m kayar (güneybatıya). Türkiye için tanımlı "ED50 to WGS 84 (30)" dönüşümü yalnızca 34,42°K kuzeyini kapsar (F ve G'yi kapsamaz); kuzey sahalarda iki dönüşüm arasındaki fark < 8 m'dir.

**İşleme.** Her tablo bir poligon (köşeler yayımlanan sırayla; A ve B'de 4, C'de 13, D'de 16 köşe vb.). Geçerlilik (`is_valid`) doğrulandı; sahalar birbiriyle örtüşmez (ortak kenarlardaki kayan nokta farkı ≤ 2 m²). Kara çıkarıldı: Natural Earth 10m kara, 150 m büyütülüp 100 m toleransla sadeleştirilerek (LAEA metrik izdüşüm); denizdeki resmî köşeler olduğu gibi kalır. Kara kesimleri: D 49,1 km² (Karpaz yarımadasının ucu), E 7,6 km², C 2,2 km². 1e-4° ızgaraya oturtuldu (4 ondalık, ~11 m), dış halka saat yönünde (şematik alanlarla aynı d3-geo kuralı). Özellikler: `id, name_tr, name_en, location_tr, location_en` (konum sözcükleri bu projenindir, Resmî Gazete'nin değil), `status: "licence", kind: "kktc-licence", licence_ref` (AR/KKTC/A…), `licensee: "TPAO", decision: "K(II)1195-2011", granted: "2011-09-22", basis_tr/en, position_tr/en, contested: true, contested_by: ["CYP (GKRY)", "Greece"], datum_source, datum_transformation, corners_published, area_km2, area_published_km2, method_tr/en, sources`.

**Durum değeri.** `claimed` yerine yeni bir `licence` değeri seçildi: `claimed` bu dosyada Türkiye'nin BM'ye bildirdiği sınır çizgileri içindir; ruhsat sahaları ise KKTC'nin idari işlemiyle belirlenmiş alanlardır. `kind: "kktc-licence"` ayrıca verildi; site bu değeri henüz ayrıca biçimlendirmez.

**Birleşik alan (`tur-kktc-med-merged`, şematik).** `tur-med-schematic` ile kırpılmış yedi sahanın birleşimi (dissolve). Bileşenler arasında 2 × 300 m'den dar şeritler, yalnızca sahaların 3 km yakınında morfolojik kapamayla dolduruldu (33,4 km²): (1) sahaların kuzey kenarları (WGS84'e çevrilmiş) ile sitedeki A/74/550 bölüm A çizgisi arasındaki 79–121 m'lik fark (aşağıdaki datum uyarısı), (2) B sahasının kuzey kenarı B4→B1, A/74/550 bölüm A'nın iki parçası üzerindeki iki noktayı birleştiren bir kiriştir ve 5. noktanın 360 m güneyinden geçer. Birleşimle kapanan ve `tur-med-schematic`'te olmayan delikler dolduruldu: Karpaz açığında, 2011 hattının kuzeyinde kalan Kıbrıs 12 dm karasuları kesiti (23,2 km² ve 9,1 km²; ayrıca 7 adet < 0,1 km² kenar artığı). Gerekçe: `tur-med-schematic` bu suları A/74/550'deki "yabancı karasuları hariç" ifadesi gereği çıkarmıştı; Türkiye + KKTC birleşik tutumunda KKTC kıyısı açığındaki sular "yabancı" değildir. Yunan adalarının karasuları delikleri (Meis vb.) korundu. Ardından Natural Earth 10m kara çıkarıldı. Sonuç: 2 parça, 4 delik, 641 köşe, ≈ 192 293 km² (162 341 + 29 887 km²; bileşenlerin örtüşmesi 0,7 km²). Özgün `tur-med-schematic` ve yedi saha ayrıca dosyada kalır.

**Uyarılar.**
- **A/74/550 bölüm A'nın datumu.** 26 saha köşesi A/74/550 bölüm A üzerindedir; bunların 22'si bölüm A noktalarının **aynı sayılarıdır** (≤ 1,5 m). Resmî Gazete'nin grid sütunları bu sayıların ED50 olduğunu gösterir. A/74/550 datum belirtmez; sitedeki `tur-med-cs-a74550-a` çizgisi (ve `tur-med-schematic`'in o kenarı) aynı sayıları WGS84 okur. 2011 Türkiye–KKTC anlaşmasının koordinatları da ED50 ise, sitedeki çizgi gerçek konumundan ~80–120 m kuzeydoğudadır. Bu PR mevcut öğeleri **değiştirmez**; bakımcının değerlendirmesine bırakılmıştır. (Saha kenarlarıyla çizgi arasındaki fark birleşik alanda doldurulmuştur.)
- Bazı köşeler kıyıdadır ya da kıyıya çok yakındır (B2/C3 Koruçam Burnu, B3 Güzelyurt Körfezi, D2/E6 Zafer Burnu yakını, E5 Gazimağusa açığı); sahalar kıyıya kadar uzanır. Natural Earth 10m (~1:10 milyon) kıyısı ile 150 m geri çekme nedeniyle kıyı kenarı genelleştirilmiştir.
- **2017 değişikliği.** H(K-I)2820-2017 sözleşmenin 1. maddesini değiştirir; mutabakat metni yayımlanmadığından sahaları etkileyip etkilemediği bilinmiyor. Resmî Gazete dizininde AR/KKTC tablolarını değiştiren bir karar bulunamadı; bu katman 2011 tablolarını gösterir.
- **Kara ruhsatları dahil değildir.** TPAO, sözleşme kapsamında 7 deniz ve 2 kara ruhsat alanında çalıştığını belirtir (<https://www.tpao.gov.tr/kktc>); K(II)1195-2011 yalnızca A–G deniz tablolarını içerir; kara ruhsatları (ör. H) bu katmanın konusu değildir.
- **F ve G** adanın güneyindedir; GKRY bu deniz alanında yetki iddia eder ve arama ruhsatları vermiştir (Kıbrıs Hidrokarbon Dairesi 5–12 numaralı blokları listeler: <https://hydrocarbons.gov.cy/en/licensing/exploration-activities>; sayfada blok koordinatı yoktur). Örtüşme bu projede hesaplanmadı.
- Bakılan diğer kaynaklar: BM belgeleri A/66/851 (GKRY, 15.6.2012), A/66/899 (Türkiye, 5.9.2012) ve A/68/857 (Türkiye, 25.4.2014) ruhsat sahası koordinatı içermez (A/68/857 yalnızca 2011 hattının 27 noktasını verir). harita.mavivatan.net'in JS paketi yalnızca atıf yaptığı belgeler için incelendi; ruhsat sahaları için resmî belge atfı bulunamadı ve geometrisi kullanılmadı. Haber grafikleri kullanılmadı.

### English

**Source (coordinates).** TRNC Council of Ministers decision **K(II)1195-2011** of 22 September 2011, "Türkiye Petrolleri Anonim Ortaklığı (TPAO)'nın Ruhsat Talebi" (TPAO's licence application; motion No. 1923/2011): "The Council of Ministers approved granting Türkiye Petrolleri Anonim Ortaklığı (TPAO) an oil and natural gas exploration licence in the areas described in the annex" (our translation). Published in the **TRNC Official Gazette No. 161, 22 September 2011, Annex IV Part I (No. 105)**, p. 1063 (decision) and pp. 1064–1066 (tables **AR/KKTC/A … AR/KKTC/G**: corner number, latitude, longitude, X, Y). PDF: <https://basimevi.gov.ct.tr/Portals/6/2011/161.pdf> (TRNC State Printing Office, 2011 archive index: <https://basimevi.gov.ct.tr/AR%C5%9E%C4%B0V/2011>). Retrieved 2026-09-13.

**Later decisions (no coordinates).**
- **K(II)1571-2011** (11 Nov 2011): approval of the "Petroleum Field Services and Production Sharing Agreement" signed on 2 Nov 2011 by the Minister of Economy and Energy, Sunat Atun, and TPAO's Director General, Mehmet Uysal: Official Gazette No. 198, 23 Nov 2011, Annex IV Part I, p. 1280.
- **H(K-I)2820-2017** (24 Oct 2017): approval of an "amendment memorandum" changing article 1 of the agreement: Official Gazette No. 182, 6 Nov 2017, Annex IV Part I, p. 1552. The memorandum's text is not in the gazette (see caveats).
- **Ö(K-I)1610-2023** (18 Oct 2023): the exploration licence, due to expire on 11 Nov 2023, extended by six years: Official Gazette No. 219, 19 Oct 2023, Annex IV Part I, p. 998.
- A search of the decision titles in the State Printing Office archive indexes for 2011–2025 ("TPAO", "Petrolleri Anonim", "AR/KKTC", "arama ruhsat", "hidrokarbon", "petrol sahası") found no other decision on the areas and no coordinate change.

**Transcription and check.** The PDF is a scan whose OCR text layer is garbled and was **not used**. The tables were read from 300-dpi page images and transcribed verbatim into `tools/geo/kktc_licences.csv`. Seconds are printed as SS"ss: 35°36'55"80''' = 35°36'55.80". Because every corner is printed both as latitude/longitude and as grid X/Y, each row checks itself: read as ED50 and projected to UTM zone 36N, the latitudes/longitudes reproduce the printed X/Y for **all 59 corners to ≤ 0.62 m** (mean 0.0 m; column "Δ grid" below). A single misread digit would show up as a residual of metres to kilometres. `build_kktc_licences.py` repeats this check on every build (threshold 1 m).

**Datum.** The gazette names no datum. Its X/Y columns are **ED50 / UTM zone 36N (EPSG:23036)** grid coordinates (read as WGS84 the residual would be ~62 m), so the published latitudes/longitudes are **ED50**. They are converted to WGS84 with the EPSG transformation **"ED50 to WGS 84 (4)"** (area of use: Cyprus, onshore and offshore; three parameters dX −104, dY −101, dZ −140 m; EPSG accuracy 26 m), which moves the corners by 118–123 m (to the south-west). The Türkiye transformation "ED50 to WGS 84 (30)" only covers north of 34.42°N (not F and G); for the northern areas the two differ by < 8 m.

**Processing.** One polygon per table, corners in the published order. Validity (`is_valid`) checked; the areas do not overlap (float noise along shared edges ≤ 2 m²). Land removed: Natural Earth 10m land grown by 150 m and simplified with a 100 m tolerance (metric LAEA), so the official sea corners stay exact. Land removed: D 49.1 km² (tip of the Karpas peninsula), E 7.6 km², C 2.2 km². Snapped to a 1e-4° grid (4 decimals, ~11 m); exterior rings clockwise (the d3-geo convention used by the schematic areas). Properties: `id, name_tr, name_en, location_tr, location_en` (the location words are this project's, not the gazette's), `status: "licence", kind: "kktc-licence", licence_ref` (AR/KKTC/A…), `licensee: "TPAO", decision: "K(II)1195-2011", granted: "2011-09-22", basis_tr/en, position_tr/en, contested: true, contested_by: ["CYP (GKRY)", "Greece"], datum_source, datum_transformation, corners_published, area_km2, area_published_km2, method_tr/en, sources`.

**Status value.** A new value `licence` was chosen rather than `claimed`: in this file `claimed` marks the limit lines Türkiye notified to the UN, whereas the licence areas are set by an administrative act of the TRNC. `kind: "kktc-licence"` is given as well; the site does not style the value yet.

**Merged area (`tur-kktc-med-merged`, schematic).** Union (dissolve) of `tur-med-schematic` and the seven clipped areas. Slivers narrower than 2 × 300 m between the components are filled by morphological closing, only within 3 km of the licence areas (33.4 km²). They come from two sources. (1) The 79–121 m offset between the areas' northern edges (converted to WGS84) and the A/74/550 section A line as drawn on the site (see the datum caveat below). (2) Block B's northern edge B4→B1 is a chord between two points on two segments of section A and passes 360 m south of point 5. Holes that only close because of the merge, and that `tur-med-schematic` does not have, are filled. These are the part of the Cyprus 12-nm territorial-sea cut-out north of the 2011 line off Karpas (23.2 km² and 9.1 km², plus 7 edge remnants < 0.1 km²). Rationale: `tur-med-schematic` removed these waters because A/74/550 says "except foreign territorial waters"; in a combined Türkiye + TRNC position, waters off the TRNC coast are not foreign. The Greek islands' territorial-sea holes (Kastellorizo/Meis etc.) are kept. Natural Earth 10m land is then removed. Result: 2 parts, 4 holes, 641 vertices, ≈ 192,293 km² (162,341 + 29,887 km²; the components overlap by 0.7 km²). The original `tur-med-schematic` and the seven areas remain in the file.

**Caveats.**
- **Datum of A/74/550 section A.** 26 licence corners lie on A/74/550 section A, and 22 of them are **the same numbers** as section A points (≤ 1.5 m). The gazette's grid columns show these numbers are ED50. A/74/550 states no datum; the site's `tur-med-cs-a74550-a` line (and that edge of `tur-med-schematic`) reads the same numbers as WGS84. If the 2011 Türkiye–TRNC agreement coordinates are also ED50, the line as drawn is ~80–120 m north-east of its true position. This PR does **not** change the existing features and leaves this to the maintainer. (The gap between the licence edges and the line is filled in the merged area.)
- Some corners lie on or very near the coast (B2/C3 Cape Kormakitis, B3 Morphou Bay, D2/E6 near Cape Apostolos Andreas, E5 off Famagusta); the areas reach the coast. The coastal edge is generalised (Natural Earth 10m, ~1:10 million, 150 m set-back).
- **2017 amendment.** H(K-I)2820-2017 changes article 1 of the agreement; its text is not published, so whether it affects the areas is unknown. No decision changing the AR/KKTC tables was found in the gazette index; this layer shows the 2011 tables.
- **Onshore licences not included.** TPAO says it works in 7 offshore and 2 onshore licence areas under the agreement (<https://www.tpao.gov.tr/kktc>); K(II)1195-2011 contains only the offshore tables A–G, and onshore licences (e.g. H) are outside this layer.
- **F and G** lie south of the island, where the Greek Cypriot Administration claims jurisdiction and has issued exploration licences (the Cyprus Hydrocarbons Service lists blocks 5–12: <https://hydrocarbons.gov.cy/en/licensing/exploration-activities>; the page gives no block coordinates). The overlap was not computed.
- Other sources checked: UN documents A/66/851 (Greek Cypriot letter, 15 Jun 2012), A/66/899 (Türkiye, 5 Sep 2012) and A/68/857 (Türkiye, 25 Apr 2014) contain no licence-area coordinates (A/68/857 gives only the 27 points of the 2011 line). The JS bundle of harita.mavivatan.net was inspected only for cited documents; it cites no official document for the licence areas, and its geometry was not used. News graphics were not used.

### Koordinat tablosu / Coordinate table

KKTC Resmî Gazete Sayı 161 (22.9.2011), s. 1064–1066, AR/KKTC/A–G; enlem/boylam ve X/Y basıldığı gibi (ED50; X = kuzey, Y = doğu, UTM 36K). WGS84 sütunları: "ED50 to WGS 84 (4)" ile dönüştürülmüş, 4 ondalık. Δ grid: basılı enlem/boylamın ED50 UTM 36K karşılığı ile basılı X/Y arasındaki fark. / As printed (ED50; X = northing, Y = easting, UTM zone 36N). WGS84 columns: converted with "ED50 to WGS 84 (4)", 4 decimals. Δ grid: distance between the ED50 UTM 36N projection of the printed lat/lon and the printed X/Y.

| Saha / Area | Köşe / Corner | Enlem / Lat (ED50) | Boylam / Lon (ED50) | X (m) | Y (m) | WGS84 lat | WGS84 lon | Δ grid (m) |
|---|---|---|---|---|---|---|---|---|
| A | 1 | 35°36'55.80" | 32°42'41.30" | 3,941,404.29 | 473,868.82 | 35.6144 | 32.7112 | 0.02 |
| A | 2 | 35°30'02.88" | 32°42'41.30" | 3,928,682.95 | 473,831.57 | 35.4997 | 32.7112 | 0.02 |
| A | 3 | 35°17'56.04" | 32°16'18.00" | 3,906,495.92 | 433,777.47 | 35.2978 | 32.2713 | 0.02 |
| A | 4 | 35°33'09.58" | 32°16'18.00" | 3,934,640.50 | 433,984.87 | 35.5516 | 32.2713 | 0.03 |
| A | 5 | 35°33'41.91" | 32°21'12.35" | 3,935,584.89 | 441,402.49 | 35.5606 | 32.3531 | 0.05 |
| A | 6 | 35°33'47.28" | 32°31'50.80" | 3,935,659.24 | 457,476.09 | 35.5621 | 32.5305 | 0.04 |
| A | 7 | 35°35'38.36" | 32°37'51.98" | 3,939,042.81 | 466,581.33 | 35.5929 | 32.6308 | 0.04 |
| B | 1 | 35°39'42.12" | 32°55'33.96" | 3,946,492.57 | 493,310.95 | 35.6606 | 32.9258 | 0.01 |
| B | 2 | 35°24'08.88" | 32°55'33.96" | 3,917,740.69 | 493,289.39 | 35.4014 | 32.9258 | 0.62 |
| B | 3 | 35°11'04.53" | 32°42'41.30" | 3,893,613.67 | 473,729.41 | 35.1835 | 32.7112 | 0.04 |
| B | 4 | 35°36'55.80" | 32°42'41.30" | 3,941,404.29 | 473,868.82 | 35.6144 | 32.7112 | 0.02 |
| C | 1 | 35°43'27.48" | 34°00'00.00" | 3,953,894.01 | 590,445.75 | 35.7232 | 33.9997 | 0.00 |
| C | 2 | 35°26'59.64" | 34°00'00.00" | 3,923,458.86 | 590,754.91 | 35.4488 | 33.9997 | 0.01 |
| C | 3 | 35°24'08.88" | 32°55'33.96" | 3,917,740.69 | 493,289.39 | 35.4014 | 32.9258 | 0.62 |
| C | 4 | 35°39'42.12" | 32°55'33.96" | 3,946,492.57 | 493,310.95 | 35.6606 | 32.9258 | 0.01 |
| C | 5 | 35°39'53.68" | 32°56'36.62" | 3,946,847.66 | 494,886.65 | 35.6639 | 32.9432 | 0.04 |
| C | 6 | 35°40'59.87" | 33°02'50.10" | 3,948,886.44 | 504,275.68 | 35.6822 | 33.0469 | 0.02 |
| C | 7 | 35°40'55.19" | 33°10'19.71" | 3,948,754.87 | 515,577.49 | 35.6809 | 33.1718 | 0.04 |
| C | 8 | 35°41'19.46" | 33°19'40.16" | 3,949,538.50 | 529,662.85 | 35.6877 | 33.3275 | 0.02 |
| C | 9 | 35°40'58.55" | 33°23'18.54" | 3,948,914.34 | 535,154.31 | 35.6819 | 33.3882 | 0.06 |
| C | 10 | 35°41'14.62" | 33°32'33.84" | 3,949,475.50 | 549,109.96 | 35.6863 | 33.5424 | 0.06 |
| C | 11 | 35°41'45.87" | 33°38'16.03" | 3,950,490.05 | 557,704.81 | 35.6950 | 33.6375 | 0.02 |
| C | 12 | 35°42'04.42" | 33°45'08.53" | 3,951,134.98 | 568,067.71 | 35.7002 | 33.7521 | 0.05 |
| C | 13 | 35°42'29.67" | 33°53'00.87" | 3,952,011.85 | 579,931.36 | 35.7072 | 33.8833 | 0.04 |
| D | 1 | 35°49'09.89" | 34°48'51.63" | 3,965,501.64 | 663,910.28 | 35.8184 | 34.8141 | 0.04 |
| D | 2 | 35°42'05.04" | 34°35'48.84" | 3,952,068.36 | 644,477.80 | 35.7003 | 34.5966 | 0.01 |
| D | 3 | 35°26'59.64" | 34°00'00.00" | 3,923,458.86 | 590,754.91 | 35.4488 | 33.9997 | 0.01 |
| D | 4 | 35°43'27.48" | 34°00'00.00" | 3,953,894.01 | 590,445.75 | 35.7232 | 33.9997 | 0.00 |
| D | 5 | 35°43'50.53" | 34°02'48.04" | 3,954,648.25 | 594,660.15 | 35.7296 | 34.0464 | 0.03 |
| D | 6 | 35°45'06.63" | 34°06'06.90" | 3,957,047.69 | 599,629.74 | 35.7508 | 34.1016 | 0.05 |
| D | 7 | 35°45'44.45" | 34°10'13.09" | 3,958,284.55 | 605,799.21 | 35.7613 | 34.1700 | 0.04 |
| D | 8 | 35°48'11.90" | 34°14'21.39" | 3,962,904.44 | 611,977.34 | 35.8023 | 34.2390 | 0.05 |
| D | 9 | 35°49'46.78" | 34°18'51.64" | 3,965,916.26 | 618,721.48 | 35.8286 | 34.3141 | 0.04 |
| D | 10 | 35°51'41.52" | 34°24'51.49" | 3,969,577.57 | 627,699.97 | 35.8605 | 34.4140 | 0.04 |
| D | 11 | 35°52'57.08" | 34°28'43.55" | 3,971,991.91 | 633,485.45 | 35.8815 | 34.4785 | 0.03 |
| D | 12 | 35°54'25.61" | 34°33'30.51" | 3,974,831.69 | 640,637.86 | 35.9061 | 34.5582 | 0.02 |
| D | 13 | 35°54'42.21" | 34°36'28.50" | 3,975,415.51 | 645,091.48 | 35.9107 | 34.6077 | 0.03 |
| D | 14 | 35°54'06.98" | 34°40'56.92" | 3,974,443.29 | 651,838.83 | 35.9009 | 34.6822 | 0.01 |
| D | 15 | 35°52'55.05" | 34°44'01.02" | 3,972,307.48 | 656,493.76 | 35.8809 | 34.7334 | 0.05 |
| D | 16 | 35°51'19.93" | 34°46'40.60" | 3,969,448.34 | 660,548.87 | 35.8545 | 34.7777 | 0.04 |
| E | 1 | 35°49'09.89" | 34°48'51.63" | 3,965,501.64 | 663,910.28 | 35.8184 | 34.8141 | 0.04 |
| E | 2 | 35°12'09.60" | 34°48'51.63" | 3,897,087.96 | 665,169.07 | 35.2016 | 34.8141 | 0.04 |
| E | 3 | 34°55'00.00" | 34°20'59.64" | 3,864,694.27 | 623,314.75 | 34.9156 | 34.3496 | 0.03 |
| E | 4 | 35°05'45.60" | 34°17'34.80" | 3,884,515.25 | 617,859.03 | 35.0949 | 34.2927 | 0.00 |
| E | 5 | 35°04'08.04" | 34°00'10.44" | 3,881,205.02 | 591,445.13 | 35.0678 | 34.0026 | 0.01 |
| E | 6 | 35°42'05.04" | 34°35'48.84" | 3,952,068.36 | 644,477.80 | 35.7003 | 34.5966 | 0.01 |
| F | 1 | 35°12'09.60" | 34°48'51.63" | 3,897,087.96 | 665,169.07 | 35.2016 | 34.8141 | 0.04 |
| F | 2 | 34°41'20.40" | 34°47'56.40" | 3,840,088.21 | 664,797.28 | 34.6879 | 34.7987 | 0.00 |
| F | 3 | 34°17'52.80" | 34°30'18.00" | 3,796,282.84 | 638,508.21 | 34.2969 | 34.5047 | 0.00 |
| F | 4 | 34°10'00.00" | 34°20'00.00" | 3,781,497.95 | 622,898.93 | 34.1656 | 34.3331 | 0.04 |
| F | 5 | 34°10'00.00" | 32°42'41.30" | 3,780,732.38 | 473,406.01 | 34.1656 | 32.7112 | 0.03 |
| F | 6 | 34°25'58.80" | 32°42'41.30" | 3,810,265.17 | 473,489.82 | 34.4319 | 32.7112 | 0.02 |
| F | 7 | 34°55'00.00" | 34°20'59.64" | 3,864,694.27 | 623,314.75 | 34.9156 | 34.3496 | 0.03 |
| G | 1 | 34°10'00.00" | 34°20'00.00" | 3,781,497.95 | 622,898.93 | 34.1656 | 34.3331 | 0.04 |
| G | 2 | 33°52'22.00" | 33°57'29.00" | 3,748,520.99 | 588,611.53 | 33.8717 | 33.9578 | 0.05 |
| G | 3 | 33°39'14.40" | 33°36'57.60" | 3,724,020.90 | 557,118.79 | 33.6529 | 33.6157 | 0.00 |
| G | 4 | 33°23'56.40" | 33°12'14.40" | 3,695,596.94 | 518,971.43 | 33.3979 | 33.2037 | 0.01 |
| G | 5 | 33°16'37.20" | 32°42'41.30" | 3,682,089.48 | 473,130.23 | 33.2759 | 32.7112 | 0.03 |
| G | 6 | 34°10'00.00" | 32°42'41.30" | 3,780,732.38 | 473,406.01 | 34.1656 | 32.7112 | 0.03 |

---

## Kaynak belgeler / Source documents

| Belge / Document | Sembol / Symbol | URL | Kullanım / Use |
|---|---|---|---|
| Letter dated 13 Nov 2019 from the Permanent Representative of Turkey (annex: coordinates of the outer limits of Turkey's continental shelf in the Eastern Mediterranean) | A/74/550 | https://documents.un.org/api/symbol/access?l=en&t=pdf&s=A/74/550 | Sections A, B, C, D |
| Letter dated 18 Mar 2020 from the Permanent Representative of Turkey (annex: points F and E per the Libya MoU) | A/74/757 | https://documents.un.org/api/symbol/access?l=en&t=pdf&s=A/74/757 | MoU segment |
| MoU between Turkey and the GNA-State of Libya on Delimitation of the Maritime Jurisdiction Areas in the Mediterranean, 27 Nov 2019 | UNTS reg. 56119 | https://www.un.org/depts/los/LEGISLATIONANDTREATIES/PDFFILES/TREATIES/Turkey_11122019_%28HC%29_MoU_Libya-Delimitation-areas-Mediterranean.pdf | Art. I(1) points A, B (WGS84) |
| DOALOS Maritime Space — Türkiye | — | https://www.un.org/depts/los/LEGISLATIONANDTREATIES/STATEFILES/TUR.htm | Index of treaties and communications |
| Protocol USSR–Turkey, territorial waters boundary, 17 Apr 1973 | UNTS 14475 | https://www.un.org/depts/los/LEGISLATIONANDTREATIES/PDFFILES/TREATIES/GEO-TUR1973MB.PDF | Black Sea |
| Agreement Turkey–USSR, continental shelf in the Black Sea, 23 Jun 1978 | UNTS 20344 | https://www.un.org/depts/los/LEGISLATIONANDTREATIES/PDFFILES/TREATIES/TUR-RUS1978CS.PDF | Black Sea; 12 turning points (cross-check) |
| Exchange of notes, USSR–Turkey EEZ, 23 Dec 1986 – 6 Feb 1987 | UNTS 24690 | https://www.un.org/depts/los/LEGISLATIONANDTREATIES/PDFFILES/TREATIES/RUS-TUR1987EZ.PDF | Black Sea |
| Agreement Turkey–Bulgaria, Mutludere/Rezovska and Black Sea delimitation, 4 Dec 1997 | UNTS 36204 | https://www.un.org/depts/los/LEGISLATIONANDTREATIES/PDFFILES/TREATIES/TUR-BGR1997MB.PDF | Black Sea; points 1–10 (cross-check) |
| Protocol Turkey–Georgia, confirmation of maritime boundaries, 14 Jul 1997 | — | https://www.un.org/depts/los/LEGISLATIONANDTREATIES/PDFFILES/TREATIES/TUR-GEO1997BS.PDF | Black Sea |
| Decree No. 86/11264 (Black Sea EEZ), 17 Dec 1986 | — | https://www.un.org/depts/los/LEGISLATIONANDTREATIES/PDFFILES/TUR_1986_Decree.pdf | Black Sea |
| Act No. 2674 on the Territorial Sea, 20 May 1982 | — | https://www.un.org/depts/los/LEGISLATIONANDTREATIES/PDFFILES/TUR_1982_Act.pdf | Aegean omission rationale; 6-nm breadth (schematic areas) |
| Marine Regions Maritime Boundaries — Turkish EEZ (MRGID 5697); Cypriot 12 NM | — | https://www.marineregions.org/gazetteer.php?p=details&id=5697 · WFS `https://geo.vliz.be/geoserver/MarineRegions/wfs` | Black Sea polygon; Cyprus TS cut-out (line C and schematic Med area) |
| Marine Regions IHO Sea Areas (IHO S-23, 1953) — Aegean Sea (MRGID 3315), Mediterranean Sea – Eastern Basin (4280), Sea of Marmara (3369) | CC BY 4.0 | https://www.marineregions.org/gazetteer.php?p=details&id=3315 · https://www.marineregions.org/gazetteer.php?p=details&id=4280 · WFS `MarineRegions:iho` | Aegean/Mediterranean split; Dardanelles closing line (schematic areas) |
| Marine Regions licence, citation and disclaimer | CC BY 4.0 | https://www.marineregions.org/disclaimer.php | Licence |
| MFA: The Kardak Dispute (28 Jan 1996) | — | https://www.mfa.gov.tr/the-kardak-dispute.en.mfa | Kardak basis |
| MFA: Islands, Islets and Rocks in the Aegean Which Were Not Ceded to Greece by International Treaties | — | https://www.mfa.gov.tr/islands_-islets-and-rocks-in-the-aegean-which-were-not-ceded-to-greece-by-international-treaties.en.mfa | Kardak basis (EGAYDAAK) |
| MFA: The Breadth of Territorial Waters; The Delimitation of the Aegean Continental Shelf | — | https://www.mfa.gov.tr/the-breadth-of-territorial-waters.en.mfa · https://www.mfa.gov.tr/the-delimitation-of-the-aegean-continental-shelf.en.mfa | Aegean omission rationale (no coordinates); schematic Aegean basis (6 nm, delimitation by agreement) |
| Wikidata P625 | CC0 1.0 | per island in `sources` | Island points |
| Natural Earth 10m land | Public domain | https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip | Processing only (land subtraction, checks); not redistributed |
| Natural Earth 10m admin-0 countries; 10m minor islands | Public domain | https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip · https://naciscdn.org/naturalearth/10m/physical/ne_10m_minor_islands.zip | Schematic areas: mainland/island classification, coasts for the distance transform, land-border termini |
| KKTC Bakanlar Kurulu Kararı K(II)1195-2011 "TPAO'nun Ruhsat Talebi", 22.9.2011 — KKTC Resmî Gazete Sayı 161, 22 Eylül 2011, EK IV Bölüm I (Sayı 105), s. 1063–1066 | K(II)1195-2011 | https://basimevi.gov.ct.tr/Portals/6/2011/161.pdf · index https://basimevi.gov.ct.tr/AR%C5%9E%C4%B0V/2011 | TRNC licence areas A–G: corner tables AR/KKTC/A–G (lat/lon ED50 + UTM 36N X/Y) |
| KKTC Bakanlar Kurulu Kararı K(II)1571-2011, 11.11.2011 (Petrol Sahası Hizmetleri ve Üretim ve Paylaşımı Sözleşmesi onayı) — RG Sayı 198, 23.11.2011, EK IV Bölüm I, s. 1280 | K(II)1571-2011 | https://basimevi.gov.ct.tr/Portals/6/2011/198.pdf | Licence basis (no coordinates) |
| KKTC Bakanlar Kurulu Kararı H(K-I)2820-2017, 24.10.2017 (sözleşme 1. madde değişiklik mutabakatı) — RG Sayı 182, 6.11.2017, EK IV Bölüm I, s. 1552 | H(K-I)2820-2017 | https://basimevi.gov.ct.tr/Portals/6/2017/182.pdf | Caveat (amendment text not published) |
| KKTC Bakanlar Kurulu Kararı Ö(K-I)1610-2023, 18.10.2023 (arama ruhsatı süresinin altı yıl uzatılması) — RG Sayı 219, 19.10.2023, EK IV Bölüm I, s. 998 | Ö(K-I)1610-2023 | https://basimevi.gov.ct.tr/Portals/6/2023/219.pdf | Licence validity |
| TPAO — KKTC faaliyetleri (7 deniz, 2 kara ruhsat alanı) | — | https://www.tpao.gov.tr/kktc | Context (no coordinates) |
| Cyprus Hydrocarbons Service — exploration activities | — | https://hydrocarbons.gov.cy/en/licensing/exploration-activities | Caveat: Greek Cypriot licences (no coordinates) |
| Letters A/66/851 (Cyprus, 15 Jun 2012), A/66/899 (Türkiye, 5 Sep 2012), A/68/857 (Türkiye, 25 Apr 2014) | A/66/851 · A/66/899 · A/68/857 | https://documents.un.org/api/symbol/access?l=en&t=pdf&s=A/68/857 (same pattern for the others) | Checked: no licence-area coordinates; A/68/857 = the 27 points of the 2011 line |
| EPSG "ED50 to WGS 84 (4)" (Cyprus); ED50 / UTM zone 36N (EPSG:23036) | EPSG | via PROJ / pyproj | Datum check and conversion of the licence corners |

**Atıf / Attribution (CC BY 4.0):** Flanders Marine Institute (2026): MarineRegions.org. Available online at www.marineregions.org. Veri değiştirilmiştir (Karadeniz'e kırpıldı, sadeleştirildi; şematik alanlarda Kıbrıs 12 dm ve IHO deniz alanları yalnızca çıkarma/bölme için kullanıldı). / Data modified (clipped to the Black Sea, simplified; in the schematic areas the Cyprus 12 NM and IHO sea-area polygons are used only for subtraction/splitting).

---

## Doğrulama / Validation

Output of `build_maritime.py` (2026-09-13):

- `maritime-tur.geojson`: 15 features, 3,281 vertices (5 original features: 975; 2 schematic areas: 1,573; 7 TRNC licence areas: 92; merged Türkiye + TRNC area: 641); every geometry `is_valid`; ≤ 4 decimals. Original features: exterior ring counter-clockwise, holes clockwise. Schematic areas, licence areas and the merged area: exterior clockwise, holes counter-clockwise. A full `build_maritime.py` run reproduces the committed `maritime-tur.geojson` and `islands-tur.geojson` byte for byte.
- TRNC licence areas: printed lat/lon (as ED50) vs printed UTM 36N X/Y — max residual 0.62 m over 59 corners (as WGS84: ~62 m); ED50 → WGS84 shift 118–123 m; licence areas ∩ Natural Earth 10m land: 0 deg²; no overlaps between areas (≤ 2 m² float noise); 26 corners on A/74/550 section A, 79–121 m from the site's line after conversion.
- Merged area: 2 parts, 4 holes (those of `tur-med-schematic`), 641 vertices, ≈ 192,293 km²; slivers filled 33.4 km²; holes filled 32.3 km²; ∩ Natural Earth 10m land: 0 deg²; nothing of either component lost (checked at 2e-4°).
- Schematic areas ∩ (Natural Earth 10m land ∪ minor islands ∪ Greek islands' 6-nm TS ∪ Cyprus 12 nm ∪ Syria 12 nm): 0 deg². Minimum clearance to land: 144 m (Aegean), 146 m (Med); to Greek islands' 6-nm TS: 149 m, 220 m.
- Aegean median: Evros/Meriç land-border terminus lies 117 m from the computed line. Independent spot checks (planar LAEA distance to the NE polygons) on the line: 40.3°N 25.427°E — 66.26 km to Turkish vs 66.16 km to Greek mainland; 38.5°N 25.137°E — 98.06 vs 98.01 km; 35.8°N 25.346°E — 204.82 vs 204.74 km (Δ ≤ 0.1 km).
- Generalisation used: gap 600 m, simplification tolerance 450 m (smallest setting in the script that keeps both schematic areas ≤ 2,000 vertices).
- Black Sea polygon ∩ Natural Earth 10m land: 2.8e-4 deg² (≈ 2.6 km² of slivers along ~1,700 km of coast, due to simplification).
- Mediterranean lines crossing Natural Earth 10m land: none.
- Kardak → Anatolian mainland (NE 10m): 3.8 nm (MFA: "3.8 miles").
- Tavşan Adaları, Avşa and Cunda are not in Natural Earth 10m land; their points are from Wikidata and match Wikipedia.

Treaty turning point → Black Sea polygon boundary (metres):

| Agreement | Pt | Lat | Lon | Δ m |
|---|---|---|---|---|
| TUR–USSR 1978 | 1 | 41°35'41"N | 41°16'33"E | 3 |
| | 2 | 41°57'00"N | 40°41'33"E | 0 |
| | 3 | 42°01'52"N | 40°26'00"E | 2 |
| | 4 | 42°08'21"N | 39°49'37"E | 3 |
| | 5 | 42°20'15"N | 39°00'13"E | 0 |
| | 6 | 42°25'28"N | 38°32'10"E | 5 |
| | 7 | 43°10'55"N | 36°50'42"E | 4 |
| | 8 | 43°26'04"N | 36°10'57"E | 5 |
| | 9 | 43°26'08"N | 35°30'25"E | 5 |
| | 10 | 43°11'17"N | 34°13'10"E | 5 |
| | 11 | 43°11'50"N | 33°36'56"E | 2 |
| | 12 | 43°20'43"N | 32°00'00"E | 2 |
| TUR–BGR 1997 | 1 | 41°59'52"N | 28°19'26"E | 1723 (see caveats) |
| | 2 | 42°14'28"N | 29°20'45"E | 1 |
| | 3 | 42°26'24"N | 29°34'20"E | 0 |
| | 4 | 42°29'24"N | 29°49'36"E | 1 |
| | 5 | 42°33'27"N | 29°58'30"E | 0 |
| | 6 | 42°48'03"N | 30°34'10"E | 0 |
| | 7 | 42°49'31"N | 30°36'18"E | 2 |
| | 8 | 42°56'43"N | 30°45'06"E | 0 |
| | 9 | 43°19'54"N | 31°06'33"E | 0 |
| | 10 | 43°26'49"N | 31°20'43"E | 3 |
