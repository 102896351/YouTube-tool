/* YouTube-tool — local front-end behaviour for the static 视频下载器 mirror.
 *
 * The original page talks to a WordPress admin-ajax endpoint with a nonce.
 * A static GitHub Pages site has no backend, so this file keeps the whole UI
 * working (theme / paste / clear / validation) and uses a configurable API:
 *
 *   window.YOUTUBE_TOOL_API = "https://your-backend.example.com/api/download";
 *
 * Expected POST JSON:  { "url": "https://www.youtube.com/watch?v=..." }
 * Expected response:   { "title", "channel", "duration", "size", "thumbnail",
 *                        "formats": [ { "label", "kind", "size", "url", ... } ] }
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

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var ICON = {
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    merge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h6M3 12h6M3 17h6M14 7l7 5-7 5V7z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  };

  function kindLabel(kind) {
    return ({ "video+audio": "Video + Audio", "video-only": "Video only", "audio-only": "Audio" })[kind] || "Download";
  }

  /* The API already puts the size and "Recommended" in most labels, so avoid
     appending them a second time in the quality dropdown. */
  function formatText(f) {
    var label = String(f.label || "Download").trim();
    var size = f.size || f.filesize || "";
    if (size && label.indexOf(size) === -1) label += " · " + size;
    if (f.recommended && !/recommended/i.test(label)) label += " — Recommended";
    return label;
  }

  function qualityOf(f) {
    var m = String(f && f.label || "").match(/(\d+p)\s*(MP4|WEBM|M4A|Opus|AVI)/i);
    if (m) return m[1] + " " + m[2];
    return f && f.ext ? String(f.ext).toUpperCase() : "MP4";
  }

  function renderResult(data) {
    var old = document.getElementById("ytx-local-result");
    if (old) old.remove();

    var d = data || {};
    var formats = d.formats || [];
    var hasAudio = formats.some(function (f) { return f.kind === "audio-only" || f.kind === "video+audio"; });
    var hasVideo = formats.some(function (f) { return f.kind === "video-only" || f.kind === "video+audio"; });
    var combos = formats.filter(function (f) { return f.kind === "video+audio"; });
    var videos = formats.filter(function (f) { return f.kind === "video-only"; });
    var audios = formats.filter(function (f) { return f.kind === "audio-only"; });
    var rec = formats.filter(function (f) { return f.recommended; })[0] || combos[0] || formats[0];
    var all = combos.concat(videos, audios);
    var thumb = d.thumbnail || "";
    var source = d.source_url || "";

    var box = document.createElement("div");
    box.id = "ytx-local-result";
    box.className = "ytpv";

    var comboOpts = combos.map(function (f) {
      return '<option value="' + esc(f.url) + '" data-kind="video+audio" data-label="' + esc(formatText(f)) + '"' +
        (f === rec ? ' data-rec="1" selected' : '') + '>' + esc(formatText(f)) + '</option>';
    }).join("");
    var comboGroup = comboOpts ? '<optgroup label="🎬 Video + Audio (Ready to Download)">' + comboOpts + '</optgroup>' : "";

    var vidOpts = videos.map(function (f) {
      return '<option value="' + esc(f.url) + '" data-kind="video-only" data-label="' + esc(formatText(f)) + '">' +
        esc(formatText(f)) + '</option>';
    }).join("");
    var vidGroup = vidOpts ? '<optgroup label="🎞️ Higher Quality Video — Combine with audio for sound">' + vidOpts + '</optgroup>' : "";

    var audOpts = audios.map(function (f) {
      return '<option value="' + esc(f.url) + '" data-kind="audio-only" data-label="' + esc(formatText(f)) + '">' +
        esc(formatText(f)) + '</option>';
    }).join("");
    var audGroup = audOpts ? '<optgroup label="🎵 Audio Only">' + audOpts + '</optgroup>' : "";

    var muxVidOpts = videos.map(function (f) {
      return '<option value="' + esc(f.url) + '">' + esc(formatText(f)) + '</option>';
    }).join("");
    var muxAudOpts = audios.map(function (f) {
      return '<option value="' + esc(f.url) + '">' + esc(formatText(f)) + '</option>';
    }).join("");

    var summary = "";
    if (rec) {
      summary = '<span class="ytpv-badge gold">Recommended</span>' +
        '<span class="ytpv-badge blue">' + esc(qualityOf(rec)) + '</span>' +
        (rec.size ? '<span class="ytpv-badge">' + esc(rec.size) + '</span>' : '') +
        '<span class="ytpv-badge ok">Video + Audio</span>';
    }

    box.innerHTML =
      '<div class="ytpv-grid">' +
        /* ---------- left: video info ---------- */
        '<div class="ytpv-card">' +
          '<div class="ytpv-center"><span class="ytpv-chip"><span class="ytpv-ic">' + ICON.video + '</span>YouTube Video Ready</span></div>' +
          '<div class="ytpv-hero"><div class="ytpv-slot">' +
            (thumb ? '<img src="' + esc(thumb) + '" alt="' + esc(d.title || "Video thumbnail") + '">' : '') +
            '<button type="button" class="ytpv-thumb-btn" data-thumb-btn>' + ICON.download +
              '<span class="ytpv-thumbtxt">Thumbnail</span><span class="ytpv-thumb-hd">HD</span></button>' +
          '</div></div>' +
          '<h1 class="ytpv-title">' + esc(d.title || "YouTube video") + '</h1>' +
          (d.channel ? '<div class="ytpv-meta">Channel: <strong>' + esc(d.channel) + '</strong></div>' : '') +
          (d.duration ? '<div class="ytpv-meta">Duration: ' + esc(d.duration) + '</div>' : '') +
          (d.size ? '<div class="ytpv-meta">Size: ' + esc(d.size) + '</div>' : '') +
          '<div class="ytpv-meta ytpv-flags">' +
            '<span class="ytpv-flag ' + (hasAudio ? "ok" : "off") + '">' + ICON.audio + '<span>Audio</span></span>' +
            '<span class="ytpv-flag ' + (hasVideo ? "ok" : "off") + '">' + ICON.video + '<span>Video</span></span>' +
          '</div>' +
        '</div>' +

        /* ---------- right: download options ---------- */
        '<div class="ytpv-op">' +
          '<div class="ytpv-hdr"><div class="ytpv-ttl">YouTube Download Options</div>' +
            '<div class="ytpv-sub">Approx. ' + esc(d.size || (rec && rec.size) || "—") + '</div></div>' +
          '<div class="ytpv-body">' +
            '<div class="ytpv-summary">' + summary + '</div>' +
            '<label class="ytpv-lbl">Choose your YouTube quality</label>' +
            '<div class="ytpv-selwrap"><select class="ytpv-sel" data-fmt-select>' + comboGroup + vidGroup + audGroup + '</select></div>' +
            '<div class="ytpv-tip" data-tip hidden>' +
              '<div><strong>This quality has no sound</strong>' +
                '<span class="ytpv-tipmsg">Pair it with an audio track below to download a complete HD file.</span></div>' +
              '<button type="button" data-tip-jump>Combine with audio →</button>' +
            '</div>' +
            '<a class="ytpv-btn ytpv-primary" data-dl href="' + esc(rec ? rec.url : "#") + '" rel="nofollow noopener" download>' +
              '<span class="ytpv-ic">' + ICON.download + '</span><span data-btn-text>Download Video</span></a>' +
            '<p class="ytpv-terms">By downloading, you agree to our <a href="terms">Terms of Service</a>.</p>' +
            '<div class="ytpv-tools">' +
              '<a class="ytpv-tool" href="' + esc(source) + '" target="_blank" rel="noopener noreferrer">' +
                '<span class="ytpv-ic">' + ICON.external + '</span><span>Open on YouTube</span></a>' +
              '<button type="button" class="ytpv-tool" data-copy>' +
                '<span class="ytpv-ic">' + ICON.copy + '</span><span class="ytpv-copylabel">Copy YouTube Link</span></button>' +
            '</div>' +
            '<a class="ytpv-btn ytpv-dark" href="' + esc(location.pathname) + '" data-another>Download another YouTube video</a>' +

            (videos.length && audios.length ?
            '<div class="ytpv-merge">' +
              '<div class="ytpv-title2">Need higher quality? Combine YouTube video + audio</div>' +
              '<p class="ytpv-sub2">Pick a video-only quality and an audio track, then prepare a single HD MP4 file.</p>' +
              '<div class="ytpv-merge-grid">' +
                '<div class="ytpv-selwrap"><select class="ytpv-sel" data-mux-video><option value="">Select video quality</option>' + muxVidOpts + '</select></div>' +
                '<div class="ytpv-selwrap"><select class="ytpv-sel" data-mux-audio><option value="">Select audio track</option>' + muxAudOpts + '</select></div>' +
              '</div>' +
              '<a class="ytpv-btn ytpv-primary" data-mux-btn href="' + esc(rec ? rec.url : "#") + '" rel="nofollow noopener" download>' +
                '<span class="ytpv-ic">' + ICON.merge + '</span><span>Prepare HD Download</span></a>' +
              '<p class="ytpv-terms">By downloading, you agree to our <a href="terms">Terms of Service</a>.</p>' +
            '</div>' : "") +

            '<p class="ytpv-note">Download links are temporary — if one expires, paste the link again.</p>' +
          '</div>' +
        '</div>' +
      '</div>';

    if (form && form.parentNode) form.parentNode.insertBefore(box, form.nextSibling);
    wirePanel(box, { rec: rec, source: source, formats: all });

    /* scroll the result into view on narrow screens */
    try { box.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
    if (window.YTI18n && window.YTI18n.apply) window.YTI18n.apply();
  }

  function wirePanel(box, ctx) {
    var sel = box.querySelector("[data-fmt-select]");
    var dl = box.querySelector("[data-dl]");
    var btnText = box.querySelector("[data-btn-text]");
    var tip = box.querySelector("[data-tip]");
    var copyBtn = box.querySelector("[data-copy]");
    var thumbBtn = box.querySelector("[data-thumb-btn]");
    var muxBtn = box.querySelector("[data-mux-btn]");
    var muxVideo = box.querySelector("[data-mux-video]");
    var muxAudio = box.querySelector("[data-mux-audio]");

    function updateFromSelect() {
      var o = sel.options[sel.selectedIndex];
      if (!o || !dl) return;
      dl.href = o.value || "#";
      var kind = o.getAttribute("data-kind") || "";
      var label = o.getAttribute("data-label") || o.text;
      if (btnText) btnText.textContent = "Download " + (kind === "audio-only" ? "Audio" : "Video");
      if (tip) tip.hidden = (kind !== "video-only");
    }
    if (sel) sel.addEventListener("change", updateFromSelect);
    updateFromSelect();

    if (tip) {
      var jump = tip.querySelector("[data-tip-jump]");
      if (jump) jump.addEventListener("click", function () {
        var m = box.querySelector(".ytpv-merge");
        if (m) { m.scrollIntoView({ behavior: "smooth", block: "center" }); }
        if (muxVideo) muxVideo.focus();
      });
    }

    if (copyBtn) copyBtn.addEventListener("click", function () {
      var done = function () {
        copyBtn.classList.add("is-copied");
        var lbl = copyBtn.querySelector(".ytpv-copylabel");
        if (lbl) lbl.textContent = "Copied!";
        setTimeout(function () {
          copyBtn.classList.remove("is-copied");
          if (lbl) lbl.textContent = "Copy YouTube Link";
        }, 1800);
      };
      var fail = function () {
        showError("Could not copy the link. Please copy it from the address bar manually.");
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ctx.source || location.href).then(done).catch(fail);
      } else {
        fail();
      }
    });

    if (thumbBtn) thumbBtn.addEventListener("click", function () {
      var img = box.querySelector(".ytpv-slot img");
      if (!img || !img.src) { showError("Thumbnail is not available for this video."); return; }
      var hd = (img.src.match(/maxresdefault|hqdefault/) ? img.src : img.src.replace(/\/_?\d+\.webp/, "/sddefault.jpg"));
      var a = document.createElement("a");
      a.href = hd; a.target = "_blank"; a.rel = "noopener";
      a.click();
    });

    if (muxBtn) muxBtn.addEventListener("click", function (e) {
      if (!muxVideo || !muxAudio || !muxVideo.value || !muxAudio.value) {
        e.preventDefault();
        showError("Please choose both a video quality and an audio track first.");
        return;
      }
      /* No server-side muxing on this static host: download both parts so the
         visitor can combine them locally. The two parts are offered in order. */
      e.preventDefault();
      var v = document.createElement("a"); v.href = muxVideo.value; v.download = ""; document.body.appendChild(v); v.click();
      var a = document.createElement("a"); a.href = muxAudio.value; a.download = ""; document.body.appendChild(a);
      setTimeout(function () { a.click(); }, 400);
      setTimeout(function () { v.remove(); a.remove(); }, 2000);
      showError("Both parts are downloading. Combine the video and audio files locally to get HD with sound.");
    });

    var another = box.querySelector("[data-another]");
    if (another) another.addEventListener("click", function () {
      var r = document.getElementById("ytx-local-result");
      if (r) r.remove();
      try { input.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
      setTimeout(function () { input.focus(); }, 300);
    });
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
      return r.json().catch(function () { return null; }).then(function (body) {
        if (!r.ok) {
          var d = body && body.detail;
          var msg = (d && d.message) || ("Request failed (HTTP " + r.status + ").");
          throw new Error(msg);
        }
        return body;
      });
    }).then(function (data) {
      renderResult(data);
    }).catch(function (err) {
      showError(err.message || "Network error.");
    }).finally(function () {
      busy = false;
      submit.disabled = false;
      submit.setAttribute("data-state", "idle");
      if (waitBox) { waitBox.hidden = true; waitBox.textContent = ""; }
    });
  });
})();
