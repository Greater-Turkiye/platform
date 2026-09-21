# `fir.json` — kaynaklar ve yöntem / sources and method

Bu dosya `hava.html` sayfasını besler.

## Türkçe

### Ne olduğu, ne olmadığı

**Uçuş bilgi bölgesi (FIR)**, bir devletin hava trafik hizmeti ve uçuş bilgi hizmeti verdiği hava sahasıdır. **Egemenlik değildir** ve bir iddia değildir: ICAO tarafından bölgesel seyrüsefer planlarıyla tahsis edilir, açık deniz üstünü ve başka devletlerin kıyısına kadar olan alanı kapsayabilir. Bir deniz alanı tartışması ile bir FIR tartışması **farklı zeminlerde** yürür; ikisini aynı şey sanmak bu bölge hakkındaki yanlış yorumların çoğunun başladığı yerdir.

### Kaynak ve lisans

| | |
|---|---|
| Veri | [VAT-Spy Data Project](https://github.com/vatsimnetwork/vatspy-data-project) — `Boundaries.geojson` |
| Lisans | **CC BY-SA 4.0** |
| Bu türetilmiş dosya | **CC BY-SA 4.0** (share-alike gereği; depodaki diğer veriler CC BY 4.0'dır) |

### Uyarı — bu resmî bir havacılık kaynağı değildir

Bu sınırlar bir uçuş simülasyon ağının yayımlanmış havacılık bilgilerinden derlediği, açık lisanslı bir topluluk veri kümesinden gelir. Yakındır; **yetkili değildir**. Bir sınırın yetkili kaynağı ilgili devletin AIP'sidir. Dosyadaki her kayıt `schematic: true` taşır, sayfa uyarıyı kenar çubuğunda gizlenemeyecek bir yerde gösterir.

**Seyrüsefer için kullanılamaz. Bir sınırın hukuken nerede geçtiğine delil sayılamaz.**

### Yöntem

Alanlar WGS84 elipsoidi üzerinde `pyproj.Geod` ile ölçülür. Derece cinsinden bir kutu alan değildir: bir boylam derecesi ekvatorda 111 km, 47°K'de 76 km'dir. Her deniz için, o denizin kutusunun ne kadarının hangi FIR'a düştüğü hesaplanır; %0,5'in altındaki paylar (sınır üzerinde bir kıymık) sayılmaz. Kutunun listelenen FIR'ların dışında kalan kısmı — kara ya da kapsanmayan alan — barda taralı gösterilir ve toplamın 100'e tamamlanması için uydurulmaz.

Çizilen FIR'lar sabit bir listedir; "kutuyu kesen her şey" değildir. Liste bir okur tarafından denetlenebilir, kesişim testi ise yukarıdaki sınırlar yeniden çizildiğinde sessizce bölge kazanır ya da kaybeder.

### Bugünkü ölçüm

| Deniz kutusu | Hava sahası bölünmesi | Kapsanan |
|---|---|---|
| `blacksea` | UKFV %25 · URRV %24 · LTAA %18 · LRBB %9 · LBSR %6 · LTBB %5 · UGGG %3 | %90 |
| `marmara` | LTBB %95 · LGGG %4 · LBSR %1 | %100 |
| `aegean` | LGGG %80 · LTBB %20 | %100 |
| `eastmed` | LCCC %30 · HECC %28 · LTAA %12 · LGGG %9 · LLLL %6 · OJAC %4 · OSTT %4 · LTBB %2 | %96 |
| `cyprus` | LCCC %95 · LTAA %4 | %99 |

En geniş bölgeler:

| FIR | Ad | Alan (km²) |
|---|---|---|
| `LTAA` | Ankara FIR | 763.987 |
| `URRV` | Rostov FIR | 725.361 |
| `HECC` | Kahire FIR | 1.285.843 |
| `LGGG` | Atina FIR | 534.801 |
| `ORBB` | Bağdat FIR | 431.782 |
| `LRBB` | Bükreş FIR | 289.440 |
| `LTBB` | İstanbul FIR | 219.623 |
| `UKFV` | Simferopol FIR | 209.221 |

**Ege kutusunun %80'i Atina FIR'ındadır.** Bu, o suyun kime ait olduğu hakkında bir şey söylemez; o hava sahasında hava trafik hizmetini hangi devletin verdiğini söyler. İki soru farklıdır ve bu sayfa ikisini karıştırmamak için vardır.

### Yapılmayan

Hiçbir uçak. Konum yok, iz yok, çağrı işareti yok, uçuş yok. Bu bir yapı haritasıdır, kimin uçtuğunun haritası değil. Bir sivil geminin konumunu yayımlamama gerekçesi (ADR 0022) bir uçak için de aynen geçerlidir.

### Yeniden üretmek

```bash
python tools/air/build_fir.py --refresh
```

## English

A flight information region is the airspace in which a state provides air traffic and flight
information services. It is not sovereignty and it is not a claim: ICAO assigns it through regional
air navigation plans, and it routinely covers open water and reaches other states' coasts. A
maritime dispute and a FIR are argued on entirely different grounds, and treating them as the same
thing is where most of the bad commentary about this region begins.

The boundaries come from the [VAT-Spy Data Project](https://github.com/vatsimnetwork/vatspy-data-project)
under **CC BY-SA 4.0**, and this derived file is published under the same licence. They are
maintained by a flight-simulation network from published aeronautical information: close, openly
licensed, and **not an aeronautical source**. The authority for a boundary is the relevant state's
AIP. Every record is marked `schematic: true` and the page carries the warning where it cannot be
missed. **Not for navigation, and not evidence of where a boundary legally runs.**

Areas are measured on the WGS84 ellipsoid with `pyproj.Geod`, because a box in degrees is not an
area. For each sea box the builder computes how much of it falls in each FIR; shares under 0.5% are
dropped, and whatever the listed FIRs do not cover is shown hatched rather than rounded away so the
bar always reaches a hundred.

Today: **80% of the Aegean box lies in the Athinai FIR** and 20% in the Istanbul FIR. That says
nothing about who the water belongs to. It says which state provides air traffic services in that
airspace — a different question, which is the reason this page exists.

No aircraft: no position, no track, no callsign, no flight. The reason a civilian vessel's position
is not published here (ADR 0022) applies to an aircraft in exactly the same way.
