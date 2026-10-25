# Short email agent + Gmail

The completed video panel now offers an email agent. It drafts 30–50 words from the saved video script (maximum 65), lets you edit the recipient, subject and body, then sends through your Google account with the MP4 attached. It uses the existing OpenRouter key and database; no MCP or additional backend is needed. It does not research recipients or send automatically when a video finishes.

## One-time setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project and enable **Gmail API**.
2. Configure **Google Auth Platform → Branding / Audience**. For a personal prototype choose External, keep Testing, and add your own Gmail address as a test user. Workspace accounts may require administrator permission. Request only `https://www.googleapis.com/auth/gmail.send` under Data Access.
3. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI: `http://localhost:53682/oauth2/callback`.
4. Put `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in your local `.env`. Generate an admin key with `openssl rand -hex 32` and add it as `EMAIL_ADMIN_KEY`. Keep these values server-side.
5. Run `npm run gmail:connect` locally. Open the URL printed in the terminal and select the account you want emails sent from. Approve sending access. The callback listener runs only on your local machine, so run the script on the computer whose browser you use.
6. The script writes a new `.env.gmail` file with restrictive permissions. Copy its `GMAIL_REFRESH_TOKEN=...` line into `.env`, delete `.env.gmail`, then restart the app. Setup deliberately refuses to overwrite an existing token file. Never commit credentials. For deployed hosting, set these same four variables in its server environment; the setup script still runs locally.

Google OAuth apps left in External Testing generally receive refresh tokens that expire after seven days for this scope. Reauthorize as needed during development, or configure the consent app for production and meet Google's applicable verification requirements. Revoking access in Google Account settings disconnects the sender.

## Use it

1. Open **Research**, select a saved report, and finish generating its video.
2. Below the video, enter your email admin key and recipient address. The key stays in this component's memory; it is not stored in browser storage.
3. Click **Draft short email**, review and edit the text, then click **Send email with video**. This button sends a real email immediately to the entered recipient.
4. Check history and the connected account's Gmail Sent folder. Test first by addressing an email to yourself. “Sent” means Gmail accepted it, not proof that it reached the recipient's inbox.

An MP4 attachment avoids sending recipients a localhost or private dashboard URL. The current limit is 18 MB before MIME encoding; larger videos must be compressed before using this pipeline. There is no public share link in this implementation. Remote OpenRouter video storage and local MP4 files are both supported.

## Reliability and access

`email_deliveries` is created automatically in SQLite or D1, recording the exact recipient, subject, body, timestamps, status and Gmail message ID. One atomic unique claim per video/recipient prevents double-clicks, concurrent requests and retry duplicates. Recipient addresses are normalized to lowercase.

Preparation failures happen before the claim and may be retried. Once a send starts, it is never retried automatically. `rejected` records a Gmail HTTP rejection; `unknown` means the submission outcome could not be confirmed. A crash can leave `sending`. These statuses all block another attempt for that video/recipient. Inspect Gmail Sent and the stored attempt before any deliberate recovery. There is intentionally no blind resend button. Gmail acceptance followed by a database failure can also leave an uncertain record.

Email API requests require a bearer admin key of at least 32 characters. Use HTTPS when deployed and share the key only with the operator; it grants compose, send and history access for this single configured mailbox. This is a single-operator integration, not a multi-user account system. Gmail tokens stay in server environment variables. The model receives only the video script and cannot call Gmail or choose the recipient.

No recurring schedule, background sending, Gmail inbox reading, or delivery tracking is included. The account is determined by the refresh token; change accounts by rerunning setup with the desired Google account and replacing the token.

## Checks and references

`npm run test:email` uses mocked OAuth/Gmail responses, checks header injection, word limits, MIME attachment encoding, admin authorization, concurrent duplicate prevention and ambiguous-send recovery. It never sends real email.

Google references: [OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [sending MIME messages](https://developers.google.com/workspace/gmail/api/guides/sending), [users.messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send).
