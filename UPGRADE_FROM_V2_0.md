# Upgrade V2.0 → V2.1

Your existing finance database should remain intact because it is stored by Tauri in the persistent application configuration directory, outside the project folder and outside the `.app` bundle.

On the first V2.1 launch, Finance Tracker creates a pre-upgrade backup before opening SQLite, then applies the versioned schema migration.

## After applying the V2.1 source update

1. Run `install.command` once. It updates dependencies and generates the professional native icon files.
2. Run `run_finance.command` and verify your existing accounts/transactions are still visible.
3. Open **Settings & backup**. Confirm:
   - app version 2.1.0
   - schema version 2
   - database detected
   - persistent database path shown
4. Create one manual backup.
5. Run `build_app.command` to make the new standalone `Finance Tracker.app`.

Do not delete the persistent Finance Tracker folder under `~/Library/Application Support/`.
