/* Bootcade : la page profil.
 *
 * Réservée aux joueurs connectés : un visiteur y est invité à se connecter
 * plutôt que de tomber sur une page vide qui ne lui dirait pas pourquoi.
 *
 * C'est aussi ici que vivent le thème et la langue une fois connecté, plutôt
 * que dans la barre du haut, qui se réduit alors au nom du joueur.
 */
(function () {
  'use strict';

  var API = 'https://scores.bootcade.duckdns.org';
  var LANG = document.documentElement.lang || 'en';
  var CAT = (window.I18N && window.I18N[LANG]) || {};
  function t(key, fallback) { return CAT[key] !== undefined ? CAT[key] : fallback; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatTime(seconds) {
    var s = Number(seconds) || 0;
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h > 0) return h + ' h ' + (m < 10 ? '0' : '') + m;
    if (m > 0) return m + ' min';
    return s + ' s';
  }

  function formatScore(row) {
    var v = Number(row.score);
    if (row.metric === 'time') {
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      return ((v >> 16) & 255) + "'" + pad((v >> 8) & 255) + '"' + pad(v & 255);
    }
    if (row.metric === 'par') return v === 0 ? 'EVEN' : (v > 0 ? '+' : '-') + Math.abs(v);
    return v.toLocaleString(LANG);
  }

  function gameLink(row) {
    var href = (LANG === 'en' ? '/catalog/' : '/' + LANG + '/catalog/')
             + '?q=' + encodeURIComponent(row.game);
    return '<a href="' + href + '">' + esc(row.title || row.game) + '</a>';
  }

  function fill(id, rows, render) {
    var host = document.getElementById(id);
    if (!host) return;
    if (!rows || !rows.length) {
      host.innerHTML = '<p class="lb-empty">' +
        esc(t('pf.empty', 'Nothing yet. Play a ranked game and it lands here.')) + '</p>';
      return;
    }
    host.innerHTML = '<ol class="lb-list">' + rows.map(function (r, i) {
      return '<li><span class="lb-rank">' + (i + 1) + '</span>' + render(r) + '</li>';
    }).join('') + '</ol>';
  }

  // Mêmes règles que l'avatar de la barre du haut, pour que ce soit visiblement
  // la même personne : initiales, et teinte dérivée du nom.
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

  /* ── Réglages ────────────────────────────────────────────────────────────
     Thème et langue, déplacés ici depuis la barre du haut. Réimplémentés
     plutôt que de déplacer les éléments existants : app.js les câble par
     identifiant, et deux éléments portant le même id casseraient les deux
     pages à la fois. */
  var LANGS = [['en', 'English'], ['fr', 'Français'], ['es', 'Español'],
               ['de', 'Deutsch'], ['pt', 'Português'], ['ja', '日本語'],
               ['zh', '中文'], ['th', 'ไทย']];

  /* Le compte lui-meme (email, nom, mot de passe, sessions, double
     authentification) se gere dans la console de compte de Keycloak, pas ici.
     On y renvoie plutot que de refaire ces formulaires : ils porteraient la
     politique de mot de passe, la validation, la verification d'email et la
     gestion des sessions, que Keycloak fait deja et mieux, et il faudrait des
     droits d'administration qu'un site statique ne peut pas detenir. */
  function accountConsole() {
    var back = encodeURIComponent(location.href);
    return 'https://auth.bootcade.duckdns.org/realms/bootcade/account/'
         + '?referrer=bootcade-site&referrer_uri=' + back;
  }

  var isSignedIn = false;

  function renderSettings(signedIn) {
    isSignedIn = !!signedIn;
    var host = document.getElementById('pf-settings');
    if (!host) return;

    var current = 'system';
    try { current = localStorage.getItem('fbneo-theme') || 'system'; } catch (e) {}

    var themes = [['system', t('pf.theme.system', 'System')],
                  ['light',  t('pf.theme.light',  'Light')],
                  ['dark',   t('pf.theme.dark',   'Dark')]];

    host.innerHTML =
      (signedIn
        ? '<div class="pf-setting"><h3>' + esc(t('pf.account', 'Account')) + '</h3>'
          + '<p class="lb-profile-hint">' + esc(t('pf.account.hint',
              'Your email, your name, your password and your sessions are managed '
              + 'in your Bootcade account.')) + '</p>'
          + '<p class="pf-choices"><a class="btn btn-accent" href="' + accountConsole()
          + '">' + esc(t('pf.account.cta', 'Manage my account')) + '</a></p></div>'
        : '')
      + '<div class="pf-setting"><h3>' + esc(t('pf.theme', 'Theme')) + '</h3>'
      + '<div class="pf-choices" id="pf-theme">'
      + themes.map(function (o) {
          return '<button type="button" class="btn' + (o[0] === current ? ' btn-accent' : '')
               + '" data-theme-choice="' + o[0] + '">' + esc(o[1]) + '</button>';
        }).join('')
      + '</div></div>'
      + '<div class="pf-setting"><h3>' + esc(t('pf.language', 'Language')) + '</h3>'
      + '<div class="pf-choices">'
      + LANGS.map(function (l) {
          // Chaque langue pointe vers CETTE page dans cette langue : changer de
          // langue depuis son profil ne doit pas renvoyer a l'accueil.
          var href = l[0] === 'en' ? '/profile/' : '/' + l[0] + '/profile/';
          return '<a class="btn' + (l[0] === LANG ? ' btn-accent' : '') + '" href="'
               + href + '" hreflang="' + l[0] + '">' + esc(l[1]) + '</a>';
        }).join('')
      + '</div></div>';

    // L'ecouteur est pose UNE fois, plus bas, et non ici : renderSettings
    // s'appelle lui-meme apres un changement de theme, donc l'attacher ici en
    // empilait un de plus a chaque clic, et la page finissait par se redessiner
    // huit fois pour un seul clic.
  }

  var settingsWired = false;
  function wireSettings() {
    var host = document.getElementById('pf-settings');
    if (!host || settingsWired) return;
    settingsWired = true;
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-theme-choice]');
      if (!b) return;
      var mode = b.getAttribute('data-theme-choice');
      try { localStorage.setItem('fbneo-theme', mode); } catch (err) {}
      if (mode === 'system') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = mode;
      renderSettings(isSignedIn);   // redessine pour marquer le choix courant
    });
  }

  function renderIdentity(user, account) {
    var name = (user && user.preferred_username) || '';
    document.getElementById('pf-identity').innerHTML =
      '<div class="pf-identity">'
      + '<span class="avatar avatar-lg" style="--avatar-hue:' + hue(name) + '">'
      + esc(initials(name)) + '</span>'
      + '<div><h1>' + esc(name) + '</h1>'
      + (account && account.created_at
          ? '<p class="pf-since">' + esc(t('pf.since', 'Member since')) + ' '
            + esc(String(account.created_at).slice(0, 10)) + '</p>'
          : '')
      + '</div></div>';
  }

  function signedOut() {
    document.getElementById('pf-identity').innerHTML =
      '<h1>' + esc(t('pf.h1', 'Your profile')) + '</h1>'
      + '<p class="lb-profile-hint">' + esc(t('pf.needAccount',
          'Sign in to see your scores, your games and your play time.')) + '</p>'
      + '<p class="lb-cta"><button type="button" class="btn btn-accent" id="pf-signin">'
      + esc(t('auth.signin', 'Sign in')) + '</button></p>';
    var b = document.getElementById('pf-signin');
    if (b) b.addEventListener('click', function () { window.BootcadeAuth.login(); });
    // Le theme et la langue restent reglables sans compte : refuser de les
    // afficher enfermerait un visiteur dans une langue qu'il ne lit pas.
    renderSettings(false);
    wireSettings();
  }

  function load() {
    if (!window.BootcadeAuth) return;
    window.BootcadeAuth.token().then(function (tok) {
      if (!tok) { signedOut(); return; }
      var head = { Authorization: 'Bearer ' + tok };
      var get = function (path) {
        return fetch(API + path, { headers: head })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; });
      };
      Promise.all([get('/api/me'), get('/api/me/scores'), get('/api/me/playtime')])
        .then(function (r) {
          var profile = r[0];
          if (!profile) {
            var note = document.getElementById('pf-status');
            note.textContent = t('lb.offline',
              'The scoring service is not answering. Try again in a moment.');
            note.hidden = false;
            renderSettings(true);
            wireSettings();
            return;
          }
          renderIdentity(window.BootcadeAuth.user(), profile.account);

          var totals = profile.totals || {};
          var cells = [
            [totals.scores == null ? 0 : totals.scores, t('lb.me.scores', 'your scores')],
            [totals.games == null ? 0 : totals.games, t('lb.me.games', 'games played')],
            [formatTime(totals.seconds), t('lb.me.time', 'time played')]
          ];
          document.getElementById('pf-totals').innerHTML = cells.map(function (c) {
            return '<div class="lb-stat"><b>' + esc(c[0]) + '</b><span>'
                 + esc(c[1]) + '</span></div>';
          }).join('');

          fill('pf-scores', r[1], function (x) {
            return '<span class="lb-main">' + gameLink(x) + '</span>'
                 + '<span class="lb-value">' + esc(formatScore(x)) + '</span>';
          });
          fill('pf-games', r[2], function (x) {
            return '<span class="lb-main">' + gameLink(x) + '</span>'
                 + '<span class="lb-value">' + esc(formatTime(x.total_secs)) + '</span>';
          });
          renderSettings(true);
          wireSettings();
        });
    });
  }

  // auth-ui.js a deja termine l'echange de jetons : rappeler complete() ici
  // consommerait le code une seconde fois et echouerait.
  window.BootcadeAuth.complete().then(load);
})();
