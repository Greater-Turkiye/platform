# `places-10m.geojson` — kaynaklar / sources

Panelin altlık kapalıyken (`?basemap=0`, ya da karolara ulaşılamadığında) çizdiği şehirler.
The cities the panel draws when the basemap is off (`?basemap=0`, or when the tiles cannot be reached).

| | |
|---|---|
| Üretici / Builder | [`tools/geo/build_places.py`](../../../../tools/geo/build_places.py) |
| Kaynak / Source | [Natural Earth](https://www.naturalearthdata.com) 1:10m populated places, **simple** build (`ne_10m_populated_places_simple.geojson`, `nvkelso/natural-earth-vector`) |
| Lisans / Licence | Kamu malı / public domain |
| Erişim / Accessed | 2026-09-18 |
| Türkçe adlar / Turkish names | **Bizim** — [`tools/geo/place_names_tr.csv`](../../../../tools/geo/place_names_tr.csv) |

## Ne seçilir / What is kept

Natural Earth'ün kendi nüfus (`pop_max`) ve ölçek sırası (`scalerank`) alanları, izlediğimiz
bölgelere göre üç halkada kullanılır — yakınlık arttıkça eşik düşer:

| Halka / Ring | Ülkeler / Countries | Eşik / Threshold |
|---|---|---|
| Çekirdek / Core | TUR, CYP, CYN, SYR, IRQ, GRC, PSX, ISR, LBN | nüfus ≥ 50.000 veya `scalerank` ≤ 8 |
| Yakın / Near | İran, Kafkasya, Balkanlar, Karadeniz, Kuzey Afrika, Körfez, Orta Asya, AFG | nüfus ≥ 150.000 veya `scalerank` ≤ 6 |
| Uzak / Far | Diğerleri / the rest | nüfus ≥ 1.000.000 |

Başkentler her zaman kalır. Katmanlarımızın veya kayıtlarımızın işaret ettiği bazı yerler
(Girne, Gazimağusa, Münbiç, Telafer, Zaho, Sohum, Gümrü, Sirte…) eşiğe bakılmaksızın eklenir.
Dosya, paneldeki görüş alanıyla (13°E–74°E, 22°N–48°N) sınırlıdır ve 700 kayıtla tavanlanır;
bugünkü çıktı **455** yerdir. Koordinatlar üç ondalığa yuvarlanır (~100 m).

## Türkçe adlar / The Turkish names

Natural Earth'te Türkçe ad alanı yoktur. Bu yüzden Türkçe adlar bizim tablomuzdan gelir ve
**bugünkü yaygın Türkçe kullanımı** esas alır: Şam, Halep, Musul, Erbil, Kerkük, Lefkoşa, Girne,
Selanik, Atina, Yanya, İskeçe, Dedeağaç, Kudüs, Gazze, Trablusgarp (Libya) ve Trablusşam (Lübnan).
Arşiv değeri dışında kullanılmayan Osmanlıca adlar (ör. Patras için "Balyabadra", Larissa için
"Yenişehir") bilerek alınmamıştır: harita bir iddia listesi değil, okunabilir bir referanstır.
Bir ad iki ülkede aynı yazılıyorsa satır ülke koduyla nitelenir (`a3` sütunu).

Natural Earth carries no Turkish name field, so the Turkish names are ours and follow **current
Turkish usage**. Ottoman-era exonyms that are no longer in ordinary use are deliberately left out:
the map is a readable reference, not a list of claims. Where one spelling covers two places, the
row is qualified with the country code (`a3`).

Tabloda olup dosyada olmayan adlar hata değildir: eşiğin altında kalan veya görüş alanı dışındaki
yerlerdir; eşikler değişirse kendiliğinden kullanılır. Natural Earth'ün kullanmadığı bir ad ise
yazım hatasıdır ve üretici çalışmayı durdurur.
