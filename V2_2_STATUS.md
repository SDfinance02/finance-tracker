# Finance Tracker V2.2 — Profiles & Security

## Included in V2.2

- Profile chooser before any financial database is opened.
- Existing V2/V2.1 ledger becomes the **Personal** profile automatically (`finance-v2.db`).
- Personal profile requires a Finance Tracker password on first use.
- Native macOS Touch ID unlock when available, with password fallback.
- Optional **Partner** profile with its own password, optional Touch ID and its own SQLite ledger (`finance-partner.db`).
- **Demo** profile with a separate fictional portfolio (`finance-demo.db`) that is safe to show to colleagues.
- Demo reset from the profile chooser.
- Profile switch/lock control in the top bar.
- Automatic lock after 15 minutes of inactivity for Personal and Partner profiles.
- Argon2 password hashing; plaintext passwords are never stored.
- Separate per-profile backups and exports.
- Database schema migration to v3 with profile metadata.
- Existing personal data remains in the original database and is not copied into Demo or Partner.

## Security scope

V2.2 protects access **inside Finance Tracker** and separates profiles into different database files. Touch ID is handled by macOS; Finance Tracker does not receive fingerprint data.

The raw SQLite database files are **not yet SQLCipher-encrypted at rest** in V2.2. Keep macOS FileVault enabled. Full database-at-rest encryption is planned as the next security-hardening step. This distinction is intentional and visible in Settings.

## Not yet included

- Household aggregation (planned V2.3).
- Insurance / Protection module.
- Future / Financial Roadmap projections and Monte Carlo.
- Belgian BV module.
- SQLCipher at-rest database encryption.
- Live bank PSD2 sync.
- Fully configured signed release channel; the updater foundation is present but still needs one-time publishing/channel setup.
