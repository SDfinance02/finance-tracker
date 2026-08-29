# Upgrade to Finance Tracker V2.5 — Future

V2.5 adds the deterministic **Future** planning engine.

## What changes

- New `Future` page directly under Household.
- Scenario-based wealth projections using your live Finance Tracker balances as month-zero input.
- Profile or Household projection scope.
- Editable assumptions for portfolio return, cash yield, inflation, income/expense growth, property/pension growth, savings allocation and FI withdrawal rate.
- Life events: one-off income/expense, recurring income/expense change, invest lump sum, home purchase + mortgage, retirement/work exit.
- Financial-independence estimate.
- Side-by-side scenario comparison.
- Demo profile receives three fictional planning scenarios.
- Database schema moves from v5 to v6. Existing data is preserved.

## Release process

1. Apply the V2.5 source patch to the existing `finance_tracker_v2` checkout.
2. Run `run_finance.command` and confirm Finance Tracker shows v2.5.0 / schema v6.
3. Test Future in Personal and Demo.
4. Stop development mode.
5. Run `publish_release.command`.
6. Once GitHub Actions is green, open the installed V2.4 app and use Settings → Check for updates.
7. Install V2.5 from inside the app.

The projection model is deterministic and transparent. It is not a market forecast. Monte Carlo / sequence-of-returns analysis is intentionally reserved for V2.6.
