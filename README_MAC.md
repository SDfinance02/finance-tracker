# Finance Tracker V2.2 — macOS

> **Upgrading from V2.1?** Use `finance_tracker_v2_2_patch.zip` and follow `UPGRADE_TO_V2_2.md`. Your existing `finance-v2.db` becomes the Personal profile automatically.

V2.2 adds a profile chooser, Personal/Partner/Demo ledgers, app-password protection, native Touch ID when available, and automatic locking.

# Finance Tracker V2.1 — Mac installation & use

Finance Tracker V2.1 is a **local-first native desktop app** built with React + TypeScript + Tauri + SQLite. V2.1 adds persistent update/migration infrastructure while preserving the V2 finance functionality.

Your normal finance data is stored in a local SQLite database on your Mac. The app only needs internet when you explicitly use **Update Market Data**. Live bank/broker OAuth is *not enabled by default*; see `V2_1_STATUS.md` and `UPDATER_SETUP.md`.

> **Existing V2.0 user?** Use `UPGRADE_FROM_V2_0.md`. V2.1 keeps the same Tauri bundle identifier and SQLite filename, so the existing database remains in the persistent application configuration directory. On first V2.1 launch a pre-upgrade backup is created automatically before migrations run.

---

## 1. Download and unzip

1. Download `finance_tracker_v2.zip`.
2. Double-click it in Finder.
3. Move the folder `finance_tracker_v2` somewhere permanent, for example:
   - `Documents/Finance Tracker V2`

Do not keep your only working copy in Downloads if you regularly clean that folder.

---

## 2. One-time prerequisites

Tauri needs three development prerequisites on your Mac: Apple Command Line Tools, Node.js, and Rust.

### A. Apple Command Line Tools

Open **Terminal** (Finder → Applications → Utilities → Terminal) and type:

```bash
xcode-select -p
```

If it prints a path, this part is installed.

If it says the tools are missing, run:

```bash
xcode-select --install
```

Complete Apple's installer.

### B. Node.js

In Terminal:

```bash
node --version
npm --version
```

If both print version numbers, continue.

If Node is missing, install the current **LTS** version from:

`https://nodejs.org/`

Then close Terminal and open it again.

### C. Rust

In Terminal:

```bash
cargo --version
```

If it prints a version, continue.

If Rust/Cargo is missing, use the official rustup installer:

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

Choose the default installation when prompted. Then close Terminal and open it again.

If `cargo` is still not found, run:

```bash
source "$HOME/.cargo/env"
```

---

## 3. Give the helper scripts permission

In Terminal type `cd ` — including the space — and drag the **finance_tracker_v2** folder from Finder into Terminal.

Example:

```bash
cd /Users/yourname/Documents/finance_tracker_v2
```

Press Return, then run:

```bash
chmod +x install.command run_finance.command build_app.command
```

You only need to do this once.

---

## 4. Install Finance Tracker V2

Double-click:

`install.command`

If macOS blocks it:

1. Control-click `install.command`
2. Choose **Open**
3. Choose **Open** again

The script checks the prerequisites and runs:

```bash
npm install
```

This installs the React/Tauri packages inside this project folder.

---

## 5. Start V2 in development mode

Double-click:

`run_finance.command`

The first launch is slower because Rust compiles the native Tauri backend. Depending on the Mac and internet connection, the first compile can take several minutes.

A **native Finance Tracker V2 window** opens. Unlike V1, this is not merely a browser tab.

While using development mode, leave the Terminal window open. To stop:

```text
Control + C
```

or close the Terminal window.

Your finance data remains stored locally.

---

## 6. Build the permanent `.app`

Once V2 is running correctly, double-click:

`build_app.command`

This creates a standalone macOS app. The script opens the output folder in Finder when finished.

The app is normally found under:

```text
src-tauri/target/release/bundle/macos/
```

You will see something like:

```text
Finance Tracker V2.app
```

Drag that `.app` to your **Applications** folder.

Because this is your own locally built, unsigned application, macOS may ask for confirmation the first time. If needed, Control-click the app → **Open**.

After that you can launch it like any other Mac application and you no longer need `run_finance.command` for normal use.

---

# Recommended first-use order

## 1. Accounts

Create your cash/bank accounts first:

- current account
- savings accounts
- broker cash
- other cash buckets

The account balance is a **reconciled current balance**. Enter it manually for now. Future Open Banking support can update it automatically.

## 2. Transactions

You can enter income, expenses, transfers and investment flows manually.

Important:

- **Expenses** affect monthly spending.
- **Income** affects monthly income.
- **Transfers** do *not* count as income/expenses.
- **Investment flows** are kept distinct from living expenses.

## 3. Bank CSV import

Go to:

`Connections → Bank transaction import`

Choose a CSV exported by your bank. V2 accepts comma, semicolon and tab-separated files.

Map:

- Date
- Description / merchant
- Signed amount

or, instead of one amount column:

- Debit
- Credit

Imported transactions first go to **Review inbox**.

## 4. Review inbox

V2 suggests categories locally using:

1. your saved merchant rules
2. built-in keyword matching
3. a fallback category

Review the suggestions and click **Accept**.

If you tick **Learn this merchant as a local rule**, future matching transactions are categorised automatically.

No cloud AI is required for this.

## 5. Investments

Add each investment/security.

Useful fields:

- Name
- Ticker
- ISIN
- Currency
- Market symbol
- Target portfolio weight

### Market symbol

For automatic prices, use a Yahoo-compatible symbol, for example:

```text
AAPL
IWDA.AS
IMIE.L
BTC-EUR
```

The exact exchange suffix matters.

Then record historical BUY/SELL trades. V2 calculates positions using **FIFO cost basis**.

## 6. Update Market Data

Go to Dashboard or Investments and click:

`Update Market Data`

V2 then accesses the internet through the Rust backend and updates securities that have a market symbol.

It stores:

- current price
- previous close
- daily change
- 52-week high when available
- timestamp
- one daily local price-history point

Manual prices remain available at all times.

## 7. Real estate

Add valuation, outstanding debt and ownership percentage.

V2 calculates your proportional equity as:

```text
(latest valuation - outstanding property debt) × ownership %
```

## 8. Pensions, debt & receivables

Add:

- VAPZ / IPT / employer / private pension plans
- non-property liabilities
- money owed to you

Open receivables contribute to net worth until marked paid.

## 9. Budget

Set category budgets per month and add recurring expenses.

V2 automatically compares recorded expenses with each target.

## 10. Planning

Use this for:

- cash goals
- emergency fund / home deposit / tax reserve
- manual market drawdown deployment rules
- expense splitting

## 11. Dashboard snapshots

Click **Save snapshot** periodically.

This creates your historical net-worth series. Saving again on the same day updates that day's snapshot instead of creating a duplicate.

---

# Backups

Go to:

`Settings → Create SQLite backup`

V2 copies the SQLite database into its application-data backup folder.

The Settings page also shows the candidate database locations discovered by Tauri so you do not have to guess where macOS stored the file.

Also use:

`Export all data JSON`

This creates a portable structured export of every major database table.

Recommended:

- SQLite backup periodically
- JSON export before major app upgrades
- optionally copy backups into iCloud Drive / another external backup location

---

# About direct bank and broker linking

The V2 architecture includes a Connections layer, but there is an important distinction between **architecture-ready** and **live connected**.

A real PSD2/Open Banking link normally requires:

- an account with an Open Banking provider such as TrueLayer, Plaid or Tink
- a client ID / secret
- OAuth bank consent
- a secure redirect/callback endpoint

Those production credentials cannot be bundled generically in this ZIP.

Therefore this build provides a robust local bank CSV workflow now, while keeping the database and connector layer ready for a future read-only PSD2 bridge.

The same principle applies to direct broker APIs such as IBKR/Saxo: the data model is ready, CSV import works now, but account-specific API authentication must be configured separately.

See `V2_STATUS.md` for an exact list of what is active now.

---

# Troubleshooting

## `cargo: command not found`

Close/reopen Terminal, or run:

```bash
source "$HOME/.cargo/env"
```

## `xcrun` / linker / compiler error

Run:

```bash
xcode-select --install
```

Then retry.

## `npm: command not found`

Install Node.js LTS and reopen Terminal.

## Market data says symbol not found

The normal ticker may not be enough. Enter the exchange-specific **Market symbol** in Investments.

Examples:

```text
IWDA.AS
IMIE.L
```

You can always use **Manual price** if an instrument is unavailable.

## App opens but database does not initialise

Make sure you launch with:

```bash
npm run tauri:dev
```

or the built `.app`, not with plain `npm run dev` in a normal browser.

---

## V2.7 — My BV

V2.7 adds a separate Belgian BV management ledger with management P&L, cash, invoices, company assets, editable corporate-tax assumptions, advance-payment planning and an extraction comparison lab. See `UPGRADE_TO_V2_7.md`.

## V2.8 — Consolidated Wealth

V2.8 connects private wealth, Household and My BV. It adds ownership-aware company equity, an Equity/Look-through consolidated view and integrates included BV equity into Dashboard, Household, Future and Decision Lab without double counting. See `UPGRADE_TO_V2_8.md`.
