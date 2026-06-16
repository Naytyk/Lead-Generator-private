# Changelog

All notable changes to the SHARE Lead Generator extension.
This project uses [Semantic Versioning](https://semver.org/).

## [3.2.0] - 2026-06-17
### Changed
- **Removed the shared secret.** Dispatch now authenticates via the unguessable
  master web-app URL + the logged-in `userId`; payload is `{ userId, leads }`.
- Dropped the Shared Secret field from the dispatch UI.

## [3.1.0] - 2026-06-17
### Added
- **Login gate**: the popup now requires SHARE login (email + password from the
  onboarding mail) via `POST /api/login` before any extraction or dispatch.
- **Activation pre-run check**: dispatch first calls `POST /api/extension/use`, so a
  **deactivated user is blocked** (and usage is counted). The popup also re-checks
  activation on open via `GET /api/script/status/:userId`.
- userId is now **auto-resolved from the login** (read-only) — operators never type it.

## [3.0.0] - 2026-06-17
First published release of the SHARE-integrated Lead Generator (fresh baseline).
### Added
- Dispatch leads to the SHARE **master sheet** with the required `secret` and batch
  `userId`, so leads route to the correct teammate's daughter sheet.
- Dispatch UI now has **User ID** and **Shared Secret** fields (remembered between runs).
- Leads are POSTed via the background service worker, which reads the JSON response and
  shows **real routed / unrouted feedback** instead of fire-and-forget.
- `host_permissions` for `script.google.com` and `script.googleusercontent.com`.
- `build.sh` produces a versioned `dist/` zip for the Chrome Web Store.

### Changed
- Renamed to **SHARE Lead Generator**; rewrote the README for the SHARE workflow.

### Removed
- Legacy `no-cors` fire-and-forget push (replaced by the worker-based dispatch).
- Old `build-chome.sh`.

## [1.5.0] - prior
- Apify-based scraping: domain config, Monaco injection, results extraction, basic
  webhook push (`{ leads }`, no secret/userId).
