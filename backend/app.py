"""Minimal download API for the static YouTube-tool front-end.

Deploy behind nginx on your own server. The GitHub Pages front-end posts a
YouTube URL to /api/download and receives format entries whose `url` points
back to this API's /api/stream endpoint, so the browser never needs direct
access to YouTube's signed media URLs.
"""
import os
import re
import time
import uuid
import shutil
import tempfile
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from yt_dlp import YoutubeDL

ALLOWED_ORIGINS = [
    "https://102896351.github.io",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
TOKEN_TTL = 15 * 60  # seconds
MAX_FORMATS = 24

app = FastAPI(title="YouTube-tool API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

_tokens = {}  # token -> {"url": ..., "format": ..., "expires": ...}


class DownloadRequest(BaseModel):
    url: str
    format: str | None = None


def classify_error(exc: Exception) -> dict:
    """Turn raw yt-dlp errors into a stable code + a human-readable message."""
    msg = str(exc)
    low = msg.lower()
    if "sign in to confirm" in low or "not a bot" in low or "login_required" in low:
        return {
            "code": "LOGIN_REQUIRED",
            "message": "YouTube is asking for a sign-in on this video and blocks automatic downloads. Please try a different public video.",
        }
    if "private video" in low or "this video is private" in low:
        return {"code": "PRIVATE", "message": "This is a private video and cannot be downloaded."}
    if "age" in low and ("confirm" in low or "restrict" in low):
        return {
            "code": "AGE_RESTRICTED",
            "message": "This video is age-restricted and needs a signed-in YouTube account.",
        }
    if "unavailable" in low or "has been removed" in low or "not available" in low or "does not exist" in low:
        return {"code": "UNAVAILABLE", "message": "This video does not exist, is private, or has been removed. Check the link and try another video."}
    if "members-only" in low or "member" in low and "only" in low:
        return {"code": "MEMBERS_ONLY", "message": "This video is for channel members only."}
    return {"code": "EXTRACT_FAILED", "message": "Could not read this video: %s" % msg[:160]}


def is_youtube_url(raw: str) -> bool:
    if not isinstance(raw, str) or not raw.strip():
        return False
    s = raw.strip()
    if not re.match(r"^https?://", s, re.I):
        s = "https://" + s
    try:
        u = urlparse(s)
    except Exception:
        return False
    host = (u.hostname or "").lower()
    if host == "youtu.be":
        return len(u.path) > 1
    if host.endswith("youtube.com") or host.endswith("youtube-nocookie.com"):
        if u.path == "/watch":
            return bool(re.search(r"(?:^|&)v=[^&]+", u.query))
        return bool(re.match(r"^/(shorts|embed|live|v)/[^/]+", u.path))
    return False


def extract(url: str) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
    }
    cookie = os.environ.get("YT_COOKIES_FILE")
    if cookie and os.path.exists(cookie):
        opts["cookiefile"] = cookie
    with YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False) or {}


def format_entries(info: dict, base: str) -> list[dict]:
    out = []
    for f in info.get("formats") or []:
        if not f.get("url"):
            continue
        vcodec, acodec = f.get("vcodec"), f.get("acodec")
        if vcodec == "none" and acodec == "none":
            continue
        height = f.get("height") or 0
        abr = f.get("abr") or 0
        if vcodec != "none" and acodec != "none":
            label = "MP4 %sp" % height if height else "MP4 combined"
        elif vcodec != "none":
            label = "Video %sp (no audio)" % height if height else "Video only"
        else:
            label = "Audio %skbps" % int(abr) if abr else "Audio"
        out.append({
            "id": str(f.get("format_id") or ""),
            "label": label,
            "ext": f.get("ext") or "mp4",
            "filesize": f.get("filesize") or f.get("filesize_approx"),
            "url": "%s/api/stream?token=%s" % (base, _issue_token(url_from_info(info), str(f.get("format_id") or ""))),
        })
    # Prefer combined formats, then audio, then video-only; cap the list.
    def rank(e):
        label = e["label"]
        if "no audio" in label:
            return 2
        if label.startswith("Audio"):
            return 1
        return 0
    out.sort(key=lambda e: (rank(e), e["label"]))
    return out[:MAX_FORMATS]


def url_from_info(info: dict) -> str:
    return info.get("webpage_url") or info.get("original_url") or ""


def _issue_token(url: str, fmt: str) -> str:
    token = uuid.uuid4().hex
    _tokens[token] = {"url": url, "format": fmt, "expires": time.time() + TOKEN_TTL}
    # cheap cleanup
    now = time.time()
    for k in [k for k, v in _tokens.items() if v["expires"] < now]:
        _tokens.pop(k, None)
    return token


def download_to_temp(url: str, fmt: str, tmpdir: str) -> str:
    opts = {
        "format": fmt or "best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "paths": {"home": tmpdir},
        "outtmpl": "%(id)s.%(ext)s",
        "retries": 2,
        "socket_timeout": 30,
    }
    cookie = os.environ.get("YT_COOKIES_FILE")
    if cookie and os.path.exists(cookie):
        opts["cookiefile"] = cookie
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return ydl.prepare_filename(info)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={"detail": {"code": "BAD_REQUEST", "message": "Please paste a valid YouTube link."}},
    )


@app.post("/api/download")
async def api_download(payload: DownloadRequest, request: Request):
    url = payload.url.strip()
    if not is_youtube_url(url):
        raise HTTPException(400, {"code": "BAD_URL", "message": "Please paste a valid YouTube video or Shorts link."})
    try:
        info = await run_in_threadpool(extract, url)
    except Exception as exc:
        raise HTTPException(422, classify_error(exc))

    base = (os.environ.get("PUBLIC_API_BASE") or str(request.base_url)).rstrip("/")
    formats = format_entries(info, base)
    if not formats:
        raise HTTPException(404, {"code": "NO_FORMATS", "message": "No downloadable format was returned for this video."})
    return {"title": info.get("title") or "YouTube video", "formats": formats}


@app.get("/api/stream")
async def api_stream(token: str, background_tasks: BackgroundTasks):
    entry = _tokens.get(token)
    if not entry or entry["expires"] < time.time():
        raise HTTPException(410, {"code": "EXPIRED", "message": "This download link has expired. Please submit the URL again."})
    tmpdir = tempfile.mkdtemp(prefix="yttool-")
    try:
        path = await run_in_threadpool(download_to_temp, entry["url"], entry["format"], tmpdir)
    except Exception as exc:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(422, classify_error(exc))
    background_tasks.add_task(shutil.rmtree, tmpdir, True)
    filename = os.path.basename(path)
    return FileResponse(
        path,
        filename=filename,
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="%s"' % filename},
    )


@app.get("/health")
async def health():
    return {"ok": True}
