# publishers

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: tasarım + **çalışan ama hiçbir şey göndermeyen** iskelet. Hiçbir kimlik bilgisi yok, hiçbir kanal açık değil.
> Status: design plus a **runnable but inert** skeleton. No credential exists, and no channel is switched on.

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

### İskelet / Skeleton

`gt_publishers` paketi çalışır ama **hiçbir şey gönderemez**: içinde ağ istemcisi yoktur, hiçbir modül bir ağ
kütüphanesi içe aktarmaz (bir test bunu her PR'da denetler) ve `deliver()` her zaman bir ret döndürür. Standart
kütüphane dışında bağımlılığı yoktur.
The `gt_publishers` package runs but **cannot post**: it contains no network client, no module imports a
networking library (a test enforces this on every pull request), and `deliver()` always returns a refusal.
It has no dependency beyond the standard library.

```
publishers/gt_publishers/message.py    mesaj sözleşmesi + içerik denetimleri / message contract + content checks
publishers/gt_publishers/approval.py   insan onayı kapısı ve acil durdurma / the human-approval gate and kill switch
publishers/gt_publishers/channels.py   kanallar, hız sınırları, render; gönderim yok / channels, rate limits, rendering; no sending
publishers/gt_publishers/cli.py        channels | draft | check | publish
publishers/examples/                   sentetik örnek mesaj / a synthetic example message
publishers/tests/                      pytest
```

```bash
cd publishers
python -m gt_publishers channels                                   # kanallar, sırların adları, sınırlar / channels, secret names, limits
python -m gt_publishers draft   --message examples/bulletin.example.json
python -m gt_publishers check   --message examples/bulletin.example.json   # CI bunu çalıştırır / CI runs this
python -m gt_publishers publish --message examples/bulletin.example.json   # reddeder ve nedenini yazar / refuses, and says why
python -m pip install "pytest>=9,<10" && python -m pytest -q tests
```

`check` şunları arar / `check` looks for: bültende her iki dilde `[DOĞRULANMAMIŞ]` / `[UNVERIFIED]` etiketi,
yalnızca A–B güvenilirlikte kaynak, metinde kaynağın adı, beyan edilmemiş bağlantı yokluğu, kanal uzunluk sınırı.
Uzun bir gönderi **kısaltılmaz, reddedilir**; kısaltmayı insan yapar. / A long post is refused, never truncated;
a human shortens it.

`publish`, gerçek yayın adımının şeklidir ve her koşulda reddeder: onay yoksa `blocked:not-approved`, sır yoksa
`skipped:no-secret`, sınır aşıldıysa `held:rate-limit`, hepsi tamamsa `blocked:not-implemented`.
`publish` is the shape of the real publishing step and refuses in every case, naming the gate that stopped it.

### İnsan onayı / Human approval

İki kapı, ikisi de insandır (ADR 0007). / Two gates, both human (ADR 0007).

1. **Gözden geçirici onayı:** mesajın `approved_by` alanı, inceleyici grubunda "bülten gönder" diyen kişidir.
   Boşsa mesaj sözleşmeyi geçemez. / The reviewer who approved the content in the reviewer group; without it
   the message is not even a valid message.
2. **Gönderim anındaki onay:** işi çalıştıran bakımcı, onay cümlesini **harfi harfine** yazar:
   `I HAVE READ THIS DRAFT AND APPROVE POSTING`. Varsayılanlarla "Run workflow" demek hiçbir şey yapmaz.
   / The maintainer running the job types the confirmation phrase exactly; running the workflow with its
   defaults does nothing.

Acil durdurma her şeyi yener: `PUBLISH_PAUSED=1` (KV'deki `publish:paused` anahtarının karşılığı) varken onay
verilmiş bir mesaj bile gönderilmez. / The kill switch beats everything: with `PUBLISH_PAUSED=1` even an
approved message is refused.

### İş akışları / Workflows

| Dosya / File | Tetikleyici / Trigger | Ne yapar / What it does |
|---|---|---|
| [`.github/workflows/publishers-ci.yml`](../.github/workflows/publishers-ci.yml) | `pull_request` (`publishers/**`) | Testler ve örnek mesajın denetimi / tests and the example message's checks |
| [`.github/workflows/publishers-draft.yml`](../.github/workflows/publishers-draft.yml) | yalnızca `workflow_dispatch` + zorunlu `confirm` girdisi / `workflow_dispatch` only, with a required `confirm` input | Taslağı üretip iş özetine yazar; `publish` adımı reddeder / renders the draft into the job summary; the publish step refuses |

`publishers-draft.yml` kanal sırlarını çevreye aktarır ama **sırlar yoktur**: tanımsız bir sır boş dizeye çözülür,
her kanal `skipped:no-secret` der ve iş yeşil biter. Zamanlama, `push` veya `pull_request` tetikleyicisi yoktur.
It wires the channel secrets into the environment although **none exist**: an undefined secret resolves to an
empty string, every channel reports `skipped:no-secret`, and the job still ends green. There is no schedule and
no automatic trigger.

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
| Telegram kanalı / channel | TR | Bot API, kanala gönderim / post to channel | İskelet; hesap yok / skeleton, no account (Aşama 4 / Phase 4) |
| Bluesky | EN | AT Protocol, uygulama parolası / app password | İskelet; hesap yok / skeleton, no account (Aşama 4 / Phase 4) |
| RSS / JSON Feed | TR, EN | Kamu akışı `datasets` derlemesinde üretilir (`feed.xml`, `feed.json`, `feed.md`), `pages.yml` yayımlar / the public feed is built by `datasets` and published by `pages.yml` | Akış yayında, bülten rölesi iskelet / feed live, bulletin relay skeleton |
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

Bu depoda hiçbir değer yoktur ve olmayacaktır; yalnızca adlar.
No value lives in this repository and none ever will; these are names only.

| Kanal / Channel | Sır adları / Secret names | Nereden gelir / Where it comes from |
|---|---|---|
| `telegram-tr` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID` | @BotFather ile oluşturulan bot; kanalın yöneticisi yapılır / a bot created with @BotFather, made an admin of the channel |
| `bluesky-en` | `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` | Hesap ayarlarındaki **uygulama parolası** — iptal edilebilir, hesap parolası değil / an **app password** from the account settings: revocable, never the account password |
| `feed` | — | Kimlik bilgisi gerekmez / needs no credential |

`PUBLISH_PAUSED` bir sır değil, bir **repository variable**'dır: `1` iken hiçbir şey gönderilmez.
`PUBLISH_PAUSED` is a repository **variable**, not a secret: while it is `1`, nothing is posted.

### Bir kanalı açmak / Switching a channel on

Bugün hiçbiri yapılmamıştır ve hiçbiri bir yapay zekâ aracısı tarafından yapılamaz — her adım bir insan hesabı
gerektirir. / None of this has been done, and none of it can be done by an agent: every step needs a human account.

**Telegram (TR)**

1. @BotFather ile bir bot oluştur, token'ı al. / Create a bot with @BotFather and take the token.
2. Kanalı aç, botu "post messages" yetkisiyle yönetici yap, kanal kimliğini (`-100…`) not et. / Create the
   channel, make the bot an administrator with "post messages", and note the channel ID.
3. `Settings → Secrets and variables → Actions` altında `TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHANNEL_ID` ekle.
   / Add the two secrets in the repository settings.
4. Telegram istemcisini ekleyen bir PR aç ve birleştir; PR, ADR 0007'ye ve yukarıdaki onay kapısına göre
   incelenir. / Open and merge a pull request that adds the Telegram client, reviewed against ADR 0007 and the
   approval gate above.
5. `publishers-draft.yml`'i onay cümlesiyle elle çalıştır ve önce tek bir test gönderisi yap. / Run the workflow
   by hand with the confirmation phrase, and send a single test post first.

**Bluesky (EN)**

1. Hesabı aç. / Create the account.
2. `Settings → Privacy and security → App passwords` ile bir uygulama parolası üret. / Generate an app password.
3. `BLUESKY_HANDLE` ve `BLUESKY_APP_PASSWORD` sırlarını ekle. / Add the two secrets.
4. AT Protocol istemcisini ekleyen PR'ı aç ve birleştir; 300 karakter sınırı ve arşiv bağlantısının yanıta
   taşınması bu PR'ın kapsamındadır. / Open and merge the pull request that adds the AT Protocol client,
   including the 300-character limit and moving the archive link into a reply.
5. Elle çalıştır, tek bir test gönderisiyle doğrula. / Run it by hand and verify with one test post.

**RSS / JSON Feed**

Zaten açık ve hesap gerektirmez: `datasets` derlemesi `dist/feed.xml`, `dist/feed.json` ve 7 günlük
`dist/feed.md` özetini üretir, `pages.yml` bunları yayımlar. Bülten rölesi ayrı bir PR'dır. / Already on and
account-free: the `datasets` build writes the feed files and `pages.yml` publishes them. The bulletin relay is a
separate pull request.

### Bağlamalar / Bindings

D1 `OPS_DB` · KV `CONFIG` · Queue consumer `PUBLISH_QUEUE`
