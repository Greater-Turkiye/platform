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

  const usd = (v) => {
    const loc = GT.lang === 'tr' ? 'tr-TR' : 'en-GB';
    if (v == null) return '—';
    if (Math.abs(v) >= 1e9) return new Intl.NumberFormat(loc, { maximumFractionDigits: 2 }).format(v / 1e9) + ' ' + GT.t('t.bn');
    return new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }).format(v / 1e6) + ' ' + GT.t('t.mn');
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
      tile(`${s.turLines} / ${s.ofMonths}`, GT.t('t.stat.turLines')),
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

  function render() {
    if (!data) return;
    const s = renderStats(data.series);
    chart(data.series);
    routes(data.routes);
    const last = data.series[data.series.length - 1];
    $('t-chart-note').textContent = GT.t('t.note', { n: s.months, d: s.ofMonths, v: usd(s.total) });
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
  document.addEventListener('gt:lang', render);
})();
