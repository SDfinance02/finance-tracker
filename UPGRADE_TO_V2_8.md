# Finance Tracker V2.8 — Consolidated Wealth

V2.8 connects My BV to Personal, Household, Future and Decision Lab without counting company assets twice.

## New

- **Consolidated wealth** page with private net worth + ownership-adjusted BV equity.
- **Equity view**: each company is represented once by your share of its equity.
- **Look-through view**: company cash, investments, real estate, receivables and operating assets are shown by asset class while company liabilities remain in the equity calculation.
- Ownership percentage per BV (for example 50%, 70% or 100%).
- Calculated or manual company-equity valuation.
- Manual market-value balance items for company investments, real estate, other assets and liabilities that are not represented in the V2.7 management ledger.
- Per-company switches for inclusion in Personal, Household and Future / Decision Lab.
- Per-company business growth and volatility assumptions for long-term projections; Future scenarios may optionally override the weighted growth rate.
- Optional FI eligibility per company, combined with a scenario-level switch to count eligible BV equity toward FI assets.
- Dashboard includes owned BV equity in consolidated net worth.
- Household sync shares only aggregate business equity and projection metadata — not the partner's company ledger.
- Future projects business equity alongside private/household assets.
- Decision Lab applies stochastic business-equity growth and includes it in Monte Carlo net worth.
- Demo receives a fictional company treasury portfolio and financing balance for the look-through view.

## Company valuation model

The calculated management value is:

`business cash + open receivables + current book value of company assets + manual market-value assets - open payables - estimated corporate tax liability - manual liabilities`

Your consolidated value is then multiplied by the configured ownership percentage.

This is deliberately a **management estimate**, not statutory equity, fair market value, a company valuation or a tax valuation. Use **Manual equity** when a better externally determined value is available.

## Double-count protection

- In **Equity view**, the BV contributes only owner equity; its underlying assets are not added separately.
- In **Look-through view**, the underlying gross asset mix is visualised, but consolidated net worth still uses the single owner-equity figure.
- Household adds each member's cached ownership-adjusted BV equity only once.

## Database

Schema 9 adds:

- `business_consolidation_settings`
- `business_balance_items`
- `business_growth_pct` and `include_business_in_fi` on Future scenarios

The household cache also gains aggregate BV-equity and business projection metadata. Existing Personal, Partner, Household, Protection, Future, Decision Lab and My BV data is preserved.
