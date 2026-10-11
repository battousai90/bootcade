/* Bootcade : la zone de compte de la barre du haut.
 *
 * Présente sur toutes les pages qui contiennent un élément #nav-account. La
 * connexion se déclenche depuis la landing page, mais l'état s'affiche
 * partout : c'est la même session de navigateur et le même compte Keycloak.
 *
 * L'avatar est DESSINÉ à partir du nom, pas téléversé : initiales sur un
 * disque dont la teinte dérive du nom. Aucun stockage, aucun service tiers à
 * qui confier l'identité des joueurs, et un avatar immédiat dès l'inscription
 * plutôt qu'une silhouette grise en attendant que le joueur en choisisse un.
 */
(function () {
  'use strict';

  var slot = document.getElementById('nav-account');
  if (!slot || !window.BootcadeAuth) return;

  var LANG = document.documentElement.lang || 'en';
  var CAT = (window.I18N && window.I18N[LANG]) || {};

  /* Deux sources, dans cet ordre. window.AUTH_I18N est injecté par build.js
     dans la langue de la page, et n'existe que sur la landing page : y
     charger les 140 Ko du catalogue complet pour trois libellés serait
     disproportionné sur la porte d'entrée du site. Les pages qui ont déjà
     besoin du catalogue (leaderboard, catalogue) passent par window.I18N. */
  function t(key, fallback) {
    var short = key.replace(/^auth\./, '');
    if (window.AUTH_I18N && window.AUTH_I18N[short] !== undefined) {
      return window.AUTH_I18N[short];
    }
    return CAT[key] !== undefined ? CAT[key] : fallback;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Deux initiales au plus. Un nom d'un seul mot donne ses deux premières
     lettres : « battousai90 » rend « BA », ce qui reste reconnaissable, là où
     une seule lettre se confondrait avec la moitié des joueurs. */
  function initials(name) {
    var parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name).slice(0, 2).toUpperCase();
  }

  /* Teinte déterministe : le même joueur garde toujours la même couleur, sur
     toutes les pages et toutes les machines, sans que rien ne soit stocké. */
  function hue(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
  }

  /* L'avatar choisi dans le profil, sinon les initiales. Les initiales ne
     sont pas un pis-aller : elles donnent une image reconnaissable des la
     premiere seconde, la ou une silhouette grise ne dit rien, et un joueur
     qui n'en choisit jamais garde quelque chose qui lui ressemble. */
  function avatar(name, id) {
    if (id) {
      return '<img class="avatar" src="/avatars/' + esc(id) + '.svg" alt="" '
           + 'aria-hidden="true">';
    }
    return '<span class="avatar" style="--avatar-hue:' + hue(name) + '" aria-hidden="true">'
         + esc(initials(name)) + '</span>';
  }

  /* Masque le selecteur de theme et celui de langue de la BARRE. Ils ne sont
     pas supprimes : app.js les cable au chargement, et les retirer du document
     casserait ses ecouteurs. */
  function hideNavPreferences(hide) {
    ['theme-btn', 'lang-btn'].forEach(function (id) {
      var el = document.getElementById(id);
      var box = el && (el.closest('.lang-picker') || el);
      // style.display et non l'attribut `hidden` : ce dernier ne vaut qu'une
      // regle `display:none` du navigateur, que le `display` de .theme-btn
      // ecrase. Le bouton de theme restait donc visible malgre le masquage.
      if (box) box.style.display = hide ? 'none' : '';
    });
  }

  function render(user) {
    if (!user) {
      hideNavPreferences(false);
      // Un seul bouton. L'ecran de connexion Keycloak porte deja son propre
      // lien « Register », donc doubler la porte d'entree ici n'ajoutait rien
      // et encombrait la barre.
      slot.innerHTML =
        '<button type="button" class="btn btn-accent" id="signin-btn">'
        + esc(t('auth.signin', 'Sign in')) + '</button>';
      document.getElementById('signin-btn')
        .addEventListener('click', function () { window.BootcadeAuth.login(); });
      return;
    }
    var name = user.preferred_username || '?';
    // Le nom mene au profil : c'est la qu'on trouve ses scores, et desormais
    // aussi le theme et la langue.
    var lang = document.documentElement.lang || 'en';
    var href = lang === 'en' ? '/profile/' : '/' + lang + '/profile/';
    /* Le menu liste les sections du profil, pour que le joueur sache qu'elles
       existent sans avoir a ouvrir son profil d'abord. Chaque entree mene
       directement a l'onglet (#scores, #activity...). */
    var items = [['scores', 'Scores'], ['activity', 'Activity'],
                 ['achievements', 'Achievements'], ['roms', 'ROMs'],
                 ['settings', 'Settings']];
    var menuLabel = t('auth.menu', 'Menu');
    // Le chip avatar + nom EST le bouton du menu : un seul element, comme le
    // bouton de connexion qu'il remplace, plutot qu'un second bouton a cote.
    slot.innerHTML =
      '<button type="button" class="nav-user" id="nav-burger" aria-haspopup="true" '
      + 'aria-expanded="false" aria-controls="nav-menu" aria-label="' + esc(menuLabel)
      + ' : ' + esc(name) + '">'
      + avatar(name, user.avatar)
      + '<span class="nav-user-name">' + esc(name) + '</span>'
      + '<svg class="nav-burger-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">'
      + '<path d="M2 4h12M2 8h12M2 12h12" fill="none" stroke="currentColor" '
      + 'stroke-width="1.6" stroke-linecap="round"/></svg></button>'
      + '<nav class="nav-menu" id="nav-menu" hidden>'
      + items.map(function (i) {
          return '<a href="' + href + '#' + i[0] + '">'
               + esc(t('pf.tab.' + i[0], i[1])) + '</a>';
        }).join('')
      + '<hr><button type="button" id="signout-btn">'
      + esc(t('auth.signout', 'Sign out')) + '</button></nav>';

    // Une fois connecte, le theme et la langue vivent dans le profil : la barre
    // se reduit au nom. Deconnecte, ils restent ici, sinon un visiteur serait
    // enferme dans une langue qu'il ne lit pas.
    hideNavPreferences(true);
    document.getElementById('signout-btn')
      .addEventListener('click', function () { window.BootcadeAuth.logout(); });
    wireMenu();
  }

  /* Ouverture et fermeture du menu. Les ecouteurs de document ne sont poses
     qu'une fois : render() se rappelle apres chaque changement d'avatar, et
     les empiler fermerait/ouvrirait le menu plusieurs fois par clic. */
  var menuWired = false;
  function wireMenu() {
    var btn = document.getElementById('nav-burger');
    var menu = document.getElementById('nav-menu');
    if (!btn || !menu) return;
    function setOpen(open) {
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(menu.hidden);
    });
    // Un lien vers le profil depuis le profil ne recharge pas la page, il ne
    // change que le #hash : sans fermeture explicite le menu resterait ouvert.
    menu.addEventListener('click', function () { setOpen(false); });
    if (menuWired) return;
    menuWired = true;
    document.addEventListener('click', function (e) {
      var m = document.getElementById('nav-menu');
      if (m && !m.hidden && !e.target.closest('#nav-menu')) {
        m.hidden = true;
        document.getElementById('nav-burger').setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      var m = document.getElementById('nav-menu');
      if (e.key === 'Escape' && m && !m.hidden) {
        m.hidden = true;
        document.getElementById('nav-burger').setAttribute('aria-expanded', 'false');
      }
    });
  }

  // On attend la fin de l'échange de jetons avant de dessiner : sinon un
  // joueur qui revient de Keycloak verrait « Se connecter » une fraction de
  // seconde avant que son nom n'apparaisse.
  window.BootcadeAuth.complete().then(function () {
    // Si ce navigateur s'est deja connecte une fois, on demande a Keycloak
    // en silence s'il reconnait encore la session, plutot que d'afficher
    // « Se connecter » a quelqu'un qui l'est deja ailleurs.
    if (window.BootcadeAuth.trySilentSso()) return;   // la page va rediriger
    render(window.BootcadeAuth.user());
  });

  // Le profil emet cet evenement apres avoir change quelque chose au compte et
  // renouvele le jeton : la barre se redessine alors tout de suite, au lieu
  // d'afficher l'ancien avatar jusqu'au prochain rafraichissement.
  window.addEventListener('bootcade:user-changed', function () {
    render(window.BootcadeAuth.user());
  });
})();
