/* Bootcade : acces aux ROMs, partage par le catalogue, le profil et la page
 * d'explication.
 *
 * Le serveur de ROMs decide seul (roms.bootcade.duckdns.org, verifie par
 * CT 106) : ce module ne donne ni ne retire aucun droit. Il sert a PREVENIR
 * le joueur avant son clic, pour qu'il ne decouvre pas la regle en tombant
 * sur l'ecran de connexion de Keycloak.
 *
 * Aucun chiffre du bareme n'est ecrit ici : tout vient de /api/roms/policy,
 * que la console d'administration regle. La page explique donc toujours ce
 * que le serveur applique.
 *
 * Si le service ne repond pas, tout se degrade vers le comportement d'avant :
 * le bouton ROM reste un simple lien, et le serveur de ROMs tranche.
 */
(function () {
  'use strict';

  var API = 'https://scores.bootcade.duckdns.org';
  var ACCOUNT = 'https://auth.bootcade.duckdns.org/realms/bootcade/account';
  var LANG = document.documentElement.lang || 'en';
  var PREFIX = LANG === 'en' ? '' : '/' + LANG;

  function cat() { return (window.I18N && window.I18N[LANG]) || {}; }
  function t(key, fallback) { var c = cat(); return c[key] !== undefined ? c[key] : fallback; }
  function fmt(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] !== undefined ? vars[k] : m;
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getJson(path, token) {
    var opts = token ? { headers: { Authorization: 'Bearer ' + token } } : {};
    return fetch(API + path, opts)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  var policyPromise = null;
  function policy() {
    if (!policyPromise) policyPromise = getJson('/api/roms/policy');
    return policyPromise;
  }

  /* L'etat du joueur connecte, ou null (personne, ou service muet). Le jeton
     vient de auth.js ; sans lui, on ne demande rien. */
  function me() {
    if (!window.BootcadeAuth) return Promise.resolve(null);
    return window.BootcadeAuth.token().then(function (tok) {
      return tok ? getJson('/api/me/roms', tok) : null;
    });
  }

  function suggestions() {
    if (!window.BootcadeAuth) return Promise.resolve(null);
    return window.BootcadeAuth.token().then(function (tok) {
      return tok ? getJson('/api/me/roms/suggestions', tok) : null;
    });
  }

  var TIER_FALLBACK = { base: 'Base', player: 'Player', regular: 'Regular', champion: 'Champion' };
  function tierName(key) { return t('roms.tier.' + key, TIER_FALLBACK[key] || key); }

  var CRIT_FALLBACK = {
    scores: '{n} published scores',
    hours: '{n} hours played',
    achievements: '{n} achievements',
    records: '{n} world record(s) on a leaderboard with at least {p} players',
    prestige: '{n} Prestige achievements'
  };
  function criterion(name, n, minPlayers) {
    return fmt(t('roms.crit.' + name, CRIT_FALLBACK[name]), { n: n, p: minPlayers });
  }

  /* Le meme critere sans chiffre, pour une progression « 2 / 3 scores ». */
  var SHORT_FALLBACK = {
    scores: 'published scores', hours: 'hours played',
    achievements: 'achievements', records: 'world records that count',
    prestige: 'Prestige achievements'
  };
  function criterionShort(name) { return t('roms.short.' + name, SHORT_FALLBACK[name] || name); }

  /* Une date ISO du serveur (UTC) en heure locale du visiteur. */
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    var sameDay = d.toDateString() === new Date().toDateString();
    var time = d.toLocaleTimeString(LANG, { hour: '2-digit', minute: '2-digit' });
    return sameDay ? time : d.toLocaleDateString(LANG, { weekday: 'short' }) + ' ' + time;
  }

  function gamePath(path) { return PREFIX + path; }

  /* Une suggestion en HTML : un lien vers le classement du jeu et une ligne
     de detail chiffree. `unlocks` dit si elle suffit a monter de palier. */
  function suggestionHtml(s) {
    var title, detail;
    if (s.kind === 'achievement') {
      var name = t('ach.' + s.code, s.name);
      title = fmt(t('roms.sg.achievement', 'Close to an achievement: {name}'), { name: esc(name) });
      detail = fmt(t('roms.sg.achievement.d', '{cur} of {target}'), { cur: s.current, target: s.target });
    } else {
      var game = '<a href="' + esc(gamePath(s.path)) + '">' + esc(s.title || s.game) + '</a>';
      if (s.kind === 'first_score') {
        title = fmt(t('roms.sg.first_score', 'Post your first score on {game}'), { game: game });
        detail = fmt(t('roms.sg.first_score.d', 'You have played it for {h} h: one ranked game is enough.'), { h: s.hours });
      } else if (s.kind === 'record_close') {
        title = fmt(t('roms.sg.record_close', 'World record within reach on {game}'), { game: game });
        detail = fmt(t('roms.sg.record_close.d', 'You are #{pos}, {gap}% behind first place.'), { pos: s.pos, gap: s.gap_pct });
      } else {
        title = fmt(t('roms.sg.open_board', 'Take a place on the {game} leaderboard'), { game: game });
        detail = fmt(t('roms.sg.open_board.d', 'Only {n} player(s) so far: any score gets you on the board.'), { n: s.players });
      }
    }
    var badge = s.unlocks
      ? '<span class="roms-unlock">' + esc(fmt(t('roms.sg.unlocks', 'Unlocks {tier}'), { tier: tierName(s.unlocks) })) + '</span>'
      : '';
    return '<li class="roms-sg roms-sg-' + esc(s.kind) + '"><b>' + title + '</b>' + badge
         + '<span>' + esc(detail) + '</span></li>';
  }

  /* Le tableau des paliers, depuis le bareme publie. */
  function tiersTableHtml(p, currentTier) {
    if (!p || !p.tiers) return '';
    var rows = p.tiers.map(function (tier) {
      var how;
      var crit = tier.criteria || {};
      var keys = Object.keys(crit);
      if (!keys.length) {
        how = esc(t('roms.tiers.base', 'Verified account'));
      } else {
        how = keys.map(function (k) {
          return esc(criterion(k, crit[k], p.min_board_players));
        }).join(' <em>' + esc(t('roms.or', 'or')) + '</em> ');
      }
      var mine = tier.key === currentTier ? ' class="is-mine"' : '';
      return '<tr' + mine + '><td><b>' + esc(tierName(tier.key)) + '</b></td>'
           + '<td class="roms-q">' + esc(tier.quota) + '</td><td>' + how + '</td></tr>';
    }).join('');
    return '<table class="roms-tiers"><thead><tr>'
         + '<th>' + esc(t('roms.col.tier', 'Tier')) + '</th>'
         + '<th>' + esc(t('roms.col.quota', 'ROMs per 24 h')) + '</th>'
         + '<th>' + esc(t('roms.col.how', 'How to reach it (any one)')) + '</th>'
         + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  window.BootcadeRoms = {
    API: API, ACCOUNT: ACCOUNT, PREFIX: PREFIX,
    t: t, fmt: fmt, esc: esc, when: when,
    policy: policy, me: me, suggestions: suggestions,
    tierName: tierName, criterion: criterion, criterionShort: criterionShort,
    suggestionHtml: suggestionHtml, tiersTableHtml: tiersTableHtml,
    explainHref: PREFIX + '/roms/',
    profileHref: PREFIX + '/profile/'
  };
})();
