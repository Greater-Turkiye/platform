# collectors/state

[Türkçe](#türkçe) · [English](#english)

## Türkçe

Zamanlanmış toplama işinin ([`.github/workflows/collect.yml`](../../.github/workflows/collect.yml))
çalışmalar arasında hatırladığı tek şey burada tutulur: `seen.jsonl`, yani **tekilleştirme
defteri**. Bir sonraki çalışma aynı öğeyi ikinci kez insanın önüne koymasın diye kullanılır.

- Dosya `main` üzerinde **yoktur**; `main` korumalıdır ve bot oraya yazmaz. Defter, ilk çalışmanın
  oluşturduğu **`collector-state`** dalında, bu dizinde durur:
  <https://github.com/Greater-Turkiye/platform/blob/collector-state/collectors/state/seen.jsonl>
- Her satır tek bir JSON nesnesidir: `{"id","simhash","seen"}`. Bağlantı, başlık veya metin
  saklanmaz. `id`, sinyalin `content_hash` değerinin ilk 12 onaltılık karakteridir ve inceleme
  konusundaki kimliğin aynısıdır.
- Kayıtlar 90 günden eski olunca ve dosya 5.000 satırı aşınca en eskiden başlayarak budanır
  (`gt_collectors.state`). Böylece dosya kalıcı olarak küçük kalır.
- Defteri sıfırlamak = `collector-state` dalını silmek. Bir sonraki çalışma boş defterle başlar ve
  akışlardaki her öğeyi yeniden aday sayar.

## English

This directory holds the only thing the scheduled collection job
([`.github/workflows/collect.yml`](../../.github/workflows/collect.yml)) remembers between runs:
`seen.jsonl`, the **deduplication ledger**, so the next run does not put the same item in front of
a human twice.

- The file is **not** on `main`: `main` is protected and the bot never writes there. The ledger
  lives in this directory on the **`collector-state`** branch, created by the first run:
  <https://github.com/Greater-Turkiye/platform/blob/collector-state/collectors/state/seen.jsonl>
- One JSON object per line, `{"id","simhash","seen"}`. No link, no title, no text is stored.
  `id` is the first 12 hex characters of the signal's `content_hash` — the same dedup id that the
  review issue shows.
- Entries are pruned when they are older than 90 days, and again from the oldest end if the file
  passes 5,000 lines (`gt_collectors.state`), so it stays small forever.
- To reset the ledger, delete the `collector-state` branch: the next run starts empty and treats
  everything still in the feeds as a new candidate.
