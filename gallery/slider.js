/* Bootcade : diaporama de captures de la page d'accueil.
 *
 * Il lit le meme manifeste que la galerie (gallery/shots.json) et ne montre
 * que les entrees qui portent "featured" : un nombre, qui donne leur rang.
 * Choisir les captures de l'accueil se fait donc dans ce seul fichier.
 *
 * La premiere diapositive est deja dans le HTML (image et legende
 * anglaises) : la page s'affiche sans attendre ce script, et sans lui elle
 * garde au moins cette capture.
 */
(function () {
  'use strict';

  var BASE = '/gallery/shots/';
  var DELAY = 6000;
  var LANG = document.documentElement.lang || 'en';

  var root = document.getElementById('shots');
  if (!root) return;
  var stage = root.querySelector('.shots-stage');
  var title = root.querySelector('.shots-title');
  var desc = root.querySelector('.shots-desc');
  var dots = root.querySelector('.shots-dots');
  var prev = root.querySelector('.shots-prev');
  var next = root.querySelector('.shots-next');

  function loc(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    return v[LANG] || v.en || '';
  }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var slides = [];
  var current = 0;
  var timer = null;
  var paused = false;

  function go(i, user) {
    var n = slides.length;
    i = (i + n) % n;
    var imgs = stage.querySelectorAll('.shots-img');
    imgs[current].classList.remove('is-on');
    imgs[i].classList.add('is-on');
    // L'image suivante se charge pendant qu'on regarde celle-ci.
    var after = imgs[(i + 1) % n];
    if (!after.getAttribute('src')) after.src = after.dataset.src;
    if (!imgs[i].getAttribute('src')) imgs[i].src = imgs[i].dataset.src;

    var b = dots.children;
    b[current].removeAttribute('aria-current');
    b[i].setAttribute('aria-current', 'true');
    current = i;
    title.textContent = loc(slides[i].title);
    desc.textContent = loc(slides[i].desc);
    // Un choix du visiteur relance le compte a rebours au lieu de l'ecourter.
    if (user) restart();
  }

  function restart() {
    clearTimeout(timer);
    root.classList.remove('is-ticking');
    if (reduced || paused || slides.length < 2) return;
    void root.offsetWidth;               // relance l'animation de la barre
    root.classList.add('is-ticking');
    timer = setTimeout(function () { go(current + 1); restart(); }, DELAY);
  }

  function pause(on) {
    paused = on;
    root.classList.toggle('is-paused', on);
    restart();
  }

  function build(list) {
    slides = list;
    var first = stage.querySelector('.shots-img');
    stage.innerHTML = '';
    list.forEach(function (s, i) {
      var img;
      // Garde l'image deja chargee par le HTML si c'est la meme.
      if (i === 0 && first && first.getAttribute('src') === BASE + s.file) img = first;
      else {
        img = document.createElement('img');
        img.className = 'shots-img';
        img.decoding = 'async';
        img.dataset.src = BASE + s.file;
        if (s.w && s.h) { img.width = s.w; img.height = s.h; }
      }
      img.alt = loc(s.title);
      img.classList.toggle('is-on', i === 0);
      stage.appendChild(img);
    });
    if (!stage.firstChild.getAttribute('src')) stage.firstChild.src = stage.firstChild.dataset.src;

    dots.innerHTML = list.map(function (s, i) {
      return '<button type="button" aria-label="' + (i + 1) + ' / ' + list.length + '"'
        + (i === 0 ? ' aria-current="true"' : '') + '><i></i></button>';
    }).join('');
    title.textContent = loc(list[0].title);
    desc.textContent = loc(list[0].desc);
    root.classList.add('is-ready');
    current = 0;
    go(0);
    restart();
  }

  dots.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) go(Array.prototype.indexOf.call(dots.children, b), true);
  });
  prev.addEventListener('click', function () { go(current - 1, true); });
  next.addEventListener('click', function () { go(current + 1, true); });

  // Pause tant que le visiteur regarde de pres, ou que l'onglet est cache.
  root.addEventListener('mouseenter', function () { pause(true); });
  root.addEventListener('mouseleave', function () { pause(false); });
  root.addEventListener('focusin', function () { pause(true); });
  root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) pause(false); });
  document.addEventListener('visibilitychange', function () { pause(document.hidden); });

  root.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1, true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1, true); }
  });

  var x0 = null, y0 = null;
  stage.addEventListener('touchstart', function (e) {
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(current + (dx < 0 ? 1 : -1), true);
  });

  fetch('/gallery/shots.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var list = (Array.isArray(data) ? data : [])
        .filter(function (s) { return s && s.file && s.featured; })
        .sort(function (a, b) { return a.featured - b.featured; });
      if (list.length) build(list);
    })
    .catch(function () { /* la capture du HTML reste affichee */ });
})();
