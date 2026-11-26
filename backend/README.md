# YouTube-tool API

FastAPI + yt-dlp backend for the static GitHub Pages front-end.

## Endpoints

- `POST /api/download` with `{ "url": "https://www.youtube.com/watch?v=..." }`
  → `{ "title": "...", "formats": [ { "label": "MP4 720p", "url": "https:// your-server/api/stream?token=..." } ] }`
- `GET /api/stream?token=...` → streams the file as an attachment. Token expires in 15 minutes.
- `GET /health`

## Install (Ubuntu 22.04 / 24.04, as root)

```bash
apt update
apt install -y python3-venv python3-pip nginx ffmpeg
mkdir -p /opt/youtube-tool-api
cd /opt/youtube-tool-api
python3 -m venv venv
source venv/bin/activate
pip install -U pip
pip install -r /path/to/repo/backend/requirements.txt
cp /path/to/repo/backend/app.py .
```

## systemd service

Create `/etc/systemd/system/youtube-tool-api.service`:

```ini
[Unit]
Description=YouTube-tool API
After=network-online.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/youtube-tool-api
Environment=PUBLIC_API_BASE=https://api.example.com
ExecStart=/opt/youtube-tool-api/venv/bin/uvicorn app:app --host 127.0.0.1 --port 8799
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now youtube-tool-api
curl http://127.0.0.1:8799/health
```

## nginx (subdomain recommended)

```nginx
server {
    listen 80;
    server_name api.example.com;
    location / {
        proxy_pass http://127.0.0.1:8799;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 300s;
        client_max_body_size 2m;
    }
}
```

Then `certbot --nginx -d api.example.com`.

## Front-end

Before `app.js` in `index.html`, set:

```html
<script>window.YOUTUBE_TOOL_API = "https://api.example.com/api/download";</script>
```

## Operational notes

- YouTube frequently changes its anti-bot checks. If extraction starts failing, `pip install -U yt-dlp` first.
- For age-gated or login-required videos, place a YouTube `cookies.txt` on the server and set `YT_COOKIES_FILE=/path/to/cookies.txt` in the systemd unit. Keep that file out of git.
- `PUBLIC_API_BASE` must be the externally reachable API origin (no trailing slash); it is used to build the `/api/stream` links.
- The API only accepts YouTube URLs; arbitrary URLs are rejected to avoid SSRF.
- Remember that downloading media may violate YouTube's Terms unless you own it or have permission. Keep the compliance notices in the front-end.
