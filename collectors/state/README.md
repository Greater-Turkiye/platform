# collectors/state

[Türkçe](#türkçe) · [English](#english)

## Türkçe

Zamanlanmış toplama işinin ([`.github/workflows/collect.yml`](../../.github/workflows/collect.yml))
çalışmalar arasında bıraktığı iki şey burada tutulur: **tekilleştirme defteri** `seen.jsonl` ve
**yayımlanan partiler** `batches/`. İkisi de `main` üzerinde **yoktur**; `main` korumalıdır ve bot
oraya yazmaz. İkisi de, ilk çalışmanın oluşturduğu **`collector-state`** dalında, bu dizindedir.

### `seen.jsonl` — tekilleştirme defteri

Bir sonraki çalışma aynı öğeyi ikinci kez insanın önüne koymasın diye kullanılır.
<https://github.com/Greater-Turkiye/platform/blob/collector-state/collectors/state/seen.jsonl>

- Her satır tek bir JSON nesnesidir: `{"id","simhash","seen"}`. Bağlantı, başlık veya metin
  saklanmaz. `id`, sinyalin `content_hash` değerinin ilk 12 onaltılık karakteridir ve inceleme
  konusundaki kimliğin aynısıdır.
- Kayıtlar 90 günden eski olunca ve dosya 5.000 satırı aşınca en eskiden başlayarak budanır
  (`gt_collectors.state`). Böylece dosya kalıcı olarak küçük kalır.
- Defteri sıfırlamak = `collector-state` dalını silmek. Bir sonraki çalışma boş defterle başlar ve
  akışlardaki her öğeyi yeniden aday sayar.

### `batches/` — D1'e giden parti

[`apps/ingest`](../../apps/ingest) Worker'ının çektiği dosyalar. Her çalışma bir tarihli parti
dosyası (`2026-09-16-<run id>.json`) ve en yenisini gösteren tek bir `latest.json` işaretçisi
yazar. Biçim: [`gt_collectors.batch`](../src/gt_collectors/batch.py).

- İçindeki her satır, tam olarak `gt-signals.signals` satırıdır: aynı 16 sütun, aynı değerler
  (yalnızca `simhash` 16 onaltılık karakterdir, çünkü JSON sayısı 64 biti tutamaz). Yani burada
  D1'e zaten giren bilgiden fazlası **yoktur**.
- Güvenlik süzgecinin veya coğrafi çitin elediği hiçbir kayıt buraya yazılmaz; süzgeç parti
  yazılmadan önce yeniden uygulanır.
- Partiler 14 günden eski olunca ve dosya sayısı 14'ü aşınca en eskiden başlayarak silinir, defter
  gibi. Bir Worker yalnızca `latest.json` ile onun gösterdiği tek dosyayı okur.
- Bu yüzden iş akışının hiçbir Cloudflare sırrına ihtiyacı yoktur: veriyi Actions itmez, Worker
  çeker.

## English

This directory holds the two things the scheduled collection job leaves behind between runs: the
**deduplication ledger** `seen.jsonl` and the **published batches** in `batches/`. Neither is on
`main` — `main` is protected and the bot never writes there — and both live in this directory on
the **`collector-state`** branch, created by the first run.

### `seen.jsonl` — the deduplication ledger

So the next run does not put the same item in front of a human twice.
<https://github.com/Greater-Turkiye/platform/blob/collector-state/collectors/state/seen.jsonl>

- One JSON object per line, `{"id","simhash","seen"}`. No link, no title, no text is stored.
  `id` is the first 12 hex characters of the signal's `content_hash` — the same dedup id that the
  review issue shows.
- Entries are pruned when they are older than 90 days, and again from the oldest end if the file
  passes 5,000 lines (`gt_collectors.state`), so it stays small forever.
- To reset the ledger, delete the `collector-state` branch: the next run starts empty and treats
  everything still in the feeds as a new candidate.

### `batches/` — the batch on its way to D1

The files the [`apps/ingest`](../../apps/ingest) Worker pulls. Each run writes one dated batch file
(`2026-09-16-<run id>.json`) and one `latest.json` pointer naming the newest. The format is defined
by [`gt_collectors.batch`](../src/gt_collectors/batch.py).

- Every row in a batch is exactly one `gt-signals.signals` row: the same sixteen columns with the
  same values (only `simhash` travels as 16 hex characters, because a JSON number cannot hold 64
  bits). There is nothing here beyond what already goes into D1.
- Nothing the safety filter or the geofence dropped is ever written here: the filter runs again
  before the batch is written.
- Batches are deleted once they are older than 14 days, and from the oldest end once there are
  more than 14 files — pruned like the ledger. A consumer only ever reads `latest.json` and the
  one file it names.
- This is why the workflow needs no Cloudflare secret at all: Actions does not push the data, the
  Worker pulls it.
