# tools/perf — ne kadara mal oluyor / what it costs

[Türkçe](#türkçe) · [English](#english)

## Türkçe

Siteyi **ölçer**, tahmin etmez. Headless Chrome'u DevTools protokolüyle sürer, CPU'yu kısar (4×, orta hâlli bir dizüstü yerine geçer; kısmadan her sayı iyi görünür ve hiçbir şey söylemez), `runs.json` içindeki senaryoyu çalıştırır ve üç şeyi raporlar:

| Ne | Nereden |
|---|---|
| Kare süreleri — p50 / p90 / p99 ve en kötü kare | sayfanın kendi `requestAnimationFrame`'i |
| Bloke süre — ana iş parçacığının tıkalı geçirdiği milisaniye | `PerformanceObserver` (`longtask`) |
| Nereye gitti — betik, yerleşim, biçem süreleri; yerleşim ve yeniden biçem sayıları; düğüm sayısı | `Performance.getMetrics` |

```bash
# siteyi bir yerden sun: web/ ve datasets/ yan yana olmalı (panel veriyi ../datasets/ altında arar)
python -m http.server 8778          # site kökünde

node tools/perf/measure.mjs --base http://127.0.0.1:8778/web
node tools/perf/measure.mjs --base http://127.0.0.1:8778/web --only panel-zoom --out perf-out
```

**Bütçe.** `runs.json` içindeki `budget`, ölçümü kontrole çevirir: aşılırsa komut sıfırdan farklı çıkar ve hangi koşunun hangi sayısının aşıldığını yazar. Bir iyileştirme yaptığınızda bütçeyi de sıkın; yoksa kazanılan yer sessizce geri verilir.

**Önbellek kapalıdır.** Aksi hâlde diskteki kodu değil, tarayıcının sakladığı kopyayı ölçersiniz — bu tuzağa bir kez düştük.

**Her koşu bir `.cpuprofile` bırakır**; DevTools'ta açılır, işlev düzeyinde bakmak gerektiğinde oradan bakılır.

**Gürültü gerçektir.** Aynı koşu aynı makinede %15 oynar. Bir değişikliğin işe yarayıp yaramadığına tek koşuyla karar vermeyin: önce/sonra için `git stash` ile iki kez ölçün ve farkı gürültüyle karşılaştırın. (`will-change: transform` böyle elendi: iyi bir fikir gibi görünüyordu, ölçünce kötüleştiriyordu.)

## English

Measures the site instead of guessing at it. It drives headless Chrome over the DevTools Protocol, throttles the CPU (4× stands in for a modest laptop; without throttling every number looks fine and tells you nothing), runs the scripted interaction in `runs.json` and reports frame times, blocked time and where the time went.

`budget` in `runs.json` turns a measurement into a check: exceeding it exits non-zero and names the figure. The browser cache is disabled, because otherwise you measure a cached copy rather than the code on disk. Each run leaves a `.cpuprofile` next to the report for a closer look.

Noise is real — the same run moves by about 15% on the same machine. Decide with a before/after pair (`git stash`), not with one run. That is how `will-change: transform` was rejected: it read like an optimisation and measured like a regression.

## Bugünkü sayılar / Today's numbers

2026-09-20, 4× CPU, 1400×900 (telefon koşusu 390×844, 6×). Tarayıcı önbelleği kapalı.

| Koşu / Run | p90 | En kötü kare / worst | Bloke / blocked |
|---|---:|---:|---:|
| `home-idle` (önce / before) | 83 ms | 983 ms | 3.937 ms |
| `home-idle` (sonra / after) | 67 ms | **100 ms** | 3.062 ms |
| `panel-idle` (önce / before) | 17 ms | 1.083 ms | 0 ms |
| `panel-idle` (sonra / after) | 17 ms | **33 ms** | 0 ms |
| `panel-zoom` | 50 ms | ~1.450 ms | ~4.050 ms |

`panel-zoom`'un maliyeti MapLibre'nin kendisidir ve bilinçli bir takastır ([ADR 0018](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0018-self-hosted-vector-basemap.md)): altlık yalnızca 1,6× yakınlaştırmadan sonra yüklenir. Ölçüm, o karardan sonra geriye kalanı gösterir. / The cost of `panel-zoom` is MapLibre itself, a deliberate trade: the basemap loads only past 1.6×.
