# missions-tur.geojson — Kaynaklar ve Yöntem / Sources and Method

Türkiye'nin yurt dışındaki diplomatik temsilcilikleri, **şehir düzeyinde** nokta verisi.
Türkiye's diplomatic missions abroad as **city-level** point data.

- Dosya / File: `apps/web/assets/data/missions-tur.geojson`
- Üretim betiği / Build script: `tools/geo/build_missions.py` (+ `tools/geo/missions_city_qids.csv`)
- Erişim tarihi / Retrieval date: **2026-09-13**

---

## Türkçe

### Hukuki not
Büyükelçilik, başkonsolosluk ve daimi temsilcilik binaları 1961 Diplomatik İlişkiler
Hakkında Viyana Sözleşmesi ve 1963 Konsolosluk İlişkileri Hakkında Viyana Sözleşmesi
uyarınca **dokunulmazdır**; ancak **Türk egemenlik alanı (Türk toprağı) değildir**.
Bu katman bir egemenlik ya da toprak iddiası göstermez; yalnızca temsilciliklerin
bulunduğu şehirleri gösterir.

### Kaynaklar
1. **T.C. Dışişleri Bakanlığı — "Yurtdışındaki Temsilciliklerimiz"**
   https://www.mfa.gov.tr/yurtdisi-teskilati.tr.mfa
   Sayfa listeyi tarayıcıda şu dosyadan üretir; betik bu dosyayı doğrudan okur:
   https://www.mfa.gov.tr/site_media/assets/content/temsilcilikler/temsilcilikler.tr.js
   İngilizce karşılığı (İngilizce temsilcilik adları için):
   https://www.mfa.gov.tr/turkish-representations.en.mfa →
   https://www.mfa.gov.tr/site_media/assets/content/temsilcilikler/temsilcilikler.en.js
2. **Temsilciliklerin kendi iletişim sayfaları** (`https://<alt-alan>.mfa.gov.tr/Mission/Contact`),
   yalnızca şehri doğrulamak için. Bu sayfalarda bina koordinatları da bulunur;
   **kullanılmamıştır**.
3. **Wikidata** — şehir koordinatları (P625), SPARQL uç noktası
   https://query.wikidata.org/sparql. Her kaydın şehir QID'si `city_wikidata`
   alanında ve `tools/geo/missions_city_qids.csv` dosyasındadır.

### Yöntem
1. `temsilcilikler.tr.js` ve `temsilcilikler.en.js` indirilir ve ayrıştırılır
   (alanlar: `misyonId`, `misyonAdi`, `misyonTurAdi`, `ulkeKod`, `url`).
2. Kapsam: Büyükelçilik (`embassy`), Başkonsolosluk (`consulate_general`),
   Daimi Temsilcilik (`permanent_mission`). Listede ayrı bir "Konsolosluk" türü yoktur;
   çıkarsa betik onu `consulate` olarak alır.
3. Şehir: Türkçe ad temsilcilik adından ("… Büyükelçiliği / Başkonsolosluğu") çıkarılır.
   Daimi temsilcilikler, nezdinde bulundukları uluslararası kuruluşun merkez şehrine
   yerleştirilir (aşağıdaki tablo).
4. Şehir → Wikidata QID eşleşmesi, İngilizce ad + ülke kodu ile SPARQL sorgusundan
   bir kez çözülmüş, elle gözden geçirilmiş ve CSV'ye sabitlenmiştir
   (ör. "Djibouti" ülke öğesi yerine şehir öğesi Q3604).
5. Koordinat: Wikidata P625 (en iyi derece), **2 ondalığa yuvarlanmış** — bilerek şehir
   düzeyinde; bina konumu **değildir**, hiçbir bina coğrafi olarak kodlanmamıştır.
6. Doğrulama: Tüm temsilciliklerin iletişim sayfası adresleri atanan şehirle
   karşılaştırılmıştır (bkz. "Doğrulama").
7. Sıralama: ülke kodu, sonra şehir.

### Sayılar
| Tür | Adet |
|---|---|
| Büyükelçilik (`embassy`) | 145 |
| Başkonsolosluk (`consulate_general`) | 95 |
| Daimi Temsilcilik (`permanent_mission`) | 12 |
| **Toplam** | **252** |

### Daimi temsilcilikler (kuruluş merkezi)
| Temsilcilik | Şehir | İletişim sayfası adresi |
|---|---|---|
| BM Cenevre Ofisi | Cenevre | 1209 Genève |
| Dünya Ticaret Örgütü | Cenevre | 1215 Cenevre |
| ICAO | Montreal | Montréal, Québec |
| AGİT | Viyana | 1010 Wien |
| BM Viyana Ofisi | Viyana | 1030 Vienna |
| Avrupa Birliği | Brüksel | 1040 Bruxelles |
| NATO | Brüksel | 1110 Bruxelles |
| Birleşmiş Milletler (Turkuno) | New York | New York City, NY |
| Avrupa Konseyi | Strazburg | 67000 Strasbourg |
| OECD | Paris | 75116 Paris |
| UNESCO | Paris | 75732 Paris |
| İslam İşbirliği Teşkilatı | Cidde | Jeddah |

### Uyarılar
- **Nokta = temsilciliğin fiilen bulunduğu şehir.** Temsilciliğin kendi iletişim sayfası
  listedeki addan farklı bir şehir gösterdiğinde nokta o şehre konmuş, `country` alanı
  Bakanlık listesindeki akreditasyon ülkesi olarak bırakılmış ve `note` alanına açıklama
  yazılmıştır:
  - Vatikan Büyükelçiliği (VAT) → **Roma** (Via Serchio 9-11, 00198 Roma)
  - Nepido Büyükelçiliği (MMR) → **Yangon** (Mayangone Township, Yangon)
  - Hartum Büyükelçiliği (SDN) → **Port Sudan** (adres Port Sudan'da)
  - Sana Büyükelçiliği (YEM) → **Riyad** (adres: "c/o Turkish Embassy in Riyadh")
- Adresi, adını taşıyan şehre komşu bir belediyede olan temsilcilikler Bakanlığın verdiği
  şehirde bırakılmış, `note` alanına yazılmıştır: Bregenz BK (Wolfurt), Paris BK
  (Boulogne-Billancourt), Beyrut BE (Rabieh, Metn), Valetta BE (Floriana),
  Los Angeles BK (Beverly Hills).
- Vagadugu Büyükelçiliği iletişim sayfasında adres yayımlanmamıştır; Bakanlık listesindeki
  şehirde (Vagadugu) bırakılmıştır.
- Gazimağusa Başkonsolosluğu iletişim sayfasında "Geçici Hizmet Ofisi" olarak geçer.
- **Ülke kodları:** Bakanlık listesindeki `CYN` (KKTC) → `XNC`; `KOS` (Kosova, ISO 3166-1'de
  yok) → `XKX`. Kudüs Başkonsolosluğu Bakanlık listesinde Filistin (`PSE`) altındadır ve
  öyle bırakılmıştır. Hong Kong Başkonsolosluğu `CHN` altındadır.
- Lefkoşa Büyükelçiliği, KKTC başkenti Lefkoşa'ya (Wikidata "North Nicosia", Q2762100)
  yerleştirilmiştir.
- **Kapsam dışı** (Bakanlık listesinde olup alınmayanlar): Taipei Türk Ticaret Ofisi
  (ticaret ofisi), Süleymaniye Konsolosluk Ajanlığı, Niş Konsolosluk Bürosu.
  **Fahri konsolosluklar** Bakanlık dosyasında yer almaz ve bu veride de yoktur.
- Veri, Bakanlık dosyasının erişim tarihindeki halini yansıtır; dosyada olmayan
  temsilcilikler eklenmemiştir. Geçici kapanma/taşınma durumları yalnızca iletişim
  sayfalarında görüldüğü kadarıyla not edilmiştir.
- `url` alanı Bakanlık listesindeki adresin `https://` sürümüdür.

---

## English

### Legal note
Embassy, consulate and permanent-mission premises are **inviolable** under the 1961 Vienna
Convention on Diplomatic Relations and the 1963 Vienna Convention on Consular Relations,
but they are **NOT sovereign Turkish territory**. This layer makes no sovereignty or
territorial claim; it only shows the cities where missions are located.

### Sources
1. **Republic of Türkiye Ministry of Foreign Affairs — "Yurtdışındaki Temsilciliklerimiz"**
   https://www.mfa.gov.tr/yurtdisi-teskilati.tr.mfa
   The page renders its list client-side from the file below, which the script reads directly:
   https://www.mfa.gov.tr/site_media/assets/content/temsilcilikler/temsilcilikler.tr.js
   English counterpart (for English mission names):
   https://www.mfa.gov.tr/turkish-representations.en.mfa →
   https://www.mfa.gov.tr/site_media/assets/content/temsilcilikler/temsilcilikler.en.js
2. **Each mission's own contact page** (`https://<subdomain>.mfa.gov.tr/Mission/Contact`),
   used only to verify the city. These pages also embed building coordinates; those were
   **not used**.
3. **Wikidata** — city coordinates (P625) via the SPARQL endpoint
   https://query.wikidata.org/sparql. Every record's city QID is in the `city_wikidata`
   property and in `tools/geo/missions_city_qids.csv`.

### Method
1. Download and parse `temsilcilikler.tr.js` and `temsilcilikler.en.js`
   (fields: `misyonId`, `misyonAdi`, `misyonTurAdi`, `ulkeKod`, `url`).
2. Scope: Büyükelçilik (`embassy`), Başkonsolosluk (`consulate_general`),
   Daimi Temsilcilik (`permanent_mission`). The list has no separate "Konsolosluk"
   (consulate) type; if one appears the script maps it to `consulate`.
3. City: the Turkish city name is taken from the mission name ("… Büyükelçiliği /
   Başkonsolosluğu"). Permanent missions are placed at the seat city of the organisation
   they are accredited to (table below).
4. City → Wikidata QID was resolved once by SPARQL (English name + country code),
   reviewed by hand and frozen in the CSV (e.g. the city item Q3604 instead of the
   country item for "Djibouti").
5. Coordinates: Wikidata P625 (best rank), **rounded to 2 decimals** — intentionally
   city-level, **not** the building; no building was geocoded.
6. Verification: every mission's contact-page address was compared with the assigned
   city (see "Verification").
7. Sort order: country code, then city.

### Counts
| Kind | Count |
|---|---|
| Embassy (`embassy`) | 145 |
| Consulate-general (`consulate_general`) | 95 |
| Permanent mission (`permanent_mission`) | 12 |
| **Total** | **252** |

### Permanent missions (organisation seat)
| Mission | City | Contact-page address |
|---|---|---|
| UN Office at Geneva | Geneva | 1209 Genève |
| World Trade Organization | Geneva | 1215 Cenevre |
| ICAO | Montreal | Montréal, Québec |
| OSCE | Vienna | 1010 Wien |
| UN Office at Vienna | Vienna | 1030 Vienna |
| European Union | Brussels | 1040 Bruxelles |
| NATO | Brussels | 1110 Bruxelles |
| United Nations (Turkuno) | New York | New York City, NY |
| Council of Europe | Strasbourg | 67000 Strasbourg |
| OECD | Paris | 75116 Paris |
| UNESCO | Paris | 75732 Paris |
| Organisation of Islamic Cooperation | Jeddah | Jeddah |

### Caveats
- **Point = the city where the mission actually is.** Where a mission's own contact page
  gives a different city from the list name, the point is placed in that city, `country`
  keeps the accreditation country from the MFA list, and `note` explains:
  - Vatican embassy (VAT) → **Rome** (Via Serchio 9-11, 00198 Roma)
  - "Nepido" embassy (MMR) → **Yangon** (Mayangone Township, Yangon)
  - "Hartum" / Khartoum embassy (SDN) → **Port Sudan** (address in Port Sudan)
  - "Sana" / Sanaa embassy (YEM) → **Riyadh** (address "c/o Turkish Embassy in Riyadh")
- Missions whose address is in a municipality adjacent to the city they are named after
  are kept at the MFA-named city, with a `note`: Bregenz CG (Wolfurt), Paris CG
  (Boulogne-Billancourt), Beirut embassy (Rabieh, Metn), Valletta embassy (Floriana),
  Los Angeles CG (Beverly Hills).
- The Ouagadougou (Vagadugu) embassy's contact page publishes no address; it is kept at
  the MFA-listed city.
- The Gazimağusa (Famagusta) consulate-general's contact page calls it a
  "Geçici Hizmet Ofisi" (temporary service office).
- **Country codes:** the MFA list's `CYN` (KKTC / TRNC) → `XNC`; `KOS` (Kosovo, not in
  ISO 3166-1) → `XKX`. The Jerusalem (Kudüs) consulate-general is listed by the MFA under
  Palestine (`PSE`) and kept so. The Hong Kong consulate-general is under `CHN`.
- The Lefkoşa embassy is placed at Lefkoşa, capital of the KKTC (Wikidata "North
  Nicosia", Q2762100).
- **Out of scope** (listed by the MFA but not included): Taipei Turkish Trade Office
  (trade office), Süleymaniye consular agency (Konsolosluk Ajanlığı), Niş consular office
  (Konsolosluk Bürosu). **Honorary consulates** are not in the MFA file and are not in
  this dataset.
- The data reflects the MFA file as retrieved; missions absent from that file were not
  added. Temporary closures/relocations are noted only as far as the contact pages show them.
- `url` is the `https://` form of the address in the MFA list.

---

## Doğrulama / Verification (2026-09-13)

**TR:** Kapsamdaki 252 temsilciliğin tamamının `/Mission/Contact` sayfası indirildi (hepsi
HTTP 200); 251'inde adres var (Vagadugu'da yok). Adresler atanan şehirle karşılaştırıldı:
241'i atanan şehirde (yerel yazımlar — Wien, Bruxelles, Genève, München, La Habana,
Warszawa vb. — ve Yarralumla/Canberra gibi şehir içi semtler dahil); 4'ü farklı bir şehirde
olduğu için taşındı (Roma, Yangon, Port Sudan, Riyad); 5'i komşu belediyede olup notla
bırakıldı; 1'inde adres yok. Ayrıca rastgele seçilen 10 kayıt (tohum 20260913) elle
kontrol edildi: Burgaz BK, Stokholm BE, Taşkent BE, Bangkok BE, Vatikan BE, Prag BE,
New York BK, Bamako BE, Freetown BE, Çengdu BK — hepsi tutarlı (Vatikan → Roma, yukarıda).

**EN:** The `/Mission/Contact` page of all 252 in-scope missions was fetched (all HTTP 200);
251 publish an address (Ouagadougou does not). Each address was compared with the
assigned city: 241 are in the assigned city (counting local spellings — Wien, Bruxelles,
Genève, München, La Habana, Warszawa, etc. — and in-city districts such as
Yarralumla/Canberra); 4 were moved because the address is in another city (Rome, Yangon,
Port Sudan, Riyadh); 5 are in an adjacent municipality and kept with a note; 1 has no
address. In addition, 10 random records (seed 20260913) were checked by hand: Burgaz CG,
Stockholm, Tashkent, Bangkok, Vatican, Prague embassies, New York CG, Bamako, Freetown
embassies, Chengdu CG — all consistent (Vatican → Rome, see above).

---

## Yeniden üretim / Reproduce
```
pip install requests
python tools/geo/build_missions.py
```
