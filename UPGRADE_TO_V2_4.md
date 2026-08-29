# Finance Tracker V2.4 — Protection

V2.4 adds a new **Protection** workspace for insurance administration.

## New
- policy register with provider, policy number, insured person/household, premium, renewal, coverage and deductible
- annual recurring premium overview
- 90-day renewal calendar
- administrative coverage map
- broker/intermediary contact fields
- beneficiary and auto-renewal fields
- policy document reference field
- claims log with claimed/reimbursed amounts and status
- fictitious Protection data in Demo
- profile database schema v5

## Upgrade safety
Existing Personal, Partner, Demo and Household data are preserved. Each profile is migrated independently when it is first opened after updating.

The current document field is a **reference** (for example a filename/path). Managed file attachments are intentionally deferred to the later document-vault update.
