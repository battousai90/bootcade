/* Bootcade — DAT change log.
 *
 * changes.json is a history of games added to or removed from the DAT
 * files, newest first. An entry is only recorded when something actually
 * changed, so the list stays short.
 *
 * Kept free of any detail about how or how often it is produced: this file
 * is served publicly, and the page it drives says the same thing.
 */
(function () {
  'use strict';

  var CHANGES_URL = 'https://files.bootcade.duckdns.org/dat/changes.json';
  // One folder per change date, created alongside the change itself, so
  // this link always resolves — a change with no fixed ROM yet simply
  // points at an empty folder. Behind HTTP Basic Auth, with its own
  // credentials, separate from the ones guarding the ROM collection.
  var ROMFIX_BASE = 'https://roms.bootcade.duckdns.org/romfix/';

  var LANG = document.documentElement.lang || 'en';
  var CAT = (window.I18N && window.I18N[LANG]) || {};
  function t(key, fallback) { return CAT[key] !== undefined ? CAT[key] : fallback; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var statusEl = document.getElementById('chg-status');
  var listEl = document.getElementById('chg-list');

  function gameList(games) {
    return games.map(function (g) {
      var meta = [g.y, g.mf].filter(Boolean).join(' · ');
      return '<li><b>' + escapeHtml(g.d || g.n) + '</b>' + (meta ? '<span>' + escapeHtml(meta) + '</span>' : '') + '</li>';
    }).join('');
  }

  // Un jeu modifié garde son nom : sans dire CE QUI a changé, la ligne
  // serait indistinguable d'un jeu inchangé.
  //
  // On ne liste PAS les champs bruts : « titre, année, éditeur, rom » ne
  // veut rien dire pour un visiteur. Et pas de pastille non plus : les
  // groupes « ajoutés » et « retirés » n'ont qu'un titre coloré et une
  // liste, un ornement supplémentaire ici romprait la charte. Le titre de
  // groupe suffit à dire qu'il s'agit d'une mise à jour ; l'ancien titre
  // en clair dit ce qui a bougé, dans la même typographie que la ligne de
  // métadonnées.
  function modifiedList(games) {
    return games.map(function (g) {
      var meta = [g.y, g.mf].filter(Boolean).join(' · ');
      var was = g.was
        ? '<span>' + escapeHtml(t('catalog.changes.previously', 'previously {d}').replace('{d}', g.was)) + '</span>'
        : '';
      return '<li><b>' + escapeHtml(g.d || g.n) + '</b>' + was +
        (meta ? '<span>' + escapeHtml(meta) + '</span>' : '') + '</li>';
    }).join('');
  }

  function systemBlock(sys) {
    var groups = '';
    if (sys.added && sys.added.length) {
      groups += '<div class="chg-group chg-added"><h4>' + escapeHtml(t('catalog.changes.added', 'Added')) +
        ' (' + sys.added.length + ')</h4><ul>' + gameList(sys.added) + '</ul></div>';
    }
    if (sys.modified && sys.modified.length) {
      groups += '<div class="chg-group chg-modified"><h4>' + escapeHtml(t('catalog.changes.modified', 'Updated')) +
        ' (' + sys.modified.length + ')</h4><ul>' + modifiedList(sys.modified) + '</ul></div>';
    }
    if (sys.removed && sys.removed.length) {
      groups += '<div class="chg-group chg-removed"><h4>' + escapeHtml(t('catalog.changes.removed', 'Removed')) +
        ' (' + sys.removed.length + ')</h4><ul>' + gameList(sys.removed) + '</ul></div>';
    }
    return '<div class="chg-system"><h3>' + escapeHtml(sys.system) + '</h3><div class="chg-system-body">' + groups + '</div></div>';
  }

  function entryCard(entry) {
    // Rendered in UTC, not the visitor's zone, so the date shown here is
    // always the same one as the RomFix folder linked next to it (built
    // from generated[:10], which is UTC). Showing local time instead makes
    // a change generated at 23:30 UTC read as "the 28th" while its folder
    // is named 2026-08-27 — an off-by-one that has already caused a
    // mis-named folder in practice.
    var date = new Date(entry.generated);
    var formatted = isNaN(date) ? entry.generated : date.toLocaleString(LANG, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'UTC', timeZoneName: 'short',
    });
    var systems = (entry.systems || []).slice().sort(function (a, b) { return a.system.localeCompare(b.system); });
    var totals = entry.totals || { added: 0, removed: 0 };

    var day = (entry.generated || '').slice(0, 10);
    var romfix = day
      ? '<a class="chg-romfix" href="' + ROMFIX_BASE + encodeURIComponent(day) + '/" rel="noopener">' +
          escapeHtml(t('catalog.changes.romFix', 'Fixed ROMs')) + '</a>'
      : '';

    return (
      '<article class="chg-entry">' +
        '<div class="chg-entry-head">' +
          '<span class="chg-entry-date">' + escapeHtml(formatted) + '</span>' +
          '<span class="chg-entry-totals">' +
            (totals.added ? '<b class="chg-count chg-count-add">+' + totals.added + '</b>' : '') +
            (totals.modified ? '<b class="chg-count chg-count-mod">~' + totals.modified + '</b>' : '') +
            (totals.removed ? '<b class="chg-count chg-count-rem">−' + totals.removed + '</b>' : '') +
            romfix +
          '</span>' +
        '</div>' +
        systems.map(systemBlock).join('') +
      '</article>'
    );
  }

  fetch(CHANGES_URL)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (entries) {
      entries = entries || [];
      if (!entries.length) {
        statusEl.textContent = t('catalog.changes.empty', 'No changes recorded yet — check back after the next DAT update.');
        return;
      }
      statusEl.hidden = true;
      listEl.innerHTML = entries.map(entryCard).join('');
    })
    .catch(function () {
      statusEl.textContent = t('catalog.changes.error', 'Could not load the change history right now — please try again later.');
    });
})();
