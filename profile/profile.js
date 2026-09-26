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

  /* Le rang d'un joueur sur un jeu.
   *
   * Medaille pour le podium, numero au-dela : trois pictogrammes se
   * reconnaissent sans lire, une 7e place a besoin de son chiffre. Tout
   * numeroter aurait noye le podium, tout medailler l'aurait vide de sens.
   *
   * Ce rang est celui de la MEILLEURE ligne du joueur sur ce jeu, calcule
   * par le serveur : un joueur qui occupe les places 2 et 4 est 2e, pas 4e.
   */
  var MEDALS = { 1: '\uD83E\uDD47', 2: '\uD83E\uDD48', 3: '\uD83E\uDD49' };

  /* Les huit distinctions.
   *
   * L'API les rend en anglais, avec leur code : c'est le CODE qui sert de
   * cle de traduction ici. Le service reste ainsi neutre en langue, et les
   * huit langues du site vivent au meme endroit que tout le reste plutot
   * que d'etre a maintenir en double dans CT 106.
   */
  /* Vingt-quatre distinctions depuis le 2026-09-26 : dix-huit normales et
   * six Prestige. L'icone et le niveau viennent de l'API (le catalogue vit
   * sur CT 106, un seul endroit) ; le nom et la condition sont traduits ici
   * par le code, l'anglais de l'API servant de repli.
   *
   * Les Prestige passent en premier, dans des cartes a part : ce sont elles
   * qui ouvrent le palier Champion des telechargements, et la page doit le
   * faire voir.
   */
  function achItem(a) {
    var got = !!a.earned_at;
    var name = t('ach.' + a.code, a.name);
    var cond = t('ach.' + a.code + '.cond', a.condition);
    return '<div class="pf-ach-item' + (got ? '' : ' is-locked')
         + (a.level === 'prestige' ? ' is-prestige' : '') + '">'
         + '<span class="pf-ach-ico" aria-hidden="true">' + esc(a.icon || '') + '</span>'
         + '<span class="pf-ach-body"><b>' + esc(name) + '</b>'
         + '<span>' + esc(cond) + '</span></span></div>';
  }

  function renderAchievements(data) {
    var wrap = document.getElementById('pf-ach-wrap');
    var host = document.getElementById('pf-ach');
    if (!wrap || !host || !data) return;
    wrap.hidden = false;
    document.getElementById('pf-ach-count').textContent =
      data.earned + ' / ' + data.total;
    var group = function (level, title, fallback) {
      var items = data.items.filter(function (a) { return (a.level || 'normal') === level; });
      if (!items.length) return '';
      var n = items.filter(function (a) { return a.earned_at; }).length;
      return '<h3 class="pf-ach-h3' + (level === 'prestige' ? ' is-prestige' : '') + '">'
           + esc(t(title, fallback)) + ' <b>' + n + ' / ' + items.length + '</b></h3>'
           + (level === 'prestige'
              ? '<p class="lb-profile-hint pf-ach-note">' + esc(t('pf.ach.prestige.note',
                  'Prestige achievements rest on leaderboards contested by several players. Three of them unlock the Champion download tier.')) + '</p>'
              : '')
           + '<div class="pf-ach">' + items.map(achItem).join('') + '</div>';
    };
    host.innerHTML = group('prestige', 'pf.ach.prestige', 'Prestige')
                   + group('normal', 'pf.ach.normal', 'Normal');
  }

  /* Telechargements de ROMs.
   *
   * Ce que le joueur doit pouvoir lire ici sans chercher : ou il en est
   * (palier, jauge, prochaine place libre), ce qui compte en ce moment (une
   * ROM reprise dans les 24 h ne recompte pas, encore faut-il savoir
   * lesquelles), et ce qui le ferait monter, chiffre. Les suggestions
   * viennent du serveur ; ce module ne fait que les presenter.
   */
  function renderRoms(state, sg) {
    var wrap = document.getElementById('pf-roms-wrap');
    var host = document.getElementById('pf-roms');
    var R = window.BootcadeRoms;
    if (!wrap || !host || !state || !R) return;
    wrap.hidden = false;
    var fmt = R.fmt;
    var pctUsed = state.quota ? Math.min(100, Math.round(100 * state.used / state.quota)) : 100;
    var html = '<div class="roms-row"><span>' + esc(t('pf.roms.tier', 'Tier')) + ' <b>'
      + esc(R.tierName(state.tier)) + '</b></span><span>'
      + esc(fmt(t('pf.roms.used', '{u} of {q} used over the last 24 hours'),
                { u: state.used, q: state.quota })) + '</span></div>'
      + '<div class="roms-gauge"><span class="' + (state.remaining ? '' : 'is-full')
      + '" style="width:' + pctUsed + '%"></span></div>';
    if (state.next_slot_at) {
      html += '<div class="roms-row"><span>' + esc(fmt(t('pf.roms.slot', 'Next free slot: {time}'),
        { time: R.when(state.next_slot_at) })) + '</span></div>';
    }
    if (state.romfix) {
      html += '<div class="roms-row"><span>' + esc(fmt(t('pf.roms.romfix',
        'Fixed ROMs: {u} of {q} used over the last 24 hours (separate quota)'),
        { u: state.romfix.used, q: state.romfix.quota })) + '</span></div>';
    }
    if (state.override && state.override.mode === 'bonus') {
      html += '<p class="lb-profile-hint">' + esc(fmt(t('pf.roms.bonus',
        'Includes a bonus of {n} granted by the administrator.'), { n: state.override.value })) + '</p>';
    } else if (state.override && state.override.mode === 'fixed') {
      html += '<p class="lb-profile-hint">' + esc(t('pf.roms.fixed',
        'Your quota was set by the administrator.')) + '</p>';
    }
    if (state.reason === 'unverified') {
      html += '<p class="pf-roms-alert">' + esc(t('pf.roms.unverified',
        'Verify your email address to download ROMs.')) + ' <a href="' + esc(R.ACCOUNT) + '">'
        + esc(t('roms.gate.account', 'My account')) + '</a></p>';
    } else if (state.reason === 'blocked' || state.reason === 'closed' || state.reason === 'no_role') {
      html += '<p class="pf-roms-alert">' + esc(t('roms.gate.' + state.reason + '.title',
        state.reason === 'closed' ? 'Downloads are closed for now' : 'Downloads unavailable for this account'))
        + '</p>';
    }

    var items = (state.items || []).slice().reverse();
    html += '<div class="pf-roms-cols"><div><h3>' + esc(t('pf.roms.window', 'Counted right now')) + '</h3>'
      + (items.length
        ? '<ul class="pf-roms-items">' + items.map(function (i) {
            return '<li><b>' + esc(i.rom) + '</b><span>' + esc(R.when(i.at)) + '</span></li>';
          }).join('') + '</ul>'
        : '<p class="lb-empty">' + esc(t('pf.roms.window.empty', 'Nothing downloaded in the last 24 hours.')) + '</p>')
      + '</div><div>';
    if (state.next) {
      html += '<h3>' + esc(fmt(t('pf.roms.next', 'Next tier: {tier}, {q} ROMs per 24 h'),
        { tier: R.tierName(state.next.key), q: state.next.quota })) + '</h3>'
        + '<p class="lb-profile-hint">' + esc(t('pf.roms.next.any', 'Any one of these is enough:')) + '</p>'
        + '<ul class="pf-roms-conds">' + state.next.conditions.map(function (c) {
            var p = c.target ? Math.min(100, Math.round(100 * c.current / c.target)) : 100;
            return '<li><b>' + esc(c.current) + ' / ' + esc(c.target) + '</b> '
              + esc(R.criterionShort(c.criterion))
              + '<div class="roms-gauge"><span style="width:' + p + '%"></span></div></li>';
          }).join('') + '</ul>';
    } else {
      html += '<h3>' + esc(t('pf.roms.top', 'You have reached the top tier.')) + '</h3>';
    }
    html += '</div></div>';

    var list = (sg && sg.items) || [];
    html += '<h3 style="margin-top:26px">' + esc(t('pf.roms.sg.h3', 'Ideas to climb faster')) + '</h3>'
      + (list.length
        ? '<ul class="roms-sgs">' + list.map(R.suggestionHtml).join('') + '</ul>'
        : '<p class="lb-profile-hint">' + esc(t('pf.roms.sg.empty',
            'Play a game with the Highscore badge in the Bootcade launcher: every published score counts.')) + '</p>')
      + '<p class="lb-profile-hint" style="margin-top:16px"><a href="' + esc(R.explainHref) + '">'
      + esc(t('roms.gate.how', 'How quotas work')) + '</a></p>';
    host.innerHTML = html;
  }

  function rankBadge(row) {
    var pos = row.pos;
    if (MEDALS[pos]) return '<span class="pf-medal" title="#' + pos + '">' + MEDALS[pos] + '</span>';
    return '#' + esc(pos);
  }

  function fill(id, rows, render, rankOf) {
    var host = document.getElementById(id);
    if (!host) return;
    if (!rows || !rows.length) {
      host.innerHTML = '<p class="lb-empty">' +
        esc(t('pf.empty', 'Nothing yet. Play a ranked game and it lands here.')) + '</p>';
      return;
    }
    host.innerHTML = '<ol class="lb-list">' + rows.map(function (r, i) {
      // Le rang affiche n'est pas toujours la position dans la liste : sur
      // « Your scores » c'est le rang MONDIAL du joueur sur ce jeu, ce qui
      // est la seule chose qu'on cherche a y lire.
      var rank = rankOf ? rankOf(r, i) : (i + 1);
      return '<li><span class="lb-rank">' + rank + '</span>' + render(r) + '</li>';
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

  /* ── Avatar ──────────────────────────────────────────────────────────────
     Le choix est enregistre dans le COMPTE, via l'API de compte de Keycloak,
     avec le jeton du joueur : aucun droit d'administration, et l'avatar suit
     le joueur partout, y compris dans le launcher plus tard.

     Il n'est pas garde dans la base des scores : ce serait une seconde verite
     a synchroniser, exactement le probleme qu'on a evite pour le nom. */
  var ACCOUNT = 'https://auth.bootcade.duckdns.org/realms/bootcade/account/';
  var avatars = null;          // la collection, chargee une fois
  var chosen = null;           // l'avatar ENREGISTRE, celui du compte
  var picked = null;           // celui SELECTIONNE, pas encore soumis

  function loadAvatars() {
    if (avatars) return Promise.resolve(avatars);
    return fetch('/avatars/index.json')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) { avatars = list; return list; })
      .catch(function () { avatars = []; return avatars; });
  }

  function saveAvatar(id) {
    return window.BootcadeAuth.token().then(function (tok) {
      if (!tok) return false;
      // `Accept: application/json` n'est PAS decoratif : sans lui, Keycloak
      // sert la page HTML de la console de compte au lieu de la
      // representation, r.json() echoue, et l'avatar n'etait jamais
      // enregistre. L'ecriture, elle, marchait deja.
      var head = {
        Authorization: 'Bearer ' + tok,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      };
      // On relit le compte avant d'ecrire : l'API remplace la representation
      // entiere, donc envoyer seulement l'avatar effacerait email, prenom et
      // nom au passage.
      return fetch(ACCOUNT, { headers: head })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (acc) {
          if (!acc) return false;
          acc.attributes = acc.attributes || {};
          acc.attributes.avatar = [id];
          return fetch(ACCOUNT, {
            method: 'POST', headers: head, body: JSON.stringify(acc)
          }).then(function (r) { return r.ok; });
        });
    }).catch(function () { return false; });
  }

  function avatarMarkup(id, name) {
    return id
      ? '<img class="avatar avatar-lg" src="/avatars/' + esc(id) + '.svg" alt="">'
      : '<span class="avatar avatar-lg" style="--avatar-hue:' + hue(name) + '">'
        + esc(initials(name)) + '</span>';
  }

  function renderAvatarPicker() {
    if (!avatars || !avatars.length) return '';
    var dirty = picked && picked !== chosen;
    return '<div class="pf-setting"><h3>' + esc(t('pf.avatar', 'Avatar')) + '</h3>'
      + '<p class="lb-profile-hint">' + esc(t('pf.avatar.hint',
          'Pick one, then save. It follows you everywhere, and you can change it whenever you like.'))
      + '</p><div class="pf-avatars" id="pf-avatars">'
      + avatars.map(function (a) {
          // La selection en cours prime sur l'enregistre : c'est elle que le
          // joueur vient de designer, et c'est ce qu'il s'attend a voir marque.
          var cur = picked || chosen;
          return '<button type="button" class="pf-avatar'
               + (a.id === cur ? ' is-chosen' : '') + '" data-avatar="'
               + esc(a.id) + '" title="' + esc(a.name) + '" aria-label="' + esc(a.name)
               + '"><img src="/avatars/' + esc(a.id) + '.svg" alt=""></button>';
        }).join('')
      + '</div>'
      // Le bouton n'apparait que s'il y a quelque chose a enregistrer : un
      // bouton toujours actif laisse croire qu'on a oublie de cliquer.
      + '<p class="pf-avatar-actions">'
      + '<button type="button" class="btn btn-accent" id="pf-avatar-save"'
      + (dirty ? '' : ' disabled') + '>' + esc(t('pf.avatar.save', 'Save avatar')) + '</button>'
      + '<span class="pf-avatar-note" id="pf-avatar-note"></span></p>'
      + '</div>';
  }

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
      (signedIn ? renderAvatarPicker() : '')
      + (signedIn
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

    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-avatar]');
      if (!b) return;
      // Le clic SELECTIONNE seulement. L'enregistrement se fait au bouton :
      // un choix qui part au reseau des le clic ne dit pas au joueur ce qui
      // s'est passe, et ne lui laisse pas changer d'avis.
      picked = b.getAttribute('data-avatar');
      renderSettings(isSignedIn);
    });

    host.addEventListener('click', function (e) {
      if (!e.target.closest('#pf-avatar-save')) return;
      if (!picked || picked === chosen) return;
      var id = picked;
      var btn = document.getElementById('pf-avatar-save');
      var note = document.getElementById('pf-avatar-note');
      if (btn) { btn.disabled = true; }
      if (note) { note.className = 'pf-avatar-note'; note.textContent = t('pf.avatar.saving', 'Saving...'); }
      saveAvatar(id).then(function (ok) {
        var n = document.getElementById('pf-avatar-note');
        if (ok) {
          chosen = id;
          picked = null;
          // Le jeton porte l'avatar : sans ce renouvellement la barre du haut
          // garderait l'ancien plusieurs minutes.
          window.BootcadeAuth.refresh();
          var big = document.querySelector('.pf-identity .avatar');
          if (big) big.outerHTML = avatarMarkup(id, '');
          renderSettings(isSignedIn);
          n = document.getElementById('pf-avatar-note');
          if (n) { n.className = 'pf-avatar-note is-ok'; n.textContent = t('pf.avatar.saved', 'Saved'); }
        } else if (n) {
          n.className = 'pf-avatar-note is-bad';
          n.textContent = t('pf.avatar.failed',
            'Your avatar could not be saved. Try again in a moment.');
          var b2 = document.getElementById('pf-avatar-save');
          if (b2) b2.disabled = false;
        }
      });
    });
  }

  /* Le drapeau est derive du code ISO, pas d'une image : deux points de code
     Unicode suffisent, donc aucun fichier a servir, aucune liste d'icones a
     tenir a jour, et ca suit la police du systeme. Meme methode que le
     classement, pour que ce soit le meme drapeau des deux cotes. */
  function countryFlag(code) {
    if (!code || code.length !== 2) return '';
    var base = 0x1F1E6;
    return String.fromCodePoint(
      base + code.toUpperCase().charCodeAt(0) - 65,
      base + code.toUpperCase().charCodeAt(1) - 65);
  }

  function renderIdentity(user, account) {
    var name = (user && user.preferred_username) || '';
    document.getElementById('pf-identity').innerHTML =
      '<div class="pf-identity">'
      + avatarMarkup((user && user.avatar) || null, name)
      + '<div><h1>' + esc(name) + '</h1>'
      + (account && account.created_at
          ? '<p class="pf-since">' + esc(t('pf.since', 'Member since')) + ' '
            + esc(String(account.created_at).slice(0, 10)) + '</p>'
          : '')
      // Le pays sous la date d'inscription. Absent tant que le joueur ne l'a
      // pas choisi dans son compte : afficher celui devine depuis son adresse
      // IP donnerait l'impression qu'il l'a declare, et il ne penserait pas a
      // le corriger.
      + (account && account.country
          ? '<p class="pf-country">' + countryFlag(account.country) + ' '
            + esc(account.country) + '</p>'
          : '<p class="pf-country pf-country-unset">'
            + esc(t('pf.noCountry', 'No country set')) + '</p>')
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
      Promise.all([get('/api/me'), get('/api/me/scores'),
                   get('/api/me/playtime'), get('/api/me/records'),
                   get('/api/me/achievements'), get('/api/me/roms'),
                   get('/api/me/roms/suggestions')])
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
          var u = window.BootcadeAuth.user();
          chosen = (u && u.avatar) || null;
          renderIdentity(u, profile.account);

          var totals = profile.totals || {};
          var recs = r[3] || { records: 0, ranks: [] };
          // Quatre cartes, et la derniere est celle qui compte : le nombre de
          // premieres places detenues dit ce que le joueur VAUT, la ou un
          // total de scores envoyes ne dit que sa perseverance.
          var cells = [
            [totals.scores == null ? 0 : totals.scores, t('lb.me.scores', 'your scores')],
            [totals.games == null ? 0 : totals.games, t('lb.me.games', 'games played')],
            [formatTime(totals.seconds), t('lb.me.time', 'time played')],
            ['\uD83C\uDFC6 ' + (recs.records || 0), t('lb.me.records', 'world records')]
          ];
          document.getElementById('pf-totals').innerHTML = cells.map(function (c) {
            return '<div class="lb-stat"><b>' + esc(c[0]) + '</b><span>'
                 + esc(c[1]) + '</span></div>';
          }).join('');

          // `ranks` et non `/api/me/scores` : une ligne par JEU, portant le
          // meilleur score et son rang. La liste brute des envois repetait le
          // meme jeu autant de fois qu'on y avait progresse, et ne disait
          // jamais ou l'on se situe, qui est la seule question qu'on se pose.
          fill('pf-scores', recs.ranks, function (x) {
            return '<span class="lb-main">' + gameLink(x) + '</span>'
                 + '<span class="lb-value">' + esc(formatScore(x)) + '</span>';
          }, rankBadge);

          renderAchievements(r[4]);
          renderRoms(r[5], r[6]);
          fill('pf-games', r[2], function (x) {
            return '<span class="lb-main">' + gameLink(x) + '</span>'
                 + '<span class="lb-value">' + esc(formatTime(x.total_secs)) + '</span>';
          });
          loadAvatars().then(function () {
            renderSettings(true);
            wireSettings();
          });
        });
    });
  }

  // auth-ui.js a deja termine l'echange de jetons : rappeler complete() ici
  // consommerait le code une seconde fois et echouerait.
  window.BootcadeAuth.complete().then(load);
})();
