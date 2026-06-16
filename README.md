# SHARE Lead Generator (Chrome extension)

Scrapes B2B leads via an Apify actor and dispatches them to the **SHARE master sheet**,
tagged with an owner `userId` so the master sheet routes each lead to the right
teammate's daughter sheet.

## How it fits the SHARE system

```
Apify actor ──scrape──► extension ──POST { userId, leads }──► Master Sheet doPost
                                                                          │ routes by userId
                                                                          ▼
                                                                  Daughter "Emails" tab
```

The POST payload matches what `AppScripts/master` expects:

```json
{
  "userId": "ABCDEF",
  "leads": [
    { "poc": "Jane Doe", "first_name": "Jane", "firm": "Acme",
      "recipient": "jane@acme.com", "poc_role": "Head of BD" }
  ]
}
```

`userId` is sent once at the batch level (every lead in the batch belongs to that
teammate). The master router reads `lead.userId || body.userId`.

## Install (dev)

1. `chrome://extensions/` → enable **Developer mode**.
2. **Load unpacked** → select this folder (or `dist/unpacked` after a build).

## Usage

0. Click the extension icon → **log in** with the email + password from your SHARE
   onboarding email. Deactivated accounts can't log in or dispatch. Your userId is
   resolved automatically from the login.
1. Paste target **domains** (one per line) → **Start Extraction**.
   The Apify input page opens and runs automatically.
2. When the run finishes, click **View Scraped Table** to open the dispatch page.
3. On the dispatch page fill in, once (they're remembered):
   - **Master Web App URL** — the `…/exec` URL of your deployed master sheet web app
     (pre-filled from the hardcoded default).
   - **User ID** is auto-filled from your login (read-only).
4. Click **Push to Master Sheet**. You'll see real feedback, e.g.
   `Done — routed 100/100`, or a clear error if some leads couldn't be routed
   (e.g. the userId isn't registered yet).

## Build / release

```bash
bash build.sh          # reads version from manifest.json
```
Produces:
- `dist/unpacked/` — load-unpacked for testing.
- `dist/SHARE-Lead-Generator-v<version>.zip` — upload to the Chrome Web Store.

Bump `"version"` in `manifest.json` before building. See `CHANGELOG.md` and the git
tags (`vX.Y.Z`) for release history.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest, permissions, host permissions |
| `popup.html/js` | domain entry + triggers extraction |
| `content.js` | drives the Apify Monaco editor on the input page |
| `background.js` | extracts results, and POSTs leads to the master web app |
| `results.html/js` | dispatch UI (URL / auto-filled userId) + live status |
| `build.sh` | packaging script |

## Troubleshooting

- **`unrouted` > 0** — those leads' `userId` has no registered sheet yet; the teammate
  must finish `Run Full Setup` so their sheet is registered.
- **No response / network error** — confirm the web app URL ends in `/exec` and is
  deployed with *Access: Anyone*; both `script.google.com` and `script.googleusercontent.com`
  are in `host_permissions`.
