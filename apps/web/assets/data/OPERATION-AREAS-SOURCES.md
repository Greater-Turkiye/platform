# Türkiye'nin ilan ettiği harekât bölgeleri — kaynaklar / Türkiye's announced operation areas — sources

[Türkçe](#türkçe) · [English](#english) · [Kaynak belgeler / Source documents](#kaynak-belgeler--source-documents) · [Lisans / Licence](#lisans--licence) · [Doğrulama / Validation](#doğrulama--validation)

Dosya / File: `tur-operation-areas.geojson`
Üretim / Build: `python tools/geo/build_operation_areas.py [--cache DIR] [--preview tools/geo/operation-areas-preview.png]` (shapely ≥ 2.1, pyshp, pyproj; matplotlib yalnızca önizleme için / only for the preview)
Girdiler / Inputs: `tools/geo/operation_areas.json` (adlar, tarihler, durum, notlar, nahiye p-kodları, kaynaklar / names, dates, status, notes, sub-district p-codes, sources)
Karar / Decision: handbook [ADR 0015](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0015-announced-operation-areas.md) (ADR 0014 §3'ün yerine geçer / supersedes ADR 0014 §3)
Erişim tarihi / Accessed: 2026-09-13 · Durum tarihi / Status as of: **2026-09-13**

> **Yalnızca alan düzeyi / Area level only.** Katman, Türk devletinin resmî olarak ilan ettiği harekât bölgelerini **bütün alanlar** olarak gösterir. Üs, karakol, gözlem noktası, kontrol noktası; birlik adı veya gücü; konuşlanma veya hareket; bölge içinde herhangi bir nokta verisi **yoktur** ve hiçbir özellik bunları tanımlayan bir alan taşımaz (derleme betiği anahtar adlarını denetler). Bölgeler bir cephe hattı değildir. Resmî TSK varlığı haritada yalnızca ülke düzeyinde kalır (ADR 0013 §3).
> The layer shows the operation areas officially announced by the Turkish state as **whole areas**. It contains **no** bases, observation posts, outposts or checkpoints, no unit names or strengths, no positions or movements and no point data inside a zone, and no feature carries a property describing them (the build script checks key names). The zones are not a front line. Official Turkish military presence stays at country level on the map (ADR 0013 §3).

> **Durum / Status.** Her özellik `status` (`active` | `ended` | `unclear`) ve `status_as_of` taşır. 2026-09-13 itibarıyla üç bölgenin üçü de `ended`: bölge artık **ayrı bir Türk kontrol alanı olarak** mevcut değildir. Harita durumu etiketlemeli ve `ended` bölgeleri güncel kontrol gibi göstermemelidir (ör. soluk dolgu ve "sona erdi / ended" etiketi).
> Every feature has `status` (`active` | `ended` | `unclear`) and `status_as_of`. As of 2026-09-13 all three zones are `ended`: the zone no longer exists **as a distinct Turkish-controlled area**. The map should label the status and must not style `ended` zones as current control (e.g. a faded fill and an "ended / sona erdi" label).

> **Şematik / Schematic.** `schematic: true` olan bölgelerin (`tur-op-firat-kalkani`, `tur-op-baris-pinari`) sınırı yaklaşıktır: Türkiye bir koordinat listesi yayımlamamıştır; poligon, ilan edilen kapsama karşılık gelen idari birimlerden bu projenin kurduğu bir yapıdır. `tur-op-zeytin-dali` Afrin ilçesinin idari sınırıdır.
> Zones with `schematic: true` (`tur-op-firat-kalkani`, `tur-op-baris-pinari`) have an approximate extent: Türkiye has published no coordinate list, and the polygon is this project's construction from the administrative units matching the announced scope. `tur-op-zeytin-dali` is the administrative boundary of the Afrin district.

---

## Türkçe

### Kapsam

| Öğe (`id`) | Harekât | İlan | Durum (`status_as_of`) | Alan | Geometri | Resmî dayanak |
|---|---|---|---|---|---|---|
| `tur-op-firat-kalkani` | Fırat Kalkanı | 24.08.2016 | `ended` (2026-09-13) | 2.291 km² (Türkiye: 2.015 km²) | **Şematik** — 8 nahiye | S/2016/739; MGK 29.03.2017; S/2018/53 |
| `tur-op-zeytin-dali` | Zeytin Dalı | 20.01.2018 | `ended` (2026-09-13) | 1.736 km² | Afrin ilçesi (7 nahiye) | S/2018/53; Cumhurbaşkanlığı 18.03.2018 |
| `tur-op-baris-pinari` | Barış Pınarı | 09.10.2019 | `ended` (2026-09-13) | 4.985 km² | **Şematik** — 4 nahiye ∩ Türkiye'ye 32 km | S/2019/804; Türkiye–ABD ortak açıklaması 17.10.2019; Soçi Mutabakat Muhtırası 22.10.2019 |

Özellik alanları: `id`, `kind` (`operation-area`), `name_tr/_en`, `operation_tr/_en`, `announced`, `status`, `status_as_of`, `schematic`, `note_tr/_en` (Türkiye'nin ilan ettiği harekât bölgesi olduğunu belirten kısa not), `status_note_tr/_en` (durumun gerekçesi ve kaynağı), `geometry_method_tr/_en`, `area_km2`, `admin_areas` (kullanılan OCHA nahiyeleri: p-kod, ad), `attribution`, `sources[]` (`title`, `publisher`, `url`, `date`, `accessed`; önce resmî kaynaklar).

### Durum (2026-09-13)

Aralık 2024'ten bu yana: Esad yönetimi düştü (8 Aralık 2024); Suriye Millî Ordusu (SMO) grupları 2025'te Suriye devlet yapılarına katıldı; Türkiye ile Suriye 13 Ağustos 2025'te Ortak Eğitim ve Danışmanlık Mutabakat Muhtırası imzaladı (MSB); Suriye hükümeti ile SDG 18 Ocak 2026'da ateşkes ve entegrasyon anlaşması açıkladı (Dışişleri Bakanlığı açıklaması No: 9); SDG 25 Ağustos 2026'da Suriye ordusuna katılımın tamamlandığını belirterek kendini feshetti. Buna göre:

- **Fırat Kalkanı — `ended`.** Harekât 29 Mart 2017'de tamamlandı (MGK). ISW'ye göre Suriye geçiş hükümeti, SMO'nun eskiden kontrol ettiği kuzey Halep kırsalının güvenlik ve idari sorumluluğunun tamamını taşıyor (21 Ocak 2026).
- **Zeytin Dalı — `ended`.** Suriye hükümeti güvenlik güçleri 6 Şubat 2025'te Afrin ve Cinderes'e girdi (ISW; Long War Journal). Güvenlik kaynaklarına göre Türk polisi ve jandarması Afrin'deki güvenlik görevini kademeli olarak Suriye makamlarına devretti (Daily Sabah, 1 Şubat 2026).
- **Barış Pınarı — `ended`.** ISW'ye göre Suriye hükümeti güvenlik birimleri "Barış Pınarı" bölgesinin genelinde görev yapıyor ve Tel Abyad ile Resulayn sınır kapılarını kontrol ediyor (21 Ocak 2026). Alanı tanımlayan 2019 düzenlemeleri YPG'nin geri çekilmesine dayanıyordu; SDG Ağustos 2026'da feshedildi.

Türkiye bu bölgelerin sona erdiğini (Fırat Kalkanı Harekâtı'nın 2017'deki tamamlanması dışında) ayrıca ilan etmedi. `ended`, bölgenin artık ayrı bir Türk kontrol alanı olmadığı anlamına gelir; Türkiye'nin Suriye'deki askerî varlığının sona erdiği anlamına **gelmez**. MSB, faaliyetlerin Suriye hükümetiyle koordineli yürütüldüğünü (1 Şubat 2026) ve Suriye'nin toprak bütünlüğü ile "tek devlet, tek ordu" anlayışının desteklendiğini (14 Ağustos 2025; 3 Eylül 2026) belirtiyor; TSK'nın Irak ve Suriye'deki görev süresi 30 Ekim 2025'ten itibaren üç yıl uzatıldı (TBMM). Bu varlık haritada yalnızca ülke düzeyinde gösterilir.

### Yöntem

1. **İdari sınırlar.** OCHA COD-AB Suriye (HDX, `syr_admin_boundaries.shp.zip`, katman `syr_admin3` = nahiyeler; HDX güncellemesi 26.01.2026; CC BY-IGO 3.0). Dosya SHA-256 ile sabitlendi (`operation_areas.json`); HDX yeni sürüm yayımlarsa betik durur ve inceleme ister. Her p-kodun adı betikte denetlenir.
2. **Bölge başına nahiyeler** (`admin_areas`):
   - Fırat Kalkanı: Azez, Suran, Ahterin, Mare (Azez ilçesi); er-Rai, El Bab (El Bab ilçesi); Cerablus, Gandura (Cerablus ilçesi). Tel Rıfat, Nubl, Tadef ve Arima alınmadı.
   - Zeytin Dalı: Afrin ilçesinin yedi nahiyesi (Afrin, Bülbül, Cinderes, Mabatlı, Raco, Şeran, Şeyh Hadid).
   - Barış Pınarı: Tel Abyad, Süluk, Ayn İsa (Tel Abyad ilçesi); Resulayn (Resulayn ilçesi). Derbasiye alınmadı.
3. **Derinlik (yalnızca Barış Pınarı).** Soçi Mutabakat Muhtırası (22.10.2019) alanı Tel Abyad ve Resulayn'ı içine alan, 32 km derinliğinde bir alan olarak tanımlar. Nahiye birleşimi, Türkiye'ye (Natural Earth 10m) 32 km içinde kalan kısımla sınırlandı (yerel Lambert azimut eşit alan izdüşümünde tampon). Ayn İsa nahiyesi yalnızca bu kuşağa giren kuzey kesimiyle girer; Ayn İsa merkezi Türkiye'ye 33,9 km uzaklıktadır ve alanın dışındadır (Tel Abyad merkezi 0,2 km, Süluk 8,3 km — derleme raporu).
4. **Temel harita kırpması.** Alanlar sitenin kendi Natural Earth 1:50m haritasındaki (`countries-50m.json`) Suriye'ye kırpıldı; böylece dolgu, sitenin çizdiği sınırı aşmaz. OCHA ile Natural Earth sınırları birkaç yüz metre ile birkaç km arasında farklıdır; kırpma Fırat Kalkanı'ndan 33,0 km², Zeytin Dalı'ndan 102,7 km², Barış Pınarı'ndan 59,7 km² çıkardı.
5. **Sadeleştirme.** Üç bölge birlikte kapsama sadeleştirmesiyle (shapely `coverage_simplify`, Visvalingam–Whyatt, tolerans 0,005°) sadeleştirildi; Zeytin Dalı ile Fırat Kalkanı'nın ortak sınırı birebir aynı kalır. Ardından sınırdan 0,75 ızgara hücresi içeri çekilmiş Suriye'ye yeniden kırpıldı, 1e-3° ızgaraya oturtuldu (3 ondalık, ≈ 110 m), dış halkalar saat yönünün tersine çevrildi (RFC 7946; site d3 için yeniden sarar).
6. **Önizleme:** `tools/geo/operation-areas-preview.png`.

### Dışarıda bırakılanlar

- **Irak'ın kuzeyi (Pençe harekâtları, ör. Pençe-Kilit, Nisan 2022).** MSB bölgeyi yalnızca adlarla tanımlar ("sözde Metina, Zap ve Avaşin-Basyan bölgeleri"); sınır, derinlik veya alan açıklanmamıştır ve bu adlar idari birimlere karşılık gelmez. TBMM tezkeresi de "hudut, şümul, miktar ve zamanı"nı Cumhurbaşkanının takdirine bırakır, bir alan tanımlamaz. Kaynaklı ve tanımlı bir alan olmadığı için eklenmedi.
- **İdlib.** Astana sürecindeki gerginliği azaltma bölgesi (2017) üç garantör devletin bölgesidir, Türkiye'nin ilan ettiği bir harekât bölgesi değildir; içindeki gözlem noktaları zaten kırmızı çizgi kapsamındadır. Bahar Kalkanı Harekâtı (Şubat–Mart 2020) bir alan tanımlamadı.
- **Hava harekâtları** (ör. Pençe-Kılıç, Kasım 2022): kara alanı ilan edilmedi.
- **Tel Rıfat ve Münbiç (Aralık 2024).** SMO'nun "Özgürlük Şafağı" harekâtıyla alındı (EUAA, Mart 2025); Türkiye'nin resmî olarak ilan ettiği bir harekât bölgesi değildir.
- **Genel "güvenli bölge" önerileri.** 17 Ekim 2019 Türkiye–ABD ortak açıklaması bir "güvenli bölge"den söz eder ama kapsamını vermez; çizilen yalnızca Soçi Mutabakat Muhtırası'nın tarif ettiği Barış Pınarı alanıdır.

### Uyarılar

- **Alanlar resmî rakamlarla birebir örtüşmez.** Fırat Kalkanı'nın şematik alanı (2.291 km²) Türkiye'nin açıkladığı 2.015 km²'den ~%14 büyüktür; harekât sınırı nahiye sınırlarını izlemiyordu. Barış Pınarı'nın doğu ve batı kenarları nahiye sınırlarıdır.
- **Zeytin Dalı:** ilan edilen hedef "Afrin"dir (S/2018/53); ilçenin tamamının kontrol altına alındığını söyleyen resmî bir metin burada kaynak olarak kullanılmadı; ilçe sınırı ilan edilen kapsamın idari karşılığı olarak kullanıldı (şematik değil).
- **Durum için resmî kaynak sınırlıdır.** Türkiye bölgelerin sona erdiğini ilan etmediğinden `ended` kararı, resmî açıklamaların (MSB, Dışişleri, TBMM) yanında ikincil kaynaklara (ISW, Daily Sabah'ın aktardığı güvenlik kaynakları, Long War Journal, Al Jazeera, France 24) dayanır.
- Şanlıurfa Valiliği'nin Mart 2026'da Barış Pınarı bölgesindeki birimlerini çektiğine dair bir basın haberi (T24) doğrulanamadı; kullanılmadı.
- OCHA sınırları BM'nin resmî onayı veya kabulü anlamına gelmez (CC BY-IGO feragatnamesi).

---

## English

### Scope

| Feature (`id`) | Operation | Announced | Status (`status_as_of`) | Area | Geometry | Official basis |
|---|---|---|---|---|---|---|
| `tur-op-firat-kalkani` | Euphrates Shield | 2016-08-24 | `ended` (2026-09-13) | 2,291 km² (Türkiye: 2,015 km²) | **Schematic** — 8 sub-districts | S/2016/739; National Security Council 29 Mar 2017; S/2018/53 |
| `tur-op-zeytin-dali` | Olive Branch | 2018-01-20 | `ended` (2026-09-13) | 1,736 km² | Afrin district (7 sub-districts) | S/2018/53; Presidency 18 Mar 2018 |
| `tur-op-baris-pinari` | Peace Spring | 2019-10-09 | `ended` (2026-09-13) | 4,985 km² | **Schematic** — 4 sub-districts ∩ 32 km from Türkiye | S/2019/804; Türkiye–US joint statement 17 Oct 2019; Sochi MoU 22 Oct 2019 |

Feature properties: `id`, `kind` (`operation-area`), `name_tr/_en`, `operation_tr/_en`, `announced`, `status`, `status_as_of`, `schematic`, `note_tr/_en` (short note stating it is Türkiye's announced operation area), `status_note_tr/_en` (reason and source for the status), `geometry_method_tr/_en`, `area_km2`, `admin_areas` (OCHA sub-districts used: p-code, names), `attribution`, `sources[]` (`title`, `publisher`, `url`, `date`, `accessed`; official sources first).

### Status (2026-09-13)

Since December 2024: the Assad government fell (8 Dec 2024); Syrian National Army (SNA) factions were absorbed into Syrian state structures in 2025; Türkiye and Syria signed a Joint Training and Consultancy Memorandum of Understanding on 13 Aug 2025 (Ministry of National Defence); the Syrian government and the SDF announced a ceasefire and integration agreement on 18 Jan 2026 (Turkish MFA statement No. 9); on 25 Aug 2026 the SDF dissolved itself after announcing that its integration into the Syrian army was complete. Accordingly:

- **Euphrates Shield — `ended`.** The operation was concluded on 29 Mar 2017 (National Security Council). According to ISW, the Syrian transitional government bears full security and administrative responsibility over the northern Aleppo countryside the SNA formerly controlled (21 Jan 2026).
- **Olive Branch — `ended`.** Syrian government security forces entered Afrin and Jandairis on 6 Feb 2025 (ISW; Long War Journal). According to security sources, Turkish police and gendarmerie gradually handed security in Afrin over to Syrian authorities (Daily Sabah, 1 Feb 2026).
- **Peace Spring — `ended`.** According to ISW, Syrian government security services operate across the "Peace Spring" region and the Syrian government controls the Tell Abyad and Ras al-Ayn border crossings (21 Jan 2026). The 2019 arrangements that defined the area rested on the YPG's withdrawal; the SDF was dissolved in August 2026.

Apart from the 2017 conclusion of Operation Euphrates Shield, Türkiye has not separately announced that these areas ended. `ended` means the area no longer exists as a distinct Turkish-controlled area; it does **not** mean that Turkish military presence in Syria has ended. The Ministry of National Defence says its activities are coordinated with the Syrian government (1 Feb 2026) and that Türkiye supports Syria's territorial integrity and the "one state, one army" principle (14 Aug 2025; 3 Sep 2026); the mandate for the Turkish Armed Forces in Iraq and Syria was extended for three years from 30 Oct 2025 (Grand National Assembly). That presence is shown at country level only.

### Processing

1. **Administrative boundaries.** OCHA COD-AB Syria (HDX, `syr_admin_boundaries.shp.zip`, layer `syr_admin3` = sub-districts; HDX update 26 Jan 2026; CC BY-IGO 3.0). The file is pinned by SHA-256 (`operation_areas.json`); if HDX publishes a new release the script stops and asks for a review. The name of every p-code is checked.
2. **Sub-districts per zone** (`admin_areas`):
   - Euphrates Shield: A'zaz, Suran, Aghtrin, Mare' (A'zaz district); Ar-Ra'ee, Al Bab (Al Bab district); Jarablus, Ghandorah (Jarablus district). Tall Refaat, Nabul, Tadaf and A'rima are not included.
   - Olive Branch: the seven sub-districts of the Afrin district (Afrin, Bulbul, Jandairis, Ma'btali, Raju, Sharan, Sheikh El-Hadid).
   - Peace Spring: Tell Abiad, Suluk, Ein Issa (Tell Abiad district); Ras Al Ain (Ras Al Ain district). Darbasiyah is not included.
3. **Depth (Peace Spring only).** The Sochi MoU (22 Oct 2019) describes the area as covering Tell Abyad and Ras al-Ayn with a depth of 32 km. The sub-district union is limited to the part within 32 km of Türkiye (Natural Earth 10m; buffer in a local Lambert azimuthal equal-area projection). Ein Issa sub-district enters only with its northern part inside that band; Ein Issa town is 33.9 km from Türkiye and outside the area (Tell Abyad town 0.2 km, Suluk 8.3 km — build report).
4. **Basemap clip.** The areas are clipped to Syria as drawn by the site's own Natural Earth 1:50m basemap (`countries-50m.json`), so a fill never crosses the border the site draws. The OCHA and Natural Earth borders differ by a few hundred metres to a few km; the clip removed 33.0 km² from Euphrates Shield, 102.7 km² from Olive Branch and 59.7 km² from Peace Spring.
5. **Simplification.** The three zones are simplified together as a coverage (shapely `coverage_simplify`, Visvalingam–Whyatt, tolerance 0.005°), so the edge shared by Olive Branch and Euphrates Shield stays identical. They are then clipped again to Syria shrunk by 0.75 grid cells, snapped to a 1e-3° grid (3 decimals, ≈ 110 m), and exterior rings are made counter-clockwise (RFC 7946; the site rewinds for d3).
6. **Preview:** `tools/geo/operation-areas-preview.png`.

### Omitted

- **Northern Iraq (the Claw operations, e.g. Claw-Lock, April 2022).** The Ministry of National Defence names the areas only ("the so-called Metina, Zap and Avaşin-Basyan regions"); no boundary, depth or size was announced, and the names do not correspond to administrative units. The parliamentary mandate leaves "limits, scope, amount and timing" to the President and defines no area. With no sourced, defined area, nothing is drawn.
- **Idlib.** The Astana de-escalation zone (2017) belongs to three guarantor states and is not an operation area announced by Türkiye; the observation posts in it fall under the red line anyway. Operation Spring Shield (Feb–Mar 2020) defined no area.
- **Air operations** (e.g. Claw-Sword, Nov 2022): no ground area was announced.
- **Tell Rifaat and Manbij (Dec 2024).** Taken in the SNA's "Dawn of Freedom" offensive (EUAA, March 2025); not an operation area officially announced by Türkiye.
- **General "safe zone" proposals.** The 17 Oct 2019 Türkiye–US joint statement refers to a "safe zone" but gives no extent; only the Peace Spring area described in the Sochi MoU is drawn.

### Caveats

- **Areas do not match the official figures exactly.** The schematic Euphrates Shield area (2,291 km²) is ~14% larger than the 2,015 km² Türkiye announced; the operation's limits did not follow sub-district lines. Peace Spring's eastern and western edges are sub-district boundaries.
- **Olive Branch:** the announced target is "Afrin" (S/2018/53); no official text stating that the whole district came under control is used as a source here; the district boundary is used as the administrative equivalent of the announced scope (not schematic).
- **Official sources on status are limited.** Because Türkiye has not announced that the areas ended, the `ended` status rests on official statements (Ministry of National Defence, MFA, Grand National Assembly) together with secondary sources (ISW, security sources quoted by Daily Sabah, Long War Journal, Al Jazeera, France 24).
- A press report (T24) that the Şanlıurfa Governorship withdrew its units from the Peace Spring area in March 2026 could not be verified and is not used.
- The OCHA boundaries do not imply official endorsement or acceptance by the United Nations (CC BY-IGO disclaimer).

---

## Kaynak belgeler / Source documents

Tümüne 2026-09-13'te erişildi. / All accessed 2026-09-13.

| Belge / Document | Yayımlayan / Publisher | Tarih / Date | URL | Kullanım / Use |
|---|---|---|---|---|
| Letter from the Permanent Representative of Turkey to the President of the Security Council (S/2016/739) | UN Security Council | 2016-08-24 | https://documents.un.org/api/symbol/access?l=en&t=pdf&s=S/2016/739 | Euphrates Shield: launch, Art. 51 |
| MGK 29 Mart 2017 toplantısı basın bildirisi | Millî Güvenlik Kurulu Genel Sekreterliği | 2017-03-29 | https://www.mgk.gov.tr/index.php/29-mart-2017-tarihli-toplanti | Euphrates Shield: concluded |
| Identical letters from the Chargé d'affaires a.i. of Turkey (S/2018/53) | UN Security Council | 2018-01-20 | https://documents.un.org/api/symbol/access?l=en&t=pdf&s=S/2018/53 | Olive Branch: launch, Art. 51; Euphrates Shield: 2,015 km² |
| "Afrin'de artık … Türk bayrağı dalgalanıyor" | T.C. Cumhurbaşkanlığı | 2018-03-18 | https://www.tccb.gov.tr/haberler/410/91807/afrinde-artik-teror-orgutunun-pacavralari-degil-huzur-ve-guvenin-sembolu-turk-bayragi-dalgalaniyor | Olive Branch: Afrin city centre |
| Letter from the Permanent Representative of Turkey to the President of the Security Council (S/2019/804) | UN Security Council | 2019-10-09 | https://documents.un.org/api/symbol/access?l=en&t=pdf&s=S/2019/804 | Peace Spring: launch, Art. 51 |
| Suriye'nin kuzeydoğusuna ilişkin Türkiye-ABD ortak açıklaması | T.C. Cumhurbaşkanlığı İletişim Başkanlığı | 2019-10-17 | https://www.iletisim.gov.tr/turkce/haberler/detay/suriyenin-kuzeydogusuna-iliskin-turkiye-abd-ortak-aciklamasi | Peace Spring: halt; "safe zone" (no extent) |
| Türkiye ile Rusya Federasyonu arasında mutabakat muhtırası imzalandı (text) | Anadolu Ajansı | 2019-10-22 | https://www.aa.com.tr/tr/dunya/turkiye-ile-rusya-federasyonu-arasinda-mutabakat-muhtirasi-imzalandi/1622980 | Peace Spring: Tell Abyad – Ras al-Ayn, 32 km depth |
| Irak ve Suriye tezkeresi Genel Kurulda kabul edildi | TBMM | 2025-10-22 | https://www.tbmm.gov.tr/Haber/Detay?Id=98232409-71f0-4b95-8244-019a08a2e22e | Mandate from 30 Oct 2025, three years; no area defined |
| MSB: Suriye'nin siyasi birliğini, toprak bütünlüğünü savunuyoruz | Anadolu Ajansı (MSB) | 2025-08-14 | https://www.aa.com.tr/tr/gundem/msb-suriyenin-siyasi-birligini-toprak-butunlugunu-savunuyoruz/3659254 | Türkiye–Syria MoU of 13 Aug 2025 |
| No: 9, 18 Ocak 2026, Suriye'de Açıklanan Ateşkes ve Tam Entegrasyon Anlaşması Hk. | T.C. Dışişleri Bakanlığı | 2026-01-18 | https://sam-be.mfa.gov.tr/Mission/ShowAnnouncement/416329 | SDF–Damascus agreement; Türkiye's position |
| MSB: Suriye'ye yönelik desteğimiz devam edecek (weekly briefing) | TRT Haber (MSB) | 2026-09-03 | https://www.trthaber.com/haber/gundem/msb-suriyeye-yonelik-destegimiz-devam-edecek-955777.html | "One state, one army"; latest MSB statement |
| Türkiye will only withdraw from Syria after terror threat ends: Report | Daily Sabah | 2026-02-01 | https://www.dailysabah.com/politics/turkiye-will-only-withdraw-from-syria-after-terror-threat-ends-report/news | Afrin security handover; coordination with Damascus |
| Iran Update, February 6, 2025 | ISW / Critical Threats | 2025-02-06 | https://www.understandingwar.org/backgrounder/iran-update-february-6-2025 | Afrin, Jandairis: government forces |
| Syrian government forces enter Afrin, signaling a change in control | FDD's Long War Journal | 2025-02-06 | https://www.longwarjournal.org/archives/2025/02/syrian-government-forces-enter-afrin-signaling-a-change-in-control.php | Afrin |
| Iran Update, January 21, 2026 | ISW / Critical Threats | 2026-01-21 | https://understandingwar.org/research/middle-east/iran-update-january-21-2026/ | Northern Aleppo, Peace Spring region: Syrian government |
| Syrian government, Kurdish-led SDF agree on ceasefire: What to know | Al Jazeera | 2026-01-18 | https://www.aljazeera.com/news/2026/1/18/syrian-army-advances-on-sdf-stronghold-of-raqqa-whats-the-latest | SDF–Damascus ceasefire |
| Syrian Kurdish leader announces SDF dissolution after its integration into army | France 24 | 2026-08-25 | https://www.france24.com/en/middle-east/20260825-syrian-kurdish-leader-dissolves-force-that-spearheaded-jihadist-fight | SDF dissolved |
| MSB: "Pençe Kilit Operasyonu" ile terör örgütünün bölgedeki varlığına ağır darbe indirildi | Anadolu Ajansı (MSB) | 2022 | https://www.aa.com.tr/tr/gundem/msb-pence-kilit-operasyonu-ile-teror-orgutunun-bolgedeki-varligina-agir-darbe-indirildi/2566076 | Omission: Iraq (named regions only) |
| EUAA COI — Syria: Country Focus, 4.2 Areas under the control of the SNA | EUAA | 2025-03 | https://euaa.europa.eu/coi/syria/2025/country-focus/4-recent-security-trends/42-areas-under-control-syrian-national-army-sna | Omission: Dawn of Freedom (Tell Rifaat, Manbij) |
| Syrian Arab Republic – Subnational Administrative Boundaries (COD-AB) | OCHA / HDX (UN Cartographic Section and partners) | 2026-01-26 | https://data.humdata.org/dataset/cod-ab-syr | Geometry (CC BY-IGO 3.0) |
| Natural Earth 10m admin-0 countries | Natural Earth | 5.x | https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip | 32 km depth from Türkiye; preview |
| `countries-50m.json` (world-atlas 2.0.2, Natural Earth 1:50m) | — | — | `apps/web/assets/data/countries-50m.json` | Final clip; validation |

## Lisans / Licence

**Atıf / Attribution (CC BY-IGO 3.0):** Syrian Arab Republic – Subnational Administrative Boundaries (COD-AB), OCHA / United Nations Cartographic Section and partners, via the Humanitarian Data Exchange (https://data.humdata.org/dataset/cod-ab-syr), CC BY-IGO 3.0 (https://creativecommons.org/licenses/by/3.0/igo/legalcode). Veri değiştirilmiştir: nahiyeler birleştirildi, kırpıldı ve sadeleştirildi. / Data modified: sub-districts dissolved, clipped and simplified. Sınırlar ve adlar BM'nin resmî onayı veya kabulü anlamına gelmez. / The boundaries and names do not imply official endorsement or acceptance by the United Nations. Natural Earth: kamu malı / public domain. Her özelliğin `attribution` alanı bu atfı taşır. / Every feature's `attribution` property carries this attribution.

---

## Doğrulama / Validation

Output of `build_operation_areas.py` (2026-09-13):

- `tur-operation-areas.geojson`: 3 features, 371 vertices (Fırat Kalkanı 160, Zeytin Dalı 82, Barış Pınarı 129), 29,234 bytes. Each feature is a single `Polygon` without holes; every geometry `is_valid`; 3 decimals. Exterior rings counter-clockwise (RFC 7946), checked independently with the shoelace formula. A second run reproduces the file byte for byte.
- Inside Syria as drawn by the site (`countries-50m.json`, id 760): 100.0000 % for all three (area outside 0.000 km²); ∩ Iraq (id 368) 0 km²; ∩ Türkiye (id 792) 0 km².
- Overlap between zones: 0.000 km²; the Olive Branch – Euphrates Shield edge is shared exactly.
- Areas (geodesic, WGS84): Euphrates Shield 2,291 km² (8 sub-districts 2,330 km²; Türkiye's figure 2,015 km²); Olive Branch 1,736 km² (Afrin district 1,841 km²); Peace Spring 4,985 km² (4 sub-districts 7,666 km²; within 32 km of Türkiye 5,049 km²).
- Sub-district seats against the 32 km band (build report only; not in the data): Tell Abiad 0.2 km from Türkiye — inside; Suluk 8.3 km — inside; Ein Issa 33.9 km — outside. The HDX layer has no seat point for Ras Al Ain.
- Property keys: only the documented set (asserted); no key or sub-key matching base / post / checkpoint / outpost / troop / unit name / strength / position / movement / deploy / point / coord (asserted); every source has exactly `title`, `publisher`, `url`, `date`, `accessed`, all `https`.
- HDX input: `syr_admin_boundaries.shp.zip`, 4,988,013 bytes, SHA-256 `adc38bee9b8865f56c99b10069590430bd25c64d6518a6d577e8e5d490054e7f` (HDX update 2026-01-26).
