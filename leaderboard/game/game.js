/* Bootcade : la page d'un jeu.
 *
 * Une adresse par jeu, remplie a l'execution : /leaderboard/game/?s=Neo%20Geo&n=mslugx
 *
 * Pourquoi un parametre et non une page par jeu : 489 jeux classes fois huit
 * langues font 3912 pages a pre-rendre a chaque construction, pour des pages
 * dont TOUT le contenu vient du service. Le cout serait paye au build, la
 * fraicheur ne serait pas meilleure, et le classement resterait de toute
 * facon charge par requete.
 *
 * Le service est la seule source de verite : c'est CT 106 qui dit si un jeu
 * est classe, quel est son record, et qui le detient. La page ne deduit rien
 * de ce qu'elle ne recoit pas. En particulier, une liste vide ne veut pas
 * dire « service en panne » et un service en panne ne veut pas dire « aucun
 * score » : les deux sont dits avec des mots differents.
 */
(function () {
  'use strict';

  var API      = 'https://scores.bootcade.duckdns.org';
  var ART_BASE = 'https://files.bootcade.duckdns.org/artwork/';
  var LANG     = document.documentElement.lang || 'en';
  var CAT      = (window.I18N && window.I18N[LANG]) || {};

  function t(key, fallback) { return CAT[key] !== undefined ? CAT[key] : fallback; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] === undefined ? m : vars[k];
    });
  }

  function el(id) { return document.getElementById(id); }

  function prefix(path) { return LANG === 'en' ? path : '/' + LANG + path; }

  /* La fiche du jeu DANS le catalogue. Le systeme accompagne le nom parce
     qu'un meme nom de ROM existe sur deux systemes : mslugx figure dans le
     DAT arcade comme dans le DAT Neo Geo. */
  function catalogHref() {
    return prefix('/catalog/') + '?system=' + encodeURIComponent(SYSTEM)
         + '&game=' + encodeURIComponent(GAME);
  }

  /* ── Mise en forme ──────────────────────────────────────────────────── */

  // Un score, un chrono et un resultat de golf sont trois nombres differents.
  // Le service dit lequel avec `metric`, la page se contente de l'ecrire.
  function formatScore(row) {
    var v = Number(row.score);
    if (row.metric === 'time') {
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      return ((v >> 16) & 255) + "'" + pad((v >> 8) & 255) + '"' + pad(v & 255);
    }
    if (row.metric === 'par') return v === 0 ? 'EVEN' : (v > 0 ? '+' : '-') + Math.abs(v);
    return v.toLocaleString(LANG);
  }

  function formatTime(seconds) {
    var s = Number(seconds) || 0;
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (h > 0) return h + ' h ' + (m < 10 ? '0' : '') + m;
    if (m > 0) return m + ' min';
    return s + ' s';
  }

  function countryFlag(code) {
    if (!code || code.length !== 2) return '';
    var base = 0x1F1E6, up = code.toUpperCase();
    var a = up.charCodeAt(0), b = up.charCodeAt(1);
    if (a < 65 || a > 90 || b < 65 || b > 90) return '';
    return String.fromCodePoint(base + a - 65, base + b - 65);
  }

  function shortDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toISOString().slice(0, 10);
  }

  function relativeDate(iso) {
    if (!iso) return '';
    var then = new Date(iso);
    if (isNaN(then)) return '';
    var days = Math.floor((Date.now() - then) / 86400000);
    if (days <= 0) return t('lb.today', 'today');
    if (days === 1) return t('lb.yesterday', 'yesterday');
    if (days < 30) return days + ' ' + t('lb.daysAgo', 'days ago');
    return then.toISOString().slice(0, 10);
  }

  // Memes regles que la barre du haut et le profil, pour que ce soit
  // visiblement la meme personne d'une page a l'autre.
  function hue(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
  }
  function initials(name) {
    var parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name).slice(0, 2).toUpperCase();
  }
  /* L'avatar CHOISI n'est connu que si le service le renvoie : il vit dans
     le compte Keycloak, pas dans la table des scores. Tant qu'il n'arrive
     pas, tout le monde a ses initiales, y compris le joueur connecte :
     un seul visage dessine au milieu de dix initiales se lirait comme un
     privilege, pas comme une donnee manquante. */
  function avatar(name, id, extra) {
    var cls = 'avatar' + (extra ? ' ' + extra : '');
    // Le service ne transporte pas encore l'avatar des autres joueurs. Celui
    // du porteur du jeton, si : il est dans le jeton. Une ligne qui est la
    // sienne porte donc son visage plutot que ses initiales.
    var mine = me();
    if (!id && mine && name && mine.name === name) id = mine.avatar;
    if (id) {
      return '<img class="' + cls + '" src="/avatars/' + esc(id) + '.svg" alt="" '
           + 'onerror="this.replaceWith(document.createTextNode(\'\'))">';
    }
    return '<span class="' + cls + '" style="--avatar-hue:' + hue(String(name || '')) + '" aria-hidden="true">'
         + esc(initials(name || '?')) + '</span>';
  }

  /* Le porteur du jeton : son nom, son pays et SON avatar, ceux-la memes
     qu'affichent la barre du haut et la page profil. C'est la seule identite
     complete qu'une page publique peut connaitre sans le service : celle des
     autres joueurs vit dans leur compte Keycloak, pas dans la table des
     scores. Ses lignes a lui portent donc son vrai visage des aujourd'hui,
     et celles des autres suivront quand le service transportera l'avatar. */
  function me() {
    var u = window.BootcadeAuth && window.BootcadeAuth.user();
    return u ? { name: u.preferred_username || u.name, avatar: u.avatar,
                 country: u.country } : null;
  }

  // Icones : SVG en ligne, comme le reste du site (voir les boutons de theme
  // dans l'entete). Aucune bibliotheque, aucune requete.
  var ICON = {
    trophy: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h8v1h2.5a.5.5 0 0 1 .5.5V5a3 3 0 0 1-3 3h-.2A4 4 0 0 1 9 10.9V13h2.5a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1H7v-2.1A4 4 0 0 1 4.2 8H4a3 3 0 0 1-3-3V3.5a.5.5 0 0 1 .5-.5H4V2Zm0 2H2v1a2 2 0 0 0 2 2V4Zm8 3a2 2 0 0 0 2-2V4h-2v3Z" fill="currentColor"/></svg>',
    user:   '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5" r="3" fill="currentColor"/><path d="M2 14a6 6 0 0 1 12 0Z" fill="currentColor"/></svg>',
    info:   '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 3.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM7 7.4h2v4.4H7Z" fill="currentColor"/></svg>',
    chart:  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 13h12v1.4H2ZM3.2 7h2.2v5H3.2Zm3.7-4h2.2v9H6.9Zm3.7 6h2.2v3h-2.2Z" fill="currentColor"/></svg>',
    link:   '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 9.4a2.6 2.6 0 0 1 0-3.7l2.1-2.1a2.6 2.6 0 1 1 3.7 3.7l-1 1-1-1 1-1a1.2 1.2 0 0 0-1.7-1.7L7.6 6.7a1.2 1.2 0 0 0 0 1.7Zm2.8-2.8a2.6 2.6 0 0 1 0 3.7l-2.1 2.1a2.6 2.6 0 1 1-3.7-3.7l1-1 1 1-1 1a1.2 1.2 0 1 0 1.7 1.7l2.1-2.1a1.2 1.2 0 0 0 0-1.7Z" fill="currentColor"/></svg>',
    play:   '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2 12.5 8 5 12.8Z" fill="currentColor"/></svg>',
    down:   '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.25 1.5h1.5v7.19l2.72-2.72 1.06 1.06L8 11.56 3.47 7.03l1.06-1.06 2.72 2.72ZM2.5 12.5h11V14h-11Z" fill="currentColor"/></svg>'
  };

  var MEDAL = ['🏆', '🥈', '🥉']; // trophee, argent, bronze

  function rankCell(pos) {
    if (pos >= 1 && pos <= 3) {
      return '<span class="gp-medal" aria-hidden="true">' + MEDAL[pos - 1] + '</span>'
           + '<span class="gp-rank-n">' + pos + '</span>';
    }
    return '<span class="gp-rank-n">' + pos + '</span>';
  }

  /* ── Ce que la page sait ────────────────────────────────────────────── */

  var params = new URLSearchParams(location.search);
  var SYSTEM = params.get('s') || params.get('system') || '';
  var GAME   = params.get('n') || params.get('game')   || '';

  var state = {
    summary: null,      // /api/games/<s>/<n>
    rows: [],           // /api/games/<s>/<n>/board
    you: null,          // ma meilleure ligne, si connecte
    mine: null,         // /api/me/progress, charge a l'ouverture de l'onglet
    ranked: null,       // null = pas encore su, true/false = repondu
    baseline: null,
    page: 0
  };

  function status(msg, kind) {
    var box = el('gp-status');
    box.hidden = false;
    box.textContent = msg;
    box.className = 'lb-status' + (kind ? ' lb-status-' + kind : '');
  }

  /* ── Entete ─────────────────────────────────────────────────────────── */

  function renderCrumbs() {
    var s = state.summary || {};
    var parts = [
      '<a href="' + prefix('/leaderboard/') + '">' + esc(t('gp.crumb.board', 'Leaderboard')) + '</a>',
      '<a href="' + prefix('/catalog/') + '?system=' + encodeURIComponent(SYSTEM) + '">'
        + esc(SYSTEM) + '</a>',
      '<span>' + esc(s.title || GAME) + '</span>'
    ];
    el('gp-crumbs').innerHTML = parts.join('<i aria-hidden="true">›</i>');
  }

  function chip(value, cls) {
    if (!value) return '';
    return '<span class="gp-chip' + (cls ? ' ' + cls : '') + '">' + esc(value) + '</span>';
  }

  /* La zone du jeu porte le jeu : image, titre, nom de ROM, une phrase et
     les actions. Les caracteristiques techniques vivent dans la carte de
     droite, une seule fois : en pastilles ici ELLES aussi, elles occupaient
     deux lignes de plus pour dire ce que la fiche disait deja. */
  function renderHero() {
    var s = state.summary || {};
    el('gp-hero').hidden = false;

    el('gp-art').innerHTML =
      '<img alt="" src="' + ART_BASE + 'previews/' + encodeURIComponent(GAME) + '.png"'
      + ' onerror="this.closest(\'.gp-art\').classList.add(\'gp-art-empty\');this.remove()">';

    /* L'image arrive apres le reste et change la hauteur de la zone haute,
       donc celle du tableau, donc le nombre de lignes qui y tiennent. Sans
       ce recalcul, la page se fige sur une mesure prise avant l'image :
       trop de lignes (elle deborde) ou trop peu (un vide sous la derniere). */
    var art = el('gp-art').querySelector('img');
    if (art) {
      art.addEventListener('load', function () { refits = 0; scheduleFit(); });
      art.addEventListener('error', function () { refits = 0; scheduleFit(); });
    }

    el('gp-title').textContent = s.title || GAME;
    el('gp-rom').textContent = GAME;

    // Les pastilles du mockup. Le systeme porte l'accent, le genre le vert
    // du service : ce sont les deux seules qui disent quelque chose du JEU
    // plutot que de sa fabrication.
    el('gp-chips').innerHTML =
        chip(SYSTEM, 'gp-chip-sys')
      + chip(s.manufacturer, '')
      + chip(s.year, '')
      + chip(s.orientation ? t('catalog.orientation.' + s.orientation, s.orientation) : '', '')
      + chip(s.genre, 'gp-chip-genre');

    // Phrase construite a partir des seuls champs recus, jamais inventee :
    // sans annee ni fabricant elle ne s'affiche pas du tout.
    var desc = '';
    if (s.year && s.manufacturer) {
      desc = fmt(t('gp.desc.full', '{title} was released in {year} by {maker} on {system} hardware.'), {
        title: s.title || GAME, year: s.year, maker: s.manufacturer, system: SYSTEM
      });
    }
    el('gp-desc').textContent = desc;
    el('gp-desc').hidden = !desc;

    el('gp-actions').innerHTML =
      '<a class="btn btn-accent" href="' + catalogHref() + '">'
        + ICON.play + esc(t('gp.act.catalog', 'View game in catalog')) + '</a>'
      + '<a class="btn" href="' + prefix('/') + '#download">'
        + ICON.down + esc(t('gp.act.play', 'Get Bootcade and play it')) + '</a>';
  }

  /* Deux verites distinctes, dites separement.
     « FBNeo sait lire la table des scores de ce jeu » et « le service
     Bootcade classe ce jeu » ne sont pas la meme phrase : un jeu peut avoir
     une definition sans que son decodeur produise quoi que ce soit. C'est
     CT 106 qui tranche, via /api/supported. */
  // Une ligne de la fiche. Un champ que le service n'a pas envoye ne laisse
  // pas d'etiquette vide : « Annee : » sans annee se lit comme une panne.
  function metaRow(label, value) {
    if (!value) return '';
    return '<tr><th scope="row">' + esc(label) + '</th><td>' + esc(value) + '</td></tr>';
  }

  function metaTable() {
    var s = state.summary || {};
    var rows =
        metaRow(t('gp.chip.system', 'System'), SYSTEM)
      + metaRow(t('gp.chip.maker', 'Manufacturer'), s.manufacturer)
      + metaRow(t('gp.chip.year', 'Year'), s.year)
      + metaRow(t('gp.chip.orientation', 'Orientation'),
                s.orientation ? t('catalog.orientation.' + s.orientation, s.orientation) : '')
      // Le genre n'existe pas dans les DAT de FinalBurn Neo : la ligne
      // n'apparait que le jour ou le service en transporte un.
      + metaRow(t('gp.chip.type', 'Game type'), s.genre)
      + metaRow(t('gp.info.rom', 'ROM name'), GAME);
    return rows ? '<table class="gp-meta"><tbody>' + rows + '</tbody></table>' : '';
  }

  function renderSupport() {
    var box = el('gp-support');
    if (state.ranked === null) { box.hidden = true; return; }
    box.hidden = false;

    // Trois etats, pas deux. Un jeu peut porter des scores publies et ne
    // plus etre classe : son decodeur s'est casse depuis, et le service l'a
    // retire de la liste.
    var paused = !state.ranked && state.rows.length > 0;
    box.className = 'gp-support ' + (state.ranked ? 'gp-support-yes'
                                   : paused ? 'gp-support-paused' : 'gp-support-no');

    var label = paused ? t('gp.sup.paused', 'Paused')
              : state.ranked ? t('gp.sup.yes', 'Supported')
                             : t('gp.sup.no', 'Not ranked');

    /* Pas de paragraphe explicatif : la carte dit l'etat du jeu et donne sa
       fiche. Comment le lanceur lit un score se raconte sur la page du
       classement, pas ici, sur chaque jeu. */
    box.innerHTML =
      '<div class="gp-sup-head"><span class="gp-sup-ico">' + ICON.trophy + '</span>'
      + '<div><h2>' + esc(t('gp.sup.h2', 'Bootcade leaderboard')) + '</h2>'
      + '<p class="gp-sup-state">' + esc(label) + '</p></div></div>'
      + (state.ranked && state.baseline === false
          ? '<p class="gp-sup-warn">' + esc(t('gp.sup.nobaseline',
              'No factory reference has been captured yet, so a first score may need a manual check.')) + '</p>'
          : '')
      + metaTable();
  }

  /* ── Classement ─────────────────────────────────────────────────────── */

  /* Le tableau montre les scores publies, et rien d'autre.
     Les dix places d'usine d'une borne remplissaient l'ecran d'une promesse
     vide : la carte doit prendre la hauteur de son contenu, un score tenant
     sur une ligne et dix sur dix. */
  function boardRow(r, mine) {
    return '<li class="gp-row' + (mine ? ' gp-row-me' : '') + '">'
      + '<span class="gp-rank">' + rankCell(r.pos) + '</span>'
      + '<span class="gp-who">' + avatar(r.player, r.avatar, 'gp-avatar')
        + '<span class="gp-name">' + esc(r.player) + '</span>'
        + '<span class="gp-flag" title="' + esc(r.country || '') + '">'
          + countryFlag(r.country) + '</span></span>'
      + '<span class="gp-score">' + esc(formatScore(r)) + '</span>'
      + '<span class="gp-date">' + esc(shortDate(r.since)) + '</span>'
      // Colonne vide tant que le service ne dit pas COMMENT la ligne est
      // entree : ecrire « Auto » par defaut serait affirmer une verification
      // qu'on n'a pas recue.
      + '<span class="gp-val">' + esc(!r.validation ? ''
          : r.validation === 'admin' ? t('gp.val.admin', 'Checked')
                                     : t('gp.val.auto', 'Auto')) + '</span>'
      + '</li>';
  }

  function boardHead() {
    return '<li class="gp-row gp-head">'
      + '<span class="gp-rank">' + esc(t('gp.col.rank', '#')) + '</span>'
      + '<span class="gp-who">' + esc(t('gp.col.player', 'Player')) + '</span>'
      + '<span class="gp-score">' + esc(t('gp.col.score', 'Score')) + '</span>'
      + '<span class="gp-date">' + esc(t('gp.col.date', 'Date')) + '</span>'
      + '<span class="gp-val">' + esc(t('gp.col.val', 'Validation')) + '</span>'
      + '</li>';
  }

  /* Combien de lignes tiennent VRAIMENT dans la place disponible.
     La zone du tableau a la hauteur que la grille lui laisse, pas l'inverse :
     on la mesure, on divise par la hauteur d'une ligne, et on pagine sur ce
     nombre. C'est ce qui empeche la page de s'allonger quand les scores
     arrivent, au lieu de la laisser pousser le reste hors de l'ecran. */
  var PER_PAGE = 12;
  var ROW_FALLBACK = 47;

  /* Le mode tableau de bord, tel que game.css le definit. En dessous du
     seuil la page redevient un document qui defile : la place disponible
     n'a plus de sens comme contrainte, et le classement reprend une
     pagination fixe. Sans ce test, `fitRows` mesurait une colonne haute
     comme son contenu et concluait « une ligne tient ». */
  var DASH = '(min-width: 1024px) and (min-height: 1000px)';
  function dashboard() {
    return !window.matchMedia || window.matchMedia(DASH).matches;
  }

  function fitRows() {
    if (!dashboard()) return 20;
    /* On mesure la PLACE DISPONIBLE, pas la carte.
       La carte, elle, prend la hauteur de son contenu : un score donne une
       carte d'une ligne, dix scores une carte de dix. Mesurer la carte pour
       decider combien de lignes y tiennent reviendrait a se demander la
       taille de ce qu'on est en train de dimensionner. */
    var main = el('gp-panel-board').parentNode;      // la colonne du classement
    var tabs = document.querySelector('.gp-tabs');
    var panel = el('gp-panel-board');
    var pager = el('gp-pager');
    var box = el('gp-board');
    if (!main || !main.clientHeight) return null;

    var cs = window.getComputedStyle(panel);
    var tcs = window.getComputedStyle(tabs);
    var chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
               + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    var tabsH = tabs.getBoundingClientRect().height + parseFloat(tcs.marginBottom);
    var pagerH = pager.hidden ? 0 : pager.getBoundingClientRect().height
               + parseFloat(window.getComputedStyle(pager).marginTop);

    var head = box.querySelector('.gp-head');
    var row = box.querySelector('.gp-row:not(.gp-head)');
    var rowH = row ? row.getBoundingClientRect().height : ROW_FALLBACK;
    if (rowH < 20) rowH = ROW_FALLBACK;
    var headH = head ? head.getBoundingClientRect().height : 0;

    var avail = main.clientHeight - tabsH - chrome - pagerH - headH;
    return Math.max(1, Math.floor(avail / rowH));
  }

  // Une seule correction en cascade, et jamais plus : mesurer, redessiner,
  // remesurer une fois. Sans ce garde-fou, une hauteur de ligne qui varie
  // d'un pixel ferait boucler la page indefiniment.
  var refits = 0;
  function scheduleFit() {
    if (refits > 2) return;
    requestAnimationFrame(function () {
      var n = fitRows();
      if (!n || n === PER_PAGE) { refits = 0; return; }
      PER_PAGE = n;
      refits++;
      renderBoard();
    });
  }

  function renderBoard() {
    var box = el('gp-board');
    var note = el('gp-board-note');
    var rows = state.rows;

    // Un jeu sans classement n'a pas de tableau a montrer.
    if (!rows.length) {
      box.innerHTML = '<p class="lb-empty">' + esc(state.ranked === false
        ? t('gp.board.unranked', 'This game has no leaderboard, so there is nothing to show here.')
        : t('gp.board.empty', 'No score yet. The first run published on this game takes the top spot.')) + '</p>';
      note.hidden = true;
      el('gp-pager').hidden = true;
      return;
    }
    note.hidden = true;

    var pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    if (state.page >= pages) state.page = pages - 1;
    var from = state.page * PER_PAGE;
    var slice = rows.slice(from, from + PER_PAGE);
    var mine = me();

    var hasVal = slice.some(function (r) { return !!r.validation; });
    box.innerHTML = '<ol class="gp-board' + (hasVal ? '' : ' gp-noval') + '">'
      + boardHead()
      + slice.map(function (r) {
          return boardRow(r, mine && r.player === mine.name);
        }).join('')
      + '</ol>';

    renderPager(pages, from, slice.length, rows.length);
    scheduleFit();
  }

  /* Pagination numerotee : sur un classement de deux cents lignes, « suivant »
     seul oblige a cliquer dix fois pour voir la centieme place. Les numeros
     se resserrent autour de la page courante avec des points de suspension,
     pour que la barre garde la meme largeur a 3 pages comme a 40. */
  function pageNumbers(current, pages) {
    var out = [], i;
    var push = function (n) { if (out[out.length - 1] !== n) out.push(n); };
    push(1);
    for (i = current - 1; i <= current + 1; i++) if (i > 1 && i < pages) push(i);
    if (pages > 1) push(pages);
    var withGaps = [];
    for (i = 0; i < out.length; i++) {
      if (i && out[i] - out[i - 1] > 1) withGaps.push(null);
      withGaps.push(out[i]);
    }
    return withGaps;
  }

  function renderPager(pages, from, shown, total) {
    var pager = el('gp-pager');
    if (pages <= 1) { pager.hidden = true; return; }
    pager.hidden = false;

    var nums = pageNumbers(state.page + 1, pages).map(function (n) {
      if (n === null) return '<span class="gp-pagebtn-gap">…</span>';
      return '<button type="button" class="gp-pagebtn'
           + (n === state.page + 1 ? ' gp-pagebtn-on' : '') + '" data-page="' + n + '">'
           + n + '</button>';
    }).join('');

    pager.innerHTML =
      '<span class="gp-pager-count">' + esc(fmt(t('gp.pager.count', 'Showing {from}–{to} of {total}'), {
          from: from + 1, to: from + shown, total: total
        })) + '</span>'
      + '<span class="gp-pages">' + nums
      + '<button type="button" class="gp-pagebtn gp-next"' + (state.page >= pages - 1 ? ' disabled' : '') + '>'
        + esc(t('gp.pager.next', 'Next')) + '</button></span>';

    pager.querySelectorAll('[data-page]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.page = Number(b.dataset.page) - 1;
        renderBoard();
      });
    });
    var next = pager.querySelector('.gp-next');
    if (next) next.addEventListener('click', function () {
      if (state.page < pages - 1) { state.page++; renderBoard(); }
    });
  }

  /* ── Colonne de droite ──────────────────────────────────────────────── */

  function renderYou() {
    var card = el('gp-you-card');
    var box  = el('gp-you');

    if (!window.BootcadeAuth || !window.BootcadeAuth.isLoggedIn()) {
      box.innerHTML = '<p class="lb-empty">' + esc(t('gp.you.anon',
        'Sign in to see where you stand on this board.')) + '</p>'
        + '<p class="gp-you-cta"><button type="button" class="btn btn-accent" id="gp-signin">'
        + esc(t('auth.signin', 'Sign in')) + '</button></p>';
      var b = el('gp-signin');
      if (b) b.addEventListener('click', function () { window.BootcadeAuth.login(); });
      card.hidden = false;
      return;
    }

    if (!state.you) {
      box.innerHTML = '<p class="lb-empty">' + esc(t('gp.you.none',
        'You have no published score on this game yet.')) + '</p>';
      card.hidden = false;
      return;
    }

    /* Identite complete, et pas seulement un nombre : sur un tableau de
       cinquante joueurs, « ou je suis » se lit d'abord au visage et au
       drapeau. C'est la meme personne que dans la barre du haut et sur le
       profil, donc le meme avatar. */
    var r = state.you;
    var mine = me();
    box.innerHTML =
      '<div class="gp-you-id">'
        + avatar(r.player, r.avatar, 'gp-you-avatar')
        + '<div class="gp-you-who"><b>' + esc(r.player) + '</b>'
        + '<span class="gp-you-country">' + countryFlag(r.country || (mine && mine.country))
          + ' ' + esc(r.country || (mine && mine.country) || '') + '</span></div>'
      + '</div>'
      + '<div class="gp-you-figures">'
        + '<b class="gp-you-score">' + esc(formatScore(r)) + '</b>'
        + '<span class="gp-you-badge">#' + r.pos + '</span>'
      + '</div>'
      + '<p class="gp-you-when">' + esc(shortDate(r.since)) + '</p>';
    card.hidden = false;
  }

  function statLine(label, value) {
    if (value === null || value === undefined || value === '') return '';
    return '<li><span class="gp-stat-k">' + esc(label) + '</span>'
         + '<span class="gp-stat-v">' + esc(value) + '</span></li>';
  }

  function renderStats() {
    var s = state.summary || {};
    var rows = state.rows;

    // La moyenne se calcule sur ce que la page a recu, et n'est affichee que
    // si elle porte sur la totalite des lignes : une moyenne des 200
    // premieres serait fausse sans le dire.
    // Le service la calcule sur la TOTALITE des lignes ; la page ne la
    // recalcule que si elle les a toutes, faute de quoi une moyenne des 200
    // premieres s'afficherait comme une moyenne generale.
    var average = '';
    if (s.average !== null && s.average !== undefined) {
      average = Number(s.average).toLocaleString(LANG);
    } else if (rows.length && s.scores && rows.length >= s.scores
               && (s.metric || 'score') === 'score') {
      var sum = rows.reduce(function (a, r) { return a + Number(r.score || 0); }, 0);
      average = Math.round(sum / rows.length).toLocaleString(LANG);
    }

    var first = s.first_at || (rows.length ? rows.map(function (r) { return r.since; })
      .filter(Boolean).sort()[0] : '');
    var last  = s.last_at  || (rows.length ? rows.map(function (r) { return r.since; })
      .filter(Boolean).sort().slice(-1)[0] : '');

    el('gp-stats').innerHTML = '<ul class="gp-stats">'
      + statLine(t('gp.stat.players', 'Players'), s.players ? s.players.toLocaleString(LANG) : '0')
      + statLine(t('gp.stat.scores', 'Scores published'), s.scores ? s.scores.toLocaleString(LANG) : '0')
      + statLine(t('gp.stat.best', 'Highest score'), s.record ? formatScore(s.record) : '')
      + statLine(t('gp.stat.holder', 'Record held by'),
                 s.record ? s.record.player + ' ' + countryFlag(s.record.country) : '')
      + statLine(t('gp.stat.average', 'Average score'), average)
      + statLine(t('gp.stat.runs', 'Runs played'), s.runs ? s.runs.toLocaleString(LANG) : '')
      + statLine(t('gp.stat.time', 'Time played'), s.seconds ? formatTime(s.seconds) : '')
      + statLine(t('gp.stat.first', 'First score'), shortDate(first))
      + statLine(t('gp.stat.last', 'Latest score'), shortDate(last))
      + '</ul>';
  }

  function renderLinks() {
    var item = function (href, label) {
      return '<li><a href="' + href + '">' + esc(label) + ICON.link + '</a></li>';
    };
    el('gp-links').innerHTML = '<ul class="gp-links">'
      + item(catalogHref(), t('gp.link.catalog', 'This game in the catalog'))
      + item(prefix('/catalog/') + '?system=' + encodeURIComponent(SYSTEM),
             fmt(t('gp.link.system', 'All {system} games'), { system: SYSTEM }))
      + item(prefix('/catalog/') + '?hiscore=1',
             t('gp.link.ranked', 'Every game that can be ranked'))
      + item(prefix('/leaderboard/'),
             t('gp.link.board', 'Back to the global leaderboard'))
      + '</ul>';
  }

  /* ── Onglets ────────────────────────────────────────────────────────── */

  function renderInfo() {
    var s = state.summary || {};
    var res = (s.width && s.height) ? (s.width + ' × ' + s.height) : '';
    var body = ''
      + statLine(t('gp.chip.system', 'System'), SYSTEM)
      + statLine(t('gp.info.rom', 'ROM name'), GAME)
      + statLine(t('gp.info.title', 'Full title'), s.title)
      + statLine(t('gp.chip.maker', 'Manufacturer'), s.manufacturer)
      + statLine(t('gp.chip.year', 'Year'), s.year)
      + statLine(t('gp.chip.orientation', 'Orientation'),
                 s.orientation ? t('catalog.orientation.' + s.orientation, s.orientation) : '')
      + statLine(t('gp.info.video', 'Video'), s.video ? t('catalog.video.' + s.video, s.video) : '')
      + statLine(t('gp.chip.resolution', 'Resolution'), res)
      + statLine(t('gp.info.metric', 'Ranked on'), s.record
          ? t('gp.metric.' + (s.record.metric || 'score'), s.record.metric || 'score') : '');

    el('gp-info').innerHTML = body
      ? '<ul class="gp-stats">' + body + '</ul>'
        + '<p class="gp-info-note">' + esc(t('gp.info.note',
            'Technical data comes from the FinalBurn Neo DAT files, the same ones the catalog is built from.')) + '</p>'
      : '<p class="lb-empty">' + esc(t('gp.info.empty',
          'The service did not return any technical data for this game.')) + '</p>';
  }

  function renderMine() {
    var box = el('gp-mine');

    if (!window.BootcadeAuth || !window.BootcadeAuth.isLoggedIn()) {
      box.innerHTML = '<p class="lb-empty">' + esc(t('gp.mine.anon',
        'Sign in to see your own runs on this game.')) + '</p>';
      return;
    }
    if (state.mine === null) {
      box.innerHTML = '<p class="lb-empty">' + esc(t('gp.mine.loading', 'Loading…')) + '</p>';
      return;
    }
    if (state.mine === false) {
      box.innerHTML = '<p class="lb-empty">' + esc(t('gp.mine.error',
        'Your scores could not be loaded right now.')) + '</p>';
      return;
    }
    if (!state.mine.length) {
      box.innerHTML = '<p class="lb-empty">' + esc(t('gp.mine.none',
        'Nothing published on this game yet.')) + '</p>';
      return;
    }

    // Dans l'ordre ou ils sont tombes, le plus recent en haut : cette liste
    // raconte une progression, pas un classement.
    var best = state.mine.reduce(function (a, r) {
      return (a === null || Number(r.score) > Number(a)) ? Number(r.score) : a;
    }, null);

    box.innerHTML = '<ol class="gp-board gp-mine-list">'
      + state.mine.slice().reverse().map(function (r) {
          return '<li class="gp-row' + (Number(r.score) === best ? ' gp-row-me' : '') + '">'
            + '<span class="gp-rank">' + (Number(r.score) === best
                ? '<span class="gp-medal" aria-hidden="true">' + MEDAL[0] + '</span>' : '') + '</span>'
            + '<span class="gp-who"><span class="gp-name">' + esc(shortDate(r.at || r.since)) + '</span></span>'
            + '<span class="gp-score">' + esc(formatScore(r)) + '</span>'
            + '<span class="gp-date">' + esc(relativeDate(r.at || r.since)) + '</span>'
            + '<span class="gp-val"></span>'
            + '</li>';
        }).join('')
      + '</ol>';
  }

  function showTab(name) {
    ['board', 'mine', 'info'].forEach(function (n) {
      var tab = el('gp-tab-' + n), panel = el('gp-panel-' + n);
      var on = n === name;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.classList.toggle('gp-tab-on', on);
      panel.hidden = !on;
    });
    if (name === 'mine') loadMine();
    if (name === 'info') renderInfo();
  }

  function wireTabs() {
    ['board', 'mine', 'info'].forEach(function (n) {
      el('gp-tab-' + n).addEventListener('click', function () { showTab(n); });
    });
  }

  /* ── Chargement ─────────────────────────────────────────────────────── */

  function authFetch(path) {
    if (!window.BootcadeAuth || !window.BootcadeAuth.isLoggedIn()) {
      return Promise.resolve(null);
    }
    return window.BootcadeAuth.token().then(function (tok) {
      if (!tok) return null;
      return fetch(API + path, { headers: { Authorization: 'Bearer ' + tok } })
        .then(function (r) { return r.ok ? r.json() : null; });
    }).catch(function () { return null; });
  }

  var mineRequested = false;
  function loadMine() {
    if (mineRequested) { renderMine(); return; }
    mineRequested = true;
    renderMine();
    authFetch('/api/me/progress/' + encodeURIComponent(SYSTEM) + '/' + encodeURIComponent(GAME))
      .then(function (rows) {
        state.mine = Array.isArray(rows) ? rows : false;
        renderMine();
      });
  }

  /* Le classement est demande AVEC le jeton quand il y en a un : le service
     ajoute alors `you`, sa meilleure place a lui. Sans jeton la meme route
     repond quand meme, le classement etant public : c'est la vitrine. */
  function loadBoard() {
    var path = '/api/games/' + encodeURIComponent(SYSTEM) + '/' + encodeURIComponent(GAME)
             + '/board?limit=200';
    var signedIn = window.BootcadeAuth && window.BootcadeAuth.isLoggedIn();
    var req = signedIn
      ? window.BootcadeAuth.token().then(function (tok) {
          return fetch(API + path, tok ? { headers: { Authorization: 'Bearer ' + tok } } : undefined);
        })
      : fetch(API + path);
    return req.then(function (r) {
      if (!r || !r.ok) throw new Error(r ? r.status : 'no answer');
      return r.json();
    });
  }

  function load() {
    if (!SYSTEM || !GAME) {
      status(t('gp.err.noGame', 'No game in this address. Pick one from the leaderboard or the catalog.'), 'bad');
      return;
    }

    document.title = GAME + ' : ' + t('gp.meta.suffix', 'Bootcade leaderboard');
    renderCrumbs();

    var summary = fetch(API + '/api/games/' + encodeURIComponent(SYSTEM) + '/' + encodeURIComponent(GAME))
      .then(function (r) { return r.ok ? r.json() : null; });

    // Deux appels obligatoires, un troisieme facultatif. Chaque promesse
    // repond separement : que /api/supported tombe ne doit pas effacer le
    // classement, et l'inverse non plus.
    Promise.all([
      summary.catch(function () { return null; }),
      loadBoard().catch(function () { return null; })
    ]).then(function (res) {
      var s = res[0], board = res[1];

      if (!s && !board) {
        status(t('gp.err.offline',
          'The score service did not answer. This page shows nothing rather than showing something wrong.'), 'bad');
        return;
      }

      state.summary = s || { title: GAME, system: SYSTEM, game: GAME, players: 0, scores: 0 };
      state.rows = (board && Array.isArray(board.rows)) ? board.rows : [];
      state.you  = (board && board.you) ? board.you : null;

      el('gp-status').hidden = true;
      el('gp-cols').hidden = false;
      renderCrumbs();
      renderHero();
      // Les deux appels courent en parallele : celui qui arrive en second
      // doit redessiner l'etat, sinon « en pause » depend de l'ordre des
      // reponses reseau, ce qui est le contraire d'un fait.
      renderSupport();
      renderBoard();
      renderYou();
      renderStats();
      renderLinks();

      if (!board) {
        status(t('gp.err.board',
          'The leaderboard itself could not be loaded. The rest of this page is still accurate.'), 'warn');
      }
    });

    // Le classement Bootcade ne se deduit pas du nombre de lignes : un jeu
    // classe sans joueur et un jeu non classe rendent tous les deux une
    // liste vide. Seul /api/supported repond a la question.
    fetch(API + '/api/supported')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (list) {
        if (!Array.isArray(list)) return;
        var hit = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i].game === GAME && list[i].system === SYSTEM) { hit = list[i]; break; }
        }
        state.ranked = !!hit;
        state.baseline = hit ? (hit.baseline !== false) : null;
        renderSupport();
        if (!state.rows.length) renderBoard();
      })
      .catch(function () { /* l'etat reste inconnu, et rien n'est affirme */ });
  }

  // Les icones des onglets et des titres de cartes sont posees ici plutot
  // qu'en dur dans le HTML : build.js remplace le contenu des elements
  // data-i18n, et un SVG a l'interieur serait efface a la traduction.
  Array.prototype.forEach.call(document.querySelectorAll('[data-ico]'), function (host) {
    host.innerHTML = ICON[host.dataset.ico] || '';
  });

  wireTabs();
  showTab('board');   // l'onglet ouvert doit AVOIR l'air ouvert des le depart
  load();

  // Redimensionner la fenetre change la place disponible, donc le nombre de
  // lignes qui y tiennent. Sans ca, agrandir la fenetre laisserait un trou
  // sous le tableau et la reduire ferait deborder la page.
  /* La mesure ne doit dependre d'aucun delai. La zone du tableau change de
     taille quand l'image du jeu arrive, quand les polices se chargent, quand
     la colonne de droite se replie sur deux colonnes ou quand la fenetre
     bouge : on observe la boite elle-meme plutot que d'essayer de deviner
     quand tout cela est fini. Redessiner la liste ne change pas la boite,
     donc l'observation ne peut pas boucler. */
  if (window.ResizeObserver) {
    new ResizeObserver(function () { refits = 0; scheduleFit(); })
      .observe(el('gp-panel-board').parentNode);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { refits = 0; scheduleFit(); });
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { refits = 0; scheduleFit(); }, 150);
  });

  // Se connecter ou se deconnecter change ce que la page peut montrer :
  // sa place, ses parties. auth-ui.js emet l'evenement, la page se redessine.
  window.addEventListener('bootcade:user-changed', function () {
    mineRequested = false;
    state.mine = null;
    loadBoard().then(function (board) {
      if (!board) return;
      state.rows = Array.isArray(board.rows) ? board.rows : [];
      state.you = board.you || null;
      renderBoard();
      renderYou();
    }).catch(function () {});
  });
})();
