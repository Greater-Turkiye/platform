# publishers

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: tasarım. Henüz kod yok. / Status: design. No code yet.

---

## Türkçe

`publisher` Worker'ı, Cloudflare Queue'daki yayın mesajlarını tüketir ve onaylanmış içeriği kanallara gönderir. Kuyruğa yalnızca iki yoldan mesaj girer: Telegram inceleyici grubunda bir gözden geçiricinin "bülten gönder" onayı veya `datasets` deposunda birleştirilmiş bir kayıt. Otomasyon hiçbir zaman kendi başına kuyruğa mesaj koyamaz.

Kurallar:

- Her gönderi kaynağa **atfedilir** ("X'e göre", "X açıkladı"); kaynağın iddiası gerçek gibi yazılmaz.
- Bültenler yalnızca A–B güvenilirlikteki kaynaklardan gelir ve her zaman **"DOĞRULANMAMIŞ"** etiketini taşır.
- Görsel paylaşımında esir/kayıp görüntüsü, kişisel veri veya Türk kuvvetlerine ait konum bulunamaz.
- Hız sınırları ve acil durdurma her gönderiden önce kontrol edilir.
- Bir kayıt düzeltildiğinde veya kaldırıldığında otomatik **düzeltme** gönderisi yayımlanır.

## English

The `publisher` Worker consumes publish messages from a Cloudflare Queue and sends approved content to the channels. Messages enter the queue in only two ways: a reviewer's "send as bulletin" approval in the Telegram reviewer group, or a record merged in the `datasets` repository. Automation can never enqueue a message on its own.

Rules:

- Every post is **attributed** ("according to X", "X announced"); a source's claim is never written as fact.
- Bulletins come only from A–B rated sources and always carry the **"UNVERIFIED"** label.
- Shared images must never show POWs/casualties, personal data or Turkish forces positions.
- Rate limits and the kill switch are checked before every post.
- When a record is corrected or removed, an automatic **correction** post is published.

---

## Teknik başvuru / Technical reference

### Mesaj sözleşmesi / Message contract

```json
{
  "type": "bulletin",
  "publication_id": "pub_…",
  "record_id": null,
  "corrects_publication_id": null,
  "channels": ["telegram-tr", "bluesky-en", "feed"],
  "text_tr": "…",
  "text_en": "…",
  "sources": [
    { "name": "…", "url": "https://…", "archive_url": "https://web.archive.org/…", "rating": "B" }
  ],
  "approved_by": "reviewer-handle",
  "idempotency_key": "…"
}
```

- `type`: `bulletin` | `record` | `correction`.
- `record_id`: `record` ve kayıtla ilgili `correction` için zorunlu (`evt_…`). / Required for `record` and record-related `correction`.
- `idempotency_key`: aynı mesaj iki kez işlenirse ikinci gönderi yapılmaz (`publications` tablosunda UNIQUE). / Prevents double posting (UNIQUE in `publications`).
- Başarılı gönderide kanalın gönderi kimliği ve bağlantısı `publications` tablosuna yazılır; düzeltmeler bununla orijinal gönderiye bağlanır. / On success, the channel's post ID and URL are stored in `publications`; corrections link back to the original post through it.

### Kanallar / Channels

| Kanal / Channel | Dil / Lang | Yöntem / Method | Durum / Status |
|---|---|---|---|
| Telegram kanalı / channel | TR | Bot API, kanala gönderim / post to channel | Aşama 4 / Phase 4 (ana kanal / main) |
| Bluesky | EN | AT Protocol, uygulama parolası / app password | Aşama 4 / Phase 4 |
| RSS / JSON Feed | TR, EN | `api` Worker'ı `publications` tablosundan sunar / served by `api` from `publications` | Aşama 4 / Phase 4 |
| X | TR/EN | Elle; bot kopyalamaya hazır metin verir / Manual; bot provides copy-ready text | Ücretsiz API yok / No free API |
| Instagram | TR | Elle / Manual | — |
| Mastodon | EN | API | Sonra / Later |

### Hız sınırları / Rate limits

- Kanal başına **saatte en fazla 4**, **günde en fazla 30** gönderi (UTC günü). / At most **4 per hour** and **30 per day** per channel (UTC day).
- Sayım `publications` tablosundan yapılır. Sınır aşılırsa mesaj gecikmeli yeniden denemeye alınır; düzeltmeler sıranın önüne geçer ama sınıra dahildir. / Counted from `publications`. Over the limit, the message is retried with a delay; corrections jump the queue but still count.

### Acil durdurma / Kill switch

- KV anahtarı `publish:paused` (`"1"` = durdur). / KV key `publish:paused` (`"1"` = paused).
- İnceleyici grubundaki **her gözden geçirici** `/stop` ile açabilir; yalnızca **yöneticiler** `/resume` ile kapatabilir. / **Any reviewer** can set it with `/stop`; only **maintainers** can clear it with `/resume`.
- Durdurulmuşken tüketici mesajları onaylar ve `publications` tablosuna `held` olarak yazar; `/resume` sonrası bekleyenler yeniden gözden geçirilip kuyruğa alınır. / While paused, the consumer acks messages and stores them as `held`; after `/resume`, held items are reviewed again and re-enqueued.

### Gönderi şablonları / Post templates

Açılı ayraç içindeki alanlar yer tutucudur. / Fields in angle brackets are placeholders.

**Bülten (TR)**

```text
[DOĞRULANMAMIŞ] <Kaynak>, <tarih, UTC> tarihinde <bölge>'de <olayın kısa özeti> olduğunu açıkladı.

Kaynak: <Kaynak adı> — <bağlantı>
Arşiv: <arşiv bağlantısı>

Bu iddia kaynağa aittir ve Greater Türkiye tarafından bağımsız olarak doğrulanmamıştır.
```

**Bulletin (EN)**

```text
[UNVERIFIED] <Source> said on <date, UTC> that <short summary of the event> in <region>.

Source: <source name> — <link>
Archive: <archive link>

This claim is the source's and has not been independently verified by Greater Türkiye.
```

**Kayıt (TR)**

```text
[KAYIT] <evt_…> — <kısa başlık>
Ne: <kaynaklara atfedilmiş özet>
Nerede: <bölge> (<yer>)
Ne zaman: <tarih> (UTC)
Güven: <düzey>
Kaynaklar: <kaynak 1>, <kaynak 2>
Kayıt: https://github.com/Greater-Turkiye/datasets/blob/main/<kayıt yolu>
```

**Record (EN)**

```text
[RECORD] <evt_…> — <short title>
What: <summary attributed to sources>
Where: <region> (<place>)
When: <date> (UTC)
Confidence: <level>
Sources: <source 1>, <source 2>
Record: https://github.com/Greater-Turkiye/datasets/blob/main/<record path>
```

**Düzeltme / Correction**

```text
[DÜZELTME] <tarih> tarihli paylaşımımızda <hatalı bilgi> yer aldı. Doğrusu: <doğru bilgi>. Kayıt güncellendi: <bağlantı>

[CORRECTION] Our post of <date> stated <incorrect information>. Correct: <correct information>. Record updated: <link>
```

Kaldırılan (tombstone) kayıtlar için orijinal gönderi mümkünse silinir ve kaldırma nedeni kategorisi dışında ayrıntı verilmeden kısa bir düzeltme yayımlanır. / For tombstoned records, the original post is deleted where possible and a short correction is published without details beyond the removal reason category.

### Sırlar (yalnızca adlar) / Secrets (names only)

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`

### Bağlamalar / Bindings

D1 `OPS_DB` · KV `CONFIG` · Queue consumer `PUBLISH_QUEUE`
