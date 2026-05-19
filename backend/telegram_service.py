import os
import socks
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.network.connection.tcpmtproxy import ConnectionTcpMTProxyRandomizedIntermediate

SESSIONS_DIR = os.path.join(os.path.dirname(__file__), "sessions")
os.makedirs(SESSIONS_DIR, exist_ok=True)

class TelegramService:
    def __init__(self):
        self.clients = {}

    def _get_session_path(self, name):
        return os.path.join(SESSIONS_DIR, name)

    def _build_proxy(self, proxy_type="none", host=None, port=None, secret=None, username=None, password=None):
        proxy_type = (proxy_type or "none").lower()
        if proxy_type == "none" or not any([host, port, secret, username, password]):
            return None
        if proxy_type == "mtproto":
            if not all([host, port, secret]):
                raise ValueError("MTProto proxy requires host, port, and secret")
            return {
                "connection": ConnectionTcpMTProxyRandomizedIntermediate,
                "proxy": (host, int(port), secret),
            }
        if proxy_type == "socks5":
            if not all([host, port]):
                raise ValueError("SOCKS5 proxy requires host and port")
            return {
                "proxy": (
                    socks.SOCKS5,
                    host,
                    int(port),
                    True,
                    username or None,
                    password or None,
                ),
            }
        raise ValueError("Proxy type must be one of: none, mtproto, socks5")

    async def get_client(
        self,
        session_name,
        api_id,
        api_hash,
        proxy_type="none",
        proxy_host=None,
        proxy_port=None,
        proxy_secret=None,
        proxy_username=None,
        proxy_password=None,
    ):
        proxy_config = self._build_proxy(proxy_type, proxy_host, proxy_port, proxy_secret, proxy_username, proxy_password)
        cache_key = (session_name, proxy_type, proxy_host, proxy_port, proxy_secret, proxy_username, bool(proxy_password))
        if cache_key in self.clients:
            client = self.clients[cache_key]
            if not client.is_connected():
                await client.connect()
            return client

        kwargs = {
            "timeout": 10,
            "connection_retries": 1,
            "request_retries": 1,
        }
        if proxy_config:
            kwargs.update(proxy_config)

        client = TelegramClient(self._get_session_path(session_name), api_id, api_hash, **kwargs)
        await client.connect()
        self.clients[cache_key] = client
        return client

    async def send_code(self, client, phone):
        result = await client.send_code_request(phone)
        return result.phone_code_hash

    async def sign_in_code(self, client, phone, code, phone_code_hash):
        try:
            await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
            return {"status": "success"}
        except SessionPasswordNeededError:
            return {"status": "password_needed"}

    async def sign_in_password(self, client, password):
        await client.sign_in(password=password)
        return {"status": "success"}

    async def upload_file(self, client, file_path, caption=None, progress_callback=None):
        msg = await client.send_file('me', file_path, caption=caption, progress_callback=progress_callback)
        return msg.id

    async def delete_message(self, client, message_id):
        await client.delete_messages('me', [message_id])

    async def get_message(self, client, message_id):
        messages = await client.get_messages('me', ids=[message_id])
        if messages:
            return messages[0]
        return None

    async def download_file(self, client, message, file_path):
        await client.download_media(message, file=file_path)

telegram_service = TelegramService()
