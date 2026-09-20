/* Greater Türkiye — the Aegean register page.
 *
 * It renders the `site` records of the register (handbook ADR 0019) straight from the published
 * dataset: one card per island, the treaty article it is held to, what is documented so far, and —
 * stated as plainly as the records themselves do — what is still missing. There is no map here on
 * purpose: the records carry no coordinates until each one has been verified against a primary
 * source, and a page that drew them anyway would be claiming more than the data says.
 */
(function () {
  'use strict';
  GT.initChrome();
  GT.initReveal();

  const TAG = 'ege-silahsizlandirilmis-statu';
  /* Which treaty article a record is held to, and how to say it in one line. The tag is on the
     record; the wording lives here so the page reads as a sentence rather than a code. */
  const TREATY = {
    'lozan-md-13': { tr: 'Lozan 1923, md. 13', en: 'Lausanne 1923, Art. 13' },
    'paris-md-14': { tr: 'Paris 1947, md. 14(2)', en: 'Paris 1947, Art. 14(2)' },
    'lozan-bogazlar-sozlesmesi': { tr: 'Lozan 1923 + Boğazlar Sözleşmesi', en: 'Lausanne 1923 + Straits Convention' },
  };
  const FLAG = {
    'birincil-kaynak-bekliyor': { tr: 'birincil kaynak bekliyor', en: 'primary source pending' },
    'koordinat-yok': { tr: 'koordinat yok', en: 'no coordinates' },
  };

  const els = { state: document.getElementById('r-state'), cards: document.getElementById('r-cards') };
  let records = [];

  function card(rec) {
    const el = document.createElement('article');
    el.className = 'r-card rv';
    const treaty = (rec.tags || []).map((t) => TREATY[t]).find(Boolean);
    const flags = (rec.tags || []).map((t) => FLAG[t]).filter(Boolean);

    const h = document.createElement('h3');
    h.className = 'r-name';
    h.textContent = GT.txt(rec.name);
    el.append(h);

    const meta = document.createElement('p');
    meta.className = 'r-meta';
    const place = rec.location && rec.location.place_name ? GT.txt(rec.location.place_name) : '';
    meta.textContent = [place, treaty ? GT.txt(treaty) : ''].filter(Boolean).join(' · ');
    el.append(meta);

    const body = document.createElement('p');
    body.className = 'r-body';
    body.textContent = GT.txt(rec.description);
    el.append(body);

    if (flags.length) {
      const row = document.createElement('p');
      row.className = 'r-flags';
      flags.forEach((f) => {
        const chip = document.createElement('span');
        chip.className = 'r-flag';
        chip.textContent = GT.txt(f);
        row.append(chip);
      });
      el.append(row);
    }

    const src = document.createElement('p');
    src.className = 'r-src';
    const label = document.createElement('span');
    label.textContent = GT.t('r.sources');
    src.append(label);
    (rec.sources || []).forEach((s) => {
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      // the host is what a reader scans for; the full title is there on hover and for screen readers
      a.textContent = new URL(s.url).hostname.replace(/^www\./, '');
      if (s.title) a.title = s.title;
      src.append(a);
    });
    el.append(src);
    return el;
  }

  function render() {
    els.cards.replaceChildren(...records.map(card));
    els.state.textContent = GT.t('r.count', { n: records.length });
    GT.initReveal();
  }


  /* ---------------- announced activity ----------------
     The yearly count of navigational warnings for our waters (assets/data/msi-activity.json, built
     by tools/msi/build_activity.py from the NGA archive). It is drawn only if the file is there, so
     the page works with or without it.

     Two honesty rules are in the drawing itself. Years after the coverage break are drawn hollow,
     because NGA stopped relaying the Mediterranean warnings and their fall is a change in the
     archive rather than at sea; and the bar is the *share of the archive* for that year, not the raw
     count, because a raw count cannot tell those two apart. */
  const ACT_MIL = ['firing', 'hazardous-operations', 'missile-test', 'military-exercise', 'submarine'];
  const BREAK_YEAR = 2022;

  function chart(data) {
    const series = (data.series || []).filter((s) => s.year >= 1999 && s.archive_all_areas > 0);
    if (series.length < 5) return;
    const per1000 = (s) => (1000 * s.total) / s.archive_all_areas;
    const milShare = (s) => {
      const mil = ACT_MIL.reduce((a, k) => a + (s.by_activity[k] || 0), 0);
      return s.total ? mil / s.total : 0;
    };
    const max = Math.max(...series.map(per1000));
    const W = 1000, H = 260, pad = { l: 40, r: 12, t: 12, b: 34 };
    const bw = (W - pad.l - pad.r) / series.length;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'r-chart-svg');
    const el = (name, attrs, text) => {
      const n = document.createElementNS(ns, name);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = text;
      svg.append(n);
      return n;
    };
    // gridlines, labelled in warnings per 1,000 of the whole archive that year
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      el('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'r-grid-line' });
      el('text', { x: pad.l - 8, y: y(v) + 4, class: 'r-ax', 'text-anchor': 'end' }, Math.round(v));
    }
    series.forEach((s, i) => {
      const x = pad.l + i * bw;
      const h = Math.max(1, y(0) - y(per1000(s)));
      const broken = s.year >= BREAK_YEAR;
      const g = document.createElementNS(ns, 'g');
      svg.append(g);
      const bar = document.createElementNS(ns, 'rect');
      bar.setAttribute('x', x + bw * 0.16);
      bar.setAttribute('y', y(per1000(s)));
      bar.setAttribute('width', bw * 0.68);
      bar.setAttribute('height', h);
      bar.setAttribute('class', 'r-bar' + (broken ? ' thin' : ''));
      g.append(bar);
      // the military share of that year's warnings, drawn as the filled part of the bar
      if (!broken) {
        const mh = h * milShare(s);
        const mil = document.createElementNS(ns, 'rect');
        mil.setAttribute('x', x + bw * 0.16);
        mil.setAttribute('y', y(per1000(s)) + (h - mh));
        mil.setAttribute('width', bw * 0.68);
        mil.setAttribute('height', mh);
        mil.setAttribute('class', 'r-bar-mil');
        g.append(mil);
      }
      const t = document.createElementNS(ns, 'title');
      t.textContent = GT.t('r.tip', {
        y: s.year, n: s.total, a: s.archive_all_areas,
        m: ACT_MIL.reduce((a, k) => a + (s.by_activity[k] || 0), 0),
      });
      g.append(t);
      if (s.year % 5 === 0 || i === series.length - 1) {
        el('text', { x: x + bw / 2, y: H - 12, class: 'r-ax', 'text-anchor': 'middle' }, s.year);
      }
    });
    const box = document.getElementById('r-chart');
    box.replaceChildren(svg);
    box.setAttribute('aria-label', GT.t('r.aria', { n: series.length, a: series[0].year, b: series[series.length - 1].year }));

    // The caveat is written in both languages here; the data file carries the authoritative English
    // version in `coverage_notes`, and the source document has the numbers behind it.
    const peak = series.reduce((a, b) => (per1000(a) >= per1000(b) ? a : b));
    document.getElementById('r-chart-note').textContent = GT.t('r.breaknote', {
      b: BREAK_YEAR, p: peak.year, v: Math.round(per1000(peak)),
    });
    const src = document.getElementById('r-chart-src');
    src.replaceChildren();
    const label = document.createElement('span');
    label.textContent = GT.t('r.sources');
    src.append(label);
    const a = document.createElement('a');
    a.href = (data.source && data.source.url) || 'https://msi.nga.mil/NavWarnings';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'msi.nga.mil';
    a.title = (data.source && data.source.name) || '';
    src.append(a);
    const built = data.built_from || {};
    const counts = document.createElement('span');
    counts.className = 'r-counts';
    counts.textContent = GT.t('r.built', {
      k: (built.records_kept || 0).toLocaleString(GT.lang === 'tr' ? 'tr-TR' : 'en-GB'),
      t: (built.turkish_warnings_excluded || 0).toLocaleString(GT.lang === 'tr' ? 'tr-TR' : 'en-GB'),
    });
    src.append(counts);
    document.getElementById('faaliyet').hidden = false;
  }

  let activity = null;
  fetch('assets/data/msi-activity.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('msi-activity: HTTP ' + r.status))))
    .then((d) => { activity = d; chart(d); })
    .catch((e) => console.info('activity chart off:', e.message)); // the page works without it

  GT.loadData().then((data) => {
    records = (data.site || []).filter((r) => (r.tags || []).includes(TAG));
    records.sort((a, b) => GT.txt(a.name).localeCompare(GT.txt(b.name), GT.lang === 'tr' ? 'tr' : 'en'));
    if (!records.length) { els.state.textContent = GT.t('r.empty'); return; }
    render();
  }).catch((e) => {
    console.warn(e);
    els.state.textContent = GT.t('r.err');
  });

  document.addEventListener('gt:lang', () => {
    if (records.length) render();
    if (activity) chart(activity);
  });
})();
