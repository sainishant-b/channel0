# Watch Party — Privacy Policy

_Last updated: 2026-05-05_

## What we collect

| Data | When | Where it lives |
|------|------|----------------|
| A generated user ID (random) | First install | Synced in your Chrome profile (`chrome.storage.sync`) |
| A display name (you set it, or `Guest_xxxx`) | You enter it, or auto-generated | Synced in your Chrome profile |
| Google profile (id, email, name, avatar URL) | Only if you choose "Sign in with Google" | Synced in your Chrome profile, plus your Appwrite account |
| Channel metadata (name, description, code) | When you create or join a channel | Appwrite database |
| Playlist video IDs and titles | When you add a YouTube URL to a channel | Appwrite database |
| Chat messages | When you send them | Appwrite database — wiped automatically when the host stops the broadcast |
| Presence pings (your user ID + channel ID + timestamp) | Every 20 seconds while in a channel | Appwrite database — stale rows are pruned after 60 seconds |

We do not collect, store, or transmit:

- Your YouTube watch history
- Your YouTube account or Google credentials (Google OAuth never gives us your password)
- Browsing data from any other tab
- Page contents from non-YouTube sites
- Any data when you are not actively in a watch party

## What we share

Nothing. The extension talks to:

- `youtube.com` — to inject the chat overlay and read public oEmbed metadata for the playlist editor
- Your configured Appwrite project — to store the data above
- `accounts.google.com` — only during the optional Google sign-in flow

No third-party analytics, no advertising, no telemetry.

## Your controls

- **Anonymous use**: skip Google sign-in entirely. Chat messages remain attached to a randomly generated ID.
- **Sign out**: clears the local Google profile cache and ends your Appwrite session.
- **Delete a channel you host**: removes the channel doc and cascades playlist, chat, and presence rows.
- **Uninstall the extension**: removes all local storage (`chrome.storage.sync` and `chrome.storage.local`). Data already in Appwrite stays unless you delete the channels first.

## Contact

Questions or deletion requests: open an issue on the project repository. There is no human-readable email yet because this is a hobby project.
