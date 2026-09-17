# Release Notes — v3.0.0 - 2026-09-17

See [CHANGELOG.md](CHANGELOG.md) for the full history. This file covers what to check and do when
shipping this specific release.

## Summary

This release adds the `EC Job Order` / `EC Job Receipt` workflow on top of `EC Process Lot`, unifies
Lot-capacity validation across all three submittable doctypes, and replaces the Sales/Purchase-based
permission model with a Manufacturing-based one. A one-time data-migration patch used during
development to backfill historical `EC Process Lot` activity was never committed/shipped and has
been removed from the working tree — there is no patch to run as part of this release.

## What's included

- New doctypes `EC Job Order` / `EC Job Order Detail` and `EC Job Receipt` / `EC Job Receipt Detail`,
  both submittable, with cascading Employee → Lot → Item → Operation selection and a "Process
  Receipt" button on submitted `EC Job Order` records.
- Shared Lot-capacity check (`Lot Qty − Pending Qty − Received Qty`) across `EC Job Order`,
  `EC Job Receipt`, and `EC Process Lot`, enforced at submit time with grouped, row-numbered errors.
- `EC Process Lot` submit/cancel now writes to `EC Lot Item`'s Received Qty directly, the same
  rollup `EC Job Receipt` already maintained.
- Employee name shown in errors and in link fields/dropdowns app-wide (Property Setter fixture), with
  `employee_name` hidden on the `EC Job Receipt Detail` grid.
- Updated `DocPerm` rows on `EC Item Operation Rate`, `EC Lot`, `EC Process Lot`, `EC Job Order`,
  `EC Job Receipt`: `System Manager`, `Manufacturing Manager`, `Manufacturing User`.

## Deploy steps

1. Pull this app update onto the target bench (`bench get-app` / `git pull` on `apps/ec_production`).
2. `bench --site <site> migrate` — creates the new `EC Job Order` / `EC Job Receipt` doctypes and
   their child tables, applies the updated `DocPerm` rows, and syncs the `show_title_field_in_link`
   Property Setter fixture. No data-migration patch runs as part of this — none is included.
3. Clear cache / hard-refresh the browser so the updated client scripts load.
4. Confirm the `Manufacturing Manager` and `Manufacturing User` roles exist on the target site (create
   them first if this is a fresh install) and are assigned to the right users — the old Sales/Purchase
   roles no longer have any access to these doctypes after this upgrade.
5. Verify:
   - Create and submit an `EC Job Order`, confirm `Total Qty` tracks the rows, then use "Process
     Receipt" to generate and submit a matching `EC Job Receipt`.
   - Try to over-submit an `EC Job Order` / `EC Job Receipt` / `EC Process Lot` past a Lot's available
     qty — confirm a single grouped error lists every offending row with the correct row number, and
     that the same over-qty is allowed to sit in a draft without erroring until submit.
   - Submit and then cancel an `EC Process Lot`; confirm the matching `EC Lot Item`'s Received Qty
     goes up on submit and back down on cancel.
   - Confirm error messages show employee names, not raw Employee IDs, and that a user in only
     `Manufacturing User` (not `Manufacturing Manager`) can create/submit but not delete on these
     doctypes.

## Rollback

- Revert this app to the previous commit and run `bench migrate` again. The new doctypes
  (`EC Job Order`, `EC Job Receipt`, and their child tables) will remain in the database schema but
  become inaccessible from the UI; if a clean rollback is required, remove them manually
  (`bench --site <site> execute frappe.delete_doc --args "['DocType', 'EC Job Order']"`, same for the
  other three) after confirming no data needs to be preserved.
- The permission-model change is declarative (`DocPerm` rows) and reverts cleanly with the app code.
