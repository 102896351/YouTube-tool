/**
 * YouTube Downloader — fallback frontend script.
 *
 * The new video-input.php template ships its own inline script for the
 * modern paste UI (.ytx-hero / .ytx-input-shell). This file is kept so:
 *   1. The wp_enqueue_script() registration keeps working.
 *   2. Any older shortcode/page that still uses #video-url-form without
 *      the .ytx-hero shell still gets a working paste/submit UX.
 *
 * Pure vanilla JS — no jQuery, no global pollution, no console errors.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    var form = document.getElementById('video-url-form');
    if (!form) return;

    // Skip when the new YouTube-branded template is on the page —
    // its inline script already owns submit/paste/clear.
    if (form.closest('.ytx-hero')) return;

    var input  = document.getElementById('video-url');
    var btn    = document.getElementById('submit-url');
    var errBox = document.getElementById('error-message');
    var paste  = document.getElementById('paste-url') || document.getElementById('ytx-paste-btn');
    var clear  = document.getElementById('clear-url') || document.getElementById('ytx-clear-btn');

    if (!input || !btn) return;

    var ajaxObj = (typeof window.video_downloader_ajax === 'object' && window.video_downloader_ajax) ||
                  (typeof window.videoDownloader === 'object' && window.videoDownloader) || {};
    var AJAX_URL = ajaxObj.ajax_url || ajaxObj.ajaxUrl || (window.ajaxurl || '/wp-admin/admin-ajax.php');
    var NONCE    = ajaxObj.nonce    || '';

    /* Stale nonce on a long-cached page → fresh one from an uncached endpoint. */
    function freshNonce() {
      // POST to the unchanged AJAX URL (never cached; no query-string building).
      return fetch(AJAX_URL, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
                               headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                               body: 'action=vd_fresh_nonce' })
        .then(function (r) { return r.json(); })
        .then(function (j) { return (j && j.success && j.data && j.data.nonce) || ''; })
        .catch(function () { return ''; });
    }

    var MSG = {
      empty:    'Please paste a YouTube link first.',
      bad:      'Please paste a valid YouTube video or Shorts link.',
      generic:  'Something went wrong. Please try again.',
      network:  'Network error. Please check your connection and try again.',
      clip:     'Clipboard access is unavailable. Please paste the YouTube link manually.',
      clipE:    'Your clipboard is empty. Copy a YouTube link first.'
    };

    function showError(msg) {
      var t = msg || MSG.generic;
      if (errBox) {
        errBox.textContent = t;
        errBox.removeAttribute('hidden');
        errBox.style.display = '';
      } else {
        // last resort
        try { alert(t); } catch (e) {}
      }
    }
    function clearError() {
      if (!errBox) return;
      errBox.textContent = '';
      errBox.setAttribute('hidden', '');
    }
    function setBusy(busy) {
      btn.disabled = !!busy;
      btn.setAttribute('data-state', busy ? 'loading' : 'idle');
      btn.setAttribute('aria-busy',   busy ? 'true' : 'false');
      // Old templates may still toggle children directly:
      var t = btn.querySelector('.btn-text');
      var l = btn.querySelector('.btn-loading');
      if (t) t.style.display = busy ? 'none' : '';
      if (l) l.style.display = busy ? 'inline-flex' : 'none';
    }
    function syncClearBtn() {
      if (!clear) return;
      if (input.value.trim()) clear.removeAttribute('hidden');
      else                    clear.setAttribute('hidden', '');
    }

    function isYouTubeUrl(raw) {
      if (typeof raw !== 'string') return false;
      var s = raw.trim();
      if (!s) return false;
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
      try {
        var u = new URL(s);
        var host = (u.hostname || '').toLowerCase();
        if (host === 'youtu.be' && u.pathname.length > 1) return true;
        if (/(^|\.)youtube\.com$/.test(host) ||
            /(^|\.)youtube-nocookie\.com$/.test(host)) {
          var p = u.pathname || '';
          if (p === '/watch' && u.searchParams && u.searchParams.get('v')) return true;
          if (/^\/(shorts|embed|live|v)\/[^/]+/.test(p)) return true;
        }
      } catch (e) { return false; }
      return false;
    }

    if (paste) {
      paste.addEventListener('click', function () {
        clearError();
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          showError(MSG.clip); input.focus(); return;
        }
        navigator.clipboard.readText().then(function (txt) {
          var t = (txt || '').trim();
          if (!t) { showError(MSG.clipE); return; }
          input.value = t;
          syncClearBtn();
          input.focus();
        }).catch(function () { showError(MSG.clip); input.focus(); });
      });
    }

    if (clear) {
      clear.addEventListener('click', function () {
        input.value = '';
        clearError();
        syncClearBtn();
        input.focus();
      });
    }

    input.addEventListener('input', function () { clearError(); syncClearBtn(); });
    syncClearBtn();

    var inflight = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (inflight) return;
      clearError();

      var url = (input.value || '').trim();
      if (!url) { showError(MSG.empty); input.focus(); return; }
      if (!isYouTubeUrl(url)) { showError(MSG.bad); input.focus(); input.select(); return; }

      inflight = true;
      setBusy(true);
      send(url, false);
    });

    function send(url, retried) {
      var body = new URLSearchParams();
      body.set('action', 'process_video_url');
      body.set('video_url', url);
      if (NONCE) body.set('security', NONCE);

      fetch(AJAX_URL, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: body
      })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, resp: j }; });
      })
      .then(function (x) {
        var resp = x.resp;
        if (resp && resp.success && resp.data && resp.data.redirect) {
          window.location.href = resp.data.redirect;
          return;
        }
        if (!retried && x.status === 403 && (resp === -1 || resp === null)) {
          return freshNonce().then(function (n) {
            if (n) { NONCE = n; send(url, true); return; }
            showError(MSG.generic); setBusy(false); inflight = false;
          });
        }
        var msg = (resp && resp.data && typeof resp.data === 'string') ? resp.data : MSG.generic;
        showError(msg);
        setBusy(false);
        inflight = false;
      })
      .catch(function () {
        showError(MSG.network);
        setBusy(false);
        inflight = false;
      });
    }

    window.addEventListener('pageshow', function (ev) {
      if (ev.persisted) { setBusy(false); inflight = false; clearError(); }
    });
  });
})();
