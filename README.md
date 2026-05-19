# Telegram Drive

A personal cloud drive powered by Telegram Saved Messages. It includes a Google Drive-style file manager, folder organization, friend access, public share links, and optional proxy-backed Telegram connectivity.

## Features

- Owner login with Telegram phone, API ID, API hash, verification code, and 2FA password support.
- Optional SOCKS5 or MTProto proxy support for steadier Telegram connections.
- Drive-like grid/list browsing, breadcrumbs, folder creation, file search, uploads, downloads, moves, deletes, and share links.
- Friend portal accounts with download-only or upload permissions.
- Single Docker image for Coolify: FastAPI serves both the API and built React frontend on port `8000`.

## Tech Stack

- Backend: Python, FastAPI, Telethon, SQLite
- Frontend: React, Vite, Tailwind CSS, Axios, Lucide React

## Local Development

Backend:

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server calls the backend at `http://<hostname>:8000`. In production it uses same-origin API calls.

## Coolify Deployment

1. Create a new Coolify application from this GitHub repository.
2. Choose Dockerfile build.
3. Expose port `8000`.
4. Add persistent volumes for:
   - `/app/backend/sessions`
   - `/app/backend/telegram_drive.db`
   - `/app/backend/temp` if you want temp files outside the container filesystem
5. Deploy.

The image builds the React frontend, copies it into the runtime image, and starts:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

## Proxy Notes

During owner login, enable proxy and choose:

- SOCKS5: host, port, optional username/password.
- MTProto: host, port, secret.

The chosen proxy settings are stored for that owner session and reused for uploads, downloads, and public shared downloads.

## Important Notes

- Session files in `backend/sessions/` contain Telegram authentication keys. Do not commit or share them.
- `backend/telegram_drive.db` stores local folder/file metadata and portal accounts. Keep it on a persistent volume in production.
- Telegram limits still apply to upload size, download speed, and request rate.
