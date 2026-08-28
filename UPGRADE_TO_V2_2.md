# Upgrade V2.1 → V2.2 on macOS

Use the small `finance_tracker_v2_2_patch.zip`. It updates source code only; the financial databases live under macOS Application Support and are not replaced.

1. Quit Finance Tracker. If development mode is running, press **Control+C** in Terminal.
2. Unzip `finance_tracker_v2_2_patch.zip`.
3. Control-click `APPLY_V2_2.command` → **Open** if macOS asks.
4. Choose your existing `finance_tracker_v2` project folder.
5. The patch creates a source-code backup, copies V2.2 files and runs `npm install`.
6. Double-click the existing `run_finance.command` in the `finance_tracker_v2` folder.
7. At the profile chooser, select **Personal**. On first use, create a Finance Tracker password (minimum 10 characters) and optionally enable Touch ID.
8. Confirm your existing Accounts / Transactions / Investments are still present.
9. Open **Settings** and confirm **v2.2.0**, **schema v3**, database detected.
10. Create one SQLite backup.
11. Stop development mode with **Control+C** and run `build_app.command` to build the new standalone app.

### What happens to existing data?

Nothing is re-imported. `finance-v2.db` remains your Personal ledger. Demo and Partner use different SQLite files.

### Touch ID

If Touch ID is available and enrolled on your Mac, V2.2 can use it for quick unlock. The Finance Tracker password always remains the fallback.

### Demo reset

Leave/lock the Demo profile, then click the small reset icon on the Demo card in the profile chooser. The fictional demo database is recreated the next time Demo is opened.
