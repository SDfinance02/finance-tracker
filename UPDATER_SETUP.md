# One-time signed updater setup

This setup is done once. After a signed release channel is configured, normal future Finance Tracker releases can be installed from **Settings → App updates**.

## Why a signing key is required

Tauri requires updater packages to be cryptographically signed. The public key may be stored in the app; the private key must stay secret and is used only by the release pipeline.

## 1. Generate the signing key pair

After `install.command` has run, double-click:

`configure_updater_key.command`

It stores the private key under:

`~/.finance-tracker/updater.key`

and the public key under:

`~/.finance-tracker/updater.key.pub`

Back up the private key securely. Losing it means old installed copies cannot trust future update packages signed with a different key.

## 2. Put the source in GitHub

The project already contains `.github/workflows/release-macos.yml`.

For the simplest auto-update setup, the GitHub repository that hosts the releases must be publicly readable so Finance Tracker can fetch `latest.json` and the signed update file without a GitHub login.

If you want the source repository private, use a separate public **release-only** repository. We can set that up as the next step.

## 3. GitHub Actions settings

In the release repository add:

- Repository secret `TAURI_SIGNING_PRIVATE_KEY` = contents of `~/.finance-tracker/updater.key`
- Repository secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = the password you chose, if any
- Repository variable `FINANCE_UPDATER_PUBKEY` = contents of `~/.finance-tracker/updater.key.pub`

Never commit the private key to Git.

## 4. Configure your current V2.1 app

After the first GitHub release exists, open:

**Settings → App updates → Configure channel**

Endpoint:

`https://github.com/OWNER/REPOSITORY/releases/latest/download/latest.json`

Public key:

paste the contents of `updater.key.pub`.

This configuration is saved in the persistent Finance Tracker application-data folder, not inside the `.app` bundle.

## 5. Publish a release

The workflow is manually triggerable in GitHub Actions. It builds both Apple Silicon and Intel macOS packages, creates signed updater artifacts and publishes `latest.json`.

The app version is read from `src-tauri/tauri.conf.json` / `package.json` / `Cargo.toml`. Each new release must have a higher semantic version, e.g. `2.2.0`.

## Security model

- Database: local Mac application-data folder.
- Updater public key: safe to share.
- Updater private key: never stored in Finance Tracker and never committed.
- Updates: HTTPS + cryptographic signature verification before install.
