/* Bootcade : page Galerie.
 *
 * Tout vient de shots.json : ajouter une capture, c'est deposer l'image dans
 * shots/ (et sa vignette dans shots/thumb/, voir tools/add-shot.sh) puis
 * ajouter sa ligne au manifeste. Aucune autre modification de la page.
 *
 * Chaque entree du manifeste :
 *   { "file": "game-library.webp", "w": 1920, "h": 1080,
 *     "tag": "library",
 *     "title": { "en": "The game library", "fr": "..." },
 *     "desc":  { "en": "...", "fr": "..." } }        (desc facultative)
 *
 * title et desc acceptent aussi une simple chaine : elle vaut alors pour
 * toutes les langues. Une langue absente retombe sur l'anglais.
 */
(function () {
  'use strict';

  var BASE = '/gallery/shots/';
  var LANG = document.documentElement.lang || 'en';
  var TAGS = ['library', 'roms', 'controllers', 'settings'];

  function cat() { return (window.I18N && window.I18N[LANG]) || {}; }
  function t(key, fallback) { var c = cat(); return c[key] !== undefined ? c[key] : fallback; }
  function loc(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    return v[LANG] || v.en || '';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function tagLabel(tag) {
    var en = { library: 'Library', roms: 'ROM manager', controllers: 'Controllers', settings: 'Settings' };
    return t('gal.tag.' + tag, en[tag] || tag);
  }

  var grid = document.getElementById('gal-grid');
  var filters = document.getElementById('gal-filters');
  var empty = document.getElementById('gal-empty');
  var box = document.getElementById('gal-lightbox');
  var lbImg = document.getElementById('gal-lb-img');
  var lbTitle = document.getElementById('gal-lb-title');
  var lbDesc = document.getElementById('gal-lb-desc');
  var lbCount = document.getElementById('gal-lb-count');
  var btnPrev = document.getElementById('gal-lb-prev');
  var btnNext = document.getElementById('gal-lb-next');
  if (!grid || !box) return;

  var shots = [];
  var visible = [];   // indices dans shots, dans l'ordre affiche
  var current = -1;   // position dans visible
  var active = 'all';

  // ── Grille ─────────────────────────────────────────────────────────────────
  function renderGrid() {
    grid.innerHTML = shots.map(function (s, i) {
      var title = loc(s.title);
      var r = (s.w && s.h) ? (s.w / s.h) : 16 / 9;
      return '<button type="button" class="gal-item" data-i="' + i + '" data-tag="' + esc(s.tag || '') + '"'
        + ' style="--r:' + r.toFixed(4) + ';--i:' + i + '" aria-label="' + esc(title) + '">'
        + '<img src="' + esc(BASE + 'thumb/' + s.file) + '" alt="' + esc(title) + '"'
        + ' width="' + (s.w || '') + '" height="' + (s.h || '') + '" loading="lazy" decoding="async">'
        + '<span class="gal-cap">'
        + (s.tag ? '<span class="gal-cap-tag">' + esc(tagLabel(s.tag)) + '</span>' : '')
        + '<span class="gal-cap-title">' + esc(title) + '</span>'
        + '</span></button>';
    }).join('');

    Array.prototype.forEach.call(grid.querySelectorAll('img'), function (img) {
      function done() { img.classList.add('is-loaded'); }
      if (img.complete) done(); else { img.addEventListener('load', done); img.addEventListener('error', done); }
    });
  }

  function renderFilters() {
    var counts = {};
    shots.forEach(function (s) { if (s.tag) counts[s.tag] = (counts[s.tag] || 0) + 1; });
    var used = TAGS.filter(function (tag) { return counts[tag]; });
    // Un seul type de capture : des filtres ne serviraient a rien.
    if (used.length < 2) { filters.innerHTML = ''; return; }
    var chips = [{ tag: 'all', label: t('gal.all', 'All'), n: shots.length }]
      .concat(used.map(function (tag) { return { tag: tag, label: tagLabel(tag), n: counts[tag] }; }));
    filters.innerHTML = chips.map(function (c) {
      return '<button type="button" class="gal-chip" data-tag="' + c.tag + '" aria-pressed="' + (c.tag === active) + '">'
        + esc(c.label) + '<span class="gal-chip-n">' + c.n + '</span></button>';
    }).join('');
  }

  function applyFilter(tag) {
    active = tag;
    visible = [];
    var n = 0;
    Array.prototype.forEach.call(grid.children, function (el) {
      var show = tag === 'all' || el.dataset.tag === tag;
      el.hidden = !show;
      if (show) {
        visible.push(+el.dataset.i);
        // Rejoue l'animation d'entree, en cascade depuis la premiere visible.
        el.style.setProperty('--i', n++);
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
      }
    });
    Array.prototype.forEach.call(filters.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.tag === tag));
    });
  }

  filters.addEventListener('click', function (e) {
    var b = e.target.closest('.gal-chip');
    if (b && b.dataset.tag !== active) applyFilter(b.dataset.tag);
  });

  grid.addEventListener('click', function (e) {
    var item = e.target.closest('.gal-item');
    if (item) open(visible.indexOf(+item.dataset.i));
  });

  // ── Visionneuse ────────────────────────────────────────────────────────────
  function show(pos) {
    current = (pos + visible.length) % visible.length;
    var s = shots[visible[current]];
    var title = loc(s.title);
    lbImg.src = BASE + s.file;
    lbImg.alt = title;
    // Relance l'animation de zoom a chaque image.
    lbImg.style.animation = 'none';
    void lbImg.offsetWidth;
    lbImg.style.animation = '';
    lbTitle.textContent = title;
    lbDesc.textContent = loc(s.desc);
    lbCount.textContent = (current + 1) + ' / ' + visible.length;
    var single = visible.length < 2;
    btnPrev.hidden = single;
    btnNext.hidden = single;
    // Precharge les voisines pour un defilement sans attente.
    if (!single) {
      [current + 1, current - 1].forEach(function (p) {
        var n = shots[visible[(p + visible.length) % visible.length]];
        new Image().src = BASE + n.file;
      });
    }
  }

  var opener = null;
  function open(pos) {
    if (pos < 0) return;
    opener = document.activeElement;
    show(pos);
    if (typeof box.showModal === 'function') box.showModal(); else box.setAttribute('open', '');
  }
  function close() {
    if (typeof box.close === 'function') box.close(); else box.removeAttribute('open');
  }
  box.addEventListener('close', function () {
    lbImg.removeAttribute('src');
    if (opener && opener.focus) opener.focus();
  });

  btnPrev.addEventListener('click', function () { show(current - 1); });
  btnNext.addEventListener('click', function () { show(current + 1); });
  document.getElementById('gal-lb-close').addEventListener('click', close);
  // Un clic sur le fond (hors image et hors boutons) ferme.
  box.addEventListener('click', function (e) {
    if (e.target === box || e.target.classList.contains('gal-lb-figure')) close();
  });
  box.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
  });

  // Balayage horizontal au doigt.
  var x0 = null, y0 = null;
  box.addEventListener('touchstart', function (e) {
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  box.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(current + (dx < 0 ? 1 : -1));
  });

  // Libelles des boutons de la visionneuse, qui ne sont pas des data-i18n.
  btnPrev.setAttribute('aria-label', t('gal.prev', 'Previous'));
  btnNext.setAttribute('aria-label', t('gal.next', 'Next'));
  document.getElementById('gal-lb-close').setAttribute('aria-label', t('gal.close', 'Close'));

  // ── Chargement ─────────────────────────────────────────────────────────────
  fetch('/gallery/shots.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      shots = (Array.isArray(data) ? data : []).filter(function (s) { return s && s.file; });
      if (!shots.length) { empty.hidden = false; return; }
      renderGrid();
      renderFilters();
      applyFilter('all');
    })
    .catch(function () { empty.hidden = false; });
})();
