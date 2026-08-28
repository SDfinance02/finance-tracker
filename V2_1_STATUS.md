# Finance Tracker V2.1 — Foundation

V2.1 is the infrastructure release before profiles/security and the household modules.

## Added

- Persistent data vault based on the existing Tauri AppConfig location. The bundle identifier remains `be.local.financetracker.v2`, so the existing V2 database keeps the same location.
- Automatic **pre-upgrade SQLite backup once per app version**, before the database connection opens.
- Versioned schema migration framework (`schema_migrations`) so future releases can modify the database without rebuilding from scratch.
- Initial schema migration to version 2 plus performance indexes.
- Dedicated persistent folders for backups, future documents and cache.
- Signed-update backend based on Tauri Updater.
- In-app **Settings → App updates** panel with Check for updates / Install update.
- One-time runtime release-channel configuration: HTTPS endpoint + **public** updater key. The private signing key is never stored in the app.
- GitHub Actions release workflow template that can publish signed Apple Silicon and Intel macOS updater artifacts and `latest.json`.
- Ad-hoc macOS signing for local/GitHub builds when no Apple Developer certificate is configured.
- New professional Finance Tracker app icon and automatic native icon generation.
- App version shown in the sidebar.

## Not yet in V2.1

Profiles, Touch ID, password encryption, Demo/Partner profiles and Household are the next release (V2.2). V2.1 deliberately lays the storage/update/migration foundation first.
