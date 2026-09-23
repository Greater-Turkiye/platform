/* The map engine, written once.
 *
 * Every map page on this site needs the same things: a Mercator framed on a box, an SVG with a
 * single transformed root, a zoom that separates the frame the reader is dragging from the frame
 * that is finally rendered, markers and labels that keep their size while the map grows under
 * them, a cursor read-out, and a land mask so a layer about the sea does not paint the land.
 *
 * Until now the dashboard and the sea dashboard each carried their own copy, and the air panel
 * would have been a third. A fix to one was a fix to one. This module is the single copy: pages
 * bring their own layers and their own meaning, and share the machinery underneath.
 *
 *     const m = GT.map.create(box, { view, ariaLabel, onZoom, onCursor });
 *     m.land(world);                       // water, countries, borders
 *     const g = m.layer('n-cells');        // an ordinary <g> inside the zoom root
 *     m.fixed(g, lon, lat).append('circle')// a mark that will not grow with the zoom
 *     m.ready();                           // wire the zoom once the layers are in
 *
 * What it does not do: decide what a page means. No layer here knows what it is drawing.
 *
 * What it is not for: the home-page globe. This engine is SVG, Mercator and pan-and-zoom;
 * home.js is a canvas, orthographic, rotates rather than pans and carries its own path
 * renderer (ortho.js) and quality controller. They share no machinery, and everything that
 * could be shared already lives in gt.js. See apps/web/README.md for the reasoning.
 */
(function () {
  'use strict';

  const GT = (window.GT = window.GT || {});
  const EARTH = 6371008.8; // metres, the sphere d3-geo measures on

  /* d3-geo reads a ring's winding on the sphere, so a rectangle drawn the wrong way round means
     "everything except this" and frames the whole world. Two corners as a MultiPoint have no
     winding to get wrong. This cost an afternoon once; it is a helper now so it cannot again. */
  const corners = (view) => ({ type: 'MultiPoint', coordinates: [view[0], view[1]] });

  /* Which cells fall on land, answered by drawing rather than by geometry.
   *
   * A sea layer on a 0.25 degree grid is tens of thousands of cells, and asking d3.geoContains
   * about 170 country polygons for each one is minutes of work. Painting the land into an
   * offscreen canvas under the same projection and reading one pixel per cell is the same
   * question answered in a single pass: the canvas is the index.
   *
   * The mask is deliberately generous by half a cell (`grow`), because a cell whose centre sits
   * just offshore still covers the coast, and a wash that bleeds inland reads as a claim about
   * the land. Better to drop a coastal cell than to stain Anatolia. */
  function landMask(world, proj, W, H, grow) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(W));
    cv.height = Math.max(1, Math.round(H));
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.001, grow * 2); // widen the coast so a cell straddling it counts as land
    const p = d3.geoPath(proj, ctx);
    /* One path per country, not one path for all of them. Canvas fills with the nonzero winding
       rule, so accumulating every country into a single path lets neighbours that wind in opposite
       directions cancel each other out — which left holes over Greece and Crete, and the wash
       painted the islands it was supposed to avoid. */
    for (const f of world.countries || []) {
      ctx.beginPath();
      p(f);
      ctx.fill();
      if (grow > 0) ctx.stroke();
    }
    const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
    return function onLand(x, y) {
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix < 0 || iy < 0 || ix >= cv.width || iy >= cv.height) return false;
      return px[(iy * cv.width + ix) * 4 + 3] > 8; // any ink at all
    };
  }

  /* How far a coastline may honestly be zoomed.
   *
   * Natural Earth 1:10m is drawn for maps at about 1:10,000,000. Measured on the file this project
   * ships: around the Sea of Marmara the median coastline segment is 1,564 m and the p90 is 4,773 m.
   * At 24x one pixel is 74 m, so the median segment is 21 pixels long and the shore is visibly a
   * chain of straight lines — the map is claiming a precision the data does not have.
   *
   *     zoom   1 px      median segment
   *       2x   886 m      1.8 px
   *       4x   443 m      3.5 px
   *       8x   222 m      7.1 px
   *      24x    74 m     21.2 px
   *
   * So 1:10m is honest to about 4x, and a page that wants to go deeper needs a source that carries
   * the detail — which is exactly what the dashboard does, bringing vector tiles in at 1.6x. This
   * is not a limit the engine can enforce, because it depends on what the page draws; it is a
   * number the page has to choose on purpose, which is why `scaleExtent` no longer has a generous
   * default to fall into.
   */
  const HONEST_ZOOM = { 'ne-10m': 4, 'ne-50m': 1.5 };

  /**
   * create(container, opts) → a map handle.
   *
   * opts.view          [[lon,lat],[lon,lat]] — the two corners to frame
   * opts.viewNarrow    the same for a tall box (phones); chosen by aspect ratio
   * opts.pad           pixels of margin inside the box (default 10)
   * opts.scaleExtent   [min,max] zoom factors (default [1,24])
   * opts.ariaLabel     what the map is, for a screen reader
   * opts.onZoom(k)     the zoom level settled on a new value: redraw what depends on it
   * opts.onCursor(ll)  pointer moved, in lon/lat, or null when it leaves
   * opts.onBackground  a click that hit no mark
   */
  function create(container, opts) {
    const o = opts || {};
    const pad = o.pad == null ? 10 : o.pad;
    const api = {};
    let svg = null, gRoot = null, zoom = null, proj = null, path = null, mover = null;
    let W = 0, H = 0, k = 1, view = null;
    const fixedGroups = new Set(); // groups whose children are counter-scaled

    api.frame = function frame() {
      W = container.clientWidth;
      H = container.clientHeight;
      if (!W || !H) return false;
      view = (o.viewNarrow && W / H < 1.1) ? o.viewNarrow : o.view;
      proj = d3.geoMercator().fitExtent([[pad, pad], [W - pad, H - pad]], corners(view));
      path = d3.geoPath(proj);
      /* With deferred rendering the SVG sits inside a plain box that the gesture moves, and the
         zoom behaviour is attached to the container, which never moves — so `d3.pointer` keeps
         reading coordinates in a frame that is standing still. */
      const host = d3.select(container).selectAll('div.gm-mover').data([0]).join('div')
        .attr('class', 'gm-mover');
      mover = host.node();
      host.selectAll('svg').remove();
      svg = host.append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('role', 'img')
        .attr('aria-label', o.ariaLabel || '');
      gRoot = svg.append('g');
      fixedGroups.clear();
      k = 1;
      api.svg = svg; api.gRoot = gRoot; api.proj = proj; api.path = path;
      api.W = W; api.H = H; api.view = view;
      return true;
    };

    /** A new <g> inside the zoom root, in call order. */
    api.layer = (cls) => gRoot.append('g').attr('class', cls || null);

    /**
     * The water rectangle, the land, the countries and the borders, in that order.
     *
     * `coast` is the merged 1:10m coastline, and passing it matters for more than detail: the
     * water mask is cut from the same file, so without it the drawn land (1:50m) and the mask
     * disagree and a pale halo appears along every shore where one says land and the other says
     * water. Drawn underneath the countries, it fills exactly those gaps and is hidden everywhere
     * else, so it costs one path and nothing is lost where the two already agree.
     */
    api.land = function land(world, cls, coast) {
      const c = cls || {};
      gRoot.append('rect').attr('class', c.water || 'n-water').attr('width', W).attr('height', H);
      if (coast && coast.land) {
        gRoot.append('path')
          .attr('class', (c.land || 'n-land') + ' gm-coast')
          .attr('d', path({ type: 'Feature', geometry: coast.land, properties: {} }));
      }
      /* With a coast underneath, a country outline is the *wrong* coastline drawn on top of the
         right one: a thin pale line everywhere the two generalisations differ. The countries are
         still wanted for what only they can say — which land is whose — so they keep their fill
         and lose their stroke. Borders between countries come from `world.borders` regardless. */
      const g = gRoot.append('g').classed('gm-has-coast', !!(coast && coast.land));
      g.selectAll('path').data(world.countries || []).join('path')
        .attr('d', path)
        .attr('class', (f) => (c.land || 'n-land') + (GT.a3 && GT.a3(f) === 'TUR' ? ' is-tur' : ''));
      if (world.borders) {
        gRoot.append('path').datum(world.borders).attr('d', path)
          .attr('class', c.border || 'n-border');
      }
      return g;
    };

    /**
     * A mask that lets a layer paint water and never land.
     *
     * The maritime areas and the coastline the site draws are two generalisations of the same
     * coast and they disagree: 2,668 km² of sea polygon sits on 1:50m land, spread over dozens of
     * small fragments in the gulfs the coastline smooths across. Clipping the areas would degrade
     * geometry that came from official coordinates to match a rendering asset, and would erase the
     * Bosphorus and the Dardanelles, which are narrower than the drawn coastline and overlap it on
     * purpose. So it is solved in rendering instead.
     *
     * One merged coastline (assets/data/coast-10m.json, 1:10m so the mask is finer than anything
     * it masks), as a single path in an SVG mask: white everywhere, black over land. The compositor
     * evaluates it once for the whole group rather than per feature, and because the mask lives in
     * the same transformed group as the geometry it stays aligned at every zoom — which is what
     * the old "hide the fills past 12x" rule was standing in for.
     */
    api.waterMask = function waterMask(coast, id) {
      if (!coast || !coast.land) return null;
      const name = id || 'gm-water';
      let defs = svg.select('defs');
      if (defs.empty()) defs = svg.insert('defs', ':first-child');
      defs.select('#' + name).remove();
      const m = defs.append('mask')
        .attr('id', name)
        .attr('maskUnits', 'userSpaceOnUse');
      // generous enough that no pan can run off the white; the mask travels with the group
      m.append('rect')
        .attr('x', -W * 4).attr('y', -H * 4)
        .attr('width', W * 9).attr('height', H * 9)
        .attr('fill', '#fff');
      m.append('path')
        .attr('d', path({ type: 'Feature', geometry: coast.land, properties: {} }))
        .attr('fill', '#000');
      return `url(#${name})`;
    };

    /** A land test in screen pixels for this frame; `growCells` widens the coast. */
    api.landMask = (world, growPx) => landMask(world, proj, W, H, growPx || 0);

    /**
     * A mark that keeps its size while the map zooms. It is placed by its projected position,
     * stored on the node, and counter-scaled by `rescale`. The group it goes in is remembered,
     * so a page never has to list its own fixed layers again.
     */
    api.fixed = function fixed(group, lonlat, cls) {
      const [x, y] = proj(lonlat);
      fixedGroups.add(group.node ? group.node() : group);
      return group.append('g')
        .attr('class', 'gm-fixed' + (cls ? ' ' + cls : ''))
        .attr('data-x', x).attr('data-y', y)
        .attr('transform', `translate(${x},${y}) scale(${1 / k})`);
    };

    /** Re-apply the counter-scale to every fixed mark. Cheap: one attribute each, no layout. */
    api.rescale = function rescale() {
      const place = function () {
        return `translate(${this.dataset.x},${this.dataset.y}) scale(${1 / k})`;
      };
      for (const node of fixedGroups) d3.select(node).selectAll('.gm-fixed').attr('transform', place);
    };

    /** The circle a stated uncertainty actually covers, in map coordinates (ADR 0021 §5). */
    api.uncertainty = function uncertainty(lonlat, metres) {
      const c = d3.geoCircle().center(lonlat).radius((metres / EARTH) * 180 / Math.PI)();
      return path(c);
    };

    /* Deferred rendering, for maps heavy enough that redrawing them inside a gesture stutters.
     *
     * While the reader is dragging, the already-drawn map is moved with a CSS transform on its
     * box — compositor work only. It is drawn again, sharp, once the gesture rests. The transform
     * goes on a plain box and never on the <svg>: a transform on an SVG root makes the browser lay
     * the SVG out again, and every piece of SVG text with it, because SVG text follows the
     * on-screen scale. That distinction is why this is worth the machinery.
     *
     * A page turns it on with `opts.mover` (the box to move) and reads it through `opts.onCommit`.
     * A page that leaves `mover` out gets the plain immediate path above, which is right for a map
     * that is cheap to redraw.
     */
    let pending = null, moving = false, settleTimer = 0, frameReq = 0, rendered = d3.zoomIdentity;
    let pendingPointer = null;
    const schedule = () => { if (!frameReq) frameReq = requestAnimationFrame(flush); };

    function liveMove(t) {
      const s = t.k / rendered.k;
      mover.style.transform =
        `translate(${t.x - s * rendered.x}px,${t.y - s * rendered.y}px) scale(${s})`;
    }

    function flush() {
      frameReq = 0;
      if (pending) {
        liveMove(pending);
        if (o.onFrame) o.onFrame(pending);
        pending = null;
      }
      if (pendingPointer && o.onCursor) {
        const t = d3.zoomTransform(container);
        o.onCursor(proj.invert(t.invert(pendingPointer)));
        pendingPointer = null;
      }
    }

    function commit() {
      const t = d3.zoomTransform(container);
      moving = false;
      rendered = t;
      if (svg) svg.classed('moving', false);
      gRoot.attr('transform', t);
      mover.style.transform = '';
      if (t.k !== k) { k = t.k; api.k = k; api.rescale(); if (o.onZoom) o.onZoom(k); }
      if (o.onCommit) o.onCommit(t);
    }

    /**
     * Wire the zoom, the cursor read-out and the background click. Called once the layers exist,
     * because the zoom's translate extent is expressed in the frame they were drawn in.
     */
    api.ready = function ready() {
      zoom = d3.zoom()
        .scaleExtent(o.scaleExtent || [1, 4])
        .translateExtent([[-W * 0.2, -H * 0.2], [W * 1.2, H * 1.2]]);
      pending = null; moving = false; rendered = d3.zoomIdentity;
      clearTimeout(settleTimer);
      mover.style.transform = '';
      zoom.on('zoom', (ev) => {
        pending = ev.transform;
        clearTimeout(settleTimer);
        if (!moving) { moving = true; if (o.onMoveStart) o.onMoveStart(); if (svg) svg.classed('moving', true); }
        schedule();
      }).on('end', (ev) => {
        clearTimeout(settleTimer);
        // a gesture gets a moment to rest; an animated zoom is already where it meant to be
        settleTimer = setTimeout(() => requestAnimationFrame(commit), ev.sourceEvent ? 150 : 0);
      });
      d3.select(container).property('__zoom', d3.zoomIdentity).call(zoom).on('dblclick.zoom', null);
      if (o.onCursor) {
        d3.select(container)
          .on('pointermove.gm', (ev) => { pendingPointer = d3.pointer(ev, container); schedule(); })
          .on('pointerleave.gm', () => { pendingPointer = null; o.onCursor(null); });
      }
      if (o.onBackground) {
        d3.select(container).on('click.gm', (ev) => { if (!ev.target.closest('[data-gm-mark]')) o.onBackground(ev); });
      }
      api.k = k;
      return api;
    };

    /** Put the view on a coordinate at a chosen zoom; `ms` animates. */
    api.goto = function goto(lonlat, kk, ms) {
      if (!zoom || !proj) return false;
      const c = proj(lonlat);
      const t = d3.zoomIdentity.translate(W / 2, H / 2).scale(kk).translate(-c[0], -c[1]);
      const sel = d3.select(container);
      (ms ? sel.transition().duration(ms) : sel).call(zoom.transform, t);
      return true;
    };

    /** Frame a box of lon/lat, the way a sea or a region is selected from a list. */
    api.gotoBox = function gotoBox(box, ms) {
      if (!zoom || !proj) return false;
      const a = proj(box[0]);
      const b = proj(box[1]);
      const w = Math.abs(b[0] - a[0]);
      const h = Math.abs(b[1] - a[1]);
      if (!w || !h) return false;
      const kk = Math.max(1, Math.min((o.scaleExtent || [1, 4])[1], 0.82 * Math.min(W / w, H / h)));
      return api.goto([(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2], kk, ms);
    };

    /** Apply a transform the page worked out itself (a fly-to, or restoring a view after a redraw). */
    api.transform = function transform(t, ms) {
      if (!zoom) return;
      const sel = d3.select(container);
      (ms ? sel.transition().duration(ms) : sel).call(zoom.transform, t);
    };

    /** The transform currently in force. */
    api.current = () => d3.zoomTransform(container);

    api.reset = (ms) => {
      if (!zoom) return;
      const sel = d3.select(container);
      (ms ? sel.transition().duration(ms) : sel).call(zoom.transform, d3.zoomIdentity);
    };
    api.zoomBy = (f) => { if (zoom) d3.select(container).transition().duration(180).call(zoom.scaleBy, f); };

    return api;
  }

  GT.map = { create, corners, EARTH, HONEST_ZOOM };
})();
