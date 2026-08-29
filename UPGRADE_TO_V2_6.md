# Upgrade to Finance Tracker V2.6

V2.6 adds **Decision Lab** next to Future.

## New in V2.6
- Monte Carlo simulation in a background Web Worker so the app stays responsive.
- 1,000 / 2,500 / 5,000 / 10,000 stochastic paths.
- P10 / median / P90 wealth bands.
- Probability of remaining financially solvent under the model.
- Probability of reaching the FI threshold defined in Future.
- Cash/liquidity stress probability.
- Optional early market shock for sequence-of-returns stress testing.
- Separate volatility assumptions for investments, cash, inflation, property and pensions.
- Property/equity and pension/equity correlation assumptions.
- Side-by-side robustness comparison of up to four Future scenarios.
- Local audit trail of recent Decision Lab simulations.

## Database
Schema 6 -> 7. Two additive tables are created:
- `future_risk_settings`
- `decision_lab_runs`

Existing ledgers, profiles, Household, Protection and Future scenarios are untouched.

## Important modelling note
V2.6 is a planning and stress-testing model, not a forecast. Results are driven by the user's own return, volatility, inflation, correlation and life-event assumptions.
