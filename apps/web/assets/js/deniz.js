/* Greater Türkiye — deniz paneli / the sea panel.
 *
 * A light, quiet page about one thing: the sea. It draws what is already in this repository —
 * maritime jurisdiction as Türkiye states it, the Straits, Turkish islands, and the grid of
 * activity other states announced to mariners between 2015 and 2021 — and reads three figures
 * under the map: what is announced in each sea, which registries ships left and joined, and how
 * much of the halted Israel trade used to move by water.
 *
 * Deliberately not here: any vessel's position, route or destination (ADR 0022). The map has no
 * layer for it and the page has no field for it.
 *
 * It is drawn with D3 alone — no tiles, no MapLibre. At this scale the coastline we ship is
 * enough, the page loads in one request per layer, and a light map with nothing moving is the
 * point: this is a page to read, not a console to drive.
 */
(async function () {
  'use strict';
  GT.initChrome();

  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The frame: Ionian to the Caucasus, Libya to Ukraine. Everything this page is about is inside it.
  const VIEW = [[18.5, 29.5], [45.5, 48.5]];

  /* The seas, as boxes. A cell counts for a sea when its centre is inside the box; the boxes do not
     overlap, unlike the watch regions, because a sea is a place and not a region of interest. */
  const SEAS = {
    aegean: { tr: 'Ege', en: 'Aegean', box: [[22.5, 35.0], [28.0, 41.0]] },
    marmara: { tr: 'Marmara ve Boğazlar', en: 'Marmara and the Straits', box: [[26.0, 40.0], [30.2, 41.6]] },
    blacksea: { tr: 'Karadeniz', en: 'Black Sea', box: [[27.4, 41.0], [41.8, 47.3]] },
    eastmed: { tr: 'Doğu Akdeniz', en: 'Eastern Mediterranean', box: [[28.0, 30.5], [36.5, 37.0]] },
    cyprus: { tr: 'Kıbrıs çevresi', en: 'Around Cyprus', box: [[32.0, 34.2], [35.0, 36.0]] },
  };

  let world = null, density = null, vessels = null, trade = null;
  let svg = null, gRoot = null, proj = null, path = null, zoom = null, W = 0, H = 0;

  const mapBox = $('s-map');

  /* ---------------- map ---------------- */

  function draw() {
    if (!world || !mapBox) return;
    W = mapBox.clientWidth;
    H = mapBox.clientHeight;
    if (!W || !H) return;

    /* Two corners, not a box: d3-geo reads a ring's winding on the sphere, and a rectangle drawn
       the wrong way round means "everything except this", which is how the first draft of this
       page ended up showing the whole world. A MultiPoint has no winding to get wrong. */
    proj = d3.geoMercator().fitExtent([[6, 6], [W - 6, H - 6]], {
      type: 'MultiPoint', coordinates: [VIEW[0], VIEW[1]],
    });
    path = d3.geoPath(proj);

    d3.select(mapBox).select('svg').remove();
    svg = d3.select(mapBox).append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('class', 's-svg')
      .attr('role', 'img')
      .attr('aria-label', GT.t('s.mapAria'));
    gRoot = svg.append('g');

    // the water is the background; everything else sits on it
    gRoot.append('rect').attr('class', 's-water').attr('width', W).attr('height', H);

    const land = gRoot.append('g');
    land.selectAll('path').data(world.countries).join('path')
      .attr('d', path)
      .attr('class', (f) => 's-land' + (GT.a3(f) === 'TUR' ? ' is-tur' : ''));
    gRoot.append('path').datum(world.borders).attr('d', path).attr('class', 's-border');

    /* Where activity was announced, 2015–2021: a wash under the limits, not over them. Only the
       military class is drawn — that is what the figures under the map count — and the lightest
       cells are left out, because a blanket over the whole sea says less than a shape does. */
    if (density) {
      const step = (density.method && density.method.cell_deg) || 0.25;
      const cells = density.cells.filter(([lon, lat, mil]) =>
        mil > 0 && lon >= VIEW[0][0] && lon <= VIEW[1][0] && lat >= VIEW[0][1] && lat <= VIEW[1][1]);
      const peak = Math.max(1, ...cells.map((c) => c[2]));
      const g = gRoot.append('g').attr('class', 's-cells');
      for (const [lon, lat, mil] of cells) {
        const share = mil / peak;
        if (share < 0.02) continue;
        const a = proj([lon, lat]);
        const b = proj([lon + step, lat + step]);
        g.append('rect')
          .attr('x', Math.min(a[0], b[0])).attr('y', Math.min(a[1], b[1]))
          .attr('width', Math.abs(b[0] - a[0])).attr('height', Math.abs(b[1] - a[1]))
          .attr('class', 's-cell')
          .attr('opacity', (0.08 + 0.5 * Math.sqrt(share)).toFixed(3));
      }
    }

    // what Türkiye states at sea: agreed limits solid, claimed ones dashed (MARITIME-SOURCES.md)
    const sea = gRoot.append('g');
    for (const f of world.maritime) {
      const p = f.properties;
      /* A line is a limit and an area is an area: filling a LineString paints the sea inside the
         curve. And a status with no class of its own would fall through to the SVG default, which
         is solid black — that is how the KKTC licence blocks first appeared as a black slab. */
      const line = /LineString/.test(f.geometry.type);
      const kind = p.kind === 'internal-waters' ? 'straits'
        : (['agreed', 'claimed', 'schematic', 'licence'].includes(p.status) ? p.status : 'claimed');
      const node = sea.append('path')
        .attr('d', path(f))
        .attr('class', 's-area ' + (line ? 's-limit s-limit-' + kind : 's-' + kind));
      node.append('title').text(`${GT.lang === 'tr' ? p.name_tr : p.name_en}\n${(GT.lang === 'tr' ? p.basis_tr : p.basis_en) || ''}`.trim());
    }

    // Turkish islands, as points with their names on hover
    const isl = gRoot.append('g');
    for (const f of world.islands || []) {
      const [x, y] = proj(f.geometry.coordinates);
      const node = isl.append('circle').attr('cx', x).attr('cy', y).attr('r', 2.6).attr('class', 's-island');
      node.append('title').text(GT.lang === 'tr' ? f.properties.name_tr : f.properties.name_en);
    }

    // sea names, placed once and left alone
    const labels = gRoot.append('g');
    const NAMES = [
      { at: [25.3, 38.4], tr: 'EGE DENİZİ', en: 'AEGEAN SEA' },
      { at: [33.5, 33.6], tr: 'AKDENİZ', en: 'MEDITERRANEAN' },
      { at: [34.5, 43.6], tr: 'KARADENİZ', en: 'BLACK SEA' },
      { at: [28.1, 40.7], tr: 'MARMARA', en: 'MARMARA' },
    ];
    for (const n of NAMES) {
      const [x, y] = proj(n.at);
      labels.append('text').attr('x', x).attr('y', y).attr('class', 's-sea-label')
        .attr('text-anchor', 'middle').text(GT.lang === 'tr' ? n.tr : n.en);
    }

    zoom = d3.zoom().scaleExtent([1, 8])
      .on('zoom', (ev) => gRoot.attr('transform', ev.transform));
    svg.call(zoom).on('dblclick.zoom', null);
  }

  /* ---------------- the three readings under the map ---------------- */

  function seaActivity() {
    if (!density) return [];
    const out = [];
    for (const [key, s] of Object.entries(SEAS)) {
      const [[w, so], [e, n]] = s.box;
      let mil = 0, rest = 0, cells = 0;
      for (const [lon, lat, m, survey, other] of density.cells) {
        const x = lon + 0.125, y = lat + 0.125;
        if (x >= w && x <= e && y >= so && y <= n) { mil += m; rest += survey + other; cells += 1; }
      }
      out.push({ key, name: GT.lang === 'tr' ? s.tr : s.en, mil, rest, cells });
    }
    return out.sort((a, b) => b.mil - a.mil);
  }

  function renderSeas() {
    const rows = seaActivity();
    if (!rows.length) return;
    const peak = Math.max(1, ...rows.map((r) => r.mil));
    const nf = new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB');
    const box = $('s-seas');
    box.replaceChildren(...rows.map((r) => {
      const row = GT.el('div', 's-row');
      const bar = GT.el('span', 's-bar');
      bar.style.setProperty('--w', (100 * r.mil / peak).toFixed(1) + '%');
      const val = GT.el('span', 's-val');
      val.append(bar, GT.el('b', 'mono', nf.format(r.mil)));
      row.append(GT.el('span', 's-name', r.name), val,
        GT.el('span', 's-sub mono', GT.t('s.cells', { n: nf.format(r.cells) })));
      row.title = GT.t('s.seaTip', { n: nf.format(r.mil + r.rest) });
      return row;
    }));
    $('s-seas-note').textContent = GT.t('s.seasNote');
  }

  function renderFlags() {
    if (!vessels || !vessels.flag_changes) return;
    const rows = vessels.flag_changes.filter((r) => r.from && r.to).slice(0, 6);
    if (!rows.length) return;
    const peak = Math.max(1, ...rows.map((r) => r.vessels));
    const box = $('s-flags');
    box.replaceChildren(...rows.map((r) => {
      const row = GT.el('div', 's-row');
      const bar = GT.el('span', 's-bar');
      bar.style.setProperty('--w', (100 * r.vessels / peak).toFixed(1) + '%');
      const val = GT.el('span', 's-val');
      val.append(bar, GT.el('b', 'mono', String(r.vessels)));
      row.append(GT.el('span', 's-name', `${r.from} → ${r.to}`), val, GT.el('span', 's-sub', ''));
      return row;
    }));
    const c = vessels.counts || {};
    $('s-flags-note').textContent = GT.t('s.flagsNote', { n: c.with_former_flag, t: c.vessels });
  }

  function renderTrade() {
    if (!trade || !trade.series) return;
    const before = trade.series.filter((s) => s.period < '202405' && s.tur_exports_to_isr);
    const withSea = before.filter((s) => s.by_mode && s.by_mode.tur_exports && s.by_mode.tur_exports.sea);
    if (!withSea.length) return;
    const share = withSea.reduce((a, s) => a + s.by_mode.tur_exports.sea / s.tur_exports_to_isr, 0) / withSea.length;
    const sea = withSea.reduce((a, s) => a + s.by_mode.tur_exports.sea, 0) / withSea.length;
    const nf = new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB', { maximumFractionDigits: 0 });
    $('s-trade').replaceChildren(
      stat(Math.round(share * 100) + '%', GT.t('s.tr.share')),
      stat(nf.format(sea / 1e6) + ' ' + GT.t('t.mn'), GT.t('s.tr.monthly')),
      stat(String(withSea.length), GT.t('s.tr.months')),
    );
    $('s-trade-note').textContent = GT.t('s.tradeNote');
  }

  function stat(value, label) {
    const d = GT.el('div', 's-stat');
    d.append(GT.el('b', 'mono', value), GT.el('span', null, label));
    return d;
  }

  function render() {
    draw();
    renderSeas();
    renderFlags();
    renderTrade();
    $('s-state').hidden = true;
  }

  /* ---------------- load ---------------- */

  const optional = async (url) => {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };

  try {
    [world, density, vessels, trade] = await Promise.all([
      GT.loadWorld('assets/data/countries-50m.json'),
      optional('assets/data/msi-density.json'),
      optional('assets/data/vessels-sanctioned.json'),
      optional('assets/data/trade-il.json'),
    ]);
  } catch (e) {
    $('s-state').textContent = GT.t('s.err');
    console.warn(e);
    return;
  }

  render();
  const reset = $('s-reset');
  if (reset) {
    reset.addEventListener('click', () => {
      if (svg && zoom) svg.transition().duration(reduce ? 0 : 500).call(zoom.transform, d3.zoomIdentity);
    });
  }
  window.addEventListener('resize', GT.debounce(render, 220));
  document.addEventListener('gt:lang', render);
})();
