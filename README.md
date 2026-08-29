# SHARE Lead Generator (Chrome extension)

Scrapes B2B leads via an Apify actor and dispatches them to the **SHARE master sheet**,
tagged with an owner `userId` so the master sheet routes each lead to the right
teammate's daughter sheet.

## How it fits the SHARE system

```
Apify actor ──scrape──► extension ──POST { userId, leads }──► Master Sheet doPost
                                                                          │ routes by userId
                                                                          ▼
                                                                  Teammate's lead tab
                                                                  (or Pending_Uploads,
                                                                   if they stage intake)
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
1. Paste target **domains** (one per line) → **Run & get leads**.
   The scrape runs in a background window and the results open on their own.
2. If auto-dispatch fails, the dispatch table opens with the reason at the top.
   **View scraped table** reaches it manually at any time.
3. On the dispatch page your **User ID** is filled in from your login (read-only —
   operators never type it).
4. Click **Push to my sheet**. You get a real result, e.g.
   `Done — routed 96/100 · 4 already in your sheet`, or a clear error if the batch
   was blocked (deactivated account, usage limit, unregistered userId).

   **Duplicates are not failures.** The master router de-duplicates on recipient
   against what is already in your sheet, so re-scraping a domain you have worked
   before can never produce a second email to the same person.

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
| `assets/` | SHARE logo lockups + extension icons |
| `popup.html/js` | login, domain entry, triggers extraction |
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
