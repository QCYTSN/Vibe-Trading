# Desktop Process-Boundary Threat Model

## Scope

This document covers the Electron main process, its sandboxed renderer, and the
single Vibe-Trading Python process started by the shell. The Windows packaging
layer additionally covers local credential encryption, migration, and
injection into that owned Python process. Auto-update, optional messaging
adapters, personal WeChat pairing, broker configuration, and release ownership
remain outside this change.

## Assets

- The per-launch API authentication secret.
- Local Vibe-Trading sessions, reports, configuration, and research data.
- Any credentials already present in the environment inherited by the Python
  process.
- LLM, Tushare, and QVeris credentials managed by the desktop host.
- The integrity of the executable selected as the backend.
- The ability to invoke authenticated local API routes.

## Trust boundaries

```text
Electron main process
  |-- owns random API secret
  |-- owns safeStorage encryption/decryption
  |-- selects and starts backend executable
  |-- injects Authorization on one loopback origin
  |
  +--> sandboxed renderer
  |      no Node.js, isolated context, deny-by-default permissions
  |      can use the authenticated local API through normal page requests
  |      can set or clear allowlisted credentials, but cannot read them
  |
  +--> Python backend
         binds 127.0.0.1:<random-port>
         receives API_AUTH_KEY through its child environment
         receives decrypted credentials through its child environment
```

The renderer is trusted to perform the same application actions as the web UI,
but it is not given the raw authentication secret. A renderer compromise can
still call authenticated API routes through the Electron session and is
therefore security-significant.

## Controls

### Loopback and authentication

- The backend is launched with `--host 127.0.0.1`.
- A free ephemeral port is selected for every backend start.
- The secret is 32 cryptographically random bytes encoded with Base64URL.
- The secret exists only in Electron main-process memory and the owned child
  environment. It is not written to logs, configuration, or renderer storage.
- Electron adds `Authorization: Bearer <secret>` only when the request origin
  exactly matches the active backend origin.
- Health and shutdown requests are authenticated.
- A new desktop process receives a new secret, so any stale value is invalid
  after exit.

### Renderer

- `nodeIntegration` is disabled.
- `contextIsolation` and Chromium sandboxing are enabled.
- The preload exposes status, error, retry, log-folder, backend-restart, and
  allowlisted credential-write operations. Credential values are never
  returned to the renderer.
- Browser permission checks and requests are denied by default.
- New windows are denied; safe HTTP(S) links are opened in the system browser.
- In-window navigation is restricted to the active local backend origin.
- Developer tools are unavailable when Electron reports a packaged build.
- Renderer traffic uses an isolated persistent Electron partition rather than
  the default browser session.

### Process lifecycle

- Only one desktop application instance is allowed.
- Standard output and standard error are appended to a per-user Electron log.
- Startup waits for authenticated health success and reports early process exit
  with a bounded log tail.
- Shutdown first calls the authenticated backend shutdown route.
- If the backend remains alive, Windows `taskkill /T /F` is applied only to the
  PID of the child created by this Electron process.

### Credential storage

- Credential names are checked against a fixed allowlist in the Electron main
  process.
- Values are encrypted and decrypted only through Electron `safeStorage`.
- The on-disk JSON file contains only Base64-encoded ciphertext and the list of
  configured names.
- Writes use a same-directory temporary file followed by rename.
- Existing supported values in `~/.vibe-trading/.env` and QVeris configuration
  are migrated once; the corresponding plaintext field is removed after the
  encrypted store has been persisted.
- Decrypted values are injected only into the owned backend child environment.
- Desktop secure mode prevents settings API writes from copying injected
  secrets back into dotenv.
- The credential smoke test uses an isolated temporary profile and verifies
  migration, persistence, plaintext removal, allowlisting, replacement, and
  clearing.

## Residual risks

- Renderer script injection can exercise the authenticated API even though it
  cannot read the raw secret.
- A local administrator, debugger, or process with equivalent user privileges
  may inspect either process or its environment.
- Port discovery closes the probe socket before Python binds it. Another local
  process can win that race, causing startup failure; it does not receive the
  authentication secret.
- The development override `VIBE_TRADING_EXECUTABLE` trusts the explicitly
  selected executable. Users must not point it at untrusted code.
- A compromised renderer can overwrite or clear an allowlisted credential even
  though it cannot retrieve the current value.
- `safeStorage` protects data at rest for the current Windows user; it does not
  protect against malware, a debugger, or another process already executing
  with equivalent user privileges.
- Migration cannot erase plaintext that may remain in backups, filesystem
  history, crash dumps, or external logs.
- The child inherits both the desktop process environment and decrypted
  credentials required by the backend.
- Forceful tree termination can interrupt in-progress local work after the
  graceful shutdown timeout.
- This source-only change does not provide a signing identity, installer
  reputation, update authenticity, or an official HKUDS release channel.

## Non-goals

- Protecting against a fully compromised Windows account or administrator.
- Enabling remote API access.
- Managing broker, exchange, or IM credentials.
- Exposing credential values back to the renderer.
- Publishing releases, choosing a signing identity, or updating the
  application.
