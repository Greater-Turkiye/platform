/* Greater Türkiye — the halted trade: two states' own monthly returns, side by side.
 *
 * The page draws `assets/data/trade-il.json` (built by tools/trade/build_trade.py) and nothing
 * else. Two lines: what Türkiye reports it exported to Israel, and what Israel reports it imported
 * from Türkiye. Before the halt they track each other; after it one of them stops.
 *
 * The gap between them is drawn as a gap, not as an accusation. Türkiye reports exports by country
 * of destination and Israel reports imports by country of origin, so goods routed through a third
 * country leave one line and not the other — which the reading guide says in words, under the
 * chart, where somebody looking at the shape will read it. */
(async function () {
  'use strict';
  GT.initChrome();

  const $ = (id) => document.getElementById(id);
  const HALT = '202405'; // the month the halt was announced; the series speaks for the rest
  let data = null;

  /* Whole millions were right while every row was a chapter worth tens of them. Opened to four
     digits the rows run down to a few thousand dollars, and a row reading "0 M$" beside "-99%"
     says the figure is missing rather than small. The unit stays the same down to a hundredth,
     below which the row says so instead of rounding to nothing. */
  const usd = (v) => {
    const loc = GT.lang === 'tr' ? 'tr-TR' : 'en-GB';
    if (v == null) return '—';
    const n = (x, d) => new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
    const a = Math.abs(v);
    if (a >= 1e9) return n(v / 1e9, 2) + ' ' + GT.t('t.bn');
    if (a >= 1e7) return n(v / 1e6, 0) + ' ' + GT.t('t.mn');
    if (a >= 1e6) return n(v / 1e6, 1) + ' ' + GT.t('t.mn');
    if (a >= 1e4) return n(v / 1e6, 2) + ' ' + GT.t('t.mn');
    if (a > 0) return '<' + n(0.01, 2) + ' ' + GT.t('t.mn');
    return n(0, 0) + ' ' + GT.t('t.mn');
  };
  const monthLabel = (period) => {
    const y = period.slice(0, 4);
    const m = Number(period.slice(4, 6));
    return new Intl.DateTimeFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB', { month: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(Number(y), m - 1, 1))) + ' ' + y;
  };

  function stats(series) {
    const after = series.filter((s) => s.period >= '202406');
    const withLine = after.filter((s) => (s.isr_imports_from_tur || 0) > 0);
    const before = series.filter((s) => s.period < HALT && s.tur_exports_to_isr);
    const meanBefore = before.length
      ? before.reduce((a, s) => a + s.tur_exports_to_isr, 0) / before.length : null;
    const seaBefore = before.filter((s) => s.by_mode && s.by_mode.tur_exports && s.by_mode.tur_exports.sea);
    const seaShare = seaBefore.length
      ? seaBefore.reduce((a, s) => a + s.by_mode.tur_exports.sea / s.tur_exports_to_isr, 0) / seaBefore.length : null;
    return {
      total: withLine.reduce((a, s) => a + s.isr_imports_from_tur, 0),
      months: withLine.length,
      ofMonths: after.length,
      meanBefore,
      seaShare,
      turLines: after.filter((s) => s.tur_exports_to_isr != null).length,
      /* A month with no Israel line in Türkiye's returns means one of two different things, and
         the difference is the whole method. If Türkiye reported other partners that month, the
         absence is a reported absence. If Türkiye published nothing at all, it is silence, and
         silence is not evidence of anything. The two are counted apart and shown apart. */
      absentReported: after.filter((s) => s.tur_exports_to_isr == null && s.tur_reported_that_month).length,
      absentSilent: after.filter((s) => s.tur_exports_to_isr == null && !s.tur_reported_that_month).length,
      totalReported: withLine
        .filter((s) => s.tur_reported_that_month)
        .reduce((a, s) => a + s.isr_imports_from_tur, 0),
    };
  }

  function renderStats(series) {
    const s = stats(series);
    const box = $('t-stats');
    const tile = (value, label, title) => {
      const d = GT.el('div', 't-stat');
      const b = GT.el('b', 'mono', value);
      d.append(b, GT.el('span', null, label));
      if (title) d.title = title;
      return d;
    };
    box.replaceChildren(
      tile(usd(s.total), GT.t('t.stat.total'), GT.t('t.stat.totalTip', { n: s.months })),
      tile(`${s.absentReported} / ${s.ofMonths}`, GT.t('t.stat.absent'),
        s.absentSilent ? GT.t('t.stat.silentTip', { n: s.absentSilent }) : ''),
      tile(usd(s.meanBefore), GT.t('t.stat.before')),
      tile(s.seaShare == null ? '—' : Math.round(s.seaShare * 100) + '%', GT.t('t.stat.sea')),
    );
    box.hidden = false;
    return s;
  }

  /* Two lines and a rule. The Turkish line stops; the Israeli one does not. Everything that could
     be mistaken for a claim — the shaded gap, the halt marker — is labelled in the caption. */
  function chart(series) {
    const rows = series.filter((s) => s.isr_imports_from_tur != null || s.tur_exports_to_isr != null);
    if (rows.length < 6) return;
    const max = Math.max(...rows.map((s) => Math.max(s.tur_exports_to_isr || 0, s.isr_imports_from_tur || 0)));
    const W = 1000, H = 300, pad = { l: 46, r: 14, t: 14, b: 40 };
    const step = (W - pad.l - pad.r) / (rows.length - 1);
    const x = (i) => pad.l + i * step;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'r-chart-svg');
    const el = (name, attrs, text, parent) => {
      const n = document.createElementNS(ns, name);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = text;
      (parent || svg).append(n);
      return n;
    };

    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      el('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'r-grid-line' });
      // the axis is in millions of dollars; the top gridline carries the unit so the caption
      // does not have to be read before the shape can be
      el('text', { x: pad.l - 8, y: y(v) + 4, class: 'r-ax', 'text-anchor': 'end' },
        Math.round(v / 1e6) + (i === 4 ? ' ' + GT.t('t.mn') : ''));
    }

    // the month the halt was announced
    const haltAt = rows.findIndex((s) => s.period === HALT);
    if (haltAt > 0) {
      el('line', { x1: x(haltAt), x2: x(haltAt), y1: pad.t, y2: y(0), class: 't-halt' });
      el('text', { x: x(haltAt) + 6, y: pad.t + 12, class: 'r-ax t-halt-label' }, GT.t('t.haltLabel'));
    }

    // the shaded difference: what Israel records and Türkiye does not
    const gap = rows.filter((s) => (s.isr_imports_from_tur || 0) > 0);
    if (gap.length > 1) {
      const top = gap.map((s) => `${x(rows.indexOf(s))},${y(s.isr_imports_from_tur)}`);
      const bottom = gap.slice().reverse().map((s) => `${x(rows.indexOf(s))},${y(s.tur_exports_to_isr || 0)}`);
      el('polygon', { points: [...top, ...bottom].join(' '), class: 't-gap' });
    }

    const line = (get, cls) => {
      let d = '', open = false;
      rows.forEach((s, i) => {
        const v = get(s);
        if (v == null) { open = false; return; }
        d += `${open ? 'L' : 'M'}${x(i)},${y(v)}`;
        open = true;
      });
      if (d) el('path', { d, class: cls });
    };
    line((s) => s.isr_imports_from_tur, 't-line-il');
    line((s) => s.tur_exports_to_isr, 't-line-tr');

    rows.forEach((s, i) => {
      const g = el('g', {});
      el('rect', { x: x(i) - step / 2, y: pad.t, width: step, height: H - pad.t - pad.b, class: 't-hit' }, null, g);
      el('title', {}, GT.t('t.tip', {
        m: monthLabel(s.period),
        tr: s.tur_exports_to_isr == null ? GT.t('t.noLine') : usd(s.tur_exports_to_isr),
        il: s.isr_imports_from_tur == null ? GT.t('t.noLine') : usd(s.isr_imports_from_tur),
      }), null, g);
      if (Number(s.period.slice(4)) === 1 || i === rows.length - 1) {
        el('text', { x: x(i), y: H - 14, class: 'r-ax', 'text-anchor': 'middle' }, s.period.slice(0, 4));
      }
    });

    const box = $('t-chart');
    box.replaceChildren(svg);
    box.setAttribute('aria-label', GT.t('t.aria', {
      a: monthLabel(rows[0].period), b: monthLabel(rows[rows.length - 1].period),
    }));
  }

  function routes(block) {
    if (!block || !block.partners) return;
    const rows = Object.values(block.partners)
      .filter((p) => p.change_pct != null)
      .sort((a, b) => b.change_pct - a.change_pct);
    if (!rows.length) return;
    const peak = Math.max(...rows.map((p) => Math.abs(p.change_pct)));
    const box = $('t-routes');
    const head = GT.el('div', 't-route t-route-head');
    head.append(
      GT.el('span', null, GT.t('t.r.partner')), GT.el('span', null, GT.t('t.r.before')),
      GT.el('span', null, GT.t('t.r.after')), GT.el('span', null, GT.t('t.r.change')),
    );
    box.replaceChildren(head, ...rows.map((p) => {
      const r = GT.el('div', 't-route');
      const bar = GT.el('span', 't-route-bar' + (p.change_pct < 0 ? ' down' : ''));
      bar.style.setProperty('--w', (100 * Math.abs(p.change_pct) / peak).toFixed(1) + '%');
      const change = GT.el('span', 't-route-ch' + (p.change_pct < 0 ? ' down' : ''));
      const whole = new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB', {
        maximumFractionDigits: 0, signDisplay: 'always',
      });
      change.append(bar, GT.el('b', 'mono', whole.format(p.change_pct) + '%'));
      r.append(
        GT.el('span', 't-route-name', (GT.lang === 'tr' && p.name_tr) || p.name),
        GT.el('span', 'mono', usd(p.before)), GT.el('span', 'mono', usd(p.after)), change,
      );
      r.title = GT.t('t.r.tip', { n: p.after_months, b: p.before_months });
      return r;
    }));
    /* The guard against "everything grew": if Türkiye's exports as a whole moved, a partner that
       merely kept pace has said nothing. The figure is stated once, next to the table. */
    const all = block.all_exports;
    if (all && all.change_pct != null) {
      const pctFmt = new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB', {
        minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always',
      });
      const note = GT.el('p', 'doc-note', GT.t('t.allExports', {
        pct: pctFmt.format(all.change_pct),
        a: usd(all.before), b: usd(all.after),
      }));
      box.after(note);
    }
    document.getElementById('rota').hidden = false;
  }

  /* The question that started this page was whether a reflagging can be followed. It can, and not
     by watching anything: two authorities publish the flag a designated ship flies and the flag it
     used to fly. This section shows the shape of that — which registry a ship left and which it
     joined — from lists published so that third parties can identify the ship.

     It is a different list from the trade series above and says nothing about the Israel trade.
     The lead says so, because a reader who conflates the two would be reading a claim we did not
     make. */
  async function flags() {
    let f = null;
    try {
      const r = await fetch('assets/data/vessels-summary.json', { cache: 'no-cache' });
      if (!r.ok) return;
      f = await r.json();
    } catch { return; }
    if (!f || !f.counts) return;

    const n = new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB');
    const tile = (value, label) => {
      const d = GT.el('div', 't-stat');
      d.append(GT.el('b', 'mono', value), GT.el('span', null, label));
      return d;
    };
    $('t-flag-stats').replaceChildren(
      tile(n.format(f.counts.vessels), GT.t('t.f.listed')),
      tile(n.format(f.counts.with_former_flag), GT.t('t.f.changed')),
      tile(n.format(f.counts.watch), GT.t('t.f.watch')),
      tile(n.format(f.counts.with_imo), GT.t('t.f.imo')),
    );

    const routes = (f.flag_changes || []).slice(0, 8);
    if (routes.length) {
      const peak = Math.max(...routes.map((r) => r.vessels));
      const head = GT.el('div', 't-route t-route-head');
      head.append(GT.el('span', null, GT.t('t.f.from')), GT.el('span', null, GT.t('t.f.to')),
        GT.el('span', null, ''), GT.el('span', null, GT.t('t.f.count')));
      $('t-flag-routes').replaceChildren(head, ...routes.map((r) => {
        const row = GT.el('div', 't-route');
        const ch = GT.el('span', 't-route-ch');
        const bar = GT.el('span', 't-route-bar');
        bar.style.setProperty('--w', (100 * r.vessels / peak).toFixed(1) + '%');
        ch.append(bar, GT.el('b', 'mono', String(r.vessels)));
        row.append(GT.el('span', 't-route-name', r.from || '—'),
          GT.el('span', 'mono', r.to || '—'), GT.el('span', null, ''), ch);
        return row;
      }));
    }
    $('t-flag-src').textContent = GT.t('t.f.src', { at: (f.built_at || '').slice(0, 10) });
    document.getElementById('bayrak').hidden = false;
  }

  /* What arrives, by HS chapter. Both windows come from Israel's own returns, because taking
     Türkiye's chapters before the halt and Israel's after it would compare two accounting bases
     and call the difference a finding.

     A chapter whose window is one delivery is marked: 105 M$ of ships in a single month of eleven
     averages to 10 M$ a month and would otherwise read as a trade that is still running. */
  /* A chapter opened one level. "Iron and steel" is a category, not a product: rebar for a
     building site and coated sheet for a factory are both HS 72 and they answer different
     questions. Only the chapters the builder actually fetched can be opened, so a chapter with
     no headings behind it is drawn as a plain row and says nothing it cannot support. */
  function headingRows(chapter, headings) {
    const rows = headings.filter((h) => h.chapter === chapter && (h.after > 0 || h.before > 0))
      .slice(0, 10);
    if (!rows.length) return null;
    const peak = Math.max(...rows.map((h) => h.after), 1);
    const box = GT.el('div', 't-sub');
    for (const h of rows) {
      const r = GT.el('div', 't-route t-route-sub');
      const bar = GT.el('span', 't-route-bar');
      bar.style.setProperty('--w', (100 * h.after / peak).toFixed(1) + '%');
      const share = GT.el('span', 't-route-ch');
      const pct = h.change_pct == null ? '\u2014'
        : new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB',
          { maximumFractionDigits: 0, signDisplay: 'always' }).format(h.change_pct) + '%';
      share.append(bar, GT.el('b', 'mono', pct));
      if (h.change_pct != null && h.change_pct < 0) share.classList.add('down');
      const full = (GT.lang === 'tr' && h.name_tr) ? h.name_tr : h.name;
      /* The UN sometimes writes a heading as "short chapter label; the thing it actually is"
         ("Iron or non-alloy steel; bars and rods, hot-rolled...") and sometimes puts the specific
         part first ("Alloy steel bars, rods, shapes and sections; hollow drill bars..."). Taking
         the first half printed "Iron or non-alloy steel" on five rows running; taking the second
         half turned 7228 into drill bars. The label is the short one, so only a short first
         segment is dropped. */
      const head0 = full.includes(';') ? full.slice(0, full.indexOf(';')).trim() : full;
      const cut = (full.includes(';') && head0.length <= 30)
        ? full.slice(full.indexOf(';') + 1).trim() : full;
      const short = cut.length > 74 ? cut.slice(0, 73).replace(/[\s,;]+\S*$/, '') + '…' : cut;
      const name = GT.el('span', 't-route-name');
      name.append(GT.el('span', 't-code mono', h.heading), ' ',
        short.charAt(0).toUpperCase() + short.slice(1));
      name.title = full;
      if (h.lumpy) {
        name.append(' ', GT.el('span', 't-lump', '\u25b2'));
        r.title = GT.t('t.g.lumpyTip', { n: h.months_present });
      }
      r.append(name, GT.el('span', 'mono', usd(h.before)), GT.el('span', 'mono', usd(h.after)), share);
      box.append(r);
    }
    return box;
  }

  function goods(block) {
    if (!block || !block.chapters) return;
    const rows = block.chapters.filter((c) => c.after > 0).slice(0, 12);
    if (!rows.length) return;
    const peak = Math.max(...rows.map((c) => c.after));
    const heads = (block.headings && block.headings.headings) || [];
    const box = $('t-goods');
    const head = GT.el('div', 't-route t-route-head');
    head.append(
      GT.el('span', null, GT.t('t.g.chapter')), GT.el('span', null, GT.t('t.g.before')),
      GT.el('span', null, GT.t('t.g.after')), GT.el('span', null, GT.t('t.g.share')),
    );
    box.replaceChildren(head, ...rows.map((c) => {
      const r = GT.el('div', 't-route');
      const bar = GT.el('span', 't-route-bar');
      bar.style.setProperty('--w', (100 * c.after / peak).toFixed(1) + '%');
      const share = GT.el('span', 't-route-ch');
      const pct = c.change_pct == null ? '—'
        : new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB',
          { maximumFractionDigits: 0, signDisplay: 'always' }).format(c.change_pct) + '%';
      share.append(bar, GT.el('b', 'mono', pct));

      /* The UN's chapter text is a full legal definition — "Electrical machinery and equipment and
         parts thereof; sound recorders and reproducers; television image and sound recorders…" is
         one chapter. The row takes what comes before the first semicolon, which is the chapter as
         anyone refers to it; the full text stays in the data file. */
      const full = (GT.lang === 'tr' && c.name_tr) ? c.name_tr : c.name;
      const short = full.split(';')[0].trim();
      const name = GT.el('span', 't-route-name', short);
      name.title = full;
      if (c.lumpy) {
        name.append(' ', GT.el('span', 't-lump', '▲'));
        r.title = GT.t('t.g.lumpyTip', { n: c.months_present });
      }
      r.append(name, GT.el('span', 'mono', usd(c.before)), GT.el('span', 'mono', usd(c.after)), share);

      const sub = heads.length ? headingRows(c.chapter, heads) : null;
      if (!sub) return r;
      /* The chapter row becomes the control that opens its own breakdown. <details> rather than a
         button and a class: it is open or closed in the page's own state, it prints open, and a
         reader who searches the page finds the headings inside a closed one. */
      const d = GT.el('details', 't-open');
      const sum = GT.el('summary', 't-open-sum');
      sum.append(r, GT.el('span', 't-open-n mono', GT.t('t.g.open')));
      d.append(sum, sub);
      return d;
    }));
    const total = block.chapters.reduce((a, c) => a + c.after, 0);
    const wasTotal = block.chapters.reduce((a, c) => a + c.before, 0);
    $('t-goods-src').textContent = GT.t('t.g.src', {
      a: block.windows.after.join(' – '), b: block.windows.before.join(' – '),
      was: usd(wasTotal), now: usd(total),
    });
    document.getElementById('urunler').hidden = false;
  }

  function render() {
    if (!data) return;
    const s = renderStats(data.series);
    chart(data.series);
    routes(data.routes);
    goods(Object.assign({}, data.chapters, { headings: data.headings }));
    const last = data.series[data.series.length - 1];
    $('t-chart-note').textContent = GT.t('t.note', {
      n: s.months, d: s.ofMonths, v: usd(s.total),
      r: s.absentReported, q: usd(s.totalReported),
    }) + (s.absentSilent ? ' ' + GT.t('t.noteSilent', { n: s.absentSilent }) : '');
    $('t-chart-src').textContent = GT.t('t.src', { p: monthLabel(last.period) });
    $('t-state').hidden = true;
  }

  try {
    const r = await fetch('assets/data/trade-il.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    data = await r.json();
  } catch (e) {
    $('t-state').textContent = GT.t('t.err');
    console.warn(e);
    return;
  }
  render();
  flags();
  document.addEventListener('gt:lang', () => { render(); flags(); });
})();
