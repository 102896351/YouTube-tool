"""Fallback extractor: reuse snapyt.app's server-side proxy when YouTube blocks
our own datacenter IP with "Sign in to confirm you're not a bot".

snapyt.app fetches YouTube through a residential IP and exposes the resulting
formats on a preview page. We replicate the two-step flow:

  1. POST /wp-admin/admin-ajax.php  action=vd_fresh_nonce  -> nonce + cookies
  2. POST /wp-admin/admin-ajax.php  action=process_video_url&video_url=...&security=<nonce>
       -> {"data": {"redirect": "https://www.snapyt.app/video-preview/?preview_id=...&q=..."}}
  3. GET the preview page, parse the <option> elements. Each has:
       data-force = snapyt admin-ajax URL that proxies the actual file download
       data-size  = human readable size
       option text = quality label
  4. Return format entries pointing at our own /api/stream, which calls the
     data-force URL with a streaming proxy (so our server relays the file).

This is deliberately isolated from the primary yt-dlp path: it is only used
when yt-dlp raises a bot/login error.
"""
import re
import html
import urllib.parse

import requests

SITE = "https://www.snapyt.app"
AJAX = SITE + "/wp-admin/admin-ajax.php"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
TIMEOUT = 60


def _session():
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    return s


def resolve(video_url: str) -> dict:
    """Return {"title":..., "formats":[{"label","size","proxy_url"}]}."""
    s = _session()
    # 1. fresh nonce
    r = s.post(AJAX, data={"action": "vd_fresh_nonce"}, timeout=TIMEOUT)
    r.raise_for_status()
    nonce = r.json()["data"]["nonce"]

    # 2. submit the video url
    r = s.post(
        AJAX,
        data={
            "action": "process_video_url",
            "video_url": video_url,
            "security": nonce,
        },
        headers={"Origin": SITE, "Referer": SITE + "/"},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    data = r.json()
    redirect = (data.get("data") or {}).get("redirect")
    if not redirect:
        raise RuntimeError("snapyt did not return a preview redirect")

    # 3. preview page -> format options
    r = s.get(redirect, timeout=TIMEOUT)
    r.raise_for_status()
    page = html.unescape(r.text)

    # title from the left panel meta (best-effort)
    m = re.search(r"Title:\s*</[^>]+>\s*([^<]+)", page)
    title = m.group(1).strip() if m else "YouTube video"

    options = []
    for m in re.finditer(
        r'<option\s+value="(\d+)"[^>]*?data-force="([^"]+)"[^>]*?>([^<]*)</option>',
        page,
    ):
        fmt_idx, force_url, label = m.group(1), m.group(2), m.group(3).strip()
        size_m = re.search(r'data-size="([^"]+)"', m.group(0))
        size = size_m.group(1) if size_m else ""
        if not label:
            label = "MP4 %s" % fmt_idx
        options.append({
            "id": fmt_idx,
            "label": label,
            "size": size,
            "proxy_url": force_url,
        })

    if not options:
        raise RuntimeError("no download options found on snapyt preview page")
    return {"title": title, "formats": options, "session_cookies": s.cookies.get_dict()}


def stream_file(proxy_url: str, cookies: dict, out_path: str, first_bytes: int = 0):
    """Proxy the actual file through snapyt's force-download endpoint to disk."""
    s = _session()
    s.cookies.update(cookies)
    headers = {"Referer": SITE + "/video-preview/"}
    if first_bytes > 0:
        headers["Range"] = "bytes=0-%d" % (first_bytes - 1)
    with s.get(proxy_url, headers=headers, stream=True, timeout=(30, 300)) as r:
        r.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                if chunk:
                    f.write(chunk)
    return out_path
