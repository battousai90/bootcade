/* Bootcade : game catalog.
 *
 * Static page, dynamic data: catalog-data.json and manifest.json are built
 * from the published FBNeo DAT files and fetched cross-origin from here.
 * This file never talks to any backend of its own : it only filters and
 * renders data already sitting in memory.
 *
 * This file is served publicly: keep it free of detail about where that
 * data is produced, or how often.
 *
 * Release-type classification mirrors src/Game.h exactly (is_hack/
 * is_homebrew/is_bootleg/is_prototype/is_original), so a game is tagged the
 * same way here as in the desktop app. Keep the two in sync if the rules
 * change.
 *
 * Layout mirrors the desktop app's three panes (filter tree | list |
 * detail), minus what only makes sense with a local, per-user library:
 * no "Available/Missing" ROM status (nobody visiting has scanned anything),
 * no Favorites (no accounts), no Sources filter yet (not extracted from the
 * DAT). The detail pane is the same DOM/JS whether it renders as a static
 * third column (wide screens) or a full-screen overlay (narrow screens,
 * see catalog.css) : only the CSS positioning differs.
 */
(function () {
  'use strict';

  var DATA_URL = 'https://files.bootcade.duckdns.org/dat/catalog-data.json';
  var MANIFEST_URL = 'https://files.bootcade.duckdns.org/dat/manifest.json';
  var CHANGES_URL = 'https://files.bootcade.duckdns.org/dat/changes.json';
  var ART_BASE = 'https://files.bootcade.duckdns.org/artwork/';
  var DAT_BASE = 'https://files.bootcade.duckdns.org/dat/';
  var ROMS_BASE = 'https://roms.bootcade.duckdns.org/roms/';
  var ROMFIX_BASE = 'https://roms.bootcade.duckdns.org/romfix/';
  // Score service. Its own host and its own failure domain: a leaderboard that
  // is down must cost the catalog nothing but the leaderboard itself.
  var SCORES_BASE = 'https://scores.bootcade.duckdns.org';
  var PAGE_SIZE = 80;

  function previewUrl(g) { return ART_BASE + 'previews/' + encodeURIComponent(g.n) + '.png'; }
  function titleUrl(g)   { return ART_BASE + 'titles/'   + encodeURIComponent(g.n) + '.png'; }
  function datFileUrl(f) { return DAT_BASE + encodeURIComponent(f); }
  // Roms/<rf>/<n>.zip on the NAS, mirrored verbatim as the URL path : auth
  // (HTTP Basic, single shared account) is enforced server-side by nginx,
  // not here; this link is only reachable/openable by someone who already
  // has those credentials.
  function romUrl(g) { return ROMS_BASE + encodeURIComponent(g.rf) + '/' + encodeURIComponent(g.n) + '.zip'; }

  function humanSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    var kb = bytes / 1024;
    if (kb < 1024) return (kb >= 10 ? Math.round(kb) : kb.toFixed(1)) + ' KB';
    var mb = bytes / (1024 * 1024);
    return (mb >= 10 ? Math.round(mb) : mb.toFixed(1)) + ' MB';
  }

  var LANG = document.documentElement.lang || 'en';
  var CAT = (window.I18N && window.I18N[LANG]) || {};
  function t(key, fallback) { return CAT[key] !== undefined ? CAT[key] : fallback; }

  var TYPES = [
    { id: 'original',  fallback: 'Original' },
    { id: 'clone',     fallback: 'Clone' },
    { id: 'hack',      fallback: 'Hack' },
    { id: 'homebrew',  fallback: 'Homebrew' },
    { id: 'bootleg',   fallback: 'Bootleg' },
    { id: 'prototype', fallback: 'Prototype' },
  ];

  function classify(g) {
    var d = g.d || '';
    var isClone     = !!g.c;
    var isHack      = /\(hack/i.test(d);
    var isHomebrew  = /\(hb\)|\(hb,|\(hb /i.test(d);
    var isBootleg   = /bootleg/i.test(d);
    var isPrototype = /\(proto/i.test(d);
    var isOriginal  = !isClone && !isHack && !isBootleg && !isPrototype && !isHomebrew;
    var flags = [];
    if (isOriginal)  flags.push('original');
    if (isClone)     flags.push('clone');
    if (isHack)       flags.push('hack');
    if (isHomebrew)   flags.push('homebrew');
    if (isBootleg)    flags.push('bootleg');
    if (isPrototype)  flags.push('prototype');
    return flags;
  }

  var els = {
    count: document.getElementById('cat-count'),
    search: document.getElementById('cat-search'),
    sort: document.getElementById('cat-sort'),
    systems: document.getElementById('cat-systems'),
    types: document.getElementById('cat-types'),
    manufacturers: document.getElementById('cat-manufacturers'),
    years: document.getElementById('cat-years'),
    aspects: document.getElementById('cat-aspects'),
    orientations: document.getElementById('cat-orientations'),
    reset: document.getElementById('cat-reset'),
    grid: document.getElementById('cat-grid'),
    empty: document.getElementById('cat-empty'),
    more: document.getElementById('cat-more'),
    modal: document.getElementById('cat-modal'),
    modalBackdrop: document.getElementById('cat-modal-backdrop'),
    modalClose: document.getElementById('cat-modal-close'),
    modalMedia: document.getElementById('cat-modal-media'),
    modalTitle: document.getElementById('cat-modal-title'),
    modalMeta: document.getElementById('cat-modal-meta'),
    modalBadges: document.getElementById('cat-modal-badges'),
    modalClone: document.getElementById('cat-modal-clone'),
    modalSpecs: document.getElementById('cat-modal-specs'),
    modalActions: document.getElementById('cat-modal-actions'),
    modalScores: document.getElementById('cat-modal-scores'),
    hiscoreFilter: document.getElementById('cat-hiscore-filter'),
    datList: document.getElementById('cat-dat-list'),
    lightbox: document.getElementById('cat-lightbox'),
    lightboxImg: document.getElementById('cat-lightbox-img'),
    lightboxClose: document.getElementById('cat-lightbox-close'),
  };

  var GAMES = [];
  var GAMES_BY_NAME = {};
  var activeSystems = new Set();
  var activeTypes = new Set();
  var activeManufacturers = new Set();
  var activeYears = new Set();
  var activeAspects = new Set();
  var activeOrientations = new Set();
  var filtered = [];
  var shown = 0;
  var selectedRow = null;
  // "<system>|<game>" for every game the score service can rank. Empty until
  // the list arrives, and empty for good if it never does : in which case no
  // badge, no filter and no leaderboard appear anywhere.
  var ranked = new Set();
  var onlyRanked = false;
  // Guards against a late reply painting over a game the visitor has left.
  var scoreSeq = 0;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function matches(g, query) {
    if (activeSystems.size && !activeSystems.has(g.s)) return false;
    if (activeManufacturers.size && !activeManufacturers.has(g.mf)) return false;
    if (activeYears.size && !activeYears.has(g.y)) return false;
    if (activeAspects.size && !activeAspects.has(g._aspect)) return false;
    if (activeOrientations.size && !activeOrientations.has(g.or)) return false;
    if (activeTypes.size) {
      var flags = g._flags;
      var hit = false;
      for (var i = 0; i < flags.length; i++) if (activeTypes.has(flags[i])) { hit = true; break; }
      if (!hit) return false;
    }
    if (onlyRanked && !isRanked(g)) return false;
    if (query) {
      var hay = g._hay;
      for (var j = 0; j < query.length; j++) if (hay.indexOf(query[j]) === -1) return false;
    }
    return true;
  }

  function anyFilterActive() {
    if (onlyRanked) return true;
    return anyFilterActive_();
  }

  function anyFilterActive_() {
    return activeSystems.size || activeTypes.size || activeManufacturers.size ||
           activeYears.size || activeAspects.size || activeOrientations.size;
  }

  // `fs` (first seen) n'existe que pour les jeux apparus depuis que le
  // suivi tourne : impossible de dater rétroactivement les 29 000 autres,
  // et leur inventer une date les ferait tous passer pour des nouveautés.
  // Les non-datés sont donc renvoyés en fin de liste, ce qui met justement
  // les ajouts récents en tête : le but recherché.
  function compare(mode) {
    if (mode === 'added') {
      return function (a, b) {
        var fa = a.fs || '', fb = b.fs || '';
        if (fa !== fb) return fa && fb ? fb.localeCompare(fa) : (fa ? -1 : 1);
        return a.d.localeCompare(b.d);
      };
    }
    if (mode === 'year' || mode === 'yearAsc') {
      var dir = mode === 'year' ? -1 : 1;
      return function (a, b) {
        // Une année vide ne doit jamais occuper la tête du classement,
        // quel que soit le sens du tri.
        var ya = a.y || '', yb = b.y || '';
        if (!ya !== !yb) return ya ? -1 : 1;
        if (ya !== yb) return ya.localeCompare(yb) * dir;
        return a.d.localeCompare(b.d);
      };
    }
    if (mode === 'name') {
      return function (a, b) { return a.d.localeCompare(b.d); };
    }
    // 'default' : on ne trie PAS. L'ordre naturel de GAMES est celui des
    // fichiers DAT : donc groupé par système, puis alphabétique à
    // l'intérieur. C'était le comportement du catalogue avant l'ajout du
    // tri, et il reste le plus lisible : un trieur alphabétique global
    // entrelacerait Arcade, SNES et NES sans repère.
    return null;
  }

  function applyFilters() {
    var raw = els.search.value.trim().toLowerCase();
    var query = raw ? raw.split(/\s+/) : [];
    filtered = GAMES.filter(function (g) { return matches(g, query); });
    var order = compare(els.sort ? els.sort.value : 'default');
    if (order) filtered.sort(order);
    shown = 0;
    selectedRow = null;
    els.grid.innerHTML = '';
    renderMore();
    els.empty.hidden = filtered.length !== 0;
    els.reset.hidden = !(anyFilterActive() || query.length);
    updateCount();
    if (filtered.length) openModal(filtered[0]); else els.modal.hidden = true;
  }

  function updateCount() {
    var tpl = t('catalog.count', '{n} games' + (filtered.length !== GAMES.length ? ' matching' : ' across {s} systems'));
    var sys = new Set(GAMES.map(function (g) { return g.s; }));
    els.count.textContent = tpl
      .replace('{n}', filtered.length.toLocaleString(LANG))
      .replace('{s}', sys.size);
  }

  function isRanked(g) { return ranked.has(g.s + '|' + g.n); }

  function badgesHtml(g, limit) {
    var flags = limit ? g._flags.slice(0, limit) : g._flags;
    return flags.map(function (id) {
      var def = TYPES.filter(function (x) { return x.id === id; })[0];
      var cls = id === 'original' ? ' original' : '';
      return '<span class="cat-badge' + cls + '">' + escapeHtml(t('catalog.type.' + id, def.fallback)) + '</span>';
    }).join('') + (isRanked(g)
      ? '<span class="cat-badge hiscore">◆ ' + escapeHtml(t('catalog.hiscore', 'Highscore')) + '</span>'
      : '');
  }

  function actionsHtml(g) {
    // Artwork already shows full-size above (click it for the lightbox) // a redundant download link here just duplicated that.
    return (
      '<a href="' + romUrl(g) + '" rel="noopener" title="' + escapeHtml(t('catalog.rom.protected', 'Private : requires the access credentials')) + '">' +
        escapeHtml(t('catalog.dl.rom', 'ROM')) +
      '</a>'
    );
  }

  function row(g) {
    var el = document.createElement('div');
    el.className = 'cat-row';
    el.innerHTML =
      '<div class="cat-row-art"><img loading="lazy" alt="" src="' + previewUrl(g) + '" onerror="this.parentNode.textContent=\'🕹️\'"></div>' +
      '<div class="cat-row-title"><b>' + escapeHtml(g.d) + '</b><span>' + escapeHtml(g.n) + '</span></div>' +
      (isRanked(g) ? '<span class="cat-row-hi" title="' +
          escapeHtml(t('catalog.hiscore.hint', 'Scores for this game are ranked online.')) + '">◆</span>' : '') +
      '<span class="cat-row-sys">' + escapeHtml(g.s) + '</span>' +
      '<span class="cat-row-year">' + escapeHtml(g.y) + '</span>';
    el.addEventListener('click', function () { openModal(g, el); });
    el._game = g;
    return el;
  }

  function renderMore() {
    var next = filtered.slice(shown, shown + PAGE_SIZE);
    var frag = document.createDocumentFragment();
    next.forEach(function (g) { frag.appendChild(row(g)); });
    els.grid.appendChild(frag);
    shown += next.length;
    els.more.hidden = shown >= filtered.length;
  }

  // ── Detail panel (static 3rd column on wide screens, overlay below the
  // breakpoint defined in catalog.css : same markup and JS either way) ──────
  function specRow(label, value) {
    if (!value) return '';
    return '<div class="cat-spec"><span>' + escapeHtml(label) + '</span><b>' + escapeHtml(value) + '</b></div>';
  }

  function romsHtml(g) {
    if (!g.r || !g.r.length) return '';
    var rows = g.r.map(function (r) {
      return '<tr><td>' + escapeHtml(r[0]) + '</td><td>' + humanSize(r[1]) + '</td><td>' + escapeHtml((r[2] || '').toUpperCase()) + '</td></tr>';
    }).join('');
    return (
      '<details class="cat-roms"><summary>' +
        escapeHtml(t('catalog.spec.roms', 'ROM files')) + ' (' + g.r.length + ')' +
      '</summary>' +
      '<div class="cat-roms-archive"><span>' + escapeHtml(t('catalog.spec.archive', 'Archive')) + '</span><b>' + escapeHtml(g.n) + '.zip</b></div>' +
      '<div class="cat-roms-scroll"><table>' + rows + '</table></div></details>'
    );
  }

  // Splits the translated "Clone of {n}" template around {n} so the parent
  // name can be a real clickable element while keeping each language's word
  // order intact (e.g. Japanese/Chinese put {n} before "clone").
  function renderClone(g) {
    els.modalClone.innerHTML = '';
    if (!g.c) return;
    var parts = t('catalog.cloneof', 'Clone of {n}').split('{n}');
    var parent = GAMES_BY_NAME[g.s + '|' + g.c];
    els.modalClone.appendChild(document.createTextNode(parts[0] || ''));
    if (parent) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-clone-link';
      btn.textContent = parent.d;
      btn.addEventListener('click', function () { openModal(parent); });
      els.modalClone.appendChild(btn);
    } else {
      els.modalClone.appendChild(document.createTextNode(g.c));
    }
    els.modalClone.appendChild(document.createTextNode(parts[1] || ''));
  }

  function openModal(g, rowEl) {
    if (selectedRow) selectedRow.classList.remove('active');
    selectedRow = rowEl || null;
    if (selectedRow) selectedRow.classList.add('active');

    var meta = [g.s, g.y, g.mf].filter(Boolean).join(' · ');
    els.modalMedia.innerHTML =
      '<div class="cat-modal-shot"><span>' + escapeHtml(t('catalog.dl.art', 'Artwork')) + '</span>' +
        '<img alt="" src="' + previewUrl(g) + '" onerror="this.parentNode.hidden=true"></div>' +
      '<div class="cat-modal-shot"><span>' + escapeHtml(t('catalog.title', 'Title screen')) + '</span>' +
        '<img alt="" src="' + titleUrl(g) + '" onerror="this.parentNode.hidden=true"></div>';
    els.modalTitle.textContent = g.d;
    els.modalMeta.textContent = meta;
    els.modalBadges.innerHTML = badgesHtml(g);
    renderClone(g);

    var resolution = (g.w && g.h) ? (g.w + ' × ' + g.h) : '';
    var driverLabel = g.ds ? t('catalog.driver.' + g.ds, g.ds) : '';
    els.modalSpecs.innerHTML =
      specRow(t('catalog.spec.system', 'System'), g.s) +
      specRow(t('catalog.spec.manufacturer', 'Manufacturer'), g.mf) +
      specRow(t('catalog.spec.rom', 'ROM name'), g.n) +
      specRow(t('catalog.spec.resolution', 'Resolution'), resolution) +
      specRow(t('catalog.spec.orientation', 'Orientation'), g.or ? t('catalog.orientation.' + g.or, g.or) : '') +
      specRow(t('catalog.spec.video', 'Video'), g.vt ? t('catalog.video.' + g.vt, g.vt) : '') +
      specRow(t('catalog.spec.aspect', 'Aspect ratio'), g._aspect || '') +
      specRow(t('catalog.spec.driver', 'Driver'), driverLabel) +
      romsHtml(g);

    els.modalActions.innerHTML = actionsHtml(g);
    renderScores(g);

    els.modal.hidden = false;

    // Le volet est toujours à l'écran, dans sa propre colonne : rien à
    // ramener en vue. On remet seulement son défilement en haut, sinon la
    // fiche d'un jeu s'ouvrirait au milieu du classement du précédent.
    els.modal.scrollTop = 0;
  }

  // ── Leaderboard ──────────────────────────────────────────────────────────
  // Only for games the service says it can rank. Asking for the rest would be
  // 29 000 requests answering "nothing", and would put an empty score table
  // under games that will never have one.
  function renderScores(g) {
    var box = els.modalScores;
    if (!box) return;
    if (!isRanked(g)) { box.hidden = true; box.innerHTML = ''; return; }

    box.hidden = false;
    box.innerHTML = '<h3>' + escapeHtml(t('catalog.hiscore', 'Highscore')) + '</h3>' +
                    '<p class="cat-hi-note">' + escapeHtml(t('catalog.hiscore.loading', 'Loading the leaderboard…')) + '</p>';

    var seq = ++scoreSeq;
    fetch(SCORES_BASE + '/api/scores/' + encodeURIComponent(g.s) + '/' + encodeURIComponent(g.n) + '/top?limit=50')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        if (seq !== scoreSeq) return;      // visitor has moved on
        box.innerHTML = '<h3>' + escapeHtml(t('catalog.hiscore', 'Highscore')) + '</h3>' + scoresHtml(rows || []);
      })
      .catch(function () {
        if (seq !== scoreSeq) return;
        // Said plainly rather than shown as an empty table: "no scores" and
        // "we could not ask" are different things, and a visitor deserves to
        // know which one they are looking at.
        box.innerHTML = '<h3>' + escapeHtml(t('catalog.hiscore', 'Highscore')) + '</h3>' +
          '<p class="cat-hi-note">' + escapeHtml(t('catalog.hiscore.error', 'The leaderboard is unavailable right now.')) + '</p>';
      });
  }

  // "FR" -> 🇫🇷, built from regional indicators so a system without flag
  // glyphs degrades to the two letters rather than to a blank.
  function countryFlag(iso) {
    if (!iso || iso.length !== 2) return '';
    var out = '';
    for (var i = 0; i < 2; i++) {
      var c = iso.toUpperCase().charCodeAt(i);
      if (c < 65 || c > 90) return '';
      out += String.fromCodePoint(0x1F1E6 + (c - 65));
    }
    return out;
  }

  // Une borne d'arcade affiche TOUJOURS dix lignes : les places libres portent
  // des initiales d'usine, et le joueur les remplace une par une. C'est ce qui
  // donne envie de s'y mettre : une ligne unique, ou pas de ligne du tout, ne
  // dit rien à personne. Le remplissage est purement visuel : aucune valeur
  // n'est inventée, les places libres n'affichent pas de score.
  var BOARD_ROWS = 10;

  // Tous les jeux ne rangent pas des points. Au chrono la valeur est les trois
  // octets du temps lus comme un seul nombre, minutes, secondes, centiemes :
  // ca se classe tel quel mais ca ne se lit pas, 917504 valant 14'00"00. Au
  // golf c'est un ecart au par, ou moins trois bat zero.
  function formatScore(row) {
    var value = Number(row.score);
    if (row.metric === 'time') {
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      return ((value >> 16) & 255) + "'" + pad((value >> 8) & 255) + '"' + pad(value & 255);
    }
    // Au golf le resultat est un ecart au par : le signe fait tout son sens,
    // et zero se dit EVEN.
    if (row.metric === 'par') {
      if (value === 0) return 'EVEN';
      return (value > 0 ? '+' : '-') + Math.abs(value);
    }
    return value.toLocaleString(LANG);
  }

  function scoresHtml(rows) {
    var body = '';
    for (var i = 0; i < BOARD_ROWS; i++) {
      var r = rows[i];
      if (r) {
        var flag = countryFlag(r.country);
        body += '<tr><td class="cat-hi-rank">' + (i + 1) + '</td>' +
                '<td class="cat-hi-score">' + escapeHtml(formatScore(r)) + '</td>' +
                '<td class="cat-hi-player">' + escapeHtml(r.player) + (flag ? ' ' + flag : '') + '</td>' +
                '<td class="cat-hi-date">' + escapeHtml((r.since || '').slice(0, 10)) + '</td></tr>';
      } else {
        body += '<tr class="cat-hi-free"><td class="cat-hi-rank">' + (i + 1) + '</td>' +
                '<td class="cat-hi-score"></td>' +
                '<td class="cat-hi-player">AAA</td>' +
                '<td class="cat-hi-date"></td></tr>';
      }
    }
    return '<table class="cat-hi-table">' + body + '</table>';
  }

  function closeModal() {
    els.modal.hidden = true;
    if (selectedRow) selectedRow.classList.remove('active');
    selectedRow = null;
  }

  if (els.hiscoreFilter) {
    els.hiscoreFilter.addEventListener('click', function () {
      onlyRanked = !onlyRanked;
      els.hiscoreFilter.classList.toggle('on', onlyRanked);
      applyFilters();
    });
  }

  els.modalClose.addEventListener('click', closeModal);
  els.modalBackdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!els.lightbox.hidden) { closeLightbox(); return; }
    if (!els.modal.hidden && window.matchMedia('(max-width: 980px)').matches) closeModal();
  });

  // ── Lightbox: click any artwork thumbnail to see it full scale ──────────────
  function openLightbox(src, alt) {
    els.lightboxImg.src = src;
    els.lightboxImg.alt = alt || '';
    els.lightbox.hidden = false;
  }
  function closeLightbox() { els.lightbox.hidden = true; els.lightboxImg.src = ''; }

  els.modalMedia.addEventListener('click', function (e) {
    var img = e.target.closest('img');
    if (!img) return;
    openLightbox(img.src, img.alt);
  });
  els.lightbox.addEventListener('click', closeLightbox);
  els.lightboxClose.addEventListener('click', closeLightbox);

  // ── Sidebar filters ────────────────────────────────────────────────────────
  function filterRow(container, key, label, count, activeSet) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cat-filter-row';
    b.innerHTML = '<span>' + escapeHtml(label) + '</span><span class="n">' + count.toLocaleString(LANG) + '</span>';
    b.addEventListener('click', function () {
      b.classList.toggle('active');
      if (b.classList.contains('active')) activeSet.add(key); else activeSet.delete(key);
      applyFilters();
    });
    container.appendChild(b);
  }

  function buildFacet(container, keyFn, activeSet, sortByCount) {
    var counts = {};
    GAMES.forEach(function (g) {
      var k = keyFn(g);
      if (!k) return;
      counts[k] = (counts[k] || 0) + 1;
    });
    var keys = Object.keys(counts);
    keys.sort(sortByCount ? function (a, b) { return counts[b] - counts[a]; } : undefined);
    keys.forEach(function (k) { filterRow(container, k, k, counts[k], activeSet); });
  }

  function bindTypeChips() {
    [].slice.call(els.types.querySelectorAll('.cat-filter-row')).forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.dataset.type;
        b.classList.toggle('active');
        if (b.classList.contains('active')) activeTypes.add(key); else activeTypes.delete(key);
        applyFilters();
      });
    });
  }

  function bindCollapsibles() {
    [].slice.call(document.querySelectorAll('.cat-filter-head')).forEach(function (head) {
      head.addEventListener('click', function () {
        var open = head.getAttribute('aria-expanded') === 'true';
        head.setAttribute('aria-expanded', open ? 'false' : 'true');
        document.getElementById(head.dataset.target).classList.toggle('is-collapsed', open);
      });
    });
  }

  // Long facets (Manufacturers, Years, ...) get a search box instead of a
  // scroll-and-hunt list : filters the already-built rows in place, no rebuild.
  function bindFacetSearch() {
    [].slice.call(document.querySelectorAll('.cat-filter-search')).forEach(function (input) {
      var list = document.getElementById(input.dataset.filter);
      input.addEventListener('input', function () {
        var q = input.value.trim().toLowerCase();
        [].slice.call(list.children).forEach(function (row) {
          row.hidden = !!q && row.textContent.toLowerCase().indexOf(q) === -1;
        });
      });
    });
  }

  els.search.addEventListener('input', applyFilters);
  if (els.sort) els.sort.addEventListener('change', applyFilters);
  els.more.addEventListener('click', renderMore);
  els.reset.addEventListener('click', function () {
    activeSystems.clear();
    activeTypes.clear();
    activeManufacturers.clear();
    activeYears.clear();
    activeAspects.clear();
    activeOrientations.clear();
    els.search.value = '';
    [].slice.call(document.querySelectorAll('.cat-filter-row.active')).forEach(function (b) { b.classList.remove('active'); });
    applyFilters();
  });

  bindTypeChips();
  bindCollapsibles();
  bindFacetSearch();

  // ── DAT files panel ────────────────────────────────────────────────────────
  function buildDatList(manifestByFile) {
    var bySystem = {};
    GAMES.forEach(function (g) { if (!bySystem[g.s]) bySystem[g.s] = g.f; });
    var systems = Object.keys(bySystem).sort();
    els.datList.innerHTML = systems.map(function (sys) {
      var file = bySystem[sys];
      var info = manifestByFile[file];
      var size = info ? humanSize(info.size) : '';
      return (
        '<div class="cat-dat-row"><span><b>' + escapeHtml(sys) + '</b><span class="size">' + size + '</span></span>' +
        '<a href="' + datFileUrl(file) + '" rel="noopener">' + escapeHtml(t('catalog.dl.dat', 'DAT')) + '</a></div>'
      );
    }).join('');

    // Every DAT is regenerated by the same run, so one date badge next to
    // the section title is enough : no need to repeat it on every row.
    var dates = Object.keys(manifestByFile)
      .map(function (f) { return manifestByFile[f].date; })
      .filter(Boolean)
      .sort();
    var latest = dates[dates.length - 1];
    if (latest) {
      var d = new Date(latest);
      var formatted = d.toLocaleDateString(LANG, { year: 'numeric', month: 'short', day: 'numeric' });
      document.getElementById('cat-dat-updated').textContent =
        t('catalog.datUpdated', 'Updated {d}').replace('{d}', formatted);
    }
  }

  // The "Fixed ROMs" button points at RomFix/<date of the latest change>/,
  // which only exists for dates that actually produced a change entry // hence reading changes.json rather than reusing the DAT date badge
  // above: a DAT can be republished without adding or removing a single
  // game, and that date would 404.
  function buildRomFixButton(entries) {
    var latest = (entries || [])[0];
    var date = latest && (latest.generated || '').slice(0, 10);
    if (!date) return;
    var btn = document.getElementById('cat-romfix');
    btn.href = ROMFIX_BASE + encodeURIComponent(date) + '/';
    btn.hidden = false;
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  fetch(DATA_URL)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      GAMES = d.games || [];
      GAMES.forEach(function (g) {
        g._flags = classify(g);
        g._hay = (g.d + ' ' + g.mf + ' ' + g.n).toLowerCase();
        g._aspect = (g.ax && g.ay) ? (g.ax + ':' + g.ay) : '';
        // Keyed by system too: short names aren't unique across DATs (e.g.
        // the same short name could exist on two different systems), and
        // cloneof always refers to a parent on the same system.
        GAMES_BY_NAME[g.s + '|' + g.n] = g;
      });
      buildFacet(els.systems, function (g) { return g.s; }, activeSystems, true);
      buildFacet(els.manufacturers, function (g) { return g.mf; }, activeManufacturers, true);
      buildFacet(els.years, function (g) { return g.y; }, activeYears, false);
      buildFacet(els.aspects, function (g) { return g._aspect; }, activeAspects, true);
      buildFacet(els.orientations, function (g) { return g.or; }, activeOrientations, true);
      applyFilters();

      // Separate failure domain on purpose: the DAT panel is a bonus, not
      // the catalog itself : losing it must not blank the "N games" count
      // and error out a page that otherwise loaded fine.
      fetch(MANIFEST_URL)
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (manifest) {
          var byFile = {};
          (manifest || []).forEach(function (m) { byFile[m.name] = m; });
          buildDatList(byFile);
        })
        .catch(function () { /* DAT panel just stays empty */ });

      // And again for the score service, which lives on another host
      // entirely: unreachable, the catalog simply shows no leaderboards.
      fetch(SCORES_BASE + '/api/supported')
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (list) {
          (list || []).forEach(function (x) { ranked.add(x.system + '|' + x.game); });
          if (!ranked.size) return;
          if (els.hiscoreFilter) {
            els.hiscoreFilter.hidden = false;
            els.hiscoreFilter.textContent = '◆ ' + t('catalog.hiscore', 'Highscore') +
                                            ' (' + ranked.size + ')';
          }
          // The list lands after the first rows are already on screen, so
          // what is displayed has to be rebuilt to carry the badges.
          applyFilters();
        })
        .catch(function () { /* no leaderboards, everything else stands */ });

      // Same reasoning again, one failure domain further: no changes.json,
      // no "Fixed ROMs" button, everything else still renders.
      fetch(CHANGES_URL)
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(buildRomFixButton)
        .catch(function () { /* button just stays hidden */ });
    })
    .catch(function () {
      els.count.textContent = t('catalog.error', 'Could not load the catalog right now : please try again later.');
    });
})();
