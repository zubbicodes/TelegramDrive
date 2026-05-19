# Telegram Drive Project Overview

Telegram Drive is a small personal cloud storage web app. It lets one owner connect a Telegram account, then use Telegram Saved Messages as the actual storage location for uploaded files.

In simple terms: the web app is the file manager, and Telegram is the storage backend.

## What It Does

- Upload files from a browser.
- Store those files in the owner's Telegram Saved Messages.
- Keep file names, folders, and metadata in a local SQLite database.
- Let friends log in with a normal username and password.
- Let friends download shared files.
- Optionally let trusted friends upload files too.
- Create public share links for individual files.

## How Telegram Is Used As Cloud Storage

Telegram allows users to send files to their own Saved Messages chat. This project uses that feature programmatically.

When a file is uploaded:

1. The browser sends the file to the local backend server.
2. The backend uploads the file to the owner's Telegram Saved Messages.
3. Telegram stores the actual file.
4. The local database saves information like:
   - file name
   - file size
   - folder location
   - Telegram message ID

When someone downloads a file:

1. The app looks up the file in the local database.
2. It finds the related Telegram message ID.
3. The backend downloads the file from Telegram.
4. The browser receives it as a normal file download.

## Owner Login

The owner is the person whose Telegram account stores the files.

The owner logs in using Telegram API credentials and phone verification. Once connected, the app can upload and download files through that Telegram account.

Friends do not need Telegram API credentials.

## Friend Portal

Friends can use a simple login screen with:

- username
- password

The owner creates these accounts from inside the app.

Friend accounts can be:

- download-only
- allowed to upload files and create folders

This makes it possible to share the storage space without giving friends access to the Telegram account or Telegram API credentials.

## Share Links

Each file can have a public share link.

Anyone with that link can download that specific file without logging in.

This is useful when you want to quickly send one file to someone without creating a full friend account for them.

## What Runs Locally

The project has two parts:

- Backend: FastAPI server that talks to Telegram and manages the database.
- Frontend: React web interface for owner and friend access.

The local SQLite database stores app metadata, user accounts, folder structure, and file mappings. The actual uploaded files are stored in Telegram.

## Why This Is Useful

This project turns a Telegram account into a lightweight personal cloud drive. It gives a familiar web interface for uploading, organizing, downloading, and sharing files while using Telegram as the storage layer.

It is best suited for personal use, small friend groups, and local/private deployments.

## Important Notes

- The owner's Telegram session should be kept private.
- Public share links should only be sent to people who are allowed to download the file.
- Anyone with a public share link can access that file.
- Friend accounts should only get upload permission if they are trusted.
- For access outside the local network, the app should be deployed securely with HTTPS.
