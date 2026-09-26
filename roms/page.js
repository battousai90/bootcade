/* Bootcade : page d'explication des telechargements de ROMs.
 *
 * Le texte est statique (pre-rendu par build.js dans les huit langues). Seuls
 * le tableau des paliers et les boutons d'action sont dynamiques : le tableau
 * vient du bareme publie par le serveur, les boutons dependent de ce que le
 * visiteur peut faire maintenant.
 */
(function () {
  'use strict';

  var R = window.BootcadeRoms;
  if (!R) return;
  var t = R.t, esc = R.esc;

  function button(label, attrs, accent) {
    return '<a class="btn' + (accent ? ' btn-accent' : '') + '" ' + attrs + '>' + esc(label) + '</a>';
  }

  function renderCta(state) {
    var host = document.getElementById('rp-cta');
    if (!host) return;
    var catalogHref = (R.PREFIX || '') + '/catalog/';
    var html;
    if (!state) {
      // Personne de connecte : l'inscription d'abord, c'est ce que la page
      // vient d'expliquer.
      html = button(t('rp.cta.signup', 'Create a free account'), 'href="#" id="rp-signup"', true)
           + button(t('rp.cta.signin', 'Sign in'), 'href="#" id="rp-signin"')
           + button(t('rp.cta.catalog', 'Open the catalog'), 'href="' + esc(catalogHref) + '"');
    } else if (!state.email_verified) {
      html = button(t('roms.gate.account', 'My account'), 'href="' + esc(R.ACCOUNT) + '"', true)
           + button(t('rp.cta.catalog', 'Open the catalog'), 'href="' + esc(catalogHref) + '"');
    } else {
      html = button(t('rp.cta.catalog', 'Open the catalog'), 'href="' + esc(catalogHref) + '"', true)
           + button(t('rp.cta.profile', 'See my quota'), 'href="' + esc(R.profileHref) + '"');
    }
    host.innerHTML = html;
    var up = document.getElementById('rp-signup');
    if (up) up.addEventListener('click', function (e) { e.preventDefault(); window.BootcadeAuth.register(); });
    var inn = document.getElementById('rp-signin');
    if (inn) inn.addEventListener('click', function (e) { e.preventDefault(); window.BootcadeAuth.login(); });
  }

  function renderStatus(policy, state) {
    var note = document.getElementById('rp-status');
    if (!note) return;
    var msg = null;
    if (policy && policy.enabled === false) {
      msg = t('rp.closed', 'Downloads are closed for the moment. Please come back later.');
    } else if (state && !state.email_verified) {
      msg = t('roms.gate.unverified.text',
        'Open the link we emailed you when you signed up, then come back. You can send it again from your account page.');
    } else if (state) {
      msg = R.fmt(t('rp.you', 'You are {tier}: {r} of {q} ROMs left over the last 24 hours.'),
        { tier: R.tierName(state.tier), r: state.remaining, q: state.quota });
    }
    note.textContent = msg || '';
    note.hidden = !msg;
  }

  function load() {
    Promise.all([R.policy(), R.me()]).then(function (r) {
      var policy = r[0], state = r[1];
      var host = document.getElementById('rp-tiers');
      if (host) {
        host.innerHTML = policy
          ? R.tiersTableHtml(policy, state && state.tier)
          : '<p class="lb-empty">' + esc(t('lb.offline',
              'The scoring service is not answering. Try again in a moment.')) + '</p>';
      }
      renderStatus(policy, state);
      renderCta(state);
    });
  }

  // auth-ui.js a deja lance l'echange du code : on attend qu'il ait fini.
  if (window.BootcadeAuth) window.BootcadeAuth.complete().then(load);
  else load();
})();
