/* YouTube-tool — local front-end behaviour for the static SnapYT mirror.
 *
 * The original page talks to a WordPress admin-ajax endpoint with a nonce.
 * A static GitHub Pages site has no backend, so this file keeps the whole UI
 * working (theme / paste / clear / validation) and uses a configurable API:
 *
 *   window.YOUTUBE_TOOL_API = "https://your-backend.example.com/api/download";
 *
 * Expected POST JSON:  { "url": "https://www.youtube.com/watch?v=..." }
 * Expected response:   { "title": "...", "formats": [ { "label": "MP4 720p",
 *                       "url": "https://..." } ] }
 */
(function () {
  "use strict";

  var form = document.getElementById("video-url-form");
  if (!form) return;

  var input = document.getElementById("video-url");
  var submit = document.getElementById("submit-url");
  var pasteBtn = document.getElementById("ytx-paste-btn");
  var clearBtn = document.getElementById("ytx-clear-btn");
  var errorBox = document.getElementById("error-message");
  var waitBox = document.getElementById("ytx-wait");
  var hero = document.querySelector(".ytx-hero");
  var themeBtn = document.getElementById("ytx-theme-toggle");
  var themeLbl = themeBtn && themeBtn.querySelector(".ytx-theme-label");

  function showError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }
  function clearError() {
    if (!errorBox) return;
    errorBox.textContent = "";
    errorBox.hidden = true;
  }
  function syncClear() {
    if (!clearBtn) return;
    if (input.value.trim()) clearBtn.removeAttribute("hidden");
    else clearBtn.setAttribute("hidden", "");
  }

  /* theme */
  if (themeBtn && hero) {
    function applyTheme(t) {
      hero.setAttribute("data-theme", t);
      if (themeLbl) themeLbl.textContent = t === "dark" ? "Dark" : "Light";
      themeBtn.setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode");
      try { localStorage.setItem("ytx_theme", t); } catch (e) {}
    }
    themeBtn.addEventListener("click", function () {
      applyTheme(hero.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
    try {
      var saved = localStorage.getItem("ytx_theme");
      if (saved === "dark" || saved === "light") applyTheme(saved);
    } catch (e) {}
  }

  input.addEventListener("input", function () { clearError(); syncClear(); });
  syncClear();

  if (clearBtn) clearBtn.addEventListener("click", function () {
    input.value = "";
    syncClear();
    clearError();
    input.focus();
  });

  if (pasteBtn) pasteBtn.addEventListener("click", function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      showError("Clipboard access is unavailable. Please paste the link manually.");
      return;
    }
    navigator.clipboard.readText().then(function (text) {
      if (!text || !text.trim()) {
        showError("Your clipboard is empty. Copy a YouTube link first.");
        return;
      }
      input.value = text.trim();
      syncClear();
      clearError();
    }).catch(function () {
      showError("Clipboard access was denied. Please paste the link manually.");
    });
  });

  function isValidYouTube(raw) {
    var s = String(raw || "").trim();
    if (!s) return false;
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    var u;
    try { u = new URL(s); } catch (e) { return false; }
    var host = (u.hostname || "").toLowerCase();
    if (host === "youtu.be") return u.pathname.length > 1;
    if (/(^|\.)youtube\.com$/.test(host) || /(^|\.)youtube-nocookie\.com$/.test(host)) {
      var p = u.pathname || "";
      return (p === "/watch" && !!u.searchParams.get("v")) || /^\/(shorts|embed|live|v)\/[^/]+/.test(p);
    }
    return false;
  }

  function renderResult(data) {
    var old = document.getElementById("ytx-local-result");
    if (old) old.remove();
    var box = document.createElement("div");
    box.id = "ytx-local-result";
    box.className = "ytx-local-result";
    box.style.cssText = "margin:22px auto;max-width:720px;padding:20px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;color:#0f172a;font:16px/1.6 system-ui,sans-serif;box-shadow:0 8px 28px rgba(15,23,42,.06)";

    var h = document.createElement("h3");
    h.textContent = data && data.title ? data.title : "Download options";
    h.style.cssText = "margin:0 0 14px;font-size:19px";
    box.appendChild(h);

    var formats = (data && data.formats) || [];
    if (!formats.length) {
      var p = document.createElement("p");
      p.textContent = "No formats were returned for this video.";
      box.appendChild(p);
    }
    formats.forEach(function (f) {
      var a = document.createElement("a");
      a.href = f.url;
      a.textContent = f.label || "Download";
      a.setAttribute("download", "");
      a.style.cssText = "display:inline-block;margin:6px 8px 6px 0;padding:9px 15px;border-radius:9px;background:#f1f5f9;color:#0f172a;text-decoration:none;border:1px solid #cbd5e1";
      box.appendChild(a);
    });

    if (form && form.parentNode) form.parentNode.insertBefore(box, form.nextSibling);
  }

  var busy = false;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    clearError();
    var raw = input.value.trim();
    if (!raw) { showError("Please paste a YouTube link first."); input.focus(); return; }
    if (!isValidYouTube(raw)) { showError("Please paste a valid YouTube video or Shorts link."); input.focus(); return; }

    var api = window.YOUTUBE_TOOL_API;
    if (!api) {
      showError("Static demo: no download API is configured. Set window.YOUTUBE_TOOL_API in app.js or site.config.js to enable real downloads.");
      return;
    }

    busy = true;
    submit.disabled = true;
    submit.setAttribute("data-state", "loading");
    if (waitBox) { waitBox.textContent = "Fetching available formats…"; waitBox.hidden = false; }

    fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: raw })
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (data) {
      renderResult(data);
    }).catch(function (err) {
      showError("Network error: " + err.message);
    }).finally(function () {
      busy = false;
      submit.disabled = false;
      submit.setAttribute("data-state", "idle");
      if (waitBox) { waitBox.hidden = true; waitBox.textContent = ""; }
    });
  });
})();
