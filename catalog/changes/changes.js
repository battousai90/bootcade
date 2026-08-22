/* Bootcade — DAT change log.
 *
 * changes.json is generated on the homelab (same cron/run as
 * catalog-data.json, see generate-catalog-data.py) as a history of
 * added/removed games per run, newest first — most runs change nothing and
 * add no entry, so this is usually a short list even though the cron
 * itself fires every 15 minutes.
 */
(function () {
  'use strict';

  var CHANGES_URL = 'https://files.bootcade.duckdns.org/dat/changes.json';

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

  function systemBlock(sys) {
    var groups = '';
    if (sys.added.length) {
      groups += '<div class="chg-group chg-added"><h4>' + escapeHtml(t('catalog.changes.added', 'Added')) +
        ' (' + sys.added.length + ')</h4><ul>' + gameList(sys.added) + '</ul></div>';
    }
    if (sys.removed.length) {
      groups += '<div class="chg-group chg-removed"><h4>' + escapeHtml(t('catalog.changes.removed', 'Removed')) +
        ' (' + sys.removed.length + ')</h4><ul>' + gameList(sys.removed) + '</ul></div>';
    }
    return '<div class="chg-system"><h3>' + escapeHtml(sys.system) + '</h3><div class="chg-system-body">' + groups + '</div></div>';
  }

  function entryCard(entry) {
    var date = new Date(entry.generated);
    var formatted = isNaN(date) ? entry.generated : date.toLocaleString(LANG, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    var systems = (entry.systems || []).slice().sort(function (a, b) { return a.system.localeCompare(b.system); });
    var totals = entry.totals || { added: 0, removed: 0 };

    return (
      '<article class="chg-entry">' +
        '<div class="chg-entry-head">' +
          '<span class="chg-entry-date">' + escapeHtml(formatted) + '</span>' +
          '<span class="chg-entry-totals">' +
            (totals.added ? '<b class="chg-count chg-count-add">+' + totals.added + '</b>' : '') +
            (totals.removed ? '<b class="chg-count chg-count-rem">−' + totals.removed + '</b>' : '') +
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
