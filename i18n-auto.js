/* i18n-auto.js v1.0 — traduction dynamique des apps, 100 % sur l'appareil.
 * Utilise l'API navigateur « Translator » (Chrome/Edge récents) : aucun texte n'est envoyé à un serveur,
 * donc aucun transfert de données personnelles (RGPD). Sans cette API, l'app reste dans sa langue d'origine.
 * Langue source : window.I18N_SOURCE (défaut « fr »). Choix de l'utilisateur mémorisé dans localStorage (« i18n-lang »).
 * Exclure un élément : attribut translate="no" ou classe « notranslate ». */
(function () {
  'use strict';
  if (window.__i18nAuto) return; window.__i18nAuto = true;
  var SRC = (window.I18N_SOURCE || 'fr').toLowerCase();
  var LANGS = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português', nl: 'Nederlands', ja: '日本語', zh: '中文', ar: 'العربية', ru: 'Русский', tr: 'Türkçe' };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, TEXTAREA: 1, SVG: 1, CANVAS: 1, IFRAME: 1, OPTION: 0 };
  var target = SRC, translator = null, busy = false, observer = null, timer = null;
  var cache = {};                          // texte source -> traduction (pour la langue courante)
  var nodes = new WeakMap();               // nœud texte -> { orig, out }
  var attrs = new WeakMap();               // élément -> { attr: {orig,out} }

  function store(get, k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function wanted() {
    var saved = store(true, 'i18n-lang');
    if (saved && LANGS[saved]) return saved;
    var n = ((navigator.languages && navigator.languages[0]) || navigator.language || SRC).slice(0, 2).toLowerCase();
    return LANGS[n] ? n : SRC;
  }
  function skip(el) {
    for (; el && el.nodeType === 1; el = el.parentNode) {
      if (SKIP[el.tagName] || (el.getAttribute && (el.getAttribute('translate') === 'no' || /\bnotranslate\b/.test(el.className || '')))) return true;
      if (el.id === 'i18n-auto-widget') return true;
    }
    return false;
  }
  function textNodes(root) {
    var out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    for (var n; (n = w.nextNode());) if (/\S/.test(n.nodeValue) && !skip(n.parentNode)) out.push(n);
    return out;
  }
  function translate(str) {
    var key = str.trim();
    if (!key) return Promise.resolve(str);
    if (cache[key] !== undefined) return Promise.resolve(str.replace(key, cache[key]));
    return translator.translate(key).then(function (t) { cache[key] = t; return str.replace(key, t); }, function () { return str; });
  }
  function apply(root) {
    if (!translator || busy) return Promise.resolve();
    busy = true;
    var jobs = [];
    textNodes(root).forEach(function (n) {
      var st = nodes.get(n);
      if (st && st.out === n.nodeValue) return;                 // déjà traduit, inchangé
      var orig = n.nodeValue;
      jobs.push(translate(orig).then(function (t) { nodes.set(n, { orig: orig, out: t }); if (n.nodeValue === orig) n.nodeValue = t; }));
    });
    (root.querySelectorAll ? root.querySelectorAll('[' + ATTRS.join('],[') + ']') : []).forEach(function (el) {
      if (skip(el)) return;
      ATTRS.forEach(function (a) {
        var v = el.getAttribute(a); if (!v || !/\S/.test(v)) return;
        var st = (attrs.get(el) || {})[a]; if (st && st.out === v) return;
        jobs.push(translate(v).then(function (t) { var m = attrs.get(el) || {}; m[a] = { orig: v, out: t }; attrs.set(el, m); if (el.getAttribute(a) === v) el.setAttribute(a, t); }));
      });
    });
    return Promise.all(jobs).then(function () { busy = false; }, function () { busy = false; });
  }
  function restore() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    for (var n; (n = w.nextNode());) { var st = nodes.get(n); if (st && st.out === n.nodeValue) n.nodeValue = st.orig; }
    document.querySelectorAll('[' + ATTRS.join('],[') + ']').forEach(function (el) {
      var m = attrs.get(el); if (!m) return;
      Object.keys(m).forEach(function (a) { if (el.getAttribute(a) === m[a].out) el.setAttribute(a, m[a].orig); });
    });
  }
  function watch() {
    if (observer) return;
    observer = new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(function () { apply(document.body); }, 120); });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function setLang(lang) {
    store(true, 'i18n-lang', lang);
    document.documentElement.setAttribute('lang', lang);
    cache = {};
    if (lang === SRC) { translator = null; restore(); return Promise.resolve(); }
    return window.Translator.availability({ sourceLanguage: SRC, targetLanguage: lang }).then(function (a) {
      if (a === 'unavailable') throw new Error('unavailable');
      return window.Translator.create({ sourceLanguage: SRC, targetLanguage: lang });
    }).then(function (t) { restore(); translator = t; watch(); return apply(document.body); })
      .catch(function () { translator = null; restore(); });
  }
  function widget() {
    var d = document.createElement('div'); d.id = 'i18n-auto-widget'; d.setAttribute('translate', 'no');
    d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483000;font:12px system-ui,sans-serif';
    var s = document.createElement('select'); s.setAttribute('aria-label', 'Language');
    s.style.cssText = 'background:rgba(0,0,0,.65);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:4px 6px;font:inherit;opacity:.75';
    Object.keys(LANGS).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = '🌐 ' + LANGS[k]; s.appendChild(o); });
    s.value = LANGS[target] ? target : SRC;
    s.addEventListener('change', function () { target = s.value; setLang(target); });
    d.appendChild(s); document.body.appendChild(d);
  }
  function start() {
    if (!('Translator' in window)) return;           // navigateur sans traduction locale : on ne fait rien
    target = wanted(); widget();
    if (target !== SRC) setLang(target);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.I18nAuto = { setLang: function (l) { target = l; return setLang(l); }, languages: LANGS };
})();
