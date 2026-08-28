# Upgrade to V2.3 and publish the first in-app update

V2.3 is the first release intended to be delivered to an installed Finance Tracker through the signed updater.

1. Apply the V2.3 source patch to your existing `finance_tracker_v2` project.
2. Run `run_finance.command` and test Household locally.
3. Check Settings: app v2.3.0, schema v4.
4. Create a profile backup and a household backup.
5. Stop development mode.
6. Double-click `publish_release.command`.
7. The script commits/pushes your V2.3 source and triggers `.github/workflows/release-macos.yml`.
8. Wait until the GitHub Actions run is green and a `Finance Tracker v2.3.0` release contains `latest.json` and signed updater artifacts.
9. Open your installed V2.2 app (not the dev V2.3 build), go to Settings -> Check for updates -> Install v2.3.0.
10. The app should download, verify, install, restart, and preserve all profile databases.

The GitHub Actions release may take several minutes because it compiles macOS updater artifacts.
