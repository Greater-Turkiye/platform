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

## English

Türkiye announced a halt to trade with Israel in 2024. This file does not judge that decision: it puts **both states' own monthly returns** side by side and makes the gap between them readable.

The data is UN Comtrade monthly merchandise trade, taken from the public preview endpoint, which needs no API key. The figure used is the row with `motCode = 0` and `customsCode = C00`; the API returns one row per mode of transport and customs procedure, and summing them would double-count. The mode-of-transport split is kept alongside.

Türkiye reports exports by country of **destination** and Israel reports imports by country of **origin**, which is the whole reason for the comparison: before the halt the two lines agree to within a few per cent, and a Turkish-made good routed through a third country afterwards is an export to that country in Türkiye's books and an import of Turkish origin in Israel's. The gap therefore measures **routing**, not smuggling.

A month with no Israel line in Türkiye's returns is checked against the same month's Germany line; only when Türkiye reported other partners is the absence recorded as a reported absence. The `routes` section compares Türkiye's own exports to a fixed list of neighbours and transit economies, twelve months before against twelve months after — a line that grew is not a route, and nothing is traced from one statistic to another.

The two policy dates are carried without a primary source attached, because the ministry's announcement pages do not answer a plain HTTP client and an unsourced date next to sourced figures would be the weakest thing in the file.

No vessel is tracked. The position, route, estimated arrival or crew of a civilian ship is never recorded or published (ADR 0022).
