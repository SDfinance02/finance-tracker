# Finance Tracker V2.3 — Household

V2.3 adds a consolidated Household workspace while preserving the privacy boundary between Personal and Partner ledgers.

## New
- Household navigation tab.
- Combined household net worth and liquid wealth.
- Personal vs Partner economic ownership view.
- Combined 12-month income/expense/savings chart.
- Combined asset allocation.
- Household net-worth snapshots.
- Explicitly shared assets and liabilities with Personal/Partner ownership percentages.
- Partner refresh requires that protected profile to be unlocked first.
- Only aggregate totals, monthly cashflow and snapshots are cached in the household ledger; individual partner transactions and trades are not copied.
- Demo has a fully fictional Household view.
- Separate Household SQLite backup button in Settings.
- Profile database schema v4.
- Signed updater config is embedded for SDfinance02/finance-tracker.
- `publish_release.command` pushes the source and triggers the GitHub signed release workflow.

## Storage
- Personal: `finance-v2.db`
- Partner: `finance-partner.db`
- Demo: `finance-demo.db`
- Household: `finance-household.db`
- Demo Household: `finance-household-demo.db`

Shared items should not also be entered at full value in an individual profile; otherwise they will be double-counted.
