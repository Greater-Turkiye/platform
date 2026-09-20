# `trade-il.json` — kaynaklar ve yöntem / sources and method

[Türkçe](#türkçe) · [English](#english)

## Türkçe

Türkiye 2024'te İsrail ile ticaretin durdurulduğunu açıkladı. Bu dosya o kararı yargılamaz; **iki devletin kendi aylık beyanlarını** yan yana koyar ve aradaki farkı okunur hâle getirir.

### Kaynak

| | |
|---|---|
| Veri | UN Comtrade — aylık mal ticareti, HS, tüm mallar (`cmdCode=TOTAL`) |
| Uç nokta | `https://comtradeapi.un.org/public/v1/preview/C/M/HS` — genel önizleme, API anahtarı gerektirmez |
| Raportörler | Türkiye (792), İsrail (376), Almanya (276 — yalnızca denetim için) |
| Şartlar | [UN Comtrade veri kullanımı](https://comtrade.un.org/data/AboutDataUsage); türetilmiş toplamlar kaynak gösterilerek yayımlanır |
| Üretici | [`tools/trade/build_trade.py`](../../../../tools/trade/build_trade.py) |

### Hangi satır alınır

API, her **taşıma türü** (`motCode`) ve her **gümrük rejimi** (`customsCode`) için ayrı satır döndürür; hepsini toplamak mükerrer sayım olur. Alınan tek satır `motCode = 0` ve `customsCode = C00`, yani istatistiğin kendisidir. Taşıma türü kırılımı ayrıca kaydedilir (UN kodları: 1000 hava, 2100 deniz, 3100 demiryolu, 3200 karayolu).

### İki defter neyi ölçer

- **Türkiye**, ihracatını **varış ülkesine** göre raporlar.
- **İsrail**, ithalatını **menşe ülkesine** göre raporlar.

Bu fark, dosyanın tamamının nedenidir. Yasaktan önce iki çizgi birbirini yüzde birkaç farkla takip eder (2024-03: Türkiye 440,7 M$, İsrail 428,0 M$). Üçüncü bir ülke üzerinden sevk edilen Türk menşeli bir mal, Türkiye'nin defterinde **o ülkeye ihracat**, İsrail'in defterinde **Türk menşeli ithalat** olarak görünür. Aradaki fark bu yüzden bir kaçakçılık iddiası değil, **yönlendirmenin ölçüsüdür**.

### Yokluk, sıfır değildir

Bir ayda Türkiye'nin beyanında İsrail satırının bulunmaması iki şey anlamına gelebilirdi: ticaret yok ya da rapor yok. Her böyle ay, **aynı ayın Almanya satırıyla** denetlenir. Türkiye o ay başka ortakları raporlamışsa, yokluk raporlanmış bir yokluktur ve dosyada `tur_reported_that_month: true` ile işaretlenir. Bu denetimi geçmeyen hiçbir ay "sıfıra indi" diye yayımlanmaz.

### Komşu satırları

`routes` bölümü, Türkiye'nin **kendi** ihracatını komşu ve transit ekonomilere göre, yasaktan önceki 12 ayın (2023-05 – 2024-04) ve sonraki 12 ayın (2024-06 – 2025-05) ortalamasıyla karşılaştırır. Liste önceden sabittir: soru, cevabı beğenilen satıra değil, her makul satıra sorulur.

**Büyüyen bir satır rota değildir.** Hiçbir mal bir istatistikten ötekine izlenmez; her ekonomi kendi nedenleriyle büyür. Karşılaştırmanın söyleyebileceği tek şey, bir sonraki bakışın nereye yöneleceği ve nereye yönelmeyeceğidir.

### Politika tarihleri

9 Nisan 2024 (54 ürün grubunda kısıtlama) ve 2 Mayıs 2024 (iki yönlü durdurma) tarihleri dosyada **birincil kaynağı eklenmemiş** olarak taşınır: bakanlığın duyuru sayfaları düz bir HTTP istemcisine yanıt vermiyor ve kaynaksız bir tarih, kaynaklı rakamların yanında dosyanın en zayıf yeri olurdu. Rakamlar bu tarihlere bağlı değildir: seri, Türk satırının nerede durduğunu kendisi gösterir.

### Yapılmayan

Hiçbir gemi izlenmez. Sivil bir geminin konumu, rotası, tahmini varışı veya mürettebatı hiçbir biçimde kaydedilmez ve yayımlanmaz ([ADR 0022](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0022-trade-compliance-not-vessel-tracking.md)).

### Yeniden üretmek

```bash
python tools/trade/build_trade.py             # önbellekteki indirmeleri kullanır
python tools/trade/build_trade.py --refresh   # baştan indirir (ayda bir çağrı; yaklaşık 15 dakika)
```

## `vessels-sanctioned.json` — gemi kimliği / vessel identity

Sorunun "bayrak değiştiriyorlar mı" kısmı, hiçbir şey izlemeden cevaplanabilir: iki otorite, yaptırım uyguladığı geminin bayrağını **ve daha önce taşıdığı bayrağı** yayımlıyor.

| | |
|---|---|
| Kaynaklar | [OFAC SDN](https://www.treasury.gov/ofac/downloads/sdn.xml) (ABD hükümeti eseri, **kamu malı**) · [BM GK birleşik listesi](https://scsanctions.un.org/resources/xml/en/consolidated.xml) |
| Üretici | [`tools/vessels/build_vessels.py`](../../../../tools/vessels/build_vessels.py) |
| Sayfaların okuduğu | `vessels-summary.json` (~3 KB): sayımlar ve bayrak değişikliği rotaları. Tam dosya (463 KB) okumak ve indirmek için durur; bir sayfa dört sayı için yarım megabayt yüklemez |
| Alanlar | ad, IMO, MMSI, tür, yapım yılı, bayrak, **önceki bayrak(lar)**, kayıtlı sahip, çağrı işareti, program |
| Bugünkü çıktı | 1.565 gemi; 81'inde kayıtlı önceki bayrak; 449'u izleme bölgelerine değiyor |

`watch` alanı, bayrağı/önceki bayrağı/sahibi izleme bölgelerine değen gemileri **işaretler**, hiçbirini elemez: süzgeç, neyin önemli olduğuna dair bir iddiadır ve bu dosya o iddiayı kurmaz.

**Bu liste, yukarıdaki ticaret serisinden bağımsızdır** ve İsrail ticareti hakkında hiçbir şey söylemez. Gösterdiği şey yöntemdir: bir geminin hangi sicili bırakıp hangisine geçtiği resmî kaynaklarda kayıtlıdır.

Konum, rota, tahmini varış ve mürettebat bu dosyada **yoktur**; böyle bir alan hiç tanımlanmamıştır ([ADR 0022](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0022-trade-compliance-not-vessel-tracking.md)).

### Denenip kullanılmayanlar / tried and not used

| Kaynak | Bulunan |
|---|---|
| **Equasis** | Genel API yok; kullanım şartları sistematik/otomatik çıkarımı yasaklıyor. Bir oturum çerezi ile istek atmak tarayıcı oturumunu taklit etmek olur. **Kullanılmadı.** |
| **IMO GISIS** | Genel API yok; giriş sonrası modüller tarayıcıda gezilir, toplu veri vermez. |
| **Paris MoU** | **Kullanılabilir ve asıl hedef:** liman devleti denetim kayıtlarını toplu **XML + API** olarak başvuru formuyla, ücretsiz paylaşıyor ([datasharing-public](https://parismou.org/datasharing-public/)). Her denetimde gemi, IMO, **bayrak**, şirket, liman ve tarih bulunur; yıllar boyunca bayrak alanı, resmî bir düzenleyicinin tuttuğu bayrak geçmişidir. Hesap alındığında bu dosyanın ikinci kaynağı olacaktır. |

## English

Türkiye announced a halt to trade with Israel in 2024. This file does not judge that decision: it puts **both states' own monthly returns** side by side and makes the gap between them readable.

The data is UN Comtrade monthly merchandise trade, taken from the public preview endpoint, which needs no API key. The figure used is the row with `motCode = 0` and `customsCode = C00`; the API returns one row per mode of transport and customs procedure, and summing them would double-count. The mode-of-transport split is kept alongside.

Türkiye reports exports by country of **destination** and Israel reports imports by country of **origin**, which is the whole reason for the comparison: before the halt the two lines agree to within a few per cent, and a Turkish-made good routed through a third country afterwards is an export to that country in Türkiye's books and an import of Turkish origin in Israel's. The gap therefore measures **routing**, not smuggling.

A month with no Israel line in Türkiye's returns is checked against the same month's Germany line; only when Türkiye reported other partners is the absence recorded as a reported absence. The `routes` section compares Türkiye's own exports to a fixed list of neighbours and transit economies, twelve months before against twelve months after — a line that grew is not a route, and nothing is traced from one statistic to another.

The two policy dates are carried without a primary source attached, because the ministry's announcement pages do not answer a plain HTTP client and an unsourced date next to sourced figures would be the weakest thing in the file.

No vessel is tracked. The position, route, estimated arrival or crew of a civilian ship is never recorded or published (ADR 0022).

The reflagging half of the question needs no tracking: two authorities publish the flag a designated ship flies and the flag it used to fly. `vessels-sanctioned.json` carries identity only — name, IMO, MMSI, type, year, flag, former flags, recorded owner, programme — from the OFAC SDN list (a work of the US Government, public domain) and the UN Security Council consolidated list. Nothing is filtered out; `watch` marks the rows touching this project's regions. Position, route, arrival and crew are not fields in this file.

The pages read `vessels-summary.json` (about 3 KB: the counts and the flag-change routes); the full file stays for reading and download, because no page should load half a megabyte for four numbers.

Equasis has no public API and its terms forbid systematic extraction, so it is not used. IMO GISIS has no public API either. The Paris MoU does share its port state control inspections in bulk XML and through an API, free, on application — each inspection records the ship's flag on that date, which is a flag history kept by an official regulator, and that is the next source to add.
