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
    // Le catalogue sait déjà présenter un jeu : la page renvoie vers lui plutôt
    // que de redire ce qu'il dit mieux.
    var href = (LANG === 'en' ? '/catalog/' : '/' + LANG + '/catalog/')
             + '?q=' + encodeURIComponent(row.game);
    return '<a href="' + href + '">' + esc(row.title || row.game) + '</a>';
  }

  function player(row) {
    var flag = countryFlag(row.country);
    return esc(row.player) + (flag ? ' ' + flag : '');
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
})();
