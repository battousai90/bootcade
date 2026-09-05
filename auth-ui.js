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

  function avatar(name) {
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
    slot.innerHTML =
      '<a class="nav-user" href="' + href + '">'
      + avatar(name)
      + '<span class="nav-user-name">' + esc(name) + '</span></a>'
      + '<button type="button" class="nav-signout" id="signout-btn" title="'
      + esc(t('auth.signout', 'Sign out')) + '" aria-label="'
      + esc(t('auth.signout', 'Sign out')) + '">'
      + '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">'
      + '<path d="M6 2H3.5A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14H6M10.5 11L14 8l-3.5-3M14 8H6"'
      + ' fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"'
      + ' stroke-linejoin="round"/></svg></button>';

    // Une fois connecte, le theme et la langue vivent dans le profil : la barre
    // se reduit au nom. Deconnecte, ils restent ici, sinon un visiteur serait
    // enferme dans une langue qu'il ne lit pas.
    hideNavPreferences(true);
    document.getElementById('signout-btn')
      .addEventListener('click', function () { window.BootcadeAuth.logout(); });
  }

  // On attend la fin de l'échange de jetons avant de dessiner : sinon un
  // joueur qui revient de Keycloak verrait « Se connecter » une fraction de
  // seconde avant que son nom n'apparaisse.
  window.BootcadeAuth.complete().then(function () {
    render(window.BootcadeAuth.user());
  });
})();
