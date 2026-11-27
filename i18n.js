/* Applies translations to the visible UI. Hand-curated strings take priority
   over the original-site dictionary (which only covers SEO long-form text). */
(function () {
  var STORAGE_KEY = 'yttool_lang';

  function getLang() {
    var m = new URLSearchParams(window.location.search).get('lang');
    if (m) return m.toLowerCase();
    // No ?lang= param (e.g. after clicking an internal nav link): reuse the
    // language the visitor picked earlier so it persists across pages.
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) return saved.toLowerCase();
    } catch (e) {}
    return '';
  }

  function rememberLang(lang) {
    // Only remember an explicit choice carried in the URL, so a fresh visitor
    // still sees the default English site.
    if (new URLSearchParams(window.location.search).get('lang')) {
      try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    }
  }

  // Carry the active language on internal links (nav, footer, etc.) so a full
  // page navigation keeps the same language. The language switcher itself is
  // handled separately in setMenuState.
  function tagInternalLinks(lang) {
    if (!lang || lang === 'en') return;
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.closest('.lang-item')) continue;
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#') continue;
      var u;
      try { u = new URL(href, window.location.href); } catch (e) { continue; }
      if (u.origin !== window.location.origin) continue;
      if (u.searchParams.has('lang')) continue;
      u.searchParams.set('lang', lang);
      a.setAttribute('href', u.pathname + u.search + u.hash);
    }
  }

  function activeDict(lang) {
    var hand = (window.YT_UI_I18N && window.YT_UI_I18N[lang]) || {};
    var site = (window.YT_I18N_DATA && window.YT_I18N_DATA[lang]) || {};
    var merged = {};
    Object.keys(site).forEach(function (k) { merged[k] = site[k]; });
    Object.keys(hand).forEach(function (k) { merged[k] = hand[k]; });
    return merged;
  }

  function setMenuState(lang) {
    var links = document.querySelectorAll('.lang-item a.lang-item');
    var active = null;
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var code = (a.getAttribute('lang') || a.getAttribute('hreflang') || '').toLowerCase();
      a.href = window.location.pathname + '?lang=' + code.split('-')[0];
      if (code === lang || code.split('-')[0] === lang) active = a;
    }
    if (!active && lang !== 'en') return;
    var nameEl = active && active.querySelector('span');
    var topEl = document.querySelector('#menu-item-156 > a span');
    if (nameEl && topEl) topEl.textContent = nameEl.textContent;
    // The toggle's flag is a hard-coded US flag in the mirrored markup,
    // so swap in the active language's own flag image from the dropdown.
    var topFlag = document.querySelector('#menu-item-156 > a img');
    var activeFlag = active && active.querySelector('img');
    if (topFlag && activeFlag && activeFlag.getAttribute('src')) {
      topFlag.setAttribute('src', activeFlag.getAttribute('src'));
    }
    if (active) document.documentElement.lang = active.getAttribute('lang') || lang;
    var items = document.querySelectorAll('.lang-item');
    for (var j = 0; j < items.length; j++) items[j].classList.remove('current-lang', 'current_page_item');
    if (active) active.parentElement.classList.add('current-lang');
  }

  // Prefixes followed by a dynamic value (e.g. "Duration: 3:21").
  var DYNAMIC_PREFIXES = ['Channel:', 'Duration:', 'Size:', 'Approx.'];

  function translateText(key, dict) {
    if (dict[key]) return dict[key];
    for (var i = 0; i < DYNAMIC_PREFIXES.length; i++) {
      var p = DYNAMIC_PREFIXES[i];
      if (dict[p] && key.indexOf(p) === 0 && key.length > p.length) {
        return dict[p] + key.slice(p.length);
      }
    }
    return null;
  }

  function apply() {
    var lang = getLang();
    if (lang) rememberLang(lang);
    if (!lang || lang === 'en') return;
    var dict = activeDict(lang);
    if (!Object.keys(dict).length) return;
    setMenuState(lang);
    tagInternalLinks(lang);

    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (/^(script|style|noscript|svg|code|pre)$/i.test(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest('[data-i18n-skip]') || p.closest('.lang-item')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      var key = raw.trim();
      if (!key || key.length < 2) continue;
      var translated = translateText(key, dict);
      if (translated && translated !== key) node.nodeValue = raw.replace(key, translated);
    }

    // optgroup labels are attributes, not text nodes.
    var groups = document.querySelectorAll('optgroup[label]');
    for (var g = 0; g < groups.length; g++) {
      var lbl = groups[g].getAttribute('label');
      if (dict[lbl]) groups[g].setAttribute('label', dict[lbl]);
    }
    // aria-label / title / placeholder on controls (e.g. theme toggle, search box)
    var controls = document.querySelectorAll('[aria-label],[title],[placeholder]');
    for (var a = 0; a < controls.length; a++) {
      ['aria-label', 'title', 'placeholder'].forEach(function (attr) {
        var v = controls[a].getAttribute(attr);
        if (v && dict[v]) controls[a].setAttribute(attr, dict[v]);
      });
    }

    // Browser tab title ("YouTube Video Downloader — SnapYT")
    var titleKey = document.title;
    if (dict[titleKey]) document.title = dict[titleKey];
    else {
      // Translate the leading "YouTube Video Downloader" portion.
      var base = "YouTube Video Downloader";
      if (titleKey.indexOf(base) === 0 && dict[base]) {
        document.title = dict[base] + titleKey.slice(base.length);
      }
    }
  }

  window.YTI18n = { apply: apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
