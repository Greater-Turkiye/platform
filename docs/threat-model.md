# Tehdit Modeli (Özet) / Threat Model (Summary)

[Türkçe](#türkçe) · [English](#english)

Tam gerekçe ve kararlar el kitabındaki **ADR 0011**'dedir: [handbook/decisions/0011-threat-model.md](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0011-threat-model.md). Bu sayfa platforma özgü bir özettir; çelişki durumunda ADR geçerlidir.
The full rationale and decisions are in **ADR 0011** in the handbook: [handbook/decisions/0011-threat-model.md](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0011-threat-model.md). This page is a platform-specific summary; if they conflict, the ADR prevails.

---

## Türkçe

### Korunan varlıklar

- Takma adlı katkıcıların ve gözden geçiricilerin kimlikleri.
- Yayın kanalları (Telegram, Bluesky) ve organizasyon hesapları.
- `datasets` deposunun bütünlüğü ve güvenilirliği.
- Sırlar: GitHub App anahtarı, bot token'ları, HMAC anahtarları, Cloudflare API token'ı.
- Kendi aleyhimize sonuç doğurabilecek bilgi: Türk kuvvetlerine ait konum ve hareketler.

### Tehdit aktörleri ve senaryolar

| Tehdit | Örnek | Başlıca önlemler |
|---|---|---|
| Kimlik ifşası | Commit meta verisi, saat dilimi, EXIF, yazım üslubu | noreply e-posta, `TZ=UTC`, EXIF temizleme, OPSEC eğitimi |
| Hesap ele geçirilmesi | Oltalama, token sızıntısı | Zorunlu 2FA (SMS değil), App yerine PAT yok, kısa ömürlü token'lar, acil durdurma, eylem planları |
| Veri zehirleme / dezenformasyon | Sahte "resmî" açıklamalar, koordineli kanallar | A–B kaynak şartı, atıf, "doğrulanmamış" etiketi, iki insan kapısı |
| Yanlışlıkla kendi aleyhimize yayın | Türk hava aracı/gemisi veya birliği konumu | Depolamadan önce güvenlik filtresi, `redline_check`, kırmızı çizgi düğmesi |
| Tedarik zinciri | Ele geçirilmiş bir GitHub Action veya paket | SHA sabitleme, Dependabot, kilit dosyaları, en az yetki |
| Kötüye kullanım ve taciz | Toplu şikâyet, trol saldırısı | Davranış kuralları, moderasyon, bağımsız RSS ve `datasets` |
| Hukuki baskı | Kaldırma talepleri | 72 saatlik süreç, tombstone, özel kayıt defteri |
| Dil modeli kötüye kullanımı | Kaynak metnine gömülü talimatlar (prompt injection) | Araç yok, yalnızca şemalı JSON, model yayımlayamaz |

### Kapsam dışı

Devlet düzeyinde hedefli bir saldırgana karşı tam koruma sağlanamaz. Bu nedenle hiçbir gözden geçirici, ifşa olması durumunda kendisini tehlikeye atacak bilgiyi platformda tutmaz.

---

## English

### Assets

- Identities of pseudonymous contributors and reviewers.
- Publishing channels (Telegram, Bluesky) and organization accounts.
- Integrity and credibility of the `datasets` repository.
- Secrets: GitHub App key, bot tokens, HMAC keys, Cloudflare API token.
- Information that could work against our own side: positions and movements of Turkish forces.

### Threat actors and scenarios

| Threat | Example | Main mitigations |
|---|---|---|
| Deanonymization | Commit metadata, time zone, EXIF, writing style | noreply email, `TZ=UTC`, EXIF stripping, OPSEC training |
| Account compromise | Phishing, token leak | Mandatory 2FA (not SMS), App instead of PATs, short-lived tokens, kill switch, playbooks |
| Data poisoning / disinformation | Fake "official" statements, coordinated channels | A–B source requirement, attribution, "unverified" label, two human gates |
| Accidental self-harm | Position of a Turkish aircraft, ship or unit | Safety filter before storage, `redline_check`, red-line button |
| Supply chain | Compromised GitHub Action or package | SHA pinning, Dependabot, lock files, least privilege |
| Abuse and harassment | Mass reporting, troll raids | Code of conduct, moderation, independent RSS and `datasets` |
| Legal pressure | Takedown requests | 72-hour process, tombstones, private register |
| LLM abuse | Instructions embedded in source text (prompt injection) | No tools, schema-bound JSON only, the model cannot publish |

### Out of scope

Full protection against a targeted state-level adversary is not achievable. For that reason, no reviewer keeps information on the platform that would endanger them if exposed.
