# Private Bookmarks by VaultForYou

A Chrome extension (Manifest V3) that saves pages into a password-protected, encrypted vault on this computer. It is also the desktop entry point to the [VaultForYou](https://www.vaultforyou.app/) iPhone app.

## What it does

- **Popup** (toolbar button or `Alt+Shift+B`): welcome, create vault, unlock, save the current page into a folder, "already saved" detection.
- **Side panel library**: search, filter chips (All, Favorites, folders, No folder), favorites, edit, move to folder, delete, keyboard support (`/` search, `↑ ↓` rows, `Esc` close).
- **Folders**: create, rename, delete (keep or delete the bookmarks inside).
- **Settings**: auto-lock (1, 5, 15, 60 minutes or when Chrome closes), change password, delete vault.
- **Backup and restore**: encrypted `.pvb` export, import with merge (existing bookmarks kept, duplicates skipped).
- **Onboarding tab** opens on install: create the vault inline, how-to steps, and the VaultForYou app pitch.

## Security model

- Bookmarks *and* folder names are encrypted with AES-256-GCM. The key comes from the password via PBKDF2-SHA-256 (600,000 iterations, random 16-byte salt).
- The encrypted vault is in `chrome.storage.local`. While the vault is unlocked, the derived key sits in `chrome.storage.session` (memory only, extension pages only, cleared when Chrome closes).
- The vault locks after the chosen idle time (`chrome.idle`) and whenever the screen locks.
- There's no server, no account, no analytics, and no remote code. The CSP blocks all network connections from extension pages (`connect-src 'none'`), and fonts are bundled.
- There's no password recovery. A backup opens with the password the vault had when the backup was exported.

## Funnel

All links to vaultforyou.app go through `siteUrl()` in `src/config.js` and carry
`utm_source=chrome_extension&utm_medium=extension&utm_campaign=private_bookmarks&utm_content=<placement>`:

| Placement | `utm_content` |
| --- | --- |
| Invite card after saving a page (can be dismissed) | `popup_saved_invite` |
| Settings › VaultForYou for iPhone card | `settings_card` |
| Settings footer link | `settings_footer` |
| Onboarding tab CTA button / QR code / footer | `welcome_cta` / `welcome_qr` / `welcome_footer` |
| Uninstall page | `uninstall` |
| Chrome Web Store homepage link | `homepage_url` |

To point the CTA at the App Store, change `SITE` / `siteUrl()` in `src/config.js`. If you do, regenerate `images/app-qr.svg` too, because it encodes the URL.

## Develop

No build step.

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.

Package for the Chrome Web Store:

```bash
zip -r private-bookmarks.zip manifest.json background.js popup.html sidepanel.html welcome.html src fonts icons images
```

Needs Chrome 116+. "Save current page" from the side panel opens the popup through `chrome.action.openPopup()` (Chrome 127+). On older versions it asks you to click the toolbar button.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Read the title and address of the tab you're saving, only when you click the button. No access to browsing history. |
| `storage` | Keep the encrypted vault and settings on this computer. |
| `sidePanel` | Show the library in Chrome's side panel. |
| `idle` | Auto-lock when the computer is inactive or the screen locks. |

Fonts: Geist and Instrument Serif (SIL Open Font License), bundled in `fonts/`.
