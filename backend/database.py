import aiosqlite
import os
import uuid
from datetime import datetime

DB_PATH = os.getenv("TELEGRAM_DRIVE_DB_PATH", os.path.join(os.path.dirname(__file__), "telegram_drive.db"))
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                token TEXT PRIMARY KEY,
                phone TEXT UNIQUE,
                api_id INTEGER,
                api_hash TEXT,
                session_name TEXT,
                phone_code_hash TEXT,
                proxy_type TEXT DEFAULT 'none',
                proxy_host TEXT,
                proxy_port INTEGER,
                proxy_secret TEXT,
                proxy_username TEXT,
                proxy_password TEXT,
                mtproxy_host TEXT,
                mtproxy_port INTEGER,
                mtproxy_secret TEXT,
                is_authorized INTEGER DEFAULT 0
            )
        """)
        await _ensure_column(db, "users", "mtproxy_host", "TEXT")
        await _ensure_column(db, "users", "mtproxy_port", "INTEGER")
        await _ensure_column(db, "users", "mtproxy_secret", "TEXT")
        await _ensure_column(db, "users", "proxy_type", "TEXT DEFAULT 'none'")
        await _ensure_column(db, "users", "proxy_host", "TEXT")
        await _ensure_column(db, "users", "proxy_port", "INTEGER")
        await _ensure_column(db, "users", "proxy_secret", "TEXT")
        await _ensure_column(db, "users", "proxy_username", "TEXT")
        await _ensure_column(db, "users", "proxy_password", "TEXT")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                parent_id TEXT,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                telegram_message_id INTEGER,
                name TEXT NOT NULL,
                size INTEGER,
                mime_type TEXT,
                folder_id TEXT,
                uploaded_by TEXT,
                created_at TEXT
            )
        """)
        await _ensure_column(db, "files", "uploaded_by", "TEXT")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS portal_users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                can_upload INTEGER DEFAULT 0,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS portal_sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS file_shares (
                token TEXT PRIMARY KEY,
                file_id TEXT NOT NULL,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        await db.commit()

async def _ensure_column(db, table, column, column_type):
    async with db.execute(f"PRAGMA table_info({table})") as cursor:
        columns = [row[1] for row in await cursor.fetchall()]
    if column not in columns:
        await db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")

async def create_user(
    token,
    phone,
    api_id,
    api_hash,
    session_name,
    phone_code_hash,
    proxy_type="none",
    proxy_host=None,
    proxy_port=None,
    proxy_secret=None,
    proxy_username=None,
    proxy_password=None,
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO users (
                token, phone, api_id, api_hash, session_name, phone_code_hash,
                proxy_type, proxy_host, proxy_port, proxy_secret, proxy_username, proxy_password,
                mtproxy_host, mtproxy_port, mtproxy_secret
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(phone) DO UPDATE SET
                token = excluded.token,
                api_id = excluded.api_id,
                api_hash = excluded.api_hash,
                session_name = excluded.session_name,
                phone_code_hash = excluded.phone_code_hash,
                proxy_type = excluded.proxy_type,
                proxy_host = excluded.proxy_host,
                proxy_port = excluded.proxy_port,
                proxy_secret = excluded.proxy_secret,
                proxy_username = excluded.proxy_username,
                proxy_password = excluded.proxy_password,
                mtproxy_host = excluded.mtproxy_host,
                mtproxy_port = excluded.mtproxy_port,
                mtproxy_secret = excluded.mtproxy_secret,
                is_authorized = 0
            """,
            (
                token, phone, api_id, api_hash, session_name, phone_code_hash,
                proxy_type, proxy_host, proxy_port, proxy_secret, proxy_username, proxy_password,
                proxy_host if proxy_type == "mtproto" else None,
                proxy_port if proxy_type == "mtproto" else None,
                proxy_secret if proxy_type == "mtproto" else None,
            )
        )
        await db.commit()

async def update_user_connection(
    token,
    api_id,
    api_hash,
    proxy_type="none",
    proxy_host=None,
    proxy_port=None,
    proxy_secret=None,
    proxy_username=None,
    proxy_password=None,
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            UPDATE users
            SET
                api_id = ?,
                api_hash = ?,
                proxy_type = ?,
                proxy_host = ?,
                proxy_port = ?,
                proxy_secret = ?,
                proxy_username = ?,
                proxy_password = ?,
                mtproxy_host = ?,
                mtproxy_port = ?,
                mtproxy_secret = ?
            WHERE token = ?
            """,
            (
                api_id, api_hash, proxy_type, proxy_host, proxy_port, proxy_secret, proxy_username, proxy_password,
                proxy_host if proxy_type == "mtproto" else None,
                proxy_port if proxy_type == "mtproto" else None,
                proxy_secret if proxy_type == "mtproto" else None,
                token,
            )
        )
        await db.commit()

async def get_user_by_token(token):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE token = ?", (token,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def get_user_by_phone(phone):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE phone = ?", (phone,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def get_first_authorized_user():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE is_authorized = 1 LIMIT 1") as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def update_user_auth(token, is_authorized):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE users SET is_authorized = ? WHERE token = ?", (1 if is_authorized else 0, token))
        await db.commit()

async def create_folder(name, parent_id=None):
    folder_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)",
            (folder_id, name, parent_id, created_at)
        )
        await db.commit()
    return folder_id

async def get_folders(parent_id=None):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if parent_id:
            async with db.execute("SELECT * FROM folders WHERE parent_id = ?", (parent_id,)) as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute("SELECT * FROM folders WHERE parent_id IS NULL") as cursor:
                rows = await cursor.fetchall()
        return [dict(row) for row in rows]

async def get_all_folders():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM folders ORDER BY name") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

async def delete_folder(folder_id):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
        await db.execute("DELETE FROM folders WHERE parent_id = ?", (folder_id,))
        await db.commit()

async def get_folder_by_id(folder_id):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def create_file(telegram_message_id, name, size, mime_type, folder_id=None, uploaded_by="Owner"):
    file_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO files (id, telegram_message_id, name, size, mime_type, folder_id, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (file_id, telegram_message_id, name, size, mime_type, folder_id, uploaded_by, created_at)
        )
        await db.commit()
    return file_id

async def get_files(folder_id=None):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if folder_id:
            async with db.execute("SELECT * FROM files WHERE folder_id = ?", (folder_id,)) as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute("SELECT * FROM files WHERE folder_id IS NULL") as cursor:
                rows = await cursor.fetchall()
        return [dict(row) for row in rows]

async def get_all_files():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM files") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

async def get_file(file_id):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM files WHERE id = ?", (file_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def move_file(file_id, folder_id=None):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE files SET folder_id = ? WHERE id = ?", (folder_id, file_id))
        await db.commit()

async def delete_file(file_id):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM file_shares WHERE file_id = ?", (file_id,))
        await db.execute("DELETE FROM files WHERE id = ?", (file_id,))
        await db.commit()

async def create_file_share(file_id):
    token = secrets_token()
    created_at = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO file_shares (token, file_id, created_at) VALUES (?, ?, ?)",
            (token, file_id, created_at)
        )
        await db.commit()
    return token

def secrets_token():
    return uuid.uuid4().hex + uuid.uuid4().hex

async def get_file_share(token):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT fs.token, fs.file_id, f.telegram_message_id, f.name, f.size, f.mime_type
            FROM file_shares fs
            JOIN files f ON f.id = fs.file_id
            WHERE fs.token = ?
            """,
            (token,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def create_portal_user(username, password_hash, can_upload=False):
    user_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO portal_users (id, username, password_hash, can_upload, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, username, password_hash, 1 if can_upload else 0, created_at)
        )
        await db.commit()
    return user_id

async def get_portal_user_by_username(username):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM portal_users WHERE username = ?", (username,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def get_portal_user_by_id(user_id):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id, username, can_upload, created_at FROM portal_users WHERE id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def list_portal_users():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id, username, can_upload, created_at FROM portal_users ORDER BY username") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

async def delete_portal_user(user_id):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM portal_sessions WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM portal_users WHERE id = ?", (user_id,))
        await db.commit()

async def update_portal_user(user_id, username, can_upload, password_hash=None):
    async with aiosqlite.connect(DB_PATH) as db:
        if password_hash:
            await db.execute(
                """
                UPDATE portal_users
                SET username = ?, can_upload = ?, password_hash = ?
                WHERE id = ?
                """,
                (username, 1 if can_upload else 0, password_hash, user_id)
            )
        else:
            await db.execute(
                "UPDATE portal_users SET username = ?, can_upload = ? WHERE id = ?",
                (username, 1 if can_upload else 0, user_id)
            )
        await db.commit()

async def update_portal_password(user_id, password_hash):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE portal_users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
        await db.commit()

async def create_portal_session(user_id):
    token = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO portal_sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, created_at)
        )
        await db.commit()
    return token

async def get_portal_user_by_token(token):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT pu.id, pu.username, pu.password_hash, pu.can_upload, pu.created_at
            FROM portal_sessions ps
            JOIN portal_users pu ON pu.id = ps.user_id
            WHERE ps.token = ?
            """,
            (token,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

async def get_setting(key, default=None):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT value FROM app_settings WHERE key = ?", (key,)) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else default

async def set_setting(key, value):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO app_settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, value)
        )
        await db.commit()
