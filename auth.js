/* Bootcade : connexion des joueurs, adossée à Keycloak.
 *
 * Le site est statique, donc tout se passe dans le navigateur, qui ne peut
 * rien garder de secret : un secret livré dans du JavaScript est lisible par
 * tout le monde et ne prouve rien. C'est la définition d'un client PUBLIC,
 * dont la réponse de la spec OAuth est PKCE, et c'est ce qui est implémenté
 * ici. Keycloak est configuré pour l'EXIGER (pkce.code.challenge.method =
 * S256) : sans lui, un code d'autorisation intercepté sur la redirection
 * suffirait à obtenir un jeton.
 *
 * Aucune dépendance : le site n'a pas d'étape de compilation, et faire venir
 * une bibliothèque d'authentification depuis un CDN reviendrait à confier
 * l'identité de nos joueurs à un tiers.
 *
 * Les jetons vivent en sessionStorage et non en localStorage : ils
 * disparaissent à la fermeture de l'onglet. Un joueur qui revient est
 * reconnecté sans rien saisir, parce que sa session Keycloak, elle, survit
 * dans son cookie : la redirection est silencieuse. On perd donc peu, et on
 * évite qu'un jeton traîne indéfiniment sur une machine partagée.
 */
(function () {
  'use strict';

  var ISSUER = 'https://auth.bootcade.duckdns.org/realms/bootcade';
  var CLIENT_ID = 'bootcade-site';
  var KEY = 'bootcade.auth';       // jetons
  var PKCE = 'bootcade.pkce';      // vérifieur + état, le temps de l'aller-retour

  // ── Outils PKCE ────────────────────────────────────────────────────────
  function random(bytes) {
    var a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return base64url(a);
  }

  function base64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function challenge(verifier) {
    // crypto.subtle n'existe qu'en contexte sécurisé (https, ou localhost).
    // C'est justement pourquoi le client Keycloak n'autorise que https et
    // localhost comme adresses de redirection.
    return crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(verifier))
      .then(function (buf) { return base64url(new Uint8Array(buf)); });
  }

  // ── Stockage ───────────────────────────────────────────────────────────
  function save(tokens) {
    tokens.expires_at = Date.now() + (tokens.expires_in || 60) * 1000;
    try { sessionStorage.setItem(KEY, JSON.stringify(tokens)); } catch (e) {}
  }

  function stored() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); }
    catch (e) { return null; }
  }

  function clear() {
    try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(PKCE); }
    catch (e) {}
  }

  // Le contenu du jeton sert UNIQUEMENT à l'affichage : afficher un nom,
  // décider quel bouton montrer. Rien de sensible ne s'y décide : c'est
  // l'API qui vérifie la signature, et elle seule. Un jeton lu dans le
  // navigateur peut avoir été fabriqué de toutes pièces.
  function claims(token) {
    try {
      var p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(p))));
    } catch (e) { return null; }
  }

  // ── Parcours de connexion ──────────────────────────────────────────────
  function redirectUri() {
    // Sans la query ni le fragment : Keycloak compare l'adresse exacte, et un
    // paramètre de filtre laissé dans l'URL ferait échouer la redirection.
    return location.origin + location.pathname;
  }

  /* `endpoint` vaut 'auth' pour se connecter, 'registrations' pour créer un
     compte. Keycloak expose les deux avec exactement les mêmes paramètres :
     l'inscription n'est donc pas un parcours séparé à maintenir, c'est la
     même danse OAuth qui commence sur un autre écran. Un joueur qui s'inscrit
     est connecté dans la foulée, sans second aller-retour. */
  function start(endpoint) {
    var verifier = random(64);
    var state = random(16);
    try {
      sessionStorage.setItem(PKCE, JSON.stringify({ v: verifier, s: state }));
    } catch (e) {
      // Sans stockage, impossible de finir l'échange en sécurité : mieux vaut
      // ne pas commencer que d'échouer à mi-parcours sans rien expliquer.
      alert('Ce navigateur bloque le stockage de session, la connexion ne peut pas fonctionner.');
      return;
    }
    challenge(verifier).then(function (c) {
      location.href = ISSUER + '/protocol/openid-connect/' + endpoint
        + '?client_id=' + encodeURIComponent(CLIENT_ID)
        + '&redirect_uri=' + encodeURIComponent(redirectUri())
        + '&response_type=code&scope=openid'
        + '&state=' + encodeURIComponent(state)
        + '&code_challenge=' + encodeURIComponent(c)
        + '&code_challenge_method=S256';
    });
  }

  function login() { start('auth'); }
  function register() { start('registrations'); }

  function logout() {
    var t = stored();
    clear();
    var url = ISSUER + '/protocol/openid-connect/logout'
      + '?post_logout_redirect_uri=' + encodeURIComponent(redirectUri())
      + '&client_id=' + encodeURIComponent(CLIENT_ID);
    if (t && t.id_token) url += '&id_token_hint=' + encodeURIComponent(t.id_token);
    location.href = url;
  }

  /* Termine le parcours si on revient de Keycloak. Rend une promesse pour que
     la page puisse attendre avant de se dessiner, plutôt que d'afficher
     « déconnecté » une fraction de seconde avant de se corriger.

     MÉMOÏSÉE : plusieurs scripts de la même page l'appellent (la barre du haut
     et le contenu de la page), et un code d'autorisation ne s'échange qu'UNE
     fois. Sans ce partage, le second appel partait avec le même code et
     Keycloak répondait invalid_code, ce qu'on a effectivement vu dans ses
     journaux. Retirer le code de l'URL ne suffisait pas : les deux appels le
     lisent avant que le premier n'ait fini. */
  var pendingComplete = null;
  function complete() {
    if (pendingComplete) return pendingComplete;
    pendingComplete = doComplete();
    return pendingComplete;
  }

  function doComplete() {
    var q = new URLSearchParams(location.search);
    var code = q.get('code');
    if (!code) return Promise.resolve(stored());

    var pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(PKCE) || 'null'); } catch (e) {}
    // L'état protège d'une redirection forgée par un autre site. Sans cette
    // comparaison, n'importe qui pourrait nous faire échanger SON code.
    if (!pending || pending.s !== q.get('state')) {
      clean();
      return Promise.resolve(null);
    }

    return fetch(ISSUER + '/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code: code,
        redirect_uri: redirectUri(),
        code_verifier: pending.v
      })
    }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (tokens) {
      if (tokens && tokens.access_token) save(tokens);
      try { sessionStorage.removeItem(PKCE); } catch (e) {}
      clean();
      return stored();
    }).catch(function () { clean(); return null; });
  }

  // Retire code et state de la barre d'adresse : les laisser rendrait un
  // rechargement ou un partage de lien inutilisable, et exposerait le code.
  function clean() {
    history.replaceState({}, '', redirectUri());
  }

  /* Le jeton d'accès, rafraîchi s'il est sur le point d'expirer. Rend null
     quand personne n'est connecté : les appelants s'en servent pour décider
     quoi afficher, jamais pour décider d'un droit. */
  function token() {
    var t = stored();
    if (!t || !t.access_token) return Promise.resolve(null);
    // 30 secondes de marge : un jeton qui expire pendant le trajet de la
    // requête produirait un 401 incompréhensible pour le joueur.
    if (Date.now() < t.expires_at - 30000) return Promise.resolve(t.access_token);
    if (!t.refresh_token) { clear(); return Promise.resolve(null); }

    return fetch(ISSUER + '/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: t.refresh_token
      })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (fresh) {
        if (!fresh || !fresh.access_token) { clear(); return null; }
        save(fresh);
        return fresh.access_token;
      }).catch(function () { clear(); return null; });
  }

  function user() {
    var t = stored();
    return t && t.access_token ? claims(t.access_token) : null;
  }

  window.BootcadeAuth = {
    login: login,
    register: register,
    logout: logout,
    complete: complete,
    token: token,
    user: user,
    isLoggedIn: function () { return !!user(); }
  };
})();
