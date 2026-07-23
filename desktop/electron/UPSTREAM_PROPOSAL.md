# Proposal: Windows Desktop Shell for Vibe-Trading

Hello HKUDS / Vibe-Trading maintainers,

I built a Windows-focused community desktop shell around the existing React + FastAPI + Python application. The goal is to preserve the current web and CLI architecture while making local use installable and easier to operate.

This is currently named **Vibe-Trading Desktop Community** and is not presented as an official HKUDS application.

## What is implemented

- Electron host that starts the embedded Python backend on a random loopback port, waits for health, opens the existing Web UI, and shuts down the backend process tree on exit.
- Windows NSIS installer with the project icon, shortcuts, an embedded Python 3.12 runtime, frontend assets, license notices, and release checksums.
- GitHub Releases update flow with explicit check, download progress, restart/install, `latest.yml`, blockmap support, and a draft-release GitHub Actions workflow.
- OS-backed credential encryption through Electron `safeStorage` / Windows DPAPI, including migration of supported LLM, market-data, QVeris, personal WeChat, and top-level IM channel secrets from legacy plaintext files.
- First-run disclosure covering community status, local data storage, model limitations, and live-trading risk.
- A registry-driven IM channel center that shows every built-in adapter, dependency/configuration state, generated setup fields, runtime controls, pairing controls, and personal WeChat QR login.
- Existing model/provider UI improvements, runtime model display, reply elapsed time, clipboard repair, and route-loading improvements.

## Validation completed

- 282/282 frontend tests pass.
- 57/57 settings/channel/QVeris/runtime backend tests pass.
- Embedded backend smoke tests pass; 68 OpenAPI operations and the main UI/API routes are probed.
- Windows unpacked build starts the local backend and renders the first-run UI; closing the window leaves zero Electron/Python processes.
- A Windows 11 clean VM accepted an earlier desktop build. The new credential/update/onboarding build still needs one final clean-install and N-to-N+1 update test after a release repository is selected.

## Decisions requested from upstream

1. Would you prefer this to remain a community fork, become a separate companion repository, or be proposed as a `desktop/` directory in the main repository?
2. Is the name `Vibe-Trading Desktop Community` acceptable during review? What icon/trademark wording do you prefer?
3. Who should own Windows code signing and the GitHub Releases update feed if this becomes official?
4. Which optional channel SDKs should be included in the default Windows runtime versus installed on demand?
5. Is the current personal WeChat iLink integration an intended supported surface for desktop distribution?

## Suggested review path

I can provide a focused branch containing the desktop directory, minimal backend APIs, frontend settings components, tests, and workflow separately from unrelated upstream changes. I would appreciate guidance before publishing binaries that might be mistaken for an official HKUDS release.
