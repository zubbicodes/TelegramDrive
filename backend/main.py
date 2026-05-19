import os
import uuid
import aiofiles
import hashlib
import hmac
import secrets
import time
from fastapi import FastAPI, File, UploadFile, Form, Header, HTTPException, Depends, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from typing import Optional
import asyncio

import database as db
from telegram_service import telegram_service

app = FastAPI(title="Telegram Drive")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = os.getenv("TELEGRAM_DRIVE_TEMP_DIR", os.path.join(os.path.dirname(__file__), "temp"))
os.makedirs(TEMP_DIR, exist_ok=True)
UPLOAD_PROGRESS = {}

FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000).hex()
    return f"{salt}${digest}"

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, digest = stored_hash.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000).hex()
    return hmac.compare_digest(candidate, digest)

@app.on_event("startup")
async def startup():
    await db.init_db()

async def get_user(x_token: str = Header(None), token: str = Query(None)):
    effective = x_token or token
    if not effective:
        raise HTTPException(status_code=401, detail="Missing token")
    user = await db.get_user_by_token(effective)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not user["is_authorized"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    return user

async def get_portal_user(x_portal_token: str = Header(None), token: str = Query(None)):
    effective = x_portal_token or token
    if not effective:
        raise HTTPException(status_code=401, detail="Missing portal token")
    user = await db.get_portal_user_by_token(effective)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid portal token")
    return user

async def get_storage_owner():
    owner = await db.get_first_authorized_user()
    if not owner:
        raise HTTPException(status_code=503, detail="The drive owner has not connected Telegram yet")
    return owner

async def get_storage_client():
    owner = await get_storage_owner()
    client = await telegram_service.get_client(owner["session_name"], owner["api_id"], owner["api_hash"], **user_proxy_args(owner))
    return client

async def get_storage_summary(folder_id=None):
    drive_name = await db.get_setting("drive_name", "My Drive")
    folders = await db.get_all_folders()
    files = await db.get_all_files()
    children_by_parent = {}
    folder_names = {}
    for folder in folders:
        children_by_parent.setdefault(folder["parent_id"], []).append(folder["id"])
        folder_names[folder["id"]] = folder["name"]

    direct_sizes = {}
    for file in files:
        direct_sizes[file["folder_id"]] = direct_sizes.get(file["folder_id"], 0) + (file["size"] or 0)

    folder_sizes = {}

    def folder_total(current_id):
        if current_id in folder_sizes:
            return folder_sizes[current_id]
        total = direct_sizes.get(current_id, 0)
        for child_id in children_by_parent.get(current_id, []):
            total += folder_total(child_id)
        folder_sizes[current_id] = total
        return total

    drive_size = direct_sizes.get(None, 0)
    for root_folder_id in children_by_parent.get(None, []):
        drive_size += folder_total(root_folder_id)

    current_size = drive_size
    current_name = drive_name
    if folder_id:
        if folder_id not in folder_names:
            raise HTTPException(status_code=404, detail="Folder not found")
        current_size = folder_total(folder_id)
        current_name = folder_names[folder_id]

    return {
        "drive_name": drive_name,
        "drive_size": drive_size,
        "current_folder_id": folder_id,
        "current_name": current_name,
        "current_size": current_size,
        "folder_sizes": folder_sizes,
    }

def user_proxy_args(user):
    proxy_type = user.get("proxy_type") or ("mtproto" if user.get("mtproxy_host") else "none")
    return {
        "proxy_type": proxy_type,
        "proxy_host": user.get("proxy_host") or user.get("mtproxy_host"),
        "proxy_port": user.get("proxy_port") or user.get("mtproxy_port"),
        "proxy_secret": user.get("proxy_secret") or user.get("mtproxy_secret"),
        "proxy_username": user.get("proxy_username"),
        "proxy_password": user.get("proxy_password"),
    }

def set_upload_progress(upload_id, percent, stage, done=False, error=None, bytes_done=None, bytes_total=None, speed_bps=None):
    if not upload_id:
        return
    UPLOAD_PROGRESS[upload_id] = {
        "percent": max(0, min(100, int(percent))),
        "stage": stage,
        "done": done,
        "error": error,
        "bytes_done": bytes_done,
        "bytes_total": bytes_total,
        "speed_bps": speed_bps,
    }

def make_progress_callback(upload_id):
    started_at = time.monotonic()
    def progress(sent, total):
        if total:
            # Reserve 0-10 for local transfer and 95-100 for DB cleanup.
            percent = 10 + int((sent / total) * 85)
            elapsed = max(time.monotonic() - started_at, 0.1)
            set_upload_progress(upload_id, percent, "Uploading to Telegram", bytes_done=sent, bytes_total=total, speed_bps=sent / elapsed)
    return progress

def empty_upload_progress():
    return {
        "percent": 0,
        "stage": "Waiting",
        "done": False,
        "error": None,
        "bytes_done": None,
        "bytes_total": None,
        "speed_bps": None,
    }

async def save_upload_to_temp(file, temp_path, upload_id):
    total = int(file.headers.get("content-length") or 0) or None
    received = 0
    started_at = time.monotonic()
    async with aiofiles.open(temp_path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            await f.write(chunk)
            received += len(chunk)
            if total:
                percent = min(9, int((received / total) * 10))
            else:
                percent = 5
            elapsed = max(time.monotonic() - started_at, 0.1)
            set_upload_progress(upload_id, percent, "Receiving file", bytes_done=received, bytes_total=total, speed_bps=received / elapsed)
    return received

# ─── Auth ──────────────────────────────────────────────────────────

@app.post("/api/auth/start")
async def auth_start(
    phone: str = Form(...),
    api_id: int = Form(...),
    api_hash: str = Form(...),
    proxy_type: str = Form("none"),
    proxy_host: Optional[str] = Form(None),
    proxy_port: Optional[int] = Form(None),
    proxy_secret: Optional[str] = Form(None),
    proxy_username: Optional[str] = Form(None),
    proxy_password: Optional[str] = Form(None),
    mtproxy_host: Optional[str] = Form(None),
    mtproxy_port: Optional[int] = Form(None),
    mtproxy_secret: Optional[str] = Form(None)
):
    proxy_type = (proxy_type or "none").strip().lower()
    proxy_host = (proxy_host or mtproxy_host or "").strip() or None
    proxy_secret = (proxy_secret or mtproxy_secret or "").strip() or None
    proxy_username = (proxy_username or "").strip() or None
    proxy_password = (proxy_password or "").strip() or None
    proxy_port = proxy_port or mtproxy_port
    existing = await db.get_user_by_phone(phone)
    if existing and existing["is_authorized"]:
        await db.update_user_connection(existing["token"], api_id, api_hash, proxy_type, proxy_host, proxy_port, proxy_secret, proxy_username, proxy_password)
        return {"status": "already_authorized", "token": existing["token"]}

    token = str(uuid.uuid4())
    session_name = f"session_{phone.replace('+', '').replace('-', '')}"
    try:
        client = await telegram_service.get_client(session_name, api_id, api_hash, proxy_type, proxy_host, proxy_port, proxy_secret, proxy_username, proxy_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if await client.is_user_authorized():
        await db.create_user(token, phone, api_id, api_hash, session_name, "", proxy_type, proxy_host, proxy_port, proxy_secret, proxy_username, proxy_password)
        await db.update_user_auth(token, True)
        return {"status": "already_authorized", "token": token}

    try:
        phone_code_hash = await asyncio.wait_for(telegram_service.send_code(client, phone), timeout=30)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Timed out while contacting Telegram. Check the proxy settings and try again.")
    await db.create_user(token, phone, api_id, api_hash, session_name, phone_code_hash, proxy_type, proxy_host, proxy_port, proxy_secret, proxy_username, proxy_password)
    return {"status": "code_sent", "token": token}

@app.post("/api/auth/code")
async def auth_code(token: str = Form(...), code: str = Form(...)):
    user = await db.get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    client = await telegram_service.get_client(user["session_name"], user["api_id"], user["api_hash"], **user_proxy_args(user))
    result = await telegram_service.sign_in_code(client, user["phone"], code, user["phone_code_hash"])
    if result["status"] == "success":
        await db.update_user_auth(token, True)
    return result

@app.post("/api/auth/password")
async def auth_password(token: str = Form(...), password: str = Form(...)):
    user = await db.get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    client = await telegram_service.get_client(user["session_name"], user["api_id"], user["api_hash"], **user_proxy_args(user))
    result = await telegram_service.sign_in_password(client, password)
    await db.update_user_auth(token, True)
    return result

@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(get_user)):
    return {"phone": user["phone"], "authorized": True}

@app.get("/api/settings")
async def get_settings(user: dict = Depends(get_user)):
    return {"drive_name": await db.get_setting("drive_name", "My Drive")}

@app.put("/api/settings")
async def update_settings(drive_name: str = Form(...), user: dict = Depends(get_user)):
    drive_name = drive_name.strip()
    if len(drive_name) < 1:
        raise HTTPException(status_code=400, detail="Drive name is required")
    if len(drive_name) > 40:
        raise HTTPException(status_code=400, detail="Drive name must be 40 characters or fewer")
    await db.set_setting("drive_name", drive_name)
    return {"drive_name": drive_name}

@app.get("/api/storage/summary")
async def storage_summary(folder_id: Optional[str] = None, user: dict = Depends(get_user)):
    return await get_storage_summary(folder_id)

# Portal users are local username/password accounts for friends. They use the
# owner's connected Telegram account as storage and never need Telegram API keys.

@app.get("/api/portal/users")
async def list_portal_users(user: dict = Depends(get_user)):
    return await db.list_portal_users()

@app.post("/api/portal/users")
async def create_portal_user(username: str = Form(...), password: str = Form(...), can_upload: bool = Form(False), user: dict = Depends(get_user)):
    username = username.strip()
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    existing = await db.get_portal_user_by_username(username)
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")
    user_id = await db.create_portal_user(username, hash_password(password), can_upload)
    created = await db.get_portal_user_by_id(user_id)
    return created

@app.delete("/api/portal/users/{user_id}")
async def delete_portal_user(user_id: str, user: dict = Depends(get_user)):
    await db.delete_portal_user(user_id)
    return {"status": "deleted"}

@app.put("/api/portal/users/{user_id}")
async def update_portal_user(
    user_id: str,
    username: str = Form(...),
    password: Optional[str] = Form(None),
    can_upload: bool = Form(False),
    user: dict = Depends(get_user)
):
    username = username.strip()
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if password and len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = await db.get_portal_user_by_username(username)
    if existing and existing["id"] != user_id:
        raise HTTPException(status_code=409, detail="Username already exists")

    await db.update_portal_user(user_id, username, can_upload, hash_password(password) if password else None)
    updated = await db.get_portal_user_by_id(user_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Friend account not found")
    return updated

@app.post("/api/portal/login")
async def portal_login(username: str = Form(...), password: str = Form(...)):
    user = await db.get_portal_user_by_username(username.strip())
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = await db.create_portal_session(user["id"])
    return {"token": token, "username": user["username"], "can_upload": bool(user["can_upload"])}

@app.get("/api/portal/me")
async def portal_me(user: dict = Depends(get_portal_user)):
    return {"username": user["username"], "can_upload": bool(user["can_upload"])}

@app.get("/api/portal/settings")
async def portal_settings(user: dict = Depends(get_portal_user)):
    return {"drive_name": await db.get_setting("drive_name", "My Drive")}

@app.get("/api/portal/storage/summary")
async def portal_storage_summary(folder_id: Optional[str] = None, user: dict = Depends(get_portal_user)):
    return await get_storage_summary(folder_id)

# ─── Folders ───────────────────────────────────────────────────────

@app.post("/api/folders")
async def create_folder(name: str = Form(...), parent_id: Optional[str] = Form(None), user: dict = Depends(get_user)):
    folder_id = await db.create_folder(name, parent_id)
    return {"id": folder_id, "name": name, "parent_id": parent_id}

@app.get("/api/folders")
async def list_folders(parent_id: Optional[str] = None, user: dict = Depends(get_user)):
    folders = await db.get_folders(parent_id)
    return folders

@app.get("/api/folders/all")
async def list_all_folders(user: dict = Depends(get_user)):
    return await db.get_all_folders()

async def _get_all_files_in_folder(folder_id):
    # Recursive helper to get all file rows inside a folder
    files = await db.get_files(folder_id)
    subfolders = await db.get_folders(folder_id)
    for sub in subfolders:
        files.extend(await _get_all_files_in_folder(sub["id"]))
    return files

@app.delete("/api/folders/{folder_id}")
async def delete_folder(folder_id: str, user: dict = Depends(get_user)):
    folder = await db.get_folder_by_id(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Delete all files in Telegram
    files = await _get_all_files_in_folder(folder_id)
    client = await telegram_service.get_client(user["session_name"], user["api_id"], user["api_hash"], **user_proxy_args(user))
    for f in files:
        try:
            await telegram_service.delete_message(client, f["telegram_message_id"])
        except Exception:
            pass
        await db.delete_file(f["id"])

    # Delete folders recursively from DB
    async def delete_folders_recursive(fid):
        subs = await db.get_folders(fid)
        for sub in subs:
            await delete_folders_recursive(sub["id"])
        await db.delete_folder(fid)

    await delete_folders_recursive(folder_id)
    return {"status": "deleted"}

# ─── Files ─────────────────────────────────────────────────────────

@app.get("/api/files")
async def list_files(folder_id: Optional[str] = None, user: dict = Depends(get_user)):
    files = await db.get_files(folder_id)
    return files

@app.get("/api/upload-progress/{upload_id}")
async def get_upload_progress(upload_id: str, user: dict = Depends(get_user)):
    return UPLOAD_PROGRESS.get(upload_id, empty_upload_progress())

@app.post("/api/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder_id: Optional[str] = Form(None),
    upload_id: Optional[str] = Form(None),
    user: dict = Depends(get_user)
):
    set_upload_progress(upload_id, 0, "Receiving file")
    temp_path = os.path.join(TEMP_DIR, f"{uuid.uuid4()}_{file.filename}")

    size = await save_upload_to_temp(file, temp_path, upload_id)
    set_upload_progress(upload_id, 10, "Connecting to Telegram", bytes_done=size, bytes_total=size)
    client = await telegram_service.get_client(user["session_name"], user["api_id"], user["api_hash"], **user_proxy_args(user))

    try:
        msg_id = await telegram_service.upload_file(client, temp_path, caption=file.filename, progress_callback=make_progress_callback(upload_id))
        set_upload_progress(upload_id, 96, "Saving file", bytes_done=size, bytes_total=size)
        file_id = await db.create_file(msg_id, file.filename, size, file.content_type, folder_id)
        set_upload_progress(upload_id, 100, "Done", done=True, bytes_done=size, bytes_total=size, speed_bps=0)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    return {"id": file_id, "name": file.filename, "size": size}

@app.get("/api/files/{file_id}/download")
async def download_file(file_id: str, background_tasks: BackgroundTasks, user: dict = Depends(get_user)):
    file_row = await db.get_file(file_id)
    if not file_row:
        raise HTTPException(status_code=404, detail="File not found")

    client = await telegram_service.get_client(user["session_name"], user["api_id"], user["api_hash"], **user_proxy_args(user))
    message = await telegram_service.get_message(client, file_row["telegram_message_id"])
    if not message or not message.media:
        raise HTTPException(status_code=404, detail="Telegram message not found")

    temp_path = os.path.join(TEMP_DIR, f"dl_{uuid.uuid4()}_{file_row['name']}")
    await telegram_service.download_file(client, message, temp_path)

    def cleanup():
        if os.path.exists(temp_path):
            os.remove(temp_path)

    background_tasks.add_task(cleanup)
    return FileResponse(temp_path, filename=file_row["name"])

@app.post("/api/files/{file_id}/share")
async def create_share_link(file_id: str, user: dict = Depends(get_user)):
    file_row = await db.get_file(file_id)
    if not file_row:
        raise HTTPException(status_code=404, detail="File not found")
    token = await db.create_file_share(file_id)
    return {"token": token, "url": f"/api/share/{token}"}

@app.get("/api/share/{share_token}")
async def public_share_download(share_token: str, background_tasks: BackgroundTasks):
    share = await db.get_file_share(share_token)
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")

    client = await get_storage_client()
    message = await telegram_service.get_message(client, share["telegram_message_id"])
    if not message or not message.media:
        raise HTTPException(status_code=404, detail="Telegram message not found")

    temp_path = os.path.join(TEMP_DIR, f"share_{uuid.uuid4()}_{share['name']}")
    await telegram_service.download_file(client, message, temp_path)

    def cleanup():
        if os.path.exists(temp_path):
            os.remove(temp_path)

    background_tasks.add_task(cleanup)
    return FileResponse(temp_path, filename=share["name"])

@app.delete("/api/files/{file_id}")
async def delete_file(file_id: str, user: dict = Depends(get_user)):
    file_row = await db.get_file(file_id)
    if not file_row:
        raise HTTPException(status_code=404, detail="File not found")

    client = await telegram_service.get_client(user["session_name"], user["api_id"], user["api_hash"], **user_proxy_args(user))
    try:
        await telegram_service.delete_message(client, file_row["telegram_message_id"])
    except Exception:
        pass
    await db.delete_file(file_id)
    return {"status": "deleted"}

@app.put("/api/files/{file_id}/move")
async def move_file(file_id: str, folder_id: Optional[str] = Form(None), user: dict = Depends(get_user)):
    file_row = await db.get_file(file_id)
    if not file_row:
        raise HTTPException(status_code=404, detail="File not found")
    if folder_id:
        folder = await db.get_folder_by_id(folder_id)
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
    await db.move_file(file_id, folder_id)
    return {"status": "moved", "folder_id": folder_id}

# Friend portal file browsing. Friends can always download, and can upload/create
# folders when the owner grants upload permission on their local account.

@app.get("/api/portal/folders")
async def portal_list_folders(parent_id: Optional[str] = None, user: dict = Depends(get_portal_user)):
    return await db.get_folders(parent_id)

@app.post("/api/portal/folders")
async def portal_create_folder(name: str = Form(...), parent_id: Optional[str] = Form(None), user: dict = Depends(get_portal_user)):
    if not user["can_upload"]:
        raise HTTPException(status_code=403, detail="Upload permission is disabled for this account")
    folder_id = await db.create_folder(name, parent_id)
    return {"id": folder_id, "name": name, "parent_id": parent_id}

@app.get("/api/portal/files")
async def portal_list_files(folder_id: Optional[str] = None, user: dict = Depends(get_portal_user)):
    return await db.get_files(folder_id)

@app.post("/api/portal/files/{file_id}/share")
async def portal_create_share_link(file_id: str, user: dict = Depends(get_portal_user)):
    file_row = await db.get_file(file_id)
    if not file_row:
        raise HTTPException(status_code=404, detail="File not found")
    token = await db.create_file_share(file_id)
    return {"token": token, "url": f"/api/share/{token}"}

@app.get("/api/portal/upload-progress/{upload_id}")
async def get_portal_upload_progress(upload_id: str, user: dict = Depends(get_portal_user)):
    return UPLOAD_PROGRESS.get(upload_id, empty_upload_progress())

@app.post("/api/portal/files/upload")
async def portal_upload_file(
    file: UploadFile = File(...),
    folder_id: Optional[str] = Form(None),
    upload_id: Optional[str] = Form(None),
    user: dict = Depends(get_portal_user)
):
    if not user["can_upload"]:
        raise HTTPException(status_code=403, detail="Upload permission is disabled for this account")

    set_upload_progress(upload_id, 0, "Receiving file")
    temp_path = os.path.join(TEMP_DIR, f"{uuid.uuid4()}_{file.filename}")
    size = await save_upload_to_temp(file, temp_path, upload_id)

    try:
        set_upload_progress(upload_id, 10, "Connecting to Telegram", bytes_done=size, bytes_total=size)
        client = await get_storage_client()
        msg_id = await telegram_service.upload_file(client, temp_path, caption=file.filename, progress_callback=make_progress_callback(upload_id))
        set_upload_progress(upload_id, 96, "Saving file", bytes_done=size, bytes_total=size)
        file_id = await db.create_file(msg_id, file.filename, size, file.content_type, folder_id)
        set_upload_progress(upload_id, 100, "Done", done=True, bytes_done=size, bytes_total=size, speed_bps=0)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    return {"id": file_id, "name": file.filename, "size": size}

@app.get("/api/portal/files/{file_id}/download")
async def portal_download_file(file_id: str, background_tasks: BackgroundTasks, user: dict = Depends(get_portal_user)):
    file_row = await db.get_file(file_id)
    if not file_row:
        raise HTTPException(status_code=404, detail="File not found")

    client = await get_storage_client()
    message = await telegram_service.get_message(client, file_row["telegram_message_id"])
    if not message or not message.media:
        raise HTTPException(status_code=404, detail="Telegram message not found")

    temp_path = os.path.join(TEMP_DIR, f"dl_{uuid.uuid4()}_{file_row['name']}")
    await telegram_service.download_file(client, message, temp_path)

    def cleanup():
        if os.path.exists(temp_path):
            os.remove(temp_path)

    background_tasks.add_task(cleanup)
    return FileResponse(temp_path, filename=file_row["name"])

# ─── Run ───────────────────────────────────────────────────────────

if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
