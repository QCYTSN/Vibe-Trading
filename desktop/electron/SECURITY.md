# Vibe-Trading Desktop Community Security

## Security model

- The Python API binds to `127.0.0.1` on a random port.
- A random per-launch API authentication key is injected into the backend and renderer.
- Renderer Node.js integration is disabled; context isolation and the Chromium sandbox remain enabled.
- Desktop IPC requests validate their sender and expose a narrow allowlisted interface.
- Supported credentials use OS-backed encryption. The backend receives them only as child-process environment variables.
- Update checks are disabled unless the package was built for an explicit GitHub repository.

## Financial safety

Model output and third-party market data may be wrong or incomplete. Live trading must remain opt-in. Verify broker identity, read-only probes, mandate limits, order notional limits, and the halt control before placing any real order.

## Reporting a vulnerability

Do not open a public issue containing API keys, account identifiers, broker details, or exploit instructions. Before this community desktop project has its own security contact, report upstream Vibe-Trading vulnerabilities through the security channel published by HKUDS and desktop-shell-specific issues privately to the fork maintainer.

## Release signing

The build accepts `CSC_LINK` and `CSC_KEY_PASSWORD` through GitHub Actions secrets. A publicly distributed Windows build should be signed with a trusted code-signing certificate. Unsigned Alpha builds must be labelled clearly and will trigger Windows reputation warnings.
