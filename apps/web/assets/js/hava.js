/* Greater Türkiye — hava paneli / the air dashboard.
 *
 * One subject: the structure of the airspace around Türkiye. It draws the flight information
 * regions and answers one question with a number — how much of each sea's airspace falls in which
 * FIR — because that is the question the map is usually used to argue about and almost never
 * answered with an arithmetic anyone can check.
 *
 * A FIR is where a state provides air traffic services. It is not sovereignty and it is not a
 * claim: ICAO assigns it, and it routinely covers water and other states' coasts. The airspace map
 * and the maritime map are different maps of the same water, argued on different grounds, and
 * confusing the two is how most of the bad commentary about this region starts. The page says so
 * in its own words rather than leaving the reader to work it out from the colours.
 *
 * The boundaries come from a flight-simulation network's open dataset. They are close and openly
 * licensed, and they are not an aeronautical source — so every line here is schematic, the page
 * says so where it cannot be missed, and nothing here may be used for navigation.
 *
 * No aircraft. No position, no track, no callsign, no flight. This is a map of structure.
 *
 * The map itself is assets/js/gtmap.js, shared with the dashboard and the sea dashboard.
 */
(async function () {
  'use strict';
  GT.initChrome();
  GT.clock(document.getElementById('n-utc'));

  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);

  const VIEW_WIDE = [[18.0, 28.0], [48.0, 49.0]];
  const VIEW_NARROW = [[21.0, 29.0], [45.0, 48.0]];

  const state = { sea: params.get('sea') || '', fir: params.get('fir') || '' };
  let world = null, fir = null, map = null, gFir = null, gStatic = null, k = 1;

  const mapBox = $('n-map');
  const nf = () => new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB');
  const firName = (f) => (GT.lang === 'tr' ? f.name_tr : f.name_en);
  const pct = (v) => Math.round(v * 100) + '%';

  /* ---------------- map ---------------- */

  function drawMap() {
    if (!world || !mapBox) return;
    map = GT.map.create(mapBox, {
      view: VIEW_WIDE,
      viewNarrow: VIEW_NARROW,
      // FIR boundaries are schematic and the land under them is 1:10m; see HONEST_ZOOM
      scaleExtent: [1, GT.map.HONEST_ZOOM['ne-10m']],
      ariaLabel: GT.t('h.mapAria'),
      onFrame: (t) => { $('n-scale').textContent = t.k.toFixed(1) + '×'; },
      onZoom: (kk) => { k = kk; map.rescale(); $('n-scale').textContent = kk.toFixed(1) + '×'; },
      onCursor: (ll) => { $('n-coords').textContent = ll ? GT.fmtLL(ll) : '—'; },
      onBackground: () => setFir(''),
    });
    if (!map.frame()) return;
    k = 1;

    map.land(world);
    drawFirs();
    gStatic = map.layer();
    drawFirLabels();
    map.ready();
  }

  /* Every FIR is drawn in the same colour. A palette per state would be a map of who owns what,
     which is exactly the reading this layer must not invite: the selected one is picked out, the
     rest are the same neutral outline, and the arithmetic is in the sidebar. */
  function drawFirs() {
    gFir = map.layer('a-firs');
    for (const f of (fir.geojson && fir.geojson.features) || []) {
      const p = f.properties;
      const node = gFir.append('path')
        .attr('d', map.path(f))
        .attr('class', 'a-fir' + (p.fir === state.fir ? ' on' : ''))
        .attr('data-fir', p.fir);
      const row = fir.firs.find((r) => r.fir === p.fir);
      const sub = row
        ? GT.t('h.tipArea', { n: nf().format(row.area_km2) })
        : GT.t('h.schematicShort');
      node
        .on('pointermove', (ev) => showTip(ev, `${p.fir} · ${GT.lang === 'tr' ? p.name_tr : p.name_en}`, sub))
        .on('pointerleave', hideTip)
        .on('click', (ev) => { ev.stopPropagation(); setFir(state.fir === p.fir ? '' : p.fir); });
    }
  }

  /* Labels are placed at each FIR's own centroid and counter-scaled, like the sea names: a label
     that grows with the zoom becomes a banner across the airspace it is naming. */
  function drawFirLabels() {
    for (const f of (fir.geojson && fir.geojson.features) || []) {
      const c = d3.geoCentroid(f);
      if (!c || Number.isNaN(c[0])) continue;
      map.fixed(gStatic, c, 'a-fixed')
        .append('text')
        .attr('class', 'a-fir-label')
        .attr('text-anchor', 'middle')
        .text(f.properties.fir);
    }
  }

  function syncFirClasses() {
    if (gFir) gFir.selectAll('.a-fir').classed('on', function () { return this.dataset.fir === state.fir; });
  }

  /* ---------------- tooltip ---------------- */

  const tip = $('n-tip');
  function showTip(ev, title, sub) {
    if (!tip) return;
    tip.hidden = false;
    tip.replaceChildren(GT.el('b', null, title || ''), ...(sub ? [GT.el('span', null, sub)] : []));
    const box = mapBox.getBoundingClientRect();
    const x = Math.min(Math.max(ev.clientX - box.left + 14, 8), Math.max(8, box.width - 280));
    const y = Math.min(Math.max(ev.clientY - box.top + 14, 8), Math.max(8, box.height - 80));
    tip.style.transform = `translate(${x}px,${y}px)`;
  }
  function hideTip() { if (tip) tip.hidden = true; }

  /* ---------------- sidebar ---------------- */

  function renderStats() {
    const f = nf();
    const aeg = (fir.seas.aegean && fir.seas.aegean.shares) || {};
    const top = Object.entries(aeg)[0];
    const tur = fir.firs.filter((r) => r.state === 'TUR').reduce((a, r) => a + r.area_km2, 0);
    $('n-stats').replaceChildren(
      stat(String(fir.firs.length), GT.t('h.st.firs')),
      stat(top ? `${top[0]} ${pct(top[1])}` : '—', GT.t('h.st.aegean')),
      stat(f.format(tur) + ' km²', GT.t('h.st.tur')),
      stat(String(Object.keys(fir.seas).length), GT.t('h.st.seas')),
    );
    $('n-pulse').textContent = GT.t('h.pulse', {
      at: (fir.built_at || '').slice(0, 16).replace('T', ' ') + 'Z',
    });
    $('a-warn').textContent = GT.t('h.warn');
  }

  function stat(value, label) {
    const d = GT.el('div', 'n-stat');
    d.append(GT.el('b', 'mono', value), GT.el('span', null, label));
    return d;
  }

  /* Each sea as a single bar split between the FIRs that cover it. A stacked bar rather than a
     table of percentages because the shape is the point: the Aegean is one colour with a fifth of
     another, and the Black Sea is seven slivers. */
  function renderSeas() {
    const box = $('a-seas');
    const rows = Object.entries(fir.seas);
    box.replaceChildren(...rows.map(([key, s]) => {
      const b = GT.el('button', 'a-row' + (state.sea === key ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.sea === key));
      const head = GT.el('div', 'a-row-head');
      head.append(
        GT.el('span', 'a-row-name', GT.lang === 'tr' ? s.name_tr : s.name_en),
        GT.el('span', 'a-row-top mono', Object.keys(s.shares)[0] || '—'),
      );
      const track = GT.el('div', 'a-track');
      const parts = [];
      for (const [code, share] of Object.entries(s.shares)) {
        const seg = GT.el('span', 'a-seg' + (code === state.fir ? ' on' : ''));
        seg.style.setProperty('--w', (share * 100).toFixed(2) + '%');
        seg.title = `${code} · ${pct(share)}`;
        seg.dataset.fir = code;
        track.append(seg);
        parts.push(`${code} ${pct(share)}`);
      }
      /* What the boxes do not reach is land, or airspace no listed FIR covers. Saying so is the
         difference between a measurement and a pie chart that always adds to a hundred. */
      if (s.accounted < 0.995) {
        const rest = GT.el('span', 'a-seg a-seg-rest');
        rest.style.setProperty('--w', ((1 - s.accounted) * 100).toFixed(2) + '%');
        rest.title = GT.t('h.unaccounted', { n: pct(1 - s.accounted) });
        track.append(rest);
      }
      b.append(head, track, GT.el('span', 'a-row-parts mono', parts.join(' · ')));
      b.addEventListener('click', () => setSea(state.sea === key ? '' : key));
      return b;
    }));
    $('n-clear').hidden = !state.sea && !state.fir;
  }

  function renderList() {
    const rows = fir.firs.slice();
    $('n-count').textContent = GT.t('h.count', { n: rows.length });
    $('n-list').replaceChildren(...rows.map((r) => {
      const li = GT.el('div');
      li.setAttribute('role', 'listitem');
      const b = GT.el('button', 'n-item' + (r.fir === state.fir ? ' on' : ''));
      b.type = 'button';
      const seas = Object.entries(r.seas)
        .map(([key, v]) => `${GT.lang === 'tr' ? fir.seas[key].name_tr : fir.seas[key].name_en} ${pct(v)}`)
        .join(' · ');
      b.append(
        GT.el('span', 'n-item-name', `${r.fir} · ${firName(r)}`),
        GT.el('span', 'n-item-meta mono',
          `${nf().format(r.area_km2)} km²${seas ? ' · ' + seas : ''}`),
      );
      b.addEventListener('click', () => setFir(state.fir === r.fir ? '' : r.fir));
      li.append(b);
      return li;
    }));
  }

  function renderLegend() {
    $('a-legend').replaceChildren(
      lg('a-lg-fir', GT.t('h.lg.fir')),
      lg('a-lg-on', GT.t('h.lg.on')),
      lg('a-lg-land', GT.t('h.lg.land')),
    );
  }
  function lg(cls, text) {
    const d = GT.el('div', 'n-lg');
    d.append(GT.el('i', cls), GT.el('span', null, text));
    return d;
  }

  /* ---------------- selection ---------------- */

  function setSea(key) {
    state.sea = key;
    renderSeas();
    syncUrl();
    if (!map) return;
    if (!key) { map.reset(reduce ? 0 : 600); return; }
    map.gotoBox(fir.seas[key].box, reduce ? 0 : 750);
  }

  function setFir(code) {
    state.fir = code;
    syncFirClasses();
    renderSeas();
    renderList();
    syncUrl();
    if (!code || !map) return;
    const f = (fir.geojson.features || []).find((x) => x.properties.fir === code);
    if (!f) return;
    const b = d3.geoBounds(f);
    map.gotoBox([b[0], b[1]], reduce ? 0 : 750);
  }

  function syncUrl() {
    const q = new URLSearchParams();
    if (state.sea) q.set('sea', state.sea);
    if (state.fir) q.set('fir', state.fir);
    const s = q.toString();
    history.replaceState(null, '', s ? '?' + s : location.pathname);
  }

  function render() {
    if (!fir) return;
    renderStats();
    renderSeas();
    renderList();
    renderLegend();
    drawMap();
    if (state.fir) syncFirClasses();
    if (state.sea) setSea(state.sea);
    $('n-state').hidden = true;
  }

  /* ---------------- load ---------------- */

  const optional = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
    return r.json();
  };

  const [w, f] = await Promise.allSettled([
    GT.loadWorld('assets/data/countries-50m.json'),
    optional('assets/data/fir.json'),
  ]);
  world = w.status === 'fulfilled' ? w.value : null;
  fir = f.status === 'fulfilled' ? f.value : null;

  if (!world || !fir) {
    $('n-state').textContent = GT.t('s.err');
    if (w.status === 'rejected') console.warn(w.reason);
    if (f.status === 'rejected') console.warn(f.reason);
    return;
  }

  render();
  $('n-clear').addEventListener('click', () => { setFir(''); setSea(''); });
  $('n-in').addEventListener('click', () => map && map.zoomBy(1.7));
  $('n-out').addEventListener('click', () => map && map.zoomBy(1 / 1.7));
  $('n-reset').addEventListener('click', () => { setFir(''); setSea(''); });
  window.addEventListener('resize', GT.debounce(() => { render(); }, 220));
  document.addEventListener('gt:lang', render);

  // the screenshot harness and the performance engine drive the map through this
  window.GT_AIR = { setSea, setFir, seas: () => fir.seas };
})();
