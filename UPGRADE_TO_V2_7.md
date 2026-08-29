# Finance Tracker V2.7 — My BV

V2.7 adds a separate Belgian company-management cockpit inside each profile.

## New

- Multiple business entities supported; designed first for a Belgian BV.
- Separate company ledger for revenue, costs, remuneration, assets, taxes, dividends and transfers.
- VAT amount and VAT-deductibility tracking per entry.
- Tax-deductibility percentage per expense.
- Company cash estimate, revenue/cost chart and management KPIs.
- Receivables/payables and overdue invoice tracking.
- Company assets with straight-line management depreciation.
- Corporate income-tax estimate with editable Belgian tax assumptions.
- Reduced SME-rate checks for company size, director remuneration and benefits in kind.
- Advance corporate-tax payment register (VA1–VA4) and estimated surcharge/credit impact.
- Profit Extraction Lab: keep in BV, additional remuneration, ordinary dividend, VVPR-bis and liquidation reserve.
- Fictional BV data in Demo.

## Important tax disclaimer

The module is a planning and management tool, not statutory accounting, payroll software, a VAT return or tax advice. Belgian tax eligibility is fact-specific and changes over time. Defaults are editable and should be checked with the accountant before a real filing or distribution.

## Database

Schema 8 adds:

- `business_entities`
- `business_transactions`
- `business_assets`
- `business_invoices`
- `business_advance_payments`
- `business_tax_settings`

Existing private, household, protection, future and Decision Lab data is preserved.
