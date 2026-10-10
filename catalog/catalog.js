/* Bootcade : game catalog.
 *
 * Static page, dynamic data: catalog-data.json is built from the published
 * FBNeo DAT files and fetched cross-origin from here; it carries everything
 * this page shows, the DAT panel included.
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

  var FILES = 'https://files.bootcade.duckdns.org';
  // Local preview only: `?files=http://localhost:8898` reads the catalog JSON
  // from a local folder, to try a generator change before it is deployed.
  // Ignored anywhere but localhost.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    // Garde dans l'onglet : le retour de Keycloak (connexion silencieuse)
    // reecrit l'adresse et perdait le parametre.
    var filesOverride = new URLSearchParams(location.search).get('files');
    try {
      if (filesOverride) sessionStorage.setItem('bootcade-files', filesOverride);
      else filesOverride = sessionStorage.getItem('bootcade-files');
    } catch (e) { /* sans stockage : le parametre seul */ }
    if (filesOverride) FILES = filesOverride.replace(/\/+$/, '');
  }
  var DAT_BASE = FILES + '/dat/';
  var DATA_URL = DAT_BASE + 'catalog-data.json';
  var MAME_URL = DAT_BASE + 'catalog-mame.json';
  var LIBRARIES_URL = DAT_BASE + 'libraries.json';
  var CHANGES_URL = DAT_BASE + 'changes.json';
  var ART_BASE = 'https://files.bootcade.duckdns.org/artwork/';
  var ROMS_BASE = 'https://roms.bootcade.duckdns.org/roms/';
  var ROMFIX_BASE = 'https://roms.bootcade.duckdns.org/romfix/';
  // Score service. Its own host and its own failure domain: a leaderboard that
  // is down must cost the catalog nothing but the leaderboard itself.
  var SCORES_BASE = 'https://scores.bootcade.duckdns.org';
  var PAGE_SIZE = 80;

  /* The libraries the visitor picks from, in the launcher's order. Each one
     is its own file: choosing MAME never downloads FinalBurn Neo, and the
     reverse. The brand names stay untranslated, as in the launcher. */
  var LIBRARIES = [
    { id: 'fbneo', name: 'FinalBurn Neo', logo: '/fbneo-logo.png', url: DATA_URL,
      tagline: 'Arcade boards and a few home systems' },
    { id: 'mame', name: 'MAME', logo: '/mame-logo.svg', url: MAME_URL,
      tagline: 'Arcade, and just about every machine ever built' },
  ];
  function library(id) { return LIBRARIES.filter(function (l) { return l.id === id; })[0]; }
  function isMame(g) { return g.e === 'mame'; }

  // The files under Assets/, DAT/ and Roms/ are filed by emulator. FinalBurn
  // Neo keeps its historical addresses (no emulator segment), which CT 105
  // still maps onto fbneo/: they are what every link already shared points at.
  function previewUrl(g) { return ART_BASE + (isMame(g) ? 'mame/snap/' : 'previews/') + encodeURIComponent(g.n) + '.png'; }
  function titleUrl(g)   { return ART_BASE + (isMame(g) ? 'mame/titles/' : 'titles/') + encodeURIComponent(g.n) + '.png'; }
  function datFileUrl(m) { return DAT_BASE + (m.e === 'mame' ? 'mame/' : '') + encodeURIComponent(m.name); }
  // Roms/<rf>/<n>.zip on the NAS, mirrored verbatim as the URL path. Access
  // is decided server-side (nginx on CT 105 asks CT 106: account, verified
  // email, quota). The page only PREPARES the player: see romState below.
  function romUrl(g) {
    return ROMS_BASE + (isMame(g) ? 'mame/' : '') + encodeURIComponent(g.rf) + '/' + encodeURIComponent(g.n) + '.zip';
  }

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
    genres: document.getElementById('cat-genres'),
    families: document.getElementById('cat-families'),
    players: document.getElementById('cat-players'),
    modalTitle: document.getElementById('cat-modal-title'),
    modalMeta: document.getElementById('cat-modal-meta'),
    modalBadges: document.getElementById('cat-modal-badges'),
    modalClone: document.getElementById('cat-modal-clone'),
    modalSpecs: document.getElementById('cat-modal-specs'),
    modalActions: document.getElementById('cat-modal-actions'),
    modalScores: document.getElementById('cat-modal-scores'),
    hiscoreFilter: document.getElementById('cat-hiscore-filter'),
    achFilter: document.getElementById('cat-ach-filter'),
    datList: document.getElementById('cat-dat-list'),
    emulators: document.getElementById('cat-emulators'),
    sources: document.getElementById('cat-sources'),
    libBtn: document.getElementById('cat-lib-btn'),
    libDialog: document.getElementById('cat-lib'),
    libCards: document.getElementById('cat-lib-cards'),
    lightbox: document.getElementById('cat-lightbox'),
    lightboxImg: document.getElementById('cat-lightbox-img'),
    lightboxClose: document.getElementById('cat-lightbox-close'),
  };

  var GAMES = [];
  var GAMES_BY_NAME = {};
  var activeSystems = new Set();
  // Genre, serie et nombre de joueurs : trois facettes que les DAT ne
  // permettaient pas, faute de porter l'information.
  var activeGenres = new Set();
  var activeFamilies = new Set();
  var activePlayers = new Set();
  var activeTypes = new Set();
  var activeManufacturers = new Set();
  var activeYears = new Set();
  var activeAspects = new Set();
  var activeOrientations = new Set();
  // Les deux facettes que le launcher a et que le catalogue n'avait pas :
  // l'emulateur (seulement quand plusieurs sont affiches) et la source,
  // le dossier du pilote MAME (« capcom », « konami »...).
  var activeEmulators = new Set();
  var activeSources = new Set();
  // 'fbneo', 'mame' ou 'all' : la bibliotheque affichee. null tant que le
  // visiteur n'a pas choisi.
  var LIB = null;
  var filtered = [];
  var shown = 0;
  var selectedRow = null;
  // "<system>|<game>" for every game the score service can rank. Empty until
  // the list arrives, and empty for good if it never does : in which case no
  // badge, no filter and no leaderboard appear anywhere.
  var ranked = new Set();
  var onlyRanked = false;
  // "<system>|<game>" -> nombre de succes RetroAchievements, relaye par le
  // service de scores (le catalogue de RetroAchievements n'est pas lisible
  // depuis un navigateur). Vide s'il ne repond pas : ni medaille ni filtre.
  var achievements = new Map();
  var onlyAchievements = false;
  // Guards against a late reply painting over a game the visitor has left.
  var scoreSeq = 0;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function matches(g, query) {
    if (activeEmulators.size && !activeEmulators.has(g.e)) return false;
    if (activeSources.size && !activeSources.has(g.sf)) return false;
    if (activeSystems.size && !activeSystems.has(g.s)) return false;
    if (activeGenres.size && !anyOf(g.ge, activeGenres)) return false;
    if (activeFamilies.size && !anyOf(g.fa, activeFamilies)) return false;
    if (activePlayers.size && !activePlayers.has(String(g.pl || ''))) return false;
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
    if (onlyAchievements && !achievementsOf(g)) return false;
    if (query) {
      var hay = g._hay;
      for (var j = 0; j < query.length; j++) if (hay.indexOf(query[j]) === -1) return false;
    }
    return true;
  }

  function anyFilterActive() {
    if (onlyRanked || onlyAchievements) return true;
    return anyFilterActive_();
  }

  /* Un champ multiple (« Platformer / Fighting / Beat 'em Up ») est teste
     valeur par valeur : filtrer sur « Platformer » doit sortir ce jeu,
     alors que comparer la chaine entiere ne sortirait que les jeux portant
     exactement la meme combinaison. */
  function split(value) {
    // Separateur : la virgule. Les libelles de FBNeo contiennent des « / »
    // (« Shooter / Horizontal / Sh'mup ») mais jamais de virgule.
    return value ? String(value).split(', ') : [];
  }

  function anyOf(value, set) {
    var parts = split(value);
    for (var i = 0; i < parts.length; i++) if (set.has(parts[i])) return true;
    return false;
  }

  function anyFilterActive_() {
    return activeSystems.size || activeTypes.size || activeManufacturers.size ||
           activeYears.size || activeAspects.size || activeOrientations.size ||
           activeGenres.size || activeFamilies.size || activePlayers.size ||
           activeEmulators.size || activeSources.size;
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
    // MAME seul n'a qu'un systeme : « sur 1 systemes » ne dit rien.
    if (sys.size === 1 && filtered.length === GAMES.length) {
      els.count.textContent = filtered.length.toLocaleString(LANG) + ' ' + t('catalog.lib.games', 'games');
      return;
    }
    els.count.textContent = tpl
      .replace('{n}', filtered.length.toLocaleString(LANG))
      .replace('{s}', sys.size);
  }

  // Le service de scores lit les tables de FinalBurn Neo : un set MAME du
  // meme nom et du meme systeme (« Arcade/1941 ») n'est pas classe. Meme
  // regle que MainWindow::game_ranks_online dans le launcher.
  function isRanked(g) { return g.e === 'fbneo' && ranked.has(g.s + '|' + g.n); }
  function achievementsOf(g) { return g.e === 'fbneo' ? achievements.get(g.s + '|' + g.n) || 0 : 0; }

  // Le nom court n'est unique ni entre systemes (mslugx est en Arcade ET en
  // Neo Geo) ni entre emulateurs (mslug est un set FBNeo ET un set MAME).
  function gameKey(e, s, n) { return e + '|' + s + '|' + n; }

  function badgesHtml(g, limit) {
    var flags = limit ? g._flags.slice(0, limit) : g._flags;
    return flags.map(function (id) {
      var def = TYPES.filter(function (x) { return x.id === id; })[0];
      var cls = id === 'original' ? ' original' : '';
      return '<span class="cat-badge' + cls + '">' + escapeHtml(t('catalog.type.' + id, def.fallback)) + '</span>';
    }).join('') + (isRanked(g)
      ? '<span class="cat-badge hiscore">◆ ' + escapeHtml(t('catalog.hiscore', 'Highscore')) + '</span>'
      : '') + (achievementsOf(g)
      ? '<span class="cat-badge achievements">\uD83C\uDFC5 ' + escapeHtml(
          t('catalog.achievements.count', '{n} achievements').replace('{n}', achievementsOf(g))) + '</span>'
      : '');
  }

  /* ROM access, as far as this page can tell.

     undefined : not known yet (still loading)
     null      : unknown for good (score service silent). The button stays a
                 plain link: the ROM server decides anyway, exactly as before.
     {anon}    : nobody signed in
     otherwise : /api/me/roms, with can_download and reason

     Nothing here grants or refuses anything. It only avoids sending a player
     to the Keycloak screen without telling them why, or to a refusal page
     they could have been warned about. */
  var romState;
  var currentGame = null;

  function actionsHtml(g) {
    // Une machine MAME absente du DAT split n'a pas de zip sur le serveur :
    // un bouton menerait a une erreur.
    if (isMame(g) && !(g.r && g.r.length)) return '';
    var label = escapeHtml(t('catalog.dl.rom', 'ROM'));
    var s = romState;
    if (!s) {
      return '<a href="' + romUrl(g) + '" rel="noopener">' + label + '</a>';
    }
    if (s.anon) {
      return '<a href="' + romUrl(g) + '" class="is-locked" data-gate="anon" title="' +
        escapeHtml(t('roms.rom.locked', 'Sign in to download')) + '">\uD83D\uDD12 ' + label + '</a>';
    }
    if (s.can_download) {
      var left = window.BootcadeRoms.fmt(t('roms.left', '{r} of {q} ROMs left over 24 hours'),
                                         { r: s.remaining, q: s.quota });
      return '<a href="' + romUrl(g) + '" rel="noopener" data-rom="1" title="' + escapeHtml(left) + '">' + label + '</a>';
    }
    var cls = s.reason === 'quota' ? 'is-spent' : 'is-locked';
    return '<a href="' + romUrl(g) + '" class="' + cls + '" data-gate="' + escapeHtml(s.reason || 'unavailable') + '">' +
      (s.reason === 'quota' ? '' : '\uD83D\uDD12 ') + label + '</a>';
  }

  /* The explanation shown under the buttons instead of following the link. */
  function gateEl() {
    var el = document.getElementById('cat-rom-gate');
    if (!el && els.modalActions) {
      el = document.createElement('div');
      el.id = 'cat-rom-gate';
      el.className = 'roms-gate';
      el.hidden = true;
      els.modalActions.parentNode.insertBefore(el, els.modalActions.nextSibling);
    }
    return el;
  }

  function showGate(reason) {
    var R = window.BootcadeRoms, el = gateEl();
    if (!R || !el) return;
    var s = romState || {};
    var link = function (href, key, fallback, id) {
      return '<a class="btn" href="' + escapeHtml(href) + '"' + (id ? ' id="' + id + '"' : '') + '>' +
             escapeHtml(t(key, fallback)) + '</a>';
    };
    var how = link(R.explainHref, 'roms.gate.how', 'How it works');
    var title, text, actions;
    if (reason === 'anon') {
      title = t('roms.gate.anon.title', 'Downloads are for Bootcade members');
      text = t('roms.gate.anon.text', 'The account is free. Each account can download a number of ROMs every 24 hours, and playing raises that number.');
      actions = link('#', 'roms.gate.signup', 'Create a free account', 'cat-gate-signup') +
                link('#', 'roms.gate.signin', 'Sign in', 'cat-gate-signin') + how;
    } else if (reason === 'unverified') {
      title = t('roms.gate.unverified.title', 'Verify your email address first');
      text = t('roms.gate.unverified.text', 'Open the link we emailed you when you signed up, then come back. You can send it again from your account page.');
      actions = link(R.ACCOUNT, 'roms.gate.account', 'My account') + how;
    } else if (reason === 'quota') {
      title = t('roms.gate.quota.title', 'Quota reached for now');
      text = R.fmt(t('roms.gate.quota.text', 'You have used your {q} ROMs over the last 24 hours. The next one frees up at {time}.'),
                   { q: s.quota, time: R.when(s.next_slot_at) });
      actions = link(R.profileHref, 'roms.gate.profile', 'See my quota') + how;
    } else if (reason === 'closed') {
      title = t('roms.gate.closed.title', 'Downloads are closed for now');
      text = t('roms.gate.closed.text', 'Please come back later.');
      actions = how;
    } else {
      title = t('roms.gate.blocked.title', 'Downloads unavailable for this account');
      text = t('roms.gate.blocked.text', 'ROM downloads are not available for this account. If you think this is a mistake, contact the administrator.');
      actions = how;
    }
    el.innerHTML = '<b>' + escapeHtml(title) + '</b><p>' + escapeHtml(text) + '</p>' +
                   '<div class="roms-gate-actions cat-actions">' + actions + '</div>' +
                   (reason === 'quota' ? '<ul class="roms-sgs" id="cat-gate-sg"></ul>' : '');
    el.hidden = false;
    var up = document.getElementById('cat-gate-signup');
    if (up) up.addEventListener('click', function (e) { e.preventDefault(); window.BootcadeAuth.register(); });
    var inn = document.getElementById('cat-gate-signin');
    if (inn) inn.addEventListener('click', function (e) { e.preventDefault(); window.BootcadeAuth.login(); });
    if (reason === 'quota') {
      R.suggestions().then(function (sg) {
        var list = document.getElementById('cat-gate-sg');
        if (list && sg && sg.items) list.innerHTML = sg.items.slice(0, 2).map(R.suggestionHtml).join('');
      });
    }
  }

  function renderQuotaCounter() {
    var el = document.getElementById('cat-rom-quota');
    var R = window.BootcadeRoms;
    if (!el || !R) return;
    var s = romState;
    if (!s || s.anon || s.reason === 'unverified') { el.hidden = true; return; }
    el.textContent = R.fmt(t('roms.counter', 'ROMs: {u} / {q}'), { u: s.used, q: s.quota });
    el.title = t('roms.gate.profile', 'See my quota');
    el.href = R.profileHref;
    el.classList.toggle('is-full', !s.can_download);
    el.hidden = false;
  }

  function refreshRomState() {
    var R = window.BootcadeRoms, A = window.BootcadeAuth;
    if (!R || !A) { romState = null; return; }
    A.complete().then(function () { return A.token(); }).then(function (tok) {
      if (!tok) return { anon: true };
      return R.me();
    }).then(function (s) {
      romState = s || null;
      renderQuotaCounter();
      // The modal may already be open on a game: redraw its button.
      if (currentGame && !els.modal.hidden) {
        els.modalActions.innerHTML = actionsHtml(currentGame);
      }
    }).catch(function () { romState = null; });
  }

  function row(g) {
    var el = document.createElement('div');
    el.className = 'cat-row';
    el.innerHTML =
      '<div class="cat-row-art"><img loading="lazy" alt="" src="' + previewUrl(g) + '" onerror="this.parentNode.textContent=\'🕹️\'"></div>' +
      '<div class="cat-row-title"><b>' + escapeHtml(g.d) + '</b><span>' + escapeHtml(g.n) +
        // Toutes bibliotheques confondues, deux lignes peuvent porter le meme
        // titre : l'emulateur les departage.
        (LIB === 'all' ? ' · ' + escapeHtml(library(g.e) ? library(g.e).name : g.e) : '') + '</span></div>' +
      (isRanked(g) ? '<a class="cat-row-hi" href="' + boardHref(g) + '" title="' +
          escapeHtml(t('catalog.hiscore.open', 'Open this game\u2019s leaderboard')) + '">◆</a>' : '') +
      (achievementsOf(g) ? '<span class="cat-row-ach" title="' + escapeHtml(
          t('catalog.achievements.count', '{n} achievements').replace('{n}', achievementsOf(g))) + '">\uD83C\uDFC5</span>' : '') +
      '<span class="cat-row-sys">' + escapeHtml(g.s) + '</span>' +
      '<span class="cat-row-year">' + escapeHtml(g.y) + '</span>';
    el.addEventListener('click', function (e) {
      // Le losange est un lien : il emmene au classement du jeu. Sans cette
      // garde, le clic remonterait jusqu'a la ligne et ouvrirait la fiche
      // par-dessus la navigation.
      if (e.target.closest('.cat-row-hi')) return;
      openModal(g, el);
    });
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
    var parent = GAMES_BY_NAME[gameKey(g.e, g.s, g.c)];
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
      specRow(t('catalog.spec.emulator', 'Emulator'), library(g.e) ? library(g.e).name : g.e) +
      specRow(t('catalog.spec.system', 'System'), g.s) +
      specRow(t('catalog.spec.manufacturer', 'Manufacturer'), g.mf) +
      // Genre, serie et nombre de joueurs viennent de la source de FBNeo,
      // fusionnes dans le catalogue par generate-catalog-data.py : les DAT
      // ne les portent pas.
      specRow(t('catalog.spec.genre', 'Genre'), g.ge) +
      specRow(t('catalog.spec.family', 'Series'), g.fa) +
      specRow(t('catalog.spec.players', 'Players'), g.pl) +
      specRow(t('catalog.spec.rom', 'ROM name'), g.n) +
      specRow(t('catalog.spec.resolution', 'Resolution'), resolution) +
      specRow(t('catalog.spec.orientation', 'Orientation'), g.or ? t('catalog.orientation.' + g.or, g.or) : '') +
      specRow(t('catalog.spec.video', 'Video'), g.vt ? t('catalog.video.' + g.vt, g.vt) : '') +
      specRow(t('catalog.spec.aspect', 'Aspect ratio'), g._aspect || '') +
      specRow(t('catalog.spec.driver', 'Driver'), driverLabel) +
      specRow(t('catalog.spec.source', 'Source'), g.sf) +
      romsHtml(g);

    currentGame = g;
    els.modalActions.innerHTML = actionsHtml(g);
    var gate = document.getElementById('cat-rom-gate');
    if (gate) gate.hidden = true;
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
                    '<p class="cat-hi-note">' + escapeHtml(t('catalog.hiscore.loading', 'Loading the leaderboard…')) + '</p>' +
                    boardLink(g);

    var seq = ++scoreSeq;
    fetch(SCORES_BASE + '/api/scores/' + encodeURIComponent(g.s) + '/' + encodeURIComponent(g.n) + '/top?limit=50')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        if (seq !== scoreSeq) return;      // visitor has moved on
        box.innerHTML = '<h3>' + escapeHtml(t('catalog.hiscore', 'Highscore')) + '</h3>' +
                        scoresHtml(rows || []) + boardLink(g);
      })
      .catch(function () {
        if (seq !== scoreSeq) return;
        // Said plainly rather than shown as an empty table: "no scores" and
        // "we could not ask" are different things, and a visitor deserves to
        // know which one they are looking at.
        box.innerHTML = '<h3>' + escapeHtml(t('catalog.hiscore', 'Highscore')) + '</h3>' +
          '<p class="cat-hi-note">' + escapeHtml(t('catalog.hiscore.error', 'The leaderboard is unavailable right now.')) + '</p>' +
          boardLink(g);
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

  function boardHref(g) {
    var base = LANG === 'en' ? '/leaderboard/game/' : '/' + LANG + '/leaderboard/game/';
    return base + '?s=' + encodeURIComponent(g.s) + '&n=' + encodeURIComponent(g.n);
  }

  // La fiche montre les dix premieres places : c'est ce qu'affiche une borne.
  // Au-dela, la page du jeu porte le classement entier, la place du joueur
  // connecte et l'historique de ses parties.
  function boardLink(g) {
    return '<p class="cat-hi-more"><a href="' + boardHref(g) + '">' +
           escapeHtml(t('catalog.hiscore.full', 'Full leaderboard for this game')) + '</a></p>';
  }

  function closeModal() {
    els.modal.hidden = true;
    if (selectedRow) selectedRow.classList.remove('active');
    selectedRow = null;
  }

  if (els.achFilter) {
    els.achFilter.addEventListener('click', function () {
      onlyAchievements = !onlyAchievements;
      els.achFilter.classList.toggle('on', onlyAchievements);
      applyFilters();
    });
  }
  if (els.hiscoreFilter) {
    els.hiscoreFilter.addEventListener('click', function () {
      onlyRanked = !onlyRanked;
      els.hiscoreFilter.classList.toggle('on', onlyRanked);
      applyFilters();
    });
  }

  els.modalClose.addEventListener('click', closeModal);
  // ROM button: a gated button explains instead of navigating; an allowed
  // one navigates, and the quota is re-read shortly after so the counter
  // follows (a ROM already counted in the window costs nothing, and only the
  // server knows which).
  els.modalActions.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    if (a.dataset.gate) {
      e.preventDefault();
      showGate(a.dataset.gate);
    } else if (a.dataset.rom) {
      setTimeout(refreshRomState, 2500);
    }
  });
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
    b.dataset.key = key;
    b.innerHTML = '<span>' + escapeHtml(label) + '</span><span class="n">' + count.toLocaleString(LANG) + '</span>';
    b.addEventListener('click', function () {
      b.classList.toggle('active');
      if (b.classList.contains('active')) activeSet.add(key); else activeSet.delete(key);
      applyFilters();
    });
    container.appendChild(b);
  }

  // Rebatie a chaque changement de bibliotheque. Une facette sans aucune
  // valeur cache toute sa section, comme dans le launcher : « Aspect ratio »
  // n'existe pas pour MAME, et une liste vide ne dirait rien.
  function buildFacet(container, keyFn, activeSet, sortByCount, labelFn) {
    container.innerHTML = '';
    var counts = {};
    GAMES.forEach(function (g) {
      var k = keyFn(g);
      if (!k) return;
      // Une cle peut valoir plusieurs valeurs : chacune compte pour elle.
      (Array.isArray(k) ? k : [k]).forEach(function (one) {
        if (one === '' || one === undefined || one === null) return;
        counts[one] = (counts[one] || 0) + 1;
      });
    });
    var keys = Object.keys(counts);
    keys.sort(sortByCount ? function (a, b) { return counts[b] - counts[a]; } : undefined);
    keys.forEach(function (k) { filterRow(container, k, labelFn ? labelFn(k) : k, counts[k], activeSet); });
    var section = container.closest('.cat-filter-section');
    if (section) section.hidden = keys.length === 0;
    return keys.length;
  }

  // Les types dans l'ordre du launcher, avec leur nombre ; un type sans
  // aucun jeu dans la bibliotheque n'a pas de ligne (MAME n'a ni hack ni
  // homebrew, par exemple).
  function buildTypes() {
    els.types.innerHTML = '';
    var counts = {};
    GAMES.forEach(function (g) {
      g._flags.forEach(function (f) { counts[f] = (counts[f] || 0) + 1; });
    });
    var n = 0;
    TYPES.forEach(function (ty) {
      if (!counts[ty.id]) return;
      filterRow(els.types, ty.id, t('catalog.type.' + ty.id, ty.fallback), counts[ty.id], activeTypes);
      n++;
    });
    els.types.closest('.cat-filter-section').hidden = n === 0;
  }

  // Les annees groupees par decennie, comme l'arbre du launcher : un titre
  // par decennie, puis ses annees. Les annees incompletes (« 198? ») n'ont
  // pas de decennie sure et restent apres, a part.
  function buildYears() {
    els.years.innerHTML = '';
    var counts = {};
    GAMES.forEach(function (g) { if (g.y) counts[g.y] = (counts[g.y] || 0) + 1; });
    var years = Object.keys(counts).sort();
    var decade = null;
    years.forEach(function (y) {
      var d = /^\d{4}$/.test(y) ? y.slice(0, 3) + '0s' : '?';
      if (d !== decade) {
        decade = d;
        var h = document.createElement('div');
        h.className = 'cat-filter-decade';
        h.textContent = d;
        els.years.appendChild(h);
      }
      filterRow(els.years, y, y, counts[y], activeYears);
    });
    els.years.closest('.cat-filter-section').hidden = years.length === 0;
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
  function clearFilters() {
    activeEmulators.clear();
    activeSources.clear();
    activeSystems.clear();
    activeTypes.clear();
    activeManufacturers.clear();
    activeYears.clear();
    activeAspects.clear();
    activeOrientations.clear();
    activeGenres.clear();
    activeFamilies.clear();
    activePlayers.clear();
    onlyRanked = false;
    if (els.hiscoreFilter) els.hiscoreFilter.classList.remove('on');
    onlyAchievements = false;
    if (els.achFilter) els.achFilter.classList.remove('on');
    els.search.value = '';
    [].slice.call(document.querySelectorAll('.cat-filter-row.active')).forEach(function (b) { b.classList.remove('active'); });
  }
  els.reset.addEventListener('click', function () {
    clearFilters();
    applyFilters();
  });

  bindCollapsibles();
  bindFacetSearch();

  // ── DAT files panel ────────────────────────────────────────────────────────
  // Fed by catalog-data.json's own `dats` section : the site reads nothing
  // from the launcher's download manifest, which is another contract.
  // FinalBurn Neo publie un DAT par systeme, nomme d'apres lui ; MAME en
  // publie trois par contenu (ROMs split, BIOS et peripheriques, CHD), qui
  // portent leur propre libelle. Les lignes MAME viennent apres, prefixees.
  function buildDatList(dats) {
    var manifestByFile = {};
    (dats || []).forEach(function (m) { manifestByFile[(m.e || 'fbneo') + '|' + m.name] = m; });
    var bySystem = {};
    GAMES.forEach(function (g) { if (g.e === 'fbneo' && !bySystem[g.s]) bySystem[g.s] = g.f; });
    var rows = Object.keys(bySystem).sort().map(function (sys) {
      var m = manifestByFile['fbneo|' + bySystem[sys]] || {};
      return { label: sys, name: bySystem[sys], e: 'fbneo', size: m.size };
    });
    if (LIB !== 'fbneo') (dats || []).forEach(function (m) {
      if (m.e === 'mame') rows.push(Object.assign({}, m, { label: 'MAME · ' + m.label }));
    });
    els.datList.innerHTML = rows.map(function (m) {
      return (
        '<div class="cat-dat-row"><span><b>' + escapeHtml(m.label) + '</b><span class="size">' + humanSize(m.size) + '</span></span>' +
        '<a href="' + datFileUrl(m) + '" rel="noopener">' + escapeHtml(t('catalog.dl.dat', 'DAT')) + '</a></div>'
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

  /* ── Le catalogue se laisse piloter par son adresse ──────────────────────
     Un lien peut arriver avec une recherche, un systeme, le filtre des jeux
     classes, ou directement sur la fiche d'un jeu. Sans cela, « Voir la
     fiche du jeu » depuis la page d'un jeu deposait le visiteur en haut des
     29 496 lignes, exactement comme s'il n'avait rien demande.

     On CLIQUE les commandes plutot que de recopier leur effet : le filtre,
     sa marque visuelle et le rafraichissement de la liste passent alors par
     le meme chemin que lorsque le visiteur les actionne lui-meme. */
  function facetButton(container, key) {
    if (!container) return null;
    var rows = container.querySelectorAll('.cat-filter-row');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].dataset.key === key) return rows[i];
    }
    return null;
  }

  var urlApplied = false;
  var urlGame = null;

  function applyUrl(phase) {
    var p = new URLSearchParams(location.search);

    // Le filtre « classes » n'existe qu'une fois la liste du service arrivee :
    // c'est pourquoi cette passe repasse apres elle.
    if (p.get('hiscore') === '1' && els.hiscoreFilter &&
        !els.hiscoreFilter.closest('.cat-filter-section').hidden
        && !onlyRanked) {
      els.hiscoreFilter.click();
    }
    if (phase === 'ranked') {
      /* La liste des jeux classes arrive apres coup et declenche un nouvel
         applyFilters, qui rouvre la PREMIERE ligne du resultat. Sur une
         recherche par nom de ROM, cette premiere ligne est un hack du jeu
         demande, pas le jeu demande. On repose donc la fiche voulue, et on
         en profite pour qu'elle porte enfin son classement. */
      if (urlGame) openModal(urlGame);
      return;
    }
    if (urlApplied) return;
    urlApplied = true;

    var q = p.get('q');
    if (q && els.search) { els.search.value = q; applyFilters(); }

    var system = p.get('system');
    if (system) {
      var b = facetButton(els.systems, system);
      if (b && !b.classList.contains('active')) b.click();
    }

    // `game` ouvre directement la fiche. Le systeme leve l'ambiguite quand
    // un meme nom de ROM existe sur deux systemes (mslugx est dans le DAT
    // arcade ET dans le DAT Neo Geo).
    var name = p.get('game');
    if (!name) return;
    var g = (system && GAMES_BY_NAME[gameKey(LIB === 'mame' ? 'mame' : 'fbneo', system, name)]) || null;
    if (!g) {
      for (var i = 0; i < GAMES.length; i++) {
        if (GAMES[i].n === name) { g = GAMES[i]; break; }
      }
    }
    if (!g) return;
    // La recherche est posee sur le nom de ROM pour que la ligne du jeu soit
    // reellement dans la liste derriere la fiche, et pas perdue page 800.
    if (els.search && !q) { els.search.value = g.n; applyFilters(); }
    urlGame = g;
    openModal(g);
  }

  // ── Libraries ────────────────────────────────────────────────────────────
  /* La modale de choix, comme celle du launcher : une carte par emulateur,
     plus une carte « tout ». Rien n'est telecharge avant le choix : une
     bibliotheque pese plusieurs megaoctets, et le visiteur n'en veut souvent
     qu'une. Les nombres viennent de libraries.json, quelques octets ; s'il
     manque, les cartes s'affichent sans nombre et fonctionnent pareil. */
  var LIB_KEY = 'bootcade-catalog-lib';
  var libCounts = null;
  var libraryCache = {};
  var libSeq = 0;
  var libLoaded = false;

  /* Seules les bibliotheques qui ont des jeux sont proposees, comme dans le
     launcher. libraries.json absent ou illisible : FinalBurn Neo seul, le
     catalogue d'avant. C'est ce qui permet de publier le site avant que le
     catalogue MAME existe sur le serveur. */
  function availableLibraries() {
    if (!libCounts) return [library('fbneo')];
    return LIBRARIES.filter(function (l) { return libCounts[l.id] && libCounts[l.id].games > 0; });
  }
  function isAvailable(id) {
    var av = availableLibraries();
    if (id === 'all') return av.length > 1;
    return av.some(function (l) { return l.id === id; });
  }

  function rememberedLib() {
    try {
      var v = localStorage.getItem(LIB_KEY);
      if (isAvailable(v)) return v;
    } catch (e) { /* stockage indisponible : rien a retenir */ }
    return null;
  }

  function libCard(id, title, logo, tagline, count, current) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cat-lib-card' + (id === current ? ' is-current' : '');
    b.dataset.lib = id;
    b.innerHTML =
      '<span class="cat-lib-logo">' + (logo
        ? '<img src="' + logo + '" alt="' + escapeHtml(title) + '">'
        : '<b>' + escapeHtml(title) + '</b>') + '</span>' +
      '<span class="cat-lib-text">' +
        (count != null ? '<span><b>' + count.toLocaleString(LANG) + '</b> ' +
                         escapeHtml(t('catalog.lib.games', 'games')) + '</span>' : '') +
        '<small>' + escapeHtml(tagline) + '</small>' +
      '</span>' +
      '<span class="cat-lib-check" aria-hidden="true">' + (id === current ? '✓' : '') + '</span>';
    b.addEventListener('click', function () { closeLibraryPicker(); selectLibrary(id); });
    return b;
  }

  function renderLibraryCards() {
    var current = LIB || rememberedLib();
    var count = function (id) { return libCounts && libCounts[id] ? libCounts[id].games : null; };
    var total = null;
    if (libCounts) {
      total = 0;
      availableLibraries().forEach(function (l) { total += count(l.id) || 0; });
    }
    els.libCards.innerHTML = '';
    els.libCards.appendChild(libCard('all', t('catalog.lib.all', 'All libraries'), '',
      t('catalog.lib.all.tag', 'Everything at once, from every emulator'), total, current));
    availableLibraries().forEach(function (l) {
      els.libCards.appendChild(libCard(l.id, l.name, l.logo,
        t('catalog.lib.' + l.id + '.tag', l.tagline), count(l.id), current));
    });
  }

  function openLibraryPicker() {
    renderLibraryCards();
    els.libDialog.hidden = false;
    var cur = els.libCards.querySelector('.is-current') || els.libCards.firstChild;
    if (cur) cur.focus();
  }

  // Fermer sans choisir, a la toute premiere visite, garde quand meme une
  // page utile : la derniere bibliotheque choisie, sinon FinalBurn Neo.
  function closeLibraryPicker() {
    els.libDialog.hidden = true;
  }
  function cancelLibraryPicker() {
    closeLibraryPicker();
    if (!LIB) selectLibrary(rememberedLib() || availableLibraries()[0].id);
  }

  [].slice.call(document.querySelectorAll('[data-lib-cancel]')).forEach(function (b) {
    b.addEventListener('click', cancelLibraryPicker);
  });
  els.libDialog.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); cancelLibraryPicker(); }
  });
  els.libBtn.addEventListener('click', openLibraryPicker);

  function fetchLibrary(url) {
    if (!libraryCache[url]) {
      libraryCache[url] = fetch(url)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .catch(function (e) { delete libraryCache[url]; throw e; });
    }
    return libraryCache[url];
  }

  function renderLibButton() {
    var l = library(LIB);
    // Le logo suffit, comme dans le launcher ; le nom reste lu par le texte
    // alternatif et affiche au survol.
    els.libBtn.innerHTML = (l
      ? '<img src="' + l.logo + '" alt="' + escapeHtml(l.name) + '">'
      : '<span>' + escapeHtml(t('catalog.lib.all', 'All libraries')) + '</span>') + '<i>▾</i>';
    els.libBtn.title = t('catalog.lib.title', 'Choose a library');
    // Une seule bibliotheque : rien a choisir, pas de bouton.
    els.libBtn.hidden = availableLibraries().length < 2;
  }

  // Ce qui n'existe que pour FinalBurn Neo : journal des changements, ROMs
  // corriges, archive de tous les DAT. Affiches seulement quand il est la.
  function renderFbneoOnly() {
    var hasFbneo = LIB !== 'mame';
    ['cat-dat-changes', 'cat-dat-zip'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = !hasFbneo;
    });
    var fix = document.getElementById('cat-romfix');
    if (fix) fix.hidden = !hasFbneo || fix.getAttribute('href') === '#';
    // Compte sur la bibliotheque affichee, comme le launcher : absent si
    // aucun de ses jeux n'est classe.
    if (els.hiscoreFilter) {
      var n = 0;
      GAMES.forEach(function (g) { if (isRanked(g)) n++; });
      els.hiscoreFilter.textContent = '◆ ' + t('catalog.hiscore', 'Highscore') + ' (' + n.toLocaleString(LANG) + ')';
      els.hiscoreFilter.classList.toggle('on', onlyRanked);
      els.hiscoreFilter.closest('.cat-filter-section').hidden = !n;
    }
    if (els.achFilter) {
      var a = 0;
      GAMES.forEach(function (g) { if (achievementsOf(g)) a++; });
      els.achFilter.textContent = '\uD83C\uDFC5 ' + t('catalog.achievements', 'Achievements') + ' (' + a.toLocaleString(LANG) + ')';
      els.achFilter.classList.toggle('on', onlyAchievements);
      els.achFilter.closest('.cat-filter-section').hidden = !a;
    }
  }

  function selectLibrary(id) {
    if (id === LIB && libLoaded) return;
    var wanted = id === 'all' ? LIBRARIES : [library(id)];
    LIB = id;
    libLoaded = false;
    try { localStorage.setItem(LIB_KEY, id); } catch (e) { /* sans memoire */ }
    var p = new URLSearchParams(location.search);
    p.set('lib', id);
    history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash);
    renderLibButton();

    var seq = ++libSeq;
    resetView();
    els.count.textContent = t('catalog.loading', 'Loading the catalog…');

    Promise.all(wanted.map(function (l) { return fetchLibrary(l.url); }))
      .then(function (parts) {
        if (seq !== libSeq) return;          // le visiteur a deja change d'avis
        var games = [], dats = [];
        parts.forEach(function (d, i) {
          var e = wanted[i].id;
          (d.games || []).forEach(function (g) {
            // catalog-data.json porte les jeux de tous les emulateurs a qui
            // il a trouve un .dat : on ne garde que ceux de la bibliotheque.
            if ((g.e || 'fbneo') === e) { g.e = e; games.push(g); }
          });
          (d.dats || []).forEach(function (m) { if ((m.e || 'fbneo') === e) dats.push(m); });
        });
        loadGames(games, dats);
      })
      .catch(function () {
        if (seq !== libSeq) return;
        els.count.textContent = t('catalog.error', 'Could not load the catalog right now : please try again later.');
      });
  }

  /* Tout ce que la bibliotheque precedente avait pose : liste, resultats,
     « Load more », facettes, panneau DAT, fiche. Sans cela, un chargement
     qui echoue laissait la liste FinalBurn Neo sous le logo MAME, et
     « Load more » continuait de la derouler. */
  function resetView() {
    GAMES = [];
    GAMES_BY_NAME = {};
    filtered = [];
    shown = 0;
    selectedRow = null;
    clearFilters();
    els.grid.innerHTML = '';
    els.more.hidden = true;
    els.empty.hidden = true;
    els.reset.hidden = true;
    els.modal.hidden = true;
    els.datList.innerHTML = '';
    showGroupTitles(false);
    [].slice.call(document.querySelectorAll('#cat-sidebar .cat-filter-section')).forEach(function (sec) {
      sec.hidden = true;
      [].slice.call(sec.querySelectorAll('.cat-filter-list')).forEach(function (l) { l.innerHTML = ''; });
    });
  }

  function showGroupTitles(on) {
    [].slice.call(document.querySelectorAll('#cat-sidebar .cat-filter-group-title')).forEach(function (h) {
      h.hidden = !on;
    });
  }

  // Changer de bibliotheque remet les filtres a zero, comme le launcher : un
  // fabricant choisi dans l'une n'a aucune raison d'exister dans l'autre, et
  // un filtre actif sur une dimension absente viderait la liste sans un mot.
  function loadGames(games, dats) {
    GAMES = games;
    GAMES_BY_NAME = {};
    GAMES.forEach(function (g) {
      if (!g._flags) {
        g._flags = classify(g);
        g._hay = (g.d + ' ' + g.mf + ' ' + g.n).toLowerCase();
        g._aspect = (g.ax && g.ay) ? (g.ax + ':' + g.ay) : '';
      }
      // cloneof designe toujours un parent du meme emulateur et du meme
      // systeme : c'est la cle qu'utilise renderClone.
      GAMES_BY_NAME[gameKey(g.e, g.s, g.n)] = g;
    });
    clearFilters();
    // Filtre sur l'identifiant, affiche le nom de marque.
    var emulators = buildFacet(els.emulators, function (g) { return g.e; }, activeEmulators, true,
                               function (id) { return library(id) ? library(id).name : id; });
    // Une seule bibliotheque : la facette ne choisirait rien.
    els.emulators.closest('.cat-filter-section').hidden = emulators < 2;
    buildFacet(els.systems, function (g) { return g.s; }, activeSystems, true);
    buildFacet(els.sources, function (g) { return g.sf; }, activeSources, true);
    buildFacet(els.manufacturers, function (g) { return g.mf; }, activeManufacturers, true);
    buildTypes();
    buildYears();
    buildFacet(els.aspects, function (g) { return g._aspect; }, activeAspects, true);
    buildFacet(els.orientations, function (g) { return g.or; }, activeOrientations, true);
    buildFacet(els.genres, function (g) { return split(g.ge); }, activeGenres, true);
    buildFacet(els.families, function (g) { return split(g.fa); }, activeFamilies, true);
    // Trie par nombre de joueurs et non par population : « 1, 2, 3, 4 »
    // se lit, « 2, 1, 4, 3 » demande un effort pour rien.
    buildFacet(els.players, function (g) { return g.pl ? String(g.pl) : ''; },
               activePlayers, false);
    libLoaded = true;
    showGroupTitles(true);
    renderFbneoOnly();
    applyFilters();
    applyUrl('boot');

    // The DAT panel is a bonus, not the catalog itself : an older
    // catalog-data.json without `dats` just leaves it empty.
    try { buildDatList(dats); } catch (e) { /* DAT panel just stays empty */ }
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  (function boot() {
    /* La bibliotheque vient de l'adresse, sinon on la demande. Un lien venu
       d'ailleurs sur le site (classement, page d'un jeu) designe un jeu
       FinalBurn Neo sans dire « lib » : il ouvre FinalBurn Neo directement,
       comme avant, plutot que d'interposer une question. Il faut d'abord
       savoir quelles bibliotheques existent : libraries.json, quelques
       octets. */
    function start() {
      var p = new URLSearchParams(location.search);
      var lib = p.get('lib');
      var av = availableLibraries();
      if (isAvailable(lib)) selectLibrary(lib);
      else if (av.length < 2) selectLibrary(av[0].id);
      else if (p.get('game') || p.get('system') || p.get('q') || p.get('hiscore')) selectLibrary('fbneo');
      else {
        els.count.textContent = '';
        openLibraryPicker();
      }
    }
    fetch(LIBRARIES_URL)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { libCounts = d && typeof d === 'object' ? d : null; }, function () { libCounts = null; })
      .then(start);

    // And again for the score service, which lives on another host
    // entirely: unreachable, the catalog simply shows no leaderboards.
    fetch(SCORES_BASE + '/api/supported')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        (list || []).forEach(function (x) { ranked.add(x.system + '|' + x.game); });
        if (!ranked.size) return;
        renderFbneoOnly();
        if (!libLoaded) return;
        // The list lands after the first rows are already on screen, so
        // what is displayed has to be rebuilt to carry the badges.
        applyFilters();
        applyUrl('ranked');
      })
      .catch(function () { /* no leaderboards, everything else stands */ });

    // Same again for RetroAchievements: no answer, no medal and no filter.
    fetch(SCORES_BASE + '/api/retroachievements')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        (list || []).forEach(function (x) { achievements.set(x.system + '|' + x.game, x.achievements); });
        if (!achievements.size) return;
        renderFbneoOnly();
        if (!libLoaded) return;
        applyFilters();
        applyUrl('ranked');
      })
      .catch(function () { /* no achievements, everything else stands */ });

    // ROM access state: signed in or not, quota left. Silent on failure,
    // the button then stays a plain link.
    refreshRomState();

    // Same reasoning again, one failure domain further: no changes.json,
    // no "Fixed ROMs" button, everything else still renders.
    fetch(CHANGES_URL)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (entries) { buildRomFixButton(entries); renderFbneoOnly(); })
      .catch(function () { /* button just stays hidden */ });

  })();
})();
