/* Greater Türkiye — videos page.
   Lists the videos the motion repository makes by itself from dataset records. The list, the posters
   and the files come from motion's own Pages site on this same origin (../motion/), so the page makes
   no third-party request; a video file loads only when the visitor presses play. */
(function () {
  'use strict';
  GT.initChrome();
  GT.initReveal();

  const BASE = '../motion/';
  const grid = document.getElementById('v-grid');
  const note = document.getElementById('v-note');
  let items = [];

  const STATUS_CLASS = { 'DOĞRULANMADI': 'st-unv', 'KISMEN DOĞRULANDI': 'st-part', 'DOĞRULANDI': 'st-ok', 'TARTIŞMALI': 'st-disp' };

  function card(v) {
    const li = document.createElement('li');
    li.className = 'v-card';
    const frame = document.createElement('button');
    frame.type = 'button';
    frame.className = 'v-frame';
    frame.setAttribute('aria-label', GT.t('v.play') + ': ' + v.title);
    const img = document.createElement('img');
    img.src = BASE + v.poster; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.width = 1080; img.height = 1920;
    const play = document.createElement('span');
    play.className = 'v-play'; play.setAttribute('aria-hidden', 'true');
    frame.append(img, play);
    frame.addEventListener('click', () => {
      const video = document.createElement('video');
      video.src = BASE + v.video; video.poster = BASE + v.poster;
      video.controls = true; video.autoplay = true; video.playsInline = true; video.loop = true; video.preload = 'auto';
      video.className = 'v-video';
      frame.replaceWith(video);
      video.focus();
    });

    const meta = document.createElement('div');
    meta.className = 'v-meta';
    const top = document.createElement('p');
    top.className = 'v-top';
    const st = document.createElement('span');
    st.className = 'v-status ' + (STATUS_CLASS[v.status] || 'st-unv');
    st.textContent = v.status;
    const when = document.createElement('time');
    when.dateTime = v.date; when.textContent = GT.fmtDate ? GT.fmtDate(v.date) : v.date;
    top.append(st, when);
    const h = document.createElement('h3');
    h.textContent = v.title;
    const links = document.createElement('p');
    links.className = 'v-links';
    const rec = document.createElement('a');
    rec.href = v.release; rec.textContent = GT.t('v.record'); rec.rel = 'noopener';
    links.append(rec);
    (v.sources || []).slice(0, 3).forEach((u, i) => {
      const a = document.createElement('a');
      a.href = u; a.rel = 'noopener nofollow'; a.textContent = GT.t('v.source') + (v.sources.length > 1 ? ' ' + (i + 1) : '');
      links.append(a);
    });
    meta.append(top, h, links);
    li.append(frame, meta);
    return li;
  }

  function render() {
    grid.replaceChildren(...items.map(card));
    note.textContent = items.length ? GT.t('v.count', { n: items.length }) : GT.t('v.empty');
  }

  fetch(BASE + 'videos.json', { cache: 'no-cache' })
    // no list yet is not an error: the first production run has not published one
    .then((r) => (r.ok ? r.json() : r.status === 404 ? { videos: [] } : Promise.reject(new Error(r.status))))
    .then((d) => { items = (d.videos || []).filter((v) => v && v.video && v.poster); render(); })
    .catch(() => { note.textContent = GT.t('v.error'); });

  document.addEventListener('gt:lang', () => { if (items.length) render(); });
})();
