# apps/review-bot

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: **dağıtıldı ve bağlandı** (`gt-review-bot`). Bot hesabı açıldı, dört sır Cloudflare'de oluşturuldu, webhook kuruldu ve bakımcı `reviewers` tablosuna eklendi. Sırların hiçbiri bu depoda değildir ve olmayacaktır. / Status: **deployed and connected** (`gt-review-bot`). The bot account exists, the four secrets are stored in Cloudflare, the webhook is registered and the maintainer is in the `reviewers` table. None of the secrets are in this repository and none ever will be.

## Türkçe

`review-bot`, bakımcının toplanan adayları telefonundan tek tek elden geçirmesini sağlayan **özel** bir Cloudflare Worker'ıdır. GitHub'daki inceleme kuyruğunun yerine geçmez, ona bir ön yüz ekler: aynı `gt-ops` tablolarını okur, aynı kırmızı çizgi uyarısını taşır ve kararı aynı yere yazar.

Bot **karar vermez ve hiçbir şey yayımlamaz** ([ADR 0007](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0007-human-in-the-loop-publishing.md)). Yaptığı üç şey vardır: sırada ne olduğunu göstermek, insanın dokunduğu düğmeyi `gt-ops` veritabanına yazmak, ve bunu yalnızca tek bir özel sohbette yapmak. **Onayla** düğmesi bir sinyali yalnızca "taslağa uygun" (`drafted`) olarak işaretler; kaydın kendisi hâlâ GitHub'da, `datasets` deposunda, bir insan tarafından açılır.

Türk kuvvetlerinden söz eden aday metinleri bot tarafından **hiç aktarılmaz**: öğe yine kuyrukta görünür, ama yalnızca bağlantı ve puan olarak; metni gözden geçirici kaynağından okur.

## English

`review-bot` is a **private** Cloudflare Worker that lets the maintainer triage collected candidates from a phone instead of opening GitHub. It does not replace the GitHub review queue; it puts a front end on the same data: it reads the same `gt-ops` tables, carries the same red-line reminder, and writes the decision to the same place.

The bot **decides nothing and publishes nothing** ([ADR 0007](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0007-human-in-the-loop-publishing.md)). It does three things: show what is waiting, write down which button a human pressed, and do so in one private chat only. The **Onayla** button marks a signal approved for a draft record (`drafted`) and stops there; the record itself is still opened in GitHub, in the `datasets` repository, by a human.

Candidate text that names Turkish forces is **never relayed**: the item still appears in the queue, but as a link and a score only, and the reviewer reads the wording at the source.

---

## Teknik başvuru / Technical reference

### Komutlar / Commands

| Komut / Command | Etki / Effect |
|---|---|
| `/kuyruk`, `/queue` | Bekleyen adayları listeler (en eski önce, 5 satır) / list the waiting candidates, oldest first |
| `/sonraki`, `/next` | Sıradaki adayı kaynak bağlantısı, ilgi puanı ve düğmelerle gösterir / show the next candidate with its source link, relevance score and buttons |
| `/goster <id>`, `/show <id>` | Belirli bir adayı gösterir / show one candidate |
| `/durum`, `/status` | Duruma göre sayılar / counts per status |
| `/yardim`, `/help`, `/start` | Yardım / help |

Bir karara basıldığında — **Onayla**, **Reddet** veya **Sonra** — bot sıradaki adayı kendiliğinden gönderir; tur bittiğinde kaç adayın kuyrukta kaldığını söyler. Bir öğe başına tek dokunuş: telefonda kuyruk eritmenin tek makul yolu budur. / After any decision the bot sends the next candidate by itself and, at the end of a pass, says how many are still queued: one touch per item.

Tasarımdaki `/quota`, `/stop` ve `/resume` komutları **henüz yok**: yayın kuyruğu ve kota defteri bu Worker'a bağlı değil. / The `/quota`, `/stop` and `/resume` commands from the original design **do not exist yet**: the publish queue and the usage ledger are not wired to this Worker.

### Düğmeler / Buttons

| Düğme / Button | `reviews` | Ne yapar / What it does |
|---|---|---|
| ✅ **Onayla** | `status = 'drafted'`, `decided_by`, `decided_at` | Yalnızca "taslağa uygun" işaretidir. PR açılmaz, mesaj gönderilmez, hiçbir şey yayımlanmaz. / Marks it approved for a draft. No pull request, no post, nothing published. |
| 🚫 **Reddet** | `status = 'dismissed'`, `decided_by`, `decided_at` | Öğeyi kapatır / closes the item |
| ⏭ **Sonra** | `status` değişmez, `note` güncellenir | Karar değildir: öğe kuyrukta kalır, kimin ne zaman atladığı `note` alanına yazılır ve sıradaki aday gösterilir. / Not a decision: the item stays queued, who skipped it and when goes into `note`, and the next candidate is shown. |

Aynı düğmeye ikinci kez basmak hiçbir şeyi değiştirmez (`WHERE … AND status = 'queued'`); bot "zaten karara bağlanmış" der. / A second tap changes nothing and the bot says the item was already decided.

### "Onayla" ile GitHub yolu nasıl birleşir / How approval meets the GitHub path

Bu bot **kayıt üretmez**. Onay ile kayıt arasındaki yol bugün şudur:

```
collectors → gt-signals.signals → gt-ops.reviews (status='queued')
                                        │
                              review-bot: ✅ Onayla
                                        │
                          gt-ops.reviews.status = 'drafted'      ← bot burada durur / the bot stops here
                                        │
              (insan / a human) datasets deposunda veri önerisi issue'su
                                        │
                        maintainer/triager `kayda-gec` etiketini ekler
                                        │
          datasets/.github/workflows/record-from-issue.yml → taslak PR / draft PR
                                        │
                           PR'ı inceleyen insanlar kaydı doğrular
```

`kayda-gec` etiketi ["bu aday kayda değer" demektir, "bu doğrudur" demek değildir](https://github.com/Greater-Turkiye/datasets/blob/main/CONTRIBUTING.md); kaydı doğrulayan hâlâ PR'ı inceleyen insandır. Bot bu zincire hiçbir noktada girmez: ne issue açar, ne etiket ekler, ne PR açar.

The label means "this candidate is worth recording", not "this is true". The bot enters that chain nowhere: it does not open the issue, apply the label or open the pull request.

**Sonraki adım için dikiş / the seam for a later step.** Otomatik PR açacak adım tek bir yere bağlanır: `src/update.js` içindeki `onApproved({ reviewId, reviewerId })`. Bugün yalnızca günlüğe yazar. O gövde, GitHub App ile issue'yu (veya doğrudan taslak PR'ı) açıp `gt-ops.drafts` satırını (`review_id`, `kind`, `branch`, `pr_number`, `pr_url`, `promoted_by`) yazacak çağrıyla değiştirilir; `reviews` tarafında değişiklik gerekmez. Bunun için gereken sırlar (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`) **bu Worker'da yoktur** ve o adım gelene kadar eklenmemelidir. / The step that opens the pull request automatically plugs into one function, `onApproved` in `src/update.js`. It only logs today. Its body is replaced by the GitHub App call that files the issue (or the draft PR) and writes the `gt-ops.drafts` row; nothing on the `reviews` side changes. The secrets that step needs are not in this Worker and should not be added before it exists.

### Kırmızı çizgi / The red line

Handbook [02-red-lines](https://github.com/Greater-Turkiye/handbook/blob/main/tr/02-red-lines.md), ADR 0013, ADR 0015, `CLAUDE.md` §2.

- Her aday mesajı, GitHub kuyruğundaki konu başlığının taşıdığı hatırlatmayı taşır: bunlar doğrulanmamış adaylardır, kararı insan verir, Türk kuvvetlerinin konumu ve hareketleri hiçbir koşulda yayımlanmaz. / Every candidate message carries the same reminder the GitHub queue issue carries.
- **Aktarma yok:** başlık veya alıntı Türk kuvvetlerinden söz ediyorsa ya da koordinat içeriyorsa, bot metni hiç göndermez; öğe bağlantı + puan + 🚫 işaretiyle görünür (`src/redline.js`, `screenSourceText`). Terim listesi toplayıcılardaki `_REDLINE_TERMS` ile aynı tutulur. / No relaying: if the title or the excerpt names Turkish forces or carries a coordinate, the wording is not sent at all.
- **Son denetim:** gönderilen her mesaj `guardOutgoing` süzgecinden geçer. Kendi şablonlarımızda koordinat veya kare referansı bulunmaz; biri geçerse mesaj yerine sabit bir uyarı gönderilir. / A backstop over every outgoing message: a coordinate or grid reference in a finished message means something upstream is wrong, and a fixed notice is sent instead.
- Başka bir ülkenin kuvvetlerine ait konum/hareket dili aktarılır ama ⚠️ ile işaretlenir. / Positional language about anyone else is relayed, but flagged.

### Güvenlik / Security

- `X-Telegram-Bot-Api-Secret-Token` başlığı `TELEGRAM_WEBHOOK_SECRET` ile **sabit zamanlı** karşılaştırılır (iki taraf da SHA-256'lanır, döngü hep 32 bayt sürer). Uymayan istek 401. / Compared in constant time; anything else is a 401.
- Güncelleme `TELEGRAM_REVIEW_CHAT_ID` dışındaki bir sohbetten ya da `TELEGRAM_ALLOWED_USER_IDS` dışındaki bir kullanıcıdan geliyorsa 401; veritabanına dokunulmaz. / An update from any other chat or user is a 401 and never reaches the database.
- Ret kayıtlarında **içerik yoktur**: yalnızca bir sebep ve `update_id` günlüğe yazılır. / Rejections are logged as a reason and an update id, never as content.
- Karar yazmak için ayrıca `gt-ops.reviewers` tablosunda etkin bir satır gerekir. Bot bu satırı **oluşturamaz**; bakımcı elle ekler. Tabloda gerçek ad ve iletişim bilgisi tutulmaz, bot da yazmaz. / Writing a decision additionally needs an active row in `gt-ops.reviewers`. The bot cannot create one. That table holds no real name and no contact detail, and the bot never writes one.
- Giden mesajlarda `chat_id` bir değişken değildir: `src/telegram.js` her zaman `TELEGRAM_REVIEW_CHAT_ID` kullanır, başka bir sohbete gönderecek kod yolu yoktur. / `chat_id` is not a parameter anywhere: there is no code path that could post to another chat.
- Sırlardan biri eksikse Worker **her isteği** 503 ile reddeder; kısıtlı kipte çalışmaz. / With any secret missing, the Worker refuses every request with 503; there is no degraded mode.
- Bot medya indirmez, dosya kabul etmez, komut dışındaki mesajlara cevap vermez. / The bot downloads no media, accepts no files and does not answer ordinary chat.

### Bağlamalar / Bindings

| Bağlama / Binding | D1 | `database_id` |
|---|---|---|
| `OPS_DB` | `gt-ops` | `7cb22146-fca6-4193-b9a1-7bfa923dd783` |
| `SIGNALS_DB` | `gt-signals` | `c7e4f26e-c0c8-4120-a00f-fb88abdf8ed6` |

Veritabanı kimlikleri sır değildir; erişim Cloudflare hesap yetkisiyle olur ([db/README.md](../../db/README.md)). Bu Worker şemaya tablo veya sütun eklemez. / Database ids are not secrets; the Worker adds no table and no column.

Okuduğu/yazdığı tablolar / tables it touches: `reviews` (okuma + karar yazma), `reviewers` (yalnızca okuma), `signals` (yalnızca okuma). `drafts`, `publications`, `usage_ledger`, `collector_state` tablolarına dokunmaz. / It never touches `drafts`, `publications`, `usage_ledger` or `collector_state`.

### Sırlar / Secrets

Hiçbiri depoda değildir, hiçbiri bir araç tarafından oluşturulmaz; dördünü de bir insan `wrangler secret put` ile koyar. / None of them is in the repository and none is created by tooling: a human sets all four.

| Ad / Name | Ne / What | Nereden / Where it comes from |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot API belirteci / bot API token | BotFather, `/newbot` |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram'ın her istekte geri yolladığı başlık değeri / the value Telegram echoes in the header | Kendiniz üretirsiniz: 32+ rastgele karakter (`openssl rand -hex 32`) |
| `TELEGRAM_REVIEW_CHAT_ID` | Tek özel sohbetin kimliği / the id of the one private chat | `getUpdates` çıktısındaki `chat.id` (gruplarda negatif) |
| `TELEGRAM_ALLOWED_USER_IDS` | Virgülle ayrılmış sayısal kullanıcı kimlikleri / comma-separated numeric user ids | `getUpdates` çıktısındaki `from.id` |

```bash
cd apps/review-bot
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_REVIEW_CHAT_ID
npx wrangler secret put TELEGRAM_ALLOWED_USER_IDS
npx wrangler secret list          # yalnızca adları gösterir / names only
```

Yerel geliştirme için `.dev.vars` kullanılır ve **asla commit edilmez** (`.gitignore` içinde). / Local development uses `.dev.vars`, which is git-ignored and never committed.

### Botu oluşturma / Creating the bot (BotFather)

1. Telegram'da [@BotFather](https://t.me/BotFather) → `/newbot` → ad ve `_bot` ile biten kullanıcı adı. Dönen belirteci **yalnızca** `wrangler secret put TELEGRAM_BOT_TOKEN` ile saklayın. / Store the returned token only through `wrangler secret put`.
2. `/setprivacy` → **Enable**: bot grupta yalnızca kendi komutlarını görür. / the bot then sees only its own commands in a group.
3. `/setjoingroups` → **Disable** (bot yalnızca sizin eklediğiniz sohbette olsun; grubu kurduktan sonra kapatın) ve `/setcommands` ile komut listesini yazın. / Disable joining other groups after you have added it to yours.
4. Özel bir grup (ya da doğrudan sohbet) oluşturun, botu ekleyin, grubun davet bağlantısını kapatın. Grupta bir mesaj atıp sohbet kimliğini öğrenin:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | python -m json.tool
   # chat.id → TELEGRAM_REVIEW_CHAT_ID, from.id → TELEGRAM_ALLOWED_USER_IDS
   ```
5. Gözden geçirici satırını ekleyin (gerçek ad veya iletişim bilgisi **yok**):
   ```bash
   npx wrangler d1 execute gt-ops --remote \
     --command "INSERT INTO reviewers (telegram_user_id, role) VALUES (<USER_ID>, 'maintainer')"
   ```

### Webhook'u kurma ve kaldırma / Setting and removing the webhook

```bash
# kurma / set — sadece iki güncelleme türü istenir
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<worker>.workers.dev/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d "allowed_updates=[\"message\",\"callback_query\"]" \
  -d "max_connections=2"

# denetim / check
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# kaldırma / remove
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/deleteWebhook" -d "drop_pending_updates=true"
```

### İptal / Revoking

1. `deleteWebhook` — Telegram artık Worker'a bir şey göndermez. / Telegram stops delivering.
2. BotFather → `/revoke` — belirteç geçersiz olur. / the token is invalidated.
3. `npx wrangler secret delete TELEGRAM_BOT_TOKEN` (ve gerekirse diğer üçü) — Worker artık **her isteği** reddeder. / the Worker then refuses every request.
4. Erişimi kalıcı kapatmak için: `UPDATE reviewers SET active = 0 WHERE telegram_user_id = <id>` ve kimliği `TELEGRAM_ALLOWED_USER_IDS` içinden çıkarın. / To remove a person: deactivate the row and drop the id from the allow-list.
5. Botu tamamen kaldırmak için BotFather → `/deletebot`. / To remove the bot entirely.

### Geliştirme ve test / Development and tests

```bash
cd apps/review-bot
npm ci
npm test                       # workerd içinde çalışan testler; kimlik bilgisi gerekmez, ağa çıkılmaz
npx wrangler deploy --dry-run  # derleme ve yapılandırma denetimi; dağıtım yok
npx wrangler dev               # yalnızca .dev.vars doluysa anlamlı / only useful with a filled .dev.vars
```

Testler workerd içinde, gerçek `wrangler.jsonc` ile çalışır (yapılandırma da test edilmiş olur) ve Worker'ın istek işleyicisini D1 ile Telegram API taklitlerine karşı sürer: kimlik doğrulaması olmayan webhook, bilinmeyen sohbet kimliği, izin listesinde olmayan kullanıcı, her komutun mutlu yolu, karar yazımı ve kırmızı çizgi. CI: [`.github/workflows/review-bot-ci.yml`](../../.github/workflows/review-bot-ci.yml). / The tests run inside workerd against the real `wrangler.jsonc`, driving the request handler against in-memory stand-ins for D1 and the Telegram API: unauthenticated webhook, unknown chat id, a user who is not on the allow-list, each command's happy path, the decision write and the red line. Nothing reaches the network and no credential exists.

D1'i yerelden okumak (yazmayın) / reading D1 locally (do not write):

```bash
npx wrangler d1 execute gt-ops --remote --command \
  "SELECT id, status, created_at FROM reviews ORDER BY created_at LIMIT 5"
```

### Bot ne yapmaz / What the bot refuses to do

- Hiçbir kanala, gruba ya da kişiye **yayın yapmaz**; yalnızca tek özel sohbete yazar. / It posts to nothing but the one private chat.
- Kendi başına **karar vermez**, puan hesaplamaz, metin üretmez, dil modeli çağırmaz. / It never decides, scores, writes text or calls a model.
- **PR açmaz**, issue açmaz, etiket eklemez, `datasets` deposuna dokunmaz. / It opens no pull request or issue and touches no repository.
- Türk kuvvetlerinden söz eden metni **aktarmaz**. / It does not relay text that names Turkish forces.
- `reviewers` tablosuna kimseyi **eklemez**, ad veya iletişim bilgisi yazmaz. / It enrols nobody and stores no name or contact detail.
- Sırları eksikse **çalışmaz**. / Without its secrets it does not run at all.

### Bakımcının kullanabilmesi için kalanlar / What is still missing before a maintainer can use it

1. Bot hesabı (BotFather) ve özel grup — bir insan yapar. / A bot account and the private group: a human step.
2. Dört sırrın `wrangler secret put` ile konması ve `wrangler deploy`. / The four secrets and a deploy.
3. `setWebhook` çağrısı (gizli başlık ile). / The `setWebhook` call.
4. `reviewers` tablosuna en az bir etkin satır. / At least one active row in `reviewers`.
5. `gt-ops.reviews` içinde satır olması: kuyruğu günlük toplama iş akışı doldurur — inceleme konusu açıldıktan sonra, insana sunulan her aday için bir satır ([collectors/README.md](../../collectors/README.md#sinyal-deposu-ve-inceleme-kuyruğu--signal-store-and-review-queue)). Bunun için deponun `CLOUDFLARE_API_TOKEN` secret'ı gerekir; secret yoksa adım atlanır ve bot boş bir kuyruk gösterir. / Rows in `gt-ops.reviews`: the daily collection workflow fills the queue, one row per candidate offered to a human, after the review issue is created. That step needs the repository's `CLOUDFLARE_API_TOKEN` secret; without it the step is skipped and the bot correctly shows an empty queue.
