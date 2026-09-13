/* Greater Türkiye — shared helpers: i18n, data loading, geography.
   Plain browser JS, no build step. Data comes from the `datasets` Pages export. */
(function () {
  'use strict';

  const GT = (window.GT = {});
  GT.DATA_BASE = window.GT_DATA_BASE || '../datasets/';
  GT.REPO = 'https://github.com/Greater-Turkiye';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  GT.lang = store.get('gt-lang') === 'en' ? 'en' : 'tr';

  /* ---------------- strings ---------------- */
  const I18N = {
    tr: {
      'a11y.skip': 'İçeriğe geç', 'a11y.menu': 'Menü', 'a11y.lang': 'Dil',
      'nav.panel': 'Panel', 'nav.data': 'Veri', 'nav.handbook': 'El Kitabı', 'nav.join': 'Katıl', 'nav.open': 'Paneli aç', 'nav.home': 'Ana sayfa',
      'hero.eyebrow': 'Açık kaynak istihbarat topluluğu',
      'hero.title1': 'Çevremizi', 'hero.title2': 'izliyoruz',
      'hero.lead': 'Türkiye’nin dış güvenlik ortamını yalnızca açık kaynaklardan izliyoruz. Her iddiayı kaynağına dayandırıyor, arşivliyor, insan incelemesinden geçiriyor ve herkesin denetleyebileceği açık veri olarak yayımlıyoruz.',
      'hero.cta1': 'Paneli aç', 'hero.cta2': 'Katkı ver',
      'hero.mapAria': 'Türkiye ve çevresi: izleme bölgeleri haritası',
      'hud.focus': 'Odak', 'hud.proj': 'Projeksiyon', 'hud.utc': 'UTC', 'hud.regions': 'İzleme bölgesi', 'hud.records': 'Kayıt', 'hud.hover': 'Bölge',
      'ticker.label': 'Kayıt akışı', 'ticker.empty': 'Kayıt akışı açılıyor — ilk kayıtları birlikte ekliyoruz', 'ticker.err': 'Veri akışına şu an ulaşılamıyor',
      'regions.eyebrow': 'İzleme alanları', 'regions.title1': 'Dışarıya bakan', 'regions.title2': 'göz.',
      'regions.lead': 'On dört editoryal izleme bölgesi. Bölgeler ilgi alanıdır; hiçbiri egemenlik iddiası değildir. Tartışmalı her nitelendirme sahibine atfedilir.',
      'regions.records': 'kayıt', 'regions.open': 'Panelde aç',
      'how.eyebrow': 'Yöntem', 'how.title1': 'Topla. Doğrula.', 'how.title2': 'İncele. Yayımla.',
      'how.lead': 'Hızdan önce doğruluk. Otomasyon toplar ve sıralar; karar her zaman insanındır.',
      'how.1.t': 'Topla', 'how.1.d': 'Resmî açıklamalar, haber ajansları, NAVTEX/NOTAM duyuruları, uydu ve takip servisleri: yalnızca kamuya açık kaynaklar.',
      'how.2.t': 'Doğrula', 'how.2.d': 'Admiralty ölçeği: kaynak güvenilirliği A–F, bilgi doğruluğu 1–6. Arşivlenmemiş kaynak doğrulanmış sayılmaz.',
      'how.3.t': 'İncele', 'how.3.d': 'Her kayıt insan incelemesinden geçer. “İhlal”, “provokasyon” gibi nitelendirmeler proje sesiyle değil, sahibine atfedilerek yazılır.',
      'how.4.t': 'Yayımla', 'how.4.d': 'Açık lisanslı veri: JSONL, CSV, GeoJSON. Hiçbir paylaşım insan onayı olmadan çıkmaz; düzeltmeler açıkça duyurulur.',
      'stats.eyebrow': 'Açık veri', 'stats.title1': 'Her kayıt', 'stats.title2': 'denetlenebilir.',
      'stats.lead': 'Kayıtlar Git’te tutulur, her değişiklik izlenebilir; veri CC BY 4.0 ile herkese açıktır.',
      'stats.event': 'Olay', 'stats.source': 'Kaynak', 'stats.actor': 'Aktör', 'stats.site': 'Tesis', 'stats.equipment': 'Teçhizat tipi',
      'stats.note': 'Canlı sayım · datasets deposundan', 'stats.err': 'Veri şu an yüklenemedi',
      'red.eyebrow': 'Kırmızı çizgiler', 'red.title1': 'Asla', 'red.title2': 'yapmadıklarımız.',
      'red.lead': 'Bu kurallar mutlaktır ve otomatik kontrollerle de uygulanır. Şüphedeysek yayımlamayız.',
      'red.1': 'Türk kuvvetlerinin konum ve hareketlerini paylaşmayız.',
      'red.2': 'Gizli ya da sızdırılmış materyal kullanmayız — hangi ülkeden olursa olsun.',
      'red.3': 'Askerî bölgelerde sahada bilgi toplamayız.',
      'red.4': 'Özel kişileri izlemez, kişisel veri yayımlamayız.',
      'red.5': 'Esir veya kayıp görüntüsü paylaşmayız.',
      'red.6': 'Hedef gösteren, kışkırtıcı ya da nefret içeren dil kullanmayız.',
      'red.7': 'Kaynaksız iddia sunmaz, telifli içeriği kopyalamayız.',
      'red.more': 'Kırmızı çizgilerin tamamı',
      'join.eyebrow': 'Katıl', 'join.title1': 'Takma adla da', 'join.title2': 'katkı verebilirsin.',
      'join.lead': 'Veri girişi, kaynak önerisi, çeviri, kod ya da inceleme. Önce kırmızı çizgiler ve OPSEC sayfalarını oku, sonra bir iş seç.',
      'join.datasets.k': 'Veri', 'join.datasets.t': 'datasets', 'join.datasets.d': 'Olay, aktör, tesis ve kaynak kayıtları; şemalar ve doğrulayıcı.',
      'join.handbook.k': 'Yöntem', 'join.handbook.t': 'handbook', 'join.handbook.d': 'Kırmızı çizgiler, doğrulama, OPSEC, stil rehberi ve karar kayıtları.',
      'join.platform.k': 'Kod', 'join.platform.t': 'platform', 'join.platform.d': 'Toplama, inceleme ve yayın altyapısı; bu site de burada.',
      'join.github.k': 'Topluluk', 'join.github.t': '.github', 'join.github.d': 'Davranış kuralları, yönetişim, güvenlik ve katkı rehberi.',
      'join.go': 'Depoyu aç', 'join.gfi': 'Yeni başlayanlara uygun işler', 'join.submit': 'Olay öner',
      'foot.tag': 'Türkiye’nin dış güvenlik ortamı için açık kaynak istihbarat topluluğu.',
      'foot.disclaimer': 'Gönüllü topluluk; hiçbir devlet kurumu veya siyasi yapıyla bağlantılı değildir.',
      'foot.community': 'Topluluk', 'foot.data': 'Veri', 'foot.project': 'Proje',
      'foot.redlines': 'Kırmızı çizgiler', 'foot.coc': 'Davranış kuralları', 'foot.security': 'Güvenlik ve kaldırma', 'foot.opsec': 'OPSEC',
      'foot.dataset': 'Veri seti', 'foot.schemas': 'Şemalar', 'foot.releases': 'Sürümler', 'foot.cite': 'Atıf',
      'foot.roadmap': 'Yol haritası', 'foot.license': 'İçerik ve veri CC BY 4.0 · Kod MIT',
      'p.title': 'OSINT paneli', 'p.search': 'Ara', 'p.searchPh': 'Kayıtlarda ara…', 'p.region': 'Bölge', 'p.type': 'Tür', 'p.status': 'Durum', 'p.all': 'Tümü',
      'p.layers': 'Katmanlar', 'p.lyr.regions': 'Bölgeler', 'p.lyr.sites': 'Tesisler', 'p.lyr.events': 'Olaylar', 'p.lyr.examples': 'Örnek veriler',
      'p.feed': 'Kayıtlar', 'p.count': '{n} kayıt', 'p.cursor': 'İmleç', 'p.zoom': 'Ölçek',
      'p.demo': 'Gösterim modu: “ÖRNEK” etiketli kayıtlar kurgusaldır ve gerçek olayları anlatmaz.',
      'p.none': 'Filtreye uyan kayıt yok.', 'p.noreal': 'Henüz doğrulanmış olay kaydı yok. İlk kayıtları birlikte ekliyoruz.', 'p.addFirst': 'İlk kaydı öner',
      'p.err': 'Veri yüklenemedi.', 'p.retry': 'Tekrar dene', 'p.loading': 'Yükleniyor',
      'p.zoomIn': 'Yakınlaştır', 'p.zoomOut': 'Uzaklaştır', 'p.reset': 'Görünümü sıfırla', 'p.close': 'Kapat',
      'p.nogeo': 'koordinat yok', 'p.example': 'Örnek',
      'lg.unverified': 'Doğrulanmamış', 'lg.verified': 'Doğrulandı', 'lg.partial': 'Kısmen / tartışmalı', 'lg.example': 'Örnek (kurgusal)', 'lg.site': 'Tesis', 'lg.tr': 'Türkiye',
      'd.time': 'Zaman', 'd.location': 'Konum', 'd.regions': 'Bölgeler', 'd.countries': 'Devletler', 'd.actors': 'Aktörler', 'd.equipment': 'Teçhizat', 'd.claims': 'İddialar',
      'd.sources': 'Kaynaklar', 'd.assessment': 'Değerlendirme', 'd.id': 'Kimlik', 'd.type': 'Tür', 'd.operators': 'İşleten', 'd.country': 'Devlet',
      'd.github': 'GitHub’da görüntüle', 'd.correct': 'Düzeltme öner', 'd.copy': 'Kopyala', 'd.copied': 'Kopyalandı', 'd.archive': 'arşiv',
      'd.claimBy': '{actor} iddiası', 'd.exampleWarn': 'Bu kayıt KURGUSALDIR; yalnızca veri biçimini göstermek içindir.', 'd.method': 'Yöntem', 'd.basis': 'dayanak',
      'd.qty': 'adet',
    },
    en: {
      'a11y.skip': 'Skip to content', 'a11y.menu': 'Menu', 'a11y.lang': 'Language',
      'nav.panel': 'Panel', 'nav.data': 'Data', 'nav.handbook': 'Handbook', 'nav.join': 'Join', 'nav.open': 'Open panel', 'nav.home': 'Home',
      'hero.eyebrow': 'Open-source intelligence community',
      'hero.title1': 'We watch our', 'hero.title2': 'neighbourhood',
      'hero.lead': 'We monitor Türkiye’s external security environment from public sources only. Every claim is tied to its source, archived, reviewed by humans and published as open data anyone can audit.',
      'hero.cta1': 'Open the panel', 'hero.cta2': 'Contribute',
      'hero.mapAria': 'Türkiye and its neighbourhood: watch-region map',
      'hud.focus': 'Focus', 'hud.proj': 'Projection', 'hud.utc': 'UTC', 'hud.regions': 'Watch regions', 'hud.records': 'Records', 'hud.hover': 'Region',
      'ticker.label': 'Record feed', 'ticker.empty': 'The record feed is opening — we are adding the first records together', 'ticker.err': 'The data feed is unreachable right now',
      'regions.eyebrow': 'Watch areas', 'regions.title1': 'An eye turned', 'regions.title2': 'outward.',
      'regions.lead': 'Fourteen editorial watch regions. Regions are areas of interest, never sovereignty claims. Every contested characterization is attributed to whoever makes it.',
      'regions.records': 'records', 'regions.open': 'Open in panel',
      'how.eyebrow': 'Method', 'how.title1': 'Collect. Verify.', 'how.title2': 'Review. Publish.',
      'how.lead': 'Accuracy before speed. Automation collects and ranks; the decision is always human.',
      'how.1.t': 'Collect', 'how.1.d': 'Official statements, news agencies, NAVTEX/NOTAM notices, imagery and tracking services: public sources only.',
      'how.2.t': 'Verify', 'how.2.d': 'Admiralty scale: source reliability A–F, information credibility 1–6. An unarchived source never counts as verified.',
      'how.3.t': 'Review', 'how.3.d': 'Every record passes human review. Labels like “violation” or “provocation” are attributed to their owner, never asserted by us.',
      'how.4.t': 'Publish', 'how.4.d': 'Openly licensed data: JSONL, CSV, GeoJSON. Nothing is posted without human approval; corrections are announced openly.',
      'stats.eyebrow': 'Open data', 'stats.title1': 'Every record', 'stats.title2': 'is auditable.',
      'stats.lead': 'Records live in Git and every change is traceable; the data is open to all under CC BY 4.0.',
      'stats.event': 'Events', 'stats.source': 'Sources', 'stats.actor': 'Actors', 'stats.site': 'Sites', 'stats.equipment': 'Equipment types',
      'stats.note': 'Live count · from the datasets repository', 'stats.err': 'Data could not be loaded right now',
      'red.eyebrow': 'Red lines', 'red.title1': 'What we', 'red.title2': 'never do.',
      'red.lead': 'These rules are absolute and also enforced by automated checks. When in doubt, we do not publish.',
      'red.1': 'We never share positions or movements of Turkish forces.',
      'red.2': 'We never use classified or leaked material — from any country.',
      'red.3': 'We never collect in the field near military zones.',
      'red.4': 'We never track private individuals or publish personal data.',
      'red.5': 'We never share imagery of prisoners of war or casualties.',
      'red.6': 'We never use targeting, inciting or hateful language.',
      'red.7': 'We never present unsourced claims or copy copyrighted content.',
      'red.more': 'All red lines',
      'join.eyebrow': 'Join', 'join.title1': 'Pseudonymous', 'join.title2': 'contributors welcome.',
      'join.lead': 'Data entry, source suggestions, translation, code or review. Read the red lines and OPSEC pages first, then pick a task.',
      'join.datasets.k': 'Data', 'join.datasets.t': 'datasets', 'join.datasets.d': 'Event, actor, site and source records; schemas and the validator.',
      'join.handbook.k': 'Method', 'join.handbook.t': 'handbook', 'join.handbook.d': 'Red lines, verification, OPSEC, style guide and decision records.',
      'join.platform.k': 'Code', 'join.platform.t': 'platform', 'join.platform.d': 'Collection, review and publishing infrastructure; this site lives here.',
      'join.github.k': 'Community', 'join.github.t': '.github', 'join.github.d': 'Code of conduct, governance, security and the contributing guide.',
      'join.go': 'Open repository', 'join.gfi': 'Good first issues', 'join.submit': 'Submit an event',
      'foot.tag': 'An open-source intelligence community for Türkiye’s external security environment.',
      'foot.disclaimer': 'Volunteer community; not affiliated with any state body or political organisation.',
      'foot.community': 'Community', 'foot.data': 'Data', 'foot.project': 'Project',
      'foot.redlines': 'Red lines', 'foot.coc': 'Code of conduct', 'foot.security': 'Security & takedowns', 'foot.opsec': 'OPSEC',
      'foot.dataset': 'Dataset', 'foot.schemas': 'Schemas', 'foot.releases': 'Releases', 'foot.cite': 'Citation',
      'foot.roadmap': 'Roadmap', 'foot.license': 'Content & data CC BY 4.0 · Code MIT',
      'p.title': 'OSINT panel', 'p.search': 'Search', 'p.searchPh': 'Search records…', 'p.region': 'Region', 'p.type': 'Type', 'p.status': 'Status', 'p.all': 'All',
      'p.layers': 'Layers', 'p.lyr.regions': 'Regions', 'p.lyr.sites': 'Sites', 'p.lyr.events': 'Events', 'p.lyr.examples': 'Example data',
      'p.feed': 'Records', 'p.count': '{n} records', 'p.cursor': 'Cursor', 'p.zoom': 'Scale',
      'p.demo': 'Demo mode: records tagged “EXAMPLE” are fictional and do not describe real events.',
      'p.none': 'No records match the filters.', 'p.noreal': 'No verified event records yet. We are adding the first ones together.', 'p.addFirst': 'Submit the first record',
      'p.err': 'Data could not be loaded.', 'p.retry': 'Retry', 'p.loading': 'Loading',
      'p.zoomIn': 'Zoom in', 'p.zoomOut': 'Zoom out', 'p.reset': 'Reset view', 'p.close': 'Close',
      'p.nogeo': 'no coordinates', 'p.example': 'Example',
      'lg.unverified': 'Unverified', 'lg.verified': 'Verified', 'lg.partial': 'Partial / disputed', 'lg.example': 'Example (fictional)', 'lg.site': 'Site', 'lg.tr': 'Türkiye',
      'd.time': 'Time', 'd.location': 'Location', 'd.regions': 'Regions', 'd.countries': 'States', 'd.actors': 'Actors', 'd.equipment': 'Equipment', 'd.claims': 'Claims',
      'd.sources': 'Sources', 'd.assessment': 'Assessment', 'd.id': 'ID', 'd.type': 'Type', 'd.operators': 'Operator', 'd.country': 'State',
      'd.github': 'View on GitHub', 'd.correct': 'Suggest a correction', 'd.copy': 'Copy', 'd.copied': 'Copied', 'd.archive': 'archive',
      'd.claimBy': 'Claimed by {actor}', 'd.exampleWarn': 'This record is FICTIONAL; it only illustrates the data format.', 'd.method': 'Method', 'd.basis': 'basis',
      'd.qty': 'units',
    },
  };

  GT.t = (key, vars) => {
    let s = (I18N[GT.lang] && I18N[GT.lang][key]) ?? I18N.tr[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(v);
    return s;
  };
  GT.txt = (o) => (!o ? '' : typeof o === 'string' ? o : o[GT.lang] || o.tr || o.en || '');
  GT.upper = (s) => String(s).toLocaleUpperCase(GT.lang === 'tr' ? 'tr-TR' : 'en-GB');

  GT.applyI18n = () => {
    document.documentElement.lang = GT.lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = GT.t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = GT.t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', GT.t(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === GT.lang)));
  };
  GT.setLang = (lang) => {
    GT.lang = lang;
    store.set('gt-lang', lang);
    GT.applyI18n();
    document.dispatchEvent(new CustomEvent('gt:lang'));
  };

  GT.initChrome = () => {
    document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => GT.setLang(b.dataset.lang)));
    const burger = document.querySelector('.nav-burger');
    const nav = document.querySelector('.site-nav');
    if (burger && nav) {
      burger.addEventListener('click', () => burger.setAttribute('aria-expanded', String(nav.classList.toggle('open'))));
      nav.addEventListener('click', (e) => { if (e.target.closest('a')) { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); } });
    }
    const header = document.querySelector('.site-header:not(.is-panel)');
    if (header) {
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    GT.applyI18n();
  };

  GT.clock = (el) => {
    if (!el) return;
    const tick = () => { el.textContent = new Date().toISOString().slice(11, 19) + 'Z'; };
    tick();
    setInterval(tick, 1000);
  };

  GT.el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  GT.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------------- data ---------------- */
  async function getText(path) {
    const r = await fetch(GT.DATA_BASE + path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(path + ': HTTP ' + r.status);
    return r.text();
  }
  const jsonl = (s) => s.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const KINDS = ['event', 'actor', 'site', 'source', 'equipment', 'examples'];

  GT.loadData = async () => {
    const [manifest, vocab, ...lists] = await Promise.all([
      getText('manifest.json').then(JSON.parse),
      getText('vocab.json').then(JSON.parse),
      ...KINDS.map((k) => getText(k + '.jsonl').then(jsonl).catch(() => [])),
    ]);
    const d = { manifest, vocab, byId: new Map() };
    KINDS.forEach((k, i) => { d[k] = lists[i]; });
    d.examples.forEach((r) => { r._example = true; });
    for (const k of KINDS) for (const r of d[k]) d.byId.set(r.id, r);
    GT.vocab = vocab;
    return d;
  };

  GT.label = (vocabName, code) => {
    const list = GT.vocab && GT.vocab[vocabName];
    const hit = list && list.find((c) => c.code === code);
    if (hit) return GT.txt(hit.label);
    if (vocabName === 'regions' && REGIONS[code]) return GT.txt(REGIONS[code].label);
    return code;
  };
  GT.definition = (vocabName, code) => {
    const list = GT.vocab && GT.vocab[vocabName];
    const hit = list && list.find((c) => c.code === code);
    if (hit && hit.definition) return GT.txt(hit.definition);
    return vocabName === 'regions' && REGIONS[code] ? GT.txt(REGIONS[code].def) : '';
  };

  /* IDs are TypeID-style: prefix + 26 base32 chars of a UUIDv7; the top 48 bits are the creation time. */
  const ALPHA = '0123456789abcdefghjkmnpqrstvwxyz';
  const DIRS = { evt: 'events', act: 'actors', sit: 'sites', eqp: 'equipment', src: 'sources' };
  GT.idTime = (id) => {
    let n = 0n;
    for (const c of id.split('_')[1]) n = n * 32n + BigInt(ALPHA.indexOf(c));
    return new Date(Number(n >> 80n));
  };
  GT.recordPath = (rec) => {
    const t = GT.idTime(rec.id);
    const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
    return `${rec._example ? 'examples' : 'data'}/${DIRS[rec.id.slice(0, 3)]}/${t.getUTCFullYear()}/${mm}/${rec.id}.yaml`;
  };
  GT.recordUrl = (rec) => `${GT.REPO}/datasets/blob/main/${GT.recordPath(rec)}`;

  GT.fmtTime = (iso, precision) => {
    if (!iso) return '';
    const t = new Date(iso);
    if (isNaN(t)) return iso;
    const loc = GT.lang === 'tr' ? 'tr-TR' : 'en-GB';
    const opts = { timeZone: 'UTC', year: 'numeric' };
    if (precision !== 'year') opts.month = 'short';
    if (precision === 'day' || precision === 'hour' || precision === 'minute') opts.day = '2-digit';
    let s = new Intl.DateTimeFormat(loc, opts).format(t);
    if (precision === 'hour' || precision === 'minute') s += ' · ' + t.toISOString().slice(11, 16) + 'Z';
    return s;
  };

  GT.STATUS = {
    unverified: { tr: 'Doğrulanmamış', en: 'Unverified' },
    partially_verified: { tr: 'Kısmen doğrulandı', en: 'Partially verified' },
    verified: { tr: 'Doğrulandı', en: 'Verified' },
    disputed: { tr: 'Tartışmalı', en: 'Disputed' },
    false: { tr: 'Yanlış', en: 'False' },
  };
  GT.CREDIBILITY = {
    1: { tr: 'Teyit edilmiş', en: 'Confirmed' }, 2: { tr: 'Muhtemelen doğru', en: 'Probably true' }, 3: { tr: 'Olası', en: 'Possibly true' },
    4: { tr: 'Şüpheli', en: 'Doubtful' }, 5: { tr: 'İhtimal dışı', en: 'Improbable' }, 6: { tr: 'Değerlendirilemez', en: 'Cannot be judged' },
  };
  GT.RELIABILITY = {
    A: { tr: 'Tamamen güvenilir', en: 'Completely reliable' }, B: { tr: 'Genellikle güvenilir', en: 'Usually reliable' }, C: { tr: 'Oldukça güvenilir', en: 'Fairly reliable' },
    D: { tr: 'Genellikle güvenilmez', en: 'Not usually reliable' }, E: { tr: 'Güvenilmez', en: 'Unreliable' }, F: { tr: 'Değerlendirilemez', en: 'Cannot be judged' },
  };
  GT.PRECISION = {
    exact: { tr: 'Kesin', en: 'Exact' }, site: { tr: 'Tesis', en: 'Site' }, locality: { tr: 'Yerleşim', en: 'Locality' }, admin2: { tr: 'İlçe', en: 'District' },
    admin1: { tr: 'İl / eyalet', en: 'Province' }, country: { tr: 'Ülke', en: 'Country' }, 'sea-area': { tr: 'Deniz alanı', en: 'Sea area' },
  };
  GT.ROLE = {
    perpetrator: { tr: 'fail', en: 'perpetrator' }, participant: { tr: 'katılımcı', en: 'participant' }, target: { tr: 'hedef', en: 'target' },
    claimant: { tr: 'iddia sahibi', en: 'claimant' }, reporter: { tr: 'bildiren', en: 'reporter' }, host: { tr: 'ev sahibi', en: 'host' },
    buyer: { tr: 'alıcı', en: 'buyer' }, seller: { tr: 'satıcı', en: 'seller' },
  };
  GT.DOMAIN = {
    exercise: { tr: 'Tatbikat', en: 'Exercise' }, deployment: { tr: 'Konuşlanma', en: 'Deployment' }, basing: { tr: 'Üs / tesis', en: 'Basing' },
    procurement: { tr: 'Tedarik', en: 'Procurement' }, test: { tr: 'Test', en: 'Test' }, kinetic: { tr: 'Kinetik', en: 'Kinetic' },
    air: { tr: 'Hava', en: 'Air' }, maritime: { tr: 'Deniz', en: 'Maritime' }, cyber: { tr: 'Siber', en: 'Cyber' },
    diplomatic: { tr: 'Diplomatik', en: 'Diplomatic' }, policy: { tr: 'Politika', en: 'Policy' }, other: { tr: 'Diğer', en: 'Other' },
  };

  /* ---------------- geography ---------------- */
  // world-atlas (Natural Earth, public domain) numeric ids -> ISO alpha-3, plus features without an ISO id.
  const NUM = {
    '792': 'TUR', '300': 'GRC', '196': 'CYP', '760': 'SYR', '368': 'IRQ', '364': 'IRN', '376': 'ISR', '275': 'PSE', '422': 'LBN', '400': 'JOR',
    '051': 'ARM', '031': 'AZE', '268': 'GEO', '643': 'RUS', '804': 'UKR', '498': 'MDA', '112': 'BLR', '100': 'BGR', '642': 'ROU', '688': 'SRB',
    '499': 'MNE', '807': 'MKD', '008': 'ALB', '070': 'BIH', '191': 'HRV', '705': 'SVN', '348': 'HUN', '434': 'LBY', '818': 'EGY', '788': 'TUN',
    '012': 'DZA', '504': 'MAR', '729': 'SDN', '682': 'SAU', '784': 'ARE', '634': 'QAT', '414': 'KWT', '048': 'BHR', '512': 'OMN', '887': 'YEM',
    '706': 'SOM', '262': 'DJI', '232': 'ERI', '231': 'ETH', '398': 'KAZ', '860': 'UZB', '795': 'TKM', '417': 'KGZ', '762': 'TJK', '004': 'AFG',
    '586': 'PAK', '380': 'ITA', '470': 'MLT',
  };
  // Somaliland is not recognised by Türkiye: it is drawn as part of Somalia.
  const NAMELESS = { 'N. Cyprus': 'XNC', Kosovo: 'XKX', Somaliland: 'SOM' };
  const NAMES = {
    TUR: ['Türkiye', 'Türkiye'], GRC: ['Yunanistan', 'Greece'], CYP: ['GKRY', 'Greek Cypriot Admin.'], XNC: ['KKTC', 'TRNC'], SYR: ['Suriye', 'Syria'],
    IRQ: ['Irak', 'Iraq'], IRN: ['İran', 'Iran'], ISR: ['İsrail', 'Israel'], PSE: ['Filistin', 'Palestine'], LBN: ['Lübnan', 'Lebanon'], JOR: ['Ürdün', 'Jordan'],
    ARM: ['Ermenistan', 'Armenia'], AZE: ['Azerbaycan', 'Azerbaijan'], GEO: ['Gürcistan', 'Georgia'], RUS: ['Rusya', 'Russia'], UKR: ['Ukrayna', 'Ukraine'],
    MDA: ['Moldova', 'Moldova'], BLR: ['Belarus', 'Belarus'], BGR: ['Bulgaristan', 'Bulgaria'], ROU: ['Romanya', 'Romania'], SRB: ['Sırbistan', 'Serbia'],
    MNE: ['Karadağ', 'Montenegro'], MKD: ['K. Makedonya', 'N. Macedonia'], ALB: ['Arnavutluk', 'Albania'], XKX: ['Kosova', 'Kosovo'], BIH: ['Bosna-Hersek', 'Bosnia-Herz.'],
    HRV: ['Hırvatistan', 'Croatia'], SVN: ['Slovenya', 'Slovenia'], HUN: ['Macaristan', 'Hungary'], LBY: ['Libya', 'Libya'], EGY: ['Mısır', 'Egypt'],
    TUN: ['Tunus', 'Tunisia'], DZA: ['Cezayir', 'Algeria'], MAR: ['Fas', 'Morocco'], SDN: ['Sudan', 'Sudan'], SAU: ['Suudi Arabistan', 'Saudi Arabia'],
    ARE: ['BAE', 'UAE'], QAT: ['Katar', 'Qatar'], KWT: ['Kuveyt', 'Kuwait'], BHR: ['Bahreyn', 'Bahrain'], OMN: ['Umman', 'Oman'], YEM: ['Yemen', 'Yemen'],
    SOM: ['Somali', 'Somalia'], SML: ['Somaliland', 'Somaliland'], DJI: ['Cibuti', 'Djibouti'], ERI: ['Eritre', 'Eritrea'], ETH: ['Etiyopya', 'Ethiopia'],
    KAZ: ['Kazakistan', 'Kazakhstan'], UZB: ['Özbekistan', 'Uzbekistan'], TKM: ['Türkmenistan', 'Turkmenistan'], KGZ: ['Kırgızistan', 'Kyrgyzstan'],
    TJK: ['Tacikistan', 'Tajikistan'], AFG: ['Afganistan', 'Afghanistan'], PAK: ['Pakistan', 'Pakistan'], ITA: ['İtalya', 'Italy'], MLT: ['Malta', 'Malta'],
  };

  // Editorial watch regions (vocab/regions.yaml is canonical; this adds map geometry hints).
  const REGIONS = {
    syria: { label: { tr: 'Suriye', en: 'Syria' }, def: { tr: 'Suriye toprakları ve hava sahası.', en: 'Syrian territory and airspace.' }, countries: ['SYR'], bbox: [[35.5, 32.3], [42.4, 37.4]], at: [38.6, 35.1] },
    iraq: { label: { tr: 'Irak', en: 'Iraq' }, def: { tr: 'Kuzey Irak dahil Irak toprakları.', en: 'Iraq, including northern Iraq.' }, countries: ['IRQ'], bbox: [[38.8, 29], [48.6, 37.4]], at: [43.6, 33] },
    iran: { label: { tr: 'İran', en: 'Iran' }, def: { tr: 'İran ve bölgesel askerî faaliyetleri.', en: 'Iran and its regional military activity.' }, countries: ['IRN'], bbox: [[44, 25], [63.4, 39.8]], at: [53.8, 32.4] },
    levant: { label: { tr: 'Levant', en: 'Levant' }, def: { tr: 'İsrail, Filistin, Lübnan, Ürdün.', en: 'Israel, Palestine, Lebanon, Jordan.' }, countries: ['ISR', 'PSE', 'LBN', 'JOR'], bbox: [[34.2, 29.2], [39.3, 34.7]], at: [36.9, 31] },
    caucasus: { label: { tr: 'Kafkasya', en: 'Caucasus' }, def: { tr: 'Azerbaycan, Ermenistan, Gürcistan ve Kuzey Kafkasya.', en: 'Azerbaijan, Armenia, Georgia and the North Caucasus.' }, countries: ['ARM', 'AZE', 'GEO'], bbox: [[39.9, 38.3], [50.5, 43.7]], at: [45.4, 41.3] },
    aegean: { label: { tr: 'Ege', en: 'Aegean' }, def: { tr: 'Ege Denizi, adalar ve hava sahası.', en: 'Aegean Sea, islands and airspace.' }, countries: ['GRC'], bbox: [[22.5, 35], [28.5, 41]], at: [25.2, 37.6] },
    'east-med': { label: { tr: 'Doğu Akdeniz', en: 'Eastern Mediterranean' }, def: { tr: 'Deniz yetki alanları ve enerji sahaları.', en: 'Maritime zones and energy fields.' }, countries: [], bbox: [[27, 31], [36.5, 37]], at: [30.2, 33.4] },
    cyprus: { label: { tr: 'Kıbrıs', en: 'Cyprus' }, def: { tr: 'Kıbrıs adası (KKTC ve GKRY).', en: 'The island of Cyprus (TRNC and Greek Cypriot side).' }, countries: ['CYP', 'XNC'], bbox: [[32.2, 34.5], [34.7, 35.8]], at: [33.3, 34.5] },
    'black-sea': { label: { tr: 'Karadeniz', en: 'Black Sea' }, def: { tr: 'Karadeniz ve kıyı devletlerinin deniz/hava faaliyeti.', en: 'Black Sea and littoral states’ naval/air activity.' }, countries: [], bbox: [[27.4, 40.8], [41.8, 47.3]], at: [34.6, 43.6] },
    'libya-north-africa': { label: { tr: 'Libya ve Kuzey Afrika', en: 'Libya and North Africa' }, def: { tr: 'Libya, Mısır, Tunus, Cezayir, Fas.', en: 'Libya, Egypt, Tunisia, Algeria, Morocco.' }, countries: ['LBY', 'EGY', 'TUN', 'DZA', 'MAR'], bbox: [[-9, 19.5], [37, 37.5]], at: [18, 27.5] },
    'gulf-red-sea': { label: { tr: 'Körfez ve Kızıldeniz', en: 'Gulf and Red Sea' }, def: { tr: 'Basra Körfezi, Kızıldeniz, Yemen ve Afrika Boynuzu.', en: 'Persian Gulf, Red Sea, Yemen and the Horn of Africa.' }, countries: ['SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'OMN', 'YEM', 'SOM', 'SML', 'DJI', 'ERI', 'SDN'], bbox: [[32, 10], [60, 30.5]], at: [45, 23] },
    balkans: { label: { tr: 'Balkanlar', en: 'Balkans' }, def: { tr: 'Batı Balkanlar, Bulgaristan, Romanya.', en: 'Western Balkans, Bulgaria, Romania.' }, countries: ['BGR', 'ROU', 'SRB', 'BIH', 'MNE', 'MKD', 'ALB', 'XKX', 'HRV', 'SVN'], bbox: [[13.4, 39.6], [29.8, 48.3]], at: [21.6, 44] },
    'central-asia': { label: { tr: 'Orta Asya', en: 'Central Asia' }, def: { tr: 'Türk devletleri ve Orta Asya.', en: 'Turkic states and Central Asia.' }, countries: ['KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'], bbox: [[46.5, 35], [87, 55.5]], at: [62, 42] },
    global: { label: { tr: 'Küresel', en: 'Global' }, def: { tr: 'Bölgeye bağlı olmayan: tedarik, küresel güçler, siber.', en: 'Not region-specific: procurement, great powers, cyber.' }, countries: [], bbox: [[12, 20], [62, 50]], at: null },
  };
  GT.REGIONS = REGIONS;
  GT.REGION_CODES = Object.keys(REGIONS);
  GT.REGION_OF = {};
  for (const [code, r] of Object.entries(REGIONS)) for (const a of r.countries) GT.REGION_OF[a] = code;

  GT.SEAS = [
    { at: [24.9, 36.3], tr: 'Ege Denizi', en: 'Aegean Sea', size: 1 },
    { at: [28.6, 33.9], tr: 'Akdeniz', en: 'Mediterranean', size: 1.1 },
    { at: [34.6, 43.25], tr: 'Karadeniz', en: 'Black Sea', size: 1.15 },
    { at: [50.6, 41.8], tr: 'Hazar', en: 'Caspian', size: .9 },
    { at: [50.8, 27.4], tr: 'Basra Körfezi', en: 'Persian Gulf', size: .8 },
    { at: [37.4, 22.3], tr: 'Kızıldeniz', en: 'Red Sea', size: .8 },
  ];
  GT.COUNTRY_LABELS = {
    GRC: [21.9, 39.6], BGR: [25.3, 42.75], SYR: [38.4, 35.3], IRQ: [43.6, 33.3], IRN: [54, 32.8], GEO: [43.6, 42.15], ARM: [44.9, 40.25], AZE: [47.9, 40.45],
    UKR: [31.5, 48.8], RUS: [42.5, 49.3], EGY: [29.8, 26.5], LBY: [18, 27.8], JOR: [36.8, 30.7], SAU: [44.5, 24.8], ROU: [24.8, 45.9], SRB: [20.9, 44.1],
    ISR: [34.9, 31.3], LBN: [35.9, 33.9], CYP: [32.9, 34.82], XNC: [33.62, 35.28], TKM: [58.5, 39.2], KAZ: [66, 48], UZB: [63.5, 41.8], ALB: [20, 41],
    MKD: [21.7, 41.6], ITA: [14.5, 41.8], TUN: [9.5, 34], DZA: [3, 29], SDN: [30, 16], YEM: [47.5, 15.8], OMN: [56.5, 20.8], KWT: [47.7, 29.3],
    PAK: [69.6, 29.6], PSE: [35.3, 31.95],
  };

  /* Türkiye's defence agreements shown on the map. Every entry carries its sources so the layer stays auditable;
     add a country only with a signed agreement and a primary or reputable source.
     tier "ally" = mutual defence commitment, "coop" = defence / military cooperation agreement. */
  GT.AGREEMENTS = {
    mecca: {
      tr: 'Mekke Ortak Savunma Anlaşması · 7 Ağu 2026', en: 'Mecca Joint Defence Agreement · 7 Aug 2026',
      sources: ['https://www.aa.com.tr/tr/gundem/turkiye-suudi-arabistan-ve-pakistan-ortak-savunma-anlasmasi-imzaladi/4021014',
        'https://www.iletisim.gov.tr/turkce/haberler/detay/turkiye-suudi-arabistan-ve-pakistan-arasinda-ortak-savunma-anlasmasi-imzalandi'],
    },
    'syr-2025': {
      tr: 'Askerî eğitim ve işbirliği anlaşması · 13 Ağu 2025', en: 'Military training & cooperation agreement · 13 Aug 2025',
      sources: ['https://english.aawsat.com/arab-world/5175423-t%C3%BCrkiye-equip-train-syrian-army-under-new-defense-pact'],
    },
    'egy-2026': {
      tr: 'Askerî işbirliği çerçeve anlaşması ve savunma işbirliği mutabakatı · 2026', en: 'Military cooperation framework & defence cooperation MoU · 2026',
      sources: ['https://www.dailysabah.com/politics/diplomacy/turkiye-egypt-sign-defense-cooperation-mou',
        'https://www.al-monitor.com/originals/2026/07/turkey-egypt-expand-military-ties-cooperation-frameworks-what-know'],
    },
    shusha: {
      tr: 'Şuşa Beyannamesi (müttefiklik, karşılıklı yardım) · 15 Haz 2021', en: 'Shusha Declaration (alliance, mutual assistance) · 15 Jun 2021',
      sources: ['https://www.aa.com.tr/tr/analiz/susa-beyannamesi-ve-turkiye-azerbaycan-iliskilerinde-yeni-ufuklar/2275640',
        'https://avim.org.tr/tr/Bulten/ISTE-SUSA-BEYANNAMESI-NIN-TAM-METNI'],
    },
    guarantee: {
      tr: 'Garanti ve İttifak Antlaşmaları · 1959/60 (garantör devlet)', en: 'Treaties of Guarantee and Alliance · 1959/60 (guarantor power)',
      sources: ['https://www.mfa.gov.tr/garanti-antlasmasi-_zurich_11-subat-1959_.tr.mfa'],
    },
    'qat-2014': {
      tr: 'Askerî eğitim, savunma sanayii ve TSK konuşlanması işbirliği anlaşması · 19 Ara 2014', en: 'Military training, defence industry & stationing cooperation agreement · 19 Dec 2014',
      sources: ['https://21yyte.org/orta-dogu-ve-afrika-arastirmalari-merkezi/turkiye-katar-askeri-isbirligi-anlasmasinin-bolgesel-ve-kuresel-yansimalari/8228',
        'https://anlatilaninotesi.com.tr/20150609/1015898130.html'],
    },
    'lby-2019': {
      tr: 'Güvenlik ve askerî işbirliği mutabakatı (Trablus hükümeti) · 27 Kas 2019', en: 'Security & military cooperation MoU (Tripoli government) · 27 Nov 2019',
      sources: ['https://www.aa.com.tr/tr/libya/turkiye-libya-guvenlik-ve-askeri-is-birligi-mutabakat-muhtirasi-resmi-gazetede/1684355'],
    },
    'som-2024': {
      tr: 'Savunma ve ekonomik işbirliği çerçeve anlaşması · 8 Şub 2024', en: 'Defence & economic cooperation framework agreement · 8 Feb 2024',
      sources: ['https://www.tbmm.gov.tr/Haber/Detay?Id=52226928-c750-4ae0-84bf-019f6f6e4618'],
    },
    'irq-2024': {
      tr: 'Askerî, güvenlik işbirliği ve terörle mücadele mutabakatı · 15 Ağu 2024', en: 'Military, security cooperation & counter-terrorism MoU · 15 Aug 2024',
      sources: ['https://www.iletisim.gov.tr/turkce/dis_basinda_turkiye/detay/turkiye-ve-irak-guvenlik-is-birligi-ve-terorle-mucadeleye-dair-mutabakat-zapti-imzaladi',
        'https://tr.euronews.com/2024/08/15/turkiye-ve-irak-arasinda-tarihi-askeri-mutabakat-zapti-imzalandi'],
    },
    ots: {
      tr: 'Türk Devletleri Teşkilatı', en: 'Organization of Turkic States',
      sources: ['https://turkicstates.org/tr/turk-konseyi-hakkinda', 'https://turkicstates.org/tr/gozlemci-ulkeler'],
    },
  };
  // kin = Organization of Turkic States member/observer; presence = officially acknowledged permanent Turkish military
  // presence, shown at COUNTRY level only (red line: never positions or movements).
  GT.PARTNERS = {
    SAU: { tier: 'ally', agreement: 'mecca' },
    PAK: { tier: 'ally', agreement: 'mecca' },
    AZE: { tier: 'ally', agreement: 'shusha', kin: true },
    XNC: { tier: 'ally', agreement: 'guarantee', kin: true, observer: true, presence: true },
    SYR: { tier: 'coop', agreement: 'syr-2025' },
    EGY: { tier: 'coop', agreement: 'egy-2026' },
    QAT: { tier: 'coop', agreement: 'qat-2014', presence: true },
    LBY: { tier: 'coop', agreement: 'lby-2019', presence: true },
    SOM: { tier: 'coop', agreement: 'som-2024', presence: true },
    IRQ: { tier: 'coop', agreement: 'irq-2024' },
    KAZ: { tier: 'kin', agreement: 'ots' },
    KGZ: { tier: 'kin', agreement: 'ots' },
    UZB: { tier: 'kin', agreement: 'ots' },
    TKM: { tier: 'kin', agreement: 'ots', observer: true },
    HUN: { tier: 'kin', agreement: 'ots', observer: true },
  };
  GT.PRESENCE_SOURCES = {
    QAT: ['https://21yyte.org/orta-dogu-ve-afrika-arastirmalari-merkezi/turkiye-katar-askeri-isbirligi-anlasmasinin-bolgesel-ve-kuresel-yansimalari/8228'],
    SOM: ['https://www.aa.com.tr/tr/politika/turk-silahli-kuvvetlerine-somalide-yeni-gorev/3280005'],
    LBY: ['https://www.aa.com.tr/tr/gundem/turk-askerinin-libyadaki-gorev-suresi-uzatildi/3777943'],
    XNC: ['https://www.mfa.gov.tr/garanti-antlasmasi-_zurich_11-subat-1959_.tr.mfa'],
  };
  GT.partnerClass = (a3) => {
    const p = GT.PARTNERS[a3];
    return p ? ' m-' + p.tier + (p.presence ? ' m-presence' : '') : '';
  };
  GT.partnerLabel = (a3) => {
    const p = GT.PARTNERS[a3];
    if (!p) return '';
    const bits = [GT.txt(GT.AGREEMENTS[p.agreement])];
    if (p.kin && p.agreement !== 'ots') bits.push(GT.txt(GT.AGREEMENTS.ots));
    if (p.observer) bits[bits.length - 1] += GT.lang === 'tr' ? ' (gözlemci)' : ' (observer)';
    if (p.presence) bits.push(GT.t('lg.presence'));
    return bits.join(' · ');
  };
  Object.assign(I18N.tr, { 'lg.ally': 'Müttefik · karşılıklı savunma', 'lg.coop': 'Savunma işbirliği anlaşması', 'lg.kin': 'Türk Devletleri Teşkilatı', 'lg.presence': 'Resmî TSK varlığı (ülke düzeyi)' });
  Object.assign(I18N.en, { 'lg.ally': 'Ally · mutual defence', 'lg.coop': 'Defence cooperation agreement', 'lg.kin': 'Organization of Turkic States', 'lg.presence': 'Official Turkish military presence (country level)' });

  Object.assign(I18N.tr, { 'lg.blue': "Mavi Vatan · deniz yetki alanları (Türkiye'nin tutumu)", 'lg.agreed': 'Anlaşmayla belirlenmiş', 'lg.position': "Türkiye'nin tutumu (itiraz edilen)", 'lg.island': 'Türk adası' });
  Object.assign(I18N.en, { 'lg.blue': "Blue Homeland · maritime jurisdiction (Türkiye's position)", 'lg.agreed': 'Set by agreement', 'lg.position': "Türkiye's position (contested)", 'lg.island': 'Turkish island' });

  // d3-geo treats counter-clockwise rings (RFC 7946 order) as "everything but this": flip any polygon larger than a hemisphere.
  const rewind = (f) => {
    const g = f.geometry;
    if (g && /Polygon/.test(g.type) && d3.geoArea(f) > 2 * Math.PI) {
      const rev = (poly) => poly.map((ring) => ring.slice().reverse());
      g.coordinates = g.type === 'Polygon' ? rev(g.coordinates) : g.coordinates.map(rev);
    }
    return f;
  };
  const optionalLayer = async (u) => {
    try { const r = await fetch(u); return r.ok ? (await r.json()).features.map(rewind) : []; } catch (e) { return []; }
  };

  Object.assign(I18N.tr, { 'lg.mission': 'Türk dış temsilciliği (şehir düzeyi)', 'p.lyr.missions': 'Temsilcilikler' });
  Object.assign(I18N.en, { 'lg.mission': 'Turkish diplomatic mission (city level)', 'p.lyr.missions': 'Missions' });

  GT.loadWorld = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error('world: HTTP ' + r.status);
    const topo = await r.json();
    // Optional layers: areas per Türkiye's official position (Crimea → Ukraine, Golan → Syria),
    // Mavi Vatan maritime jurisdiction/claims and Turkish islands (see assets/data/MARITIME-SOURCES.md),
    // and Türkiye's diplomatic missions at city level (see assets/data/MISSIONS-SOURCES.md).
    const base = url.replace(/countries-\d+m\.json$/, '');
    const [disputed, maritime, islands, missions] = await Promise.all(
      ['disputed-tur-view', 'maritime-tur', 'islands-tur', 'missions-tur'].map((n) => optionalLayer(base + n + '.geojson')));
    return {
      maritime,
      islands,
      missions,
      countries: topojson.feature(topo, topo.objects.countries).features,
      // no border line between features that map to the same state (e.g. Somaliland is part of Somalia)
      borders: topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b && GT.a3(a) !== GT.a3(b)),
      disputed,
    };
  };
  GT.a3 = (f) => (f.id ? NUM[f.id] : NAMELESS[f.properties.name]) || null;
  GT.countryName = (a3OrFeature) => {
    const a = typeof a3OrFeature === 'string' ? a3OrFeature : GT.a3(a3OrFeature);
    if (a && NAMES[a]) return NAMES[a][GT.lang === 'en' ? 1 : 0];
    if (a && GT.vocab && GT.vocab.countries) { const hit = GT.vocab.countries.find((c) => c.code === a); if (hit) return GT.txt(hit.label); }
    return typeof a3OrFeature === 'string' ? a3OrFeature : a3OrFeature.properties.name;
  };
  GT.fmtLL = ([lon, lat]) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;

  /* Draw a radar sweep made of thin slices with increasing opacity; rotated via SMIL so it works in any SVG transform context. */
  GT.sweep = (parent, radius, reduce, dur) => {
    const g = parent.append('g').attr('class', 'm-sweep');
    const inner = g.append('g');
    const n = 28, span = Math.PI / 3.2;
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    for (let i = 0; i < n; i++) {
      inner.append('path').attr('class', 'm-sweep-slice')
        .attr('d', arc({ startAngle: (i / n) * span, endAngle: ((i + 1) / n) * span + 0.002 }))
        .attr('fill', `rgba(200,0,42,${(0.16 * Math.pow((i + 1) / n, 2.2)).toFixed(4)})`);
    }
    inner.append('line').attr('class', 'm-sweep-edge').attr('x1', 0).attr('y1', 0)
      .attr('x2', radius * Math.sin(span)).attr('y2', -radius * Math.cos(span));
    if (!reduce) {
      inner.append('animateTransform').attr('attributeName', 'transform').attr('type', 'rotate')
        .attr('from', '0').attr('to', '360').attr('dur', (dur || 12) + 's').attr('repeatCount', 'indefinite');
    } else {
      inner.attr('transform', 'rotate(40)');
    }
    return g;
  };

  GT.mapDefs = (svg) => {
    const defs = svg.append('defs');
    const tg = defs.append('linearGradient').attr('id', 'trFill').attr('x1', 0).attr('y1', 0).attr('x2', 1).attr('y2', 1);
    tg.append('stop').attr('offset', '0%').attr('stop-color', '#3d000b');
    tg.append('stop').attr('offset', '55%').attr('stop-color', '#7a0016');
    tg.append('stop').attr('offset', '100%').attr('stop-color', '#99001c');
    const f = defs.append('filter').attr('id', 'glow').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%');
    f.append('feGaussianBlur').attr('stdDeviation', 7);
    return defs;
  };
})();
