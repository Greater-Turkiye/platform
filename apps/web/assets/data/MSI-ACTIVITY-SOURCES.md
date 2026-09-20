# `msi-activity.json` ve `msi-density.json` — kaynaklar ve yöntem / sources and method

Ege, Doğu Akdeniz ve Karadeniz için **ilan edilmiş** seyir ihbarlarının yıllara göre sayımı.
A yearly count of the navigational warnings **announced** for the Aegean, the eastern Mediterranean
and the Black Sea.

| | |
|---|---|
| Üretici / Builder | [`tools/msi/build_activity.py`](../../../../tools/msi/build_activity.py) |
| Kaynak / Source | [NGA Maritime Safety Information — broadcast warnings](https://msi.nga.mil/NavWarnings) (`?status=cancelled` arşivi + `?status=active`) |
| Lisans / Licence | ABD Hükümeti eseri, **kamu malı** / Work of the United States Government, **public domain** |
| Sınıflandırma / Classification | [`gt_collectors.navtex.activity_of`](../../../../collectors/src/gt_collectors/navtex.py) — ihbarın kendi kelimeleri |
| Sayım kuralları / Counting rules | [`gt_collectors.msi`](../../../../collectors/src/gt_collectors/msi.py) — bölge süzgeci, Türk ihbarı dışlaması ve yıllık sayım; testleri [`tests/test_msi.py`](../../../../collectors/tests/test_msi.py) |
| Üretim / Built | 2026-09-19 · 198.034 kayıt okundu, **9.051** bölge ihbarı tutuldu, 1.314 Türk ihbarı dışlandı, 624 yalnızca iptal mesajı sayılmadı |
| Kapsanan yıllar / Years | 1990–2024 |

## Bir sayım ne anlatır, ne anlatmaz / What a count says and does not say

Bir seyir ihbarı, bir devletin "şurada, şu saatler arasında bulunmayın" demesidir: atış eğitimi,
füze denemesi, denizaltı faaliyeti, araştırma gemisi çalışması. Bunları saymak, denizdeki askerî
faaliyetin çıkarım gerektirmeyen tek ölçüsüdür — çünkü duyuruyu, faaliyeti yapan devletin kendisi
yayımlar.

Ama **bir ihbar bir duyurudur**; bir tatbikat, bir gemi ya da bir gün değildir. Uzun bir tatbikat bir
kez duyurulup beş kez değiştirilebilir. Daha önemlisi, toplamdaki bir değişim **denizde olanın değil,
arşivin taşıdığının** değişimi olabilir. Bu dosyada bu yüzden her yıl üç sütunla birlikte gelir:

- `total` — o yıl bölge için tutulan ihbar sayısı,
- `archive_all_areas` — aynı arşivin o yıl **tüm deniz alanları** için taşıdığı ihbar sayısı (maruziyet tabanı),
- `by_authority` — ihbarları kimin yayımladığı (ilk altı).

**2021 sonrası düşüş bir kapsama değişimidir.** NGA'nın NAVAREA III ve Yunan NAVTEX aktarımları
2021'den sonra büyük ölçüde duruyor: 2020'de bölgedeki 1.034 ihbarın 946'sı NAVAREA III aktarımıyken 2022'de bu sayı 66'dır ve 2023'te kalanın çoğunu Romanya ile arama-kurtarma merkezleri yayımlar. Bu düşüş
faaliyetin azaldığı anlamına **gelmez** ve öyle okunmamalıdır.

Aynı tabana göre bakıldığında 2012–2020 arasındaki artış gerçektir: bölgenin arşiv içindeki payı binde 31'den (2012) binde 103'e (2020) çıkar ve 2020'de zirve yapar; 2022'den sonra binde 14–19'a iner.

## Türkiye'nin ihbarları neden sayılmıyor / Why Türkiye's own warnings are not counted

Türk makamlarının yayımladığı (ya da konusu Türkiye olan) ihbarlar sayıma **girmez** ve bu dosyada
yer almaz. Türk kuvvetlerinin güncel atış ve tatbikat alanlarını bir seri hâlinde yayımlamak, duyuruyu
ilk kim yapmış olursa olsun [ADR 0013](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0013-map-layers-turkiye-perspective.md)'ün
yasakladığı şeydir. Sicil, *başka* devletlerin ilan ettiği faaliyeti ölçer
([ADR 0019](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0019-foreign-installations-register.md)).
Dışlanan ihbar sayısı dosyada yazılıdır (`built_from.turkish_warnings_excluded`), böylece eksiklik
görünür olur.

Warnings issued by Turkish authorities, or whose subject is Türkiye, are not counted and do not
appear here; the number dropped for that reason is recorded in the file, so the omission is visible
rather than silent.

## Sınıflar / The classes

| Sınıf / Class | Ne demek / What it means | Toplam / Total |
|---|---|---|
| `hazardous-operations` | "HAZARDOUS OPERATIONS" — kapalı askerî saha; ihbar içeride ne olduğunu söylemez | 3.423 |
| `unclassified` | Kelimelerimizin tanımadığı ihbar | 2.278 |
| `firing` | Atış eğitimi, topçu atışı | 1.669 |
| `survey` | Araştırma, sismik çalışma | 770 |
| `cable-pipeline` | Kablo ve boru hattı çalışması | 324 |
| `sar` | Arama kurtarma | 241 |
| `wreck-obstruction` | Batık, engel | 129 |
| `missile-test` | Füze atışı/denemesi | 82 |
| `military-exercise` | Adıyla anılan tatbikat | 72 |
| `aid-to-navigation` | Fener, şamandıra | 57 |
| `submarine` | Denizaltı faaliyeti | 6 |

`hazardous-operations` ayrı tutulur, tatbikat sayılmaz: ihbar içeride ne olduğunu söylemiyorsa biz de
söylemeyiz. / It is kept as its own class rather than folded into exercises: the warning does not say
which it is, and neither do we.

## Güncel kalması / Keeping it current

Seri ayda bir, [`msi-activity.yml`](../../../../.github/workflows/msi-activity.yml) iş akışıyla
yeniden üretilir. Sayılar değişmişse iş akışı yeni dosyayı artefakt olarak yükler ve
`veri-guncellemesi` etiketli bir konu açar; dosyayı depoya bir insan alır. Gerekçe: bu org'da
Actions pull request açamaz, `main` korumalıdır ve üçüncü tarafın arşivi ile sitenin yayımladığı
şey arasında bir insanın durması zaten istediğimiz şeydir ([ADR 0007](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0007-human-in-the-loop-publishing.md)).
Konu, değişimin **kapsama mı faaliyet mi** olduğunu sormayı hatırlatan bir kontrol listesiyle gelir.

The series is rebuilt monthly by the `msi-activity` workflow. When the numbers move it uploads the
new file as an artifact and opens an issue; a human lands it. Actions cannot open pull requests in
this organisation and `main` is protected — and a person between a third party's archive and what
the site publishes is what ADR 0007 asks for in any case.

## Yoğunluk ızgarası / The density grid

`msi-density.json`, aynı ihbarların **nerede** ilan edildiğini 0,25°'lik bir ızgarada gösterir
(panelde "İlan edilen faaliyet" katmanı). Kurallar:

- **Pencere 2015–2021.** Arşivin bu bölgedeki kapsamı bu yıllarda istikrarlı; NAVAREA III aktarımının
  durduğu yılları karıştırmak denizi değil arşivi haritalamak olurdu.
- **Alan, köşelerden kurulur.** Dört köşe veren bir ihbar, köşelerinin sınırladığı dikdörtgendeki
  hücreleri sayar; tek konum veren bir ihbar tek hücre. 9 derece kareden geniş bir duyuru bölge
  geneli sayılır ve alan olarak çizilmez.
- **Karadaki hücreler atılır** (bu üretimde 564 hücre): bu bir deniz faaliyeti haritasıdır, bir Yunan
  köyünün üzerindeki kırmızı kare değil. Karar, sitenin çizdiği 1:50m kara geometrisine göre verilir.
- **Türk ihbarları burada da yok.** Dosyada güncel hiçbir şey yoktur: pencere 2021'de biter.

Bugünkü çıktı: **3.015 hücre**, hücre-ihbar toplamları askerî 36.437, araştırma 7.290, diğer 7.591.

`msi-density.json` shows **where** the same warnings were announced, on a 0.25° grid (the panel's
"announced activity" layer): a 2015–2021 window because the archive's coverage is steady there, areas
built from the warning's own corners, region-wide notices not drawn as areas, cells whose centre is on
land dropped, and no Turkish warnings. Nothing in it is current; the window ends in 2021.

## Bölge toplamları / The region totals

`msi-regions.json`, aynı ızgarayı panelin izleme bölgelerine toplar (kenar çubuğundaki "Bölge durumu"
tablosunun "Faaliyet" sütunu). Bir hücre, merkezi bir bölgenin kutusunun içindeyse o bölgeye sayılır.
**Kutular örtüşür** — Doğu Akdeniz ile Kıbrıs aynı suyu paylaşır — bu yüzden bölgelerin toplamı genel
toplamı vermez; dosya bunu `about` alanında yazar, normalleştirip saklamaz. Sayılan denizi olmayan
bölge (Irak, İran, Körfez, Orta Asya) dosyada **0 hücre** ile durur ve panelde "—" okunur: ölçülmedi,
"sıfır" değil. Bölge kutuları `assets/js/gt.js` içindeki `GT.REGIONS` ile aynıdır ve üreticide elle
tekrarlanır; biri taşınırsa diğeri de taşınmalıdır.

`msi-regions.json` folds the same grid into the panel's watch regions (the "Activity" column of the
region board). A cell counts for a region when its centre is inside that region's box; the boxes
overlap, so the regions do not sum to the total, and a region with no counted sea stands at zero
cells and reads "—" rather than "0" — not measured, not zero.

## Yeniden üretmek / Rebuilding

```bash
python tools/msi/build_activity.py            # önbellekteki indirmeyi kullanır / uses the cached download
python tools/msi/build_activity.py --refresh  # yeniden indirir (~112 MB) / downloads again
```

İndirme depo dışında önbelleğe alınır (`GT_MSI_CACHE`, varsayılan geçici dizin). Dosya yalnızca
sayılar taşır: hiçbir ihbar metni kopyalanmaz.
