# Changelog

All notable changes to the SHARE Lead Generator extension.
This project uses [Semantic Versioning](https://semver.org/).

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
