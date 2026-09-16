/* Greater Türkiye — methodology page.
   Static text only: shared chrome, the reveal animation, and handbook links that follow the chosen language
   (the handbook keeps a Turkish and an English copy of every chapter; ADRs are single files). */
(function () {
  'use strict';
  GT.initChrome();
  GT.initReveal();

  const HANDBOOK = GT.REPO + '/handbook/blob/main/';

  function localiseDocLinks() {
    document.querySelectorAll('[data-doc]').forEach((a) => { a.href = HANDBOOK + GT.lang + '/' + a.dataset.doc; });
  }

  localiseDocLinks();
  document.addEventListener('gt:lang', localiseDocLinks);
})();
