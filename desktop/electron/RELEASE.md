# Windows Release Runbook

> **Prerequisite:** run this from the complete Vibe-Trading fork. The current desktop
> development branch is based on upstream Vibe-Trading `0.1.12`; rebase or merge
> upstream changes and repeat all checks before each release.

## Repository setup

1. Publish the work in a fork or in a repository approved by HKUDS.
2. Keep the product name `Vibe-Trading Desktop Community` until the upstream maintainers explicitly approve official branding.
3. Add a trusted Windows signing certificate as repository secrets `CSC_LINK` and `CSC_KEY_PASSWORD` when available.

## Version and tag

The desktop version is read from `desktop/electron/package.json`. Create a matching tag:

```text
desktop-v0.3.0
```

The Windows workflow builds the frontend and embedded Python runtime, runs smoke checks, produces the NSIS installer and update metadata, verifies the release set, and creates a draft GitHub Release. Draft status is intentional: inspect and test the files before publishing.

## Required release assets

- `Vibe-Trading-Desktop-Community-<version>-x64.exe`
- matching `.exe.blockmap`
- `latest.yml`
- `SHA256SUMS.txt`

The updater needs the installer and `latest.yml`; the blockmap enables differential downloads. Never replace a published binary under the same version. If a release is bad, publish a higher version.

## Acceptance before publishing

- Install on a clean Windows 11 x64 VM.
- Confirm first-run disclosure, Settings, model request, copy button, all main routes, and app shutdown.
- Check the IM channel catalog and at least one available channel.
- Install version N, publish a draft N+1 release in a test repository, and verify check/download/restart/update.
- Run `Get-AuthenticodeSignature` on the installer and application executable. Public stable releases should report `Valid`.
- Confirm the repository/release name shown by the updater is the intended community or upstream-approved repository.
