/* Bootcade : page Leaderboard.
 *
 * Tout vient d'un seul appel à /api/stats. Une requête par tableau ferait six
 * allers-retours pour une page qui se lit d'un coup d'oeil, et le service est
 * à l'autre bout d'Internet.
 *
 * La page reste lisible quand le service ne répond pas : chaque bloc dit qu'il
 * n'a rien plutôt que de rester vide, parce qu'un tableau vide et un service
 * en panne se ressemblent trop.
 */
(function () {
  'use strict';

  var API = 'https://scores.bootcade.duckdns.org';
  var LANG = document.documentElement.lang || 'en';
  // Meme catalogue que catalog.js : window.I18N, rempli par i18n.js (charge
  // dans la page). Un window.LB_I18N maison n'existait nulle part et ne
  // traduisait donc jamais rien, silencieusement : toujours le texte anglais
  // de secours, dans les 8 langues.
  var CAT = (window.I18N && window.I18N[LANG]) || {};
  function t(key, fallback) { return CAT[key] !== undefined ? CAT[key] : fallback; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Un score, un chrono et un résultat de golf sont trois nombres différents.
  // Le service dit lequel, la page se contente de l'écrire correctement.
  function formatScore(row) {
    var v = Number(row.score);
    if (row.metric === 'time') {
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      return ((v >> 16) & 255) + "'" + pad((v >> 8) & 255) + '"' + pad(v & 255);
    }
    if (row.metric === 'par') return v === 0 ? 'EVEN' : (v > 0 ? '+' : '-') + Math.abs(v);
    return v.toLocaleString(LANG);
  }

  // Une durée se lit en heures et minutes, pas en secondes : 10265 ne dit rien
  // à personne, 2 h 51 se comprend sans réfléchir.
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
    var base = 0x1F1E6;
    return String.fromCodePoint(
      base + code.toUpperCase().charCodeAt(0) - 65,
      base + code.toUpperCase().charCodeAt(1) - 65);
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

  function gameLink(row) {
    // Chaque jeu classé a maintenant sa page : classement complet, record,
    // et sa propre place pour qui est connecté. Le lien y va plutôt que vers
    // une recherche dans le catalogue, qui répondait à côté de la question
    // posée par un nom de jeu dans un classement : « qui d'autre y joue ».
    var base = LANG === 'en' ? '/leaderboard/game/' : '/' + LANG + '/leaderboard/game/';
    var href = base + '?s=' + encodeURIComponent(row.system || '')
             + '&n=' + encodeURIComponent(row.game);
    return '<a href="' + href + '">' + esc(row.title || row.game) + '</a>';
  }

  function player(row) {
    var flag = countryFlag(row.country);
    return esc(row.player) + (flag ? ' ' + flag : '');
  }

  /* Interpolation nommee.
   *
   * Les phrases du feed sont traduites ENTIERES, avec des marqueurs, et non
   * assemblees a partir de morceaux. En japonais, en chinois et en thai
   * l'ordre des elements differe du francais : concatener « joueur » + « a
   * pris la tete sur » + « jeu » produirait des phrases fausses dans trois
   * langues sur huit, et invisibles pour qui ne les lit pas.
   *
   * Les valeurs arrivent DEJA echappees ou balisees : c'est le seul endroit
   * ou du HTML entre dans une chaine traduite, donc le seul a surveiller.
   */
  function fmt(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] === undefined ? m : vars[k];
    });
  }

  var ACT_ICON = {
    took_lead: '\uD83C\uDFC6',      // trophee
    improved: '\uD83D\uDD25',       // flamme
    joined_board: '\uD83C\uDFAE',   // manette
    first_score: '\u2728',           // etincelles
    joined: '\uD83D\uDC4B'          // main qui salue
  };

  function activityLine(e) {
    var vars = {
      player: '<b>' + esc(e.player) + '</b>'
            + (e.country ? ' ' + esc(countryFlag(e.country)) : ''),
      game: e.title || e.game ? gameLink(e) : '',
      delta: e.delta == null ? '' : '<b>' + esc(Number(e.delta).toLocaleString(LANG)) + '</b>'
    };
    var tpl = t('lb.act.' + e.kind, DEFAULT_ACT[e.kind]);
    return '<span class="lb-act-ico" aria-hidden="true">'
         + (ACT_ICON[e.kind] || '') + '</span>'
         + '<span class="lb-main lb-act-text">' + fmt(tpl, vars) + '</span>'
         + '<span class="lb-when">' + esc(relativeDate(e.at)) + '</span>';
  }

  // L'anglais est la langue source : il vit dans le code, pas dans un
  // catalogue, exactement comme le reste du site.
  var DEFAULT_ACT = {
    took_lead: '{player} took the #1 spot on {game}',
    improved: '{player} improved their {game} record by {delta}',
    joined_board: '{player} entered the {game} leaderboard',
    first_score: '{player} opened the {game} leaderboard',
    joined: '{player} joined Bootcade'
  };

  function renderActivity(events) {
    var host = document.getElementById('lb-activity');
    if (!host) return;
    if (!events || !events.length) {
      host.innerHTML = '<p class="lb-empty">'
        + esc(t('lb.empty', 'Nothing here yet. Be the first.')) + '</p>';
      return;
    }
    host.innerHTML = '<ul class="lb-list lb-act-list">' + events.map(function (e) {
      return '<li>' + activityLine(e) + '</li>';
    }).join('') + '</ul>';
  }

  function fill(id, rows, render) {
    var host = document.getElementById(id);
    if (!host) return;
    if (!rows || !rows.length) {
      host.innerHTML = '<p class="lb-empty">' +
        esc(t('lb.empty', 'Nothing here yet. Be the first.')) + '</p>';
      return;
    }
    host.innerHTML = '<ol class="lb-list">' + rows.map(function (row, i) {
      return '<li><span class="lb-rank">' + (i + 1) + '</span>' + render(row) + '</li>';
    }).join('') + '</ol>';
  }

  function render(stats) {
    var totals = stats.totals || {};
    var cells = [
      [totals.scores, t('lb.totals.scores', 'scores published')],
      [totals.players, t('lb.totals.players', 'players')],
      [totals.games_played, t('lb.totals.games', 'games played')],
      [formatTime(totals.seconds), t('lb.totals.time', 'time played')]
    ];
    document.getElementById('lb-totals').innerHTML = cells.map(function (c) {
      return '<div class="lb-stat"><b>' + esc(c[0] == null ? '0' : c[0]) +
             '</b><span>' + esc(c[1]) + '</span></div>';
    }).join('');

    fill('lb-recent', stats.recent, function (r) {
      return '<span class="lb-main">' + gameLink(r) + '</span>' +
             '<span class="lb-value">' + esc(formatScore(r)) + '</span>' +
             '<span class="lb-who">' + player(r) + '</span>' +
             '<span class="lb-when">' + esc(relativeDate(r.since)) + '</span>';
    });

    fill('lb-most-played', stats.most_played, function (r) {
      return '<span class="lb-main">' + gameLink(r) + '</span>' +
             '<span class="lb-value">' + esc(formatTime(r.seconds)) + '</span>';
    });

    fill('lb-longest', stats.longest, function (r) {
      return '<span class="lb-main">' + gameLink(r) + '</span>' +
             '<span class="lb-value">' + esc(formatTime(r.seconds)) + '</span>' +
             '<span class="lb-who">' + player(r) + '</span>';
    });

    fill('lb-players', stats.players, function (r) {
      return '<span class="lb-main">' + player(r) + '</span>' +
             '<span class="lb-value">' + esc(formatTime(r.seconds)) + '</span>' +
             '<span class="lb-when">' + esc(r.scores) + ' ' +
             esc(t('lb.scoresShort', 'scores')) + '</span>';
    });

    fill('lb-countries', stats.countries, function (r) {
      return '<span class="lb-main">' + esc(countryFlag(r.country)) + ' ' +
             esc(r.country) + '</span>' +
             '<span class="lb-value">' + esc(formatTime(r.seconds)) + '</span>' +
             '<span class="lb-when">' + esc(r.players) + ' ' +
             esc(t('lb.playersShort', 'players')) + '</span>';
    });
  }

  function failed() {
    var note = document.getElementById('lb-status');
    if (note) {
      note.textContent = t('lb.offline',
        'The scoring service is not answering. Try again in a moment.');
      note.hidden = false;
    }
  }

  fetch(API + '/api/stats?limit=10')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(failed);

  /* Classement transversal en points.
   *
   * A cote de « Les plus assidus », qui classe au temps : les deux cartes
   * repondent a deux questions differentes, et les confondre etait le
   * defaut de la page. Quelqu'un qui laisse tourner un jeu quarante heures
   * est assidu, il n'est pas le meilleur joueur.
   *
   * Le rang affiche est celui de la liste : ici, contrairement au profil,
   * la position DANS le classement est bien ce qu'on veut lire.
   */
  fetch(API + '/api/ranking?limit=10')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rows) {
      if (!rows) return;
      fill('lb-top', rows, function (r) {
        return '<span class="lb-main">' + player(r) + '</span>'
             + '<span class="lb-value">' + esc(r.points) + ' '
             + esc(t('lb.top.pts', 'pts')) + '</span>'
             + '<span class="lb-when">' + esc(r.records) + ' '
             + esc(t('lb.me.records', 'world records')) + '</span>';
      });
    })
    .catch(function () {});

  // Requete separee, et son echec est silencieux : le feed est un agrement,
  // les classements sont le propos de la page. Les lier ferait disparaitre
  // les seconds si le premier tombait.
  fetch(API + '/api/activity?limit=12')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (e) { if (e) renderActivity(e); })
    .catch(function () {});

})();
