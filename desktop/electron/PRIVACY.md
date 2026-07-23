# Vibe-Trading Desktop Community Privacy Notes

This community desktop application runs the Vibe-Trading web service on the local Windows computer. It does not add a telemetry or analytics service.

## Data stored locally

- Research sessions, reports, uploaded files, channel state, and structured configuration are stored under the current user's `.vibe-trading` directory.
- Desktop application logs and encrypted credentials are stored under the Electron application data directory for the current Windows user.
- Uninstalling the desktop application does not automatically delete research data or account configuration.

## Credentials

In the packaged Windows desktop application, supported LLM, QVeris, Tushare, and personal WeChat credentials are encrypted with Electron `safeStorage`, backed by Windows DPAPI. They are decrypted only in the desktop main process and passed to the local Python child process for the current run. Legacy plaintext values are migrated when the desktop application starts.

Other IM adapters may require secrets in their channel configuration. Review each platform's permissions and use a dedicated bot account with the minimum required scope.

## Network access

The application contacts only services enabled by the user or required by Vibe-Trading features, such as model providers, market-data sources, messaging platforms, brokers, and the configured GitHub Releases update feed. Those services have their own privacy terms.

## Removing local data

Close the application first. Back up any reports you need, then remove the relevant files from `%USERPROFILE%\.vibe-trading` and the application's user-data directory. This cannot be undone.
