# Desktop release roadmap

## What is working now

- Electron window with the existing React UI
- Random loopback port and per-launch API authentication key
- Embedded, relocatable Python 3.12 runtime
- Backend readiness checks, logs, retry UI, and graceful shutdown
- Standalone backend smoke test
- Packaged Windows directory build
- NSIS build configuration

## Required before a public stable release

1. Test install, upgrade, uninstall, and all major workflows on a clean Windows 10/11 VM.
2. Add project-owned icons and confirm branding with HKUDS; retain Community branding until approved.
3. Add Authenticode signing and publish SHA-256 checksums for every release artifact.
4. Audit all third-party licenses included in the embedded runtime.
5. Move model and broker credentials from plaintext `.env` storage to an OS credential store.
6. Move runs, sessions, and uploads out of installed program files into a user-writable data directory.
7. Add a Windows Job Object helper so the backend is terminated even if Electron crashes hard.
8. Add first-run provider setup, OAuth browser handoff, and actionable dependency diagnostics.
9. Trim optional Python dependencies or split them into downloadable feature packs.
10. Add automatic-update signing and rollback only after release signing is established.

## Python runtime policy

The backend is a directory-based sidecar, not a PyInstaller one-file executable. The
runtime builder uses the official Python embeddable distribution, installs the project
and dependencies into `Lib/site-packages`, copies the production frontend, and performs
an import smoke test. This is intentionally conservative: reliability comes before file
size for the first public prototype.

The next size pass should measure features before removing packages. Likely candidates
for optional packs are PDF/report tooling, presentation/spreadsheet tooling, selected
broker SDKs, and developer/test assets. Scientific libraries required by core backtests
must remain bundled.

## Upstream strategy

Keep desktop-specific code under `desktop/electron` and avoid invasive changes to the
agent core. Before publishing under a Vibe-Trading-derived name, open an upstream design
discussion describing the process model, security boundary, packaging layout, and
Community branding. Every upstream commit must include the DCO `Signed-off-by` trailer.
