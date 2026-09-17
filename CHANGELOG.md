# Changelog

All notable changes to `ec_production` are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.0.0] - 2026-09-17

### Added
- `EC Job Order` and `EC Job Receipt` — new submittable doctypes, each with a child table
  (`Job Order Details` / `Job Receipt Details`) that cascades Employee → Lot → Item → Operation,
  matching the selection pattern already used on `EC Process Lot`. At least one row is required
  before either can be submitted.
- `EC Job Order` gets a "Process Receipt" button once submitted — creates and submits a matching
  `EC Job Receipt` for whatever's still pending on that Job Order in one click.
- `Total Qty` rollup field on `EC Job Order`, kept in sync as rows are added/removed.
- Lot-capacity validation — `Lot Qty − Pending Qty − Received Qty` — enforced on `EC Job Order`,
  `EC Job Receipt`, and `EC Process Lot`. Checked only at submit time, not while editing or saving a
  draft, and reported as a single grouped error listing every offending row (by its real grid row
  number) instead of stopping at the first.
- `EC Process Lot` submit/cancel now updates `EC Lot Item`'s Received Qty directly, the same way
  `EC Job Receipt` already did — so lots processed without going through a Job Order/Job Receipt
  still roll up correctly.
- Property Setter fixture (`show_title_field_in_link` on `Employee`) so Employee link fields, grid
  columns, and dropdowns display the employee's name instead of the raw ID.

### Changed
- Error messages show the Employee's name instead of the raw Employee ID.
- `employee_name` is hidden on `EC Job Receipt Detail`'s grid (still shown on `EC Job Order Detail`'s
  grid).
- Permission model on `EC Item Operation Rate`, `EC Lot`, `EC Process Lot`, `EC Job Order`, and
  `EC Job Receipt` replaced: `Sales User` / `Purchase User` / `Sales Manager` / `Purchase Manager`
  are out, `Manufacturing Manager` and `Manufacturing User` are in (alongside `System Manager`).
  Sites relying on the old Sales/Purchase roles for access should review the new grants before
  upgrading.

### Removed
- The one-time `create_job_receipts_for_process_lots` data-migration patch used during development
  to backfill historical `EC Process Lot` activity into `EC Job Receipt` — it was never part of a
  shipped release and is not included going forward.

## [2.1.0] - 2026-09-14

### Added
- `closed` (`Closed`) checkbox on `EC Lot`, shown in the list view.

### Changed
- The `EC Lot` link field on `EC Process Lot` line items (`lot_items`) now only offers lots where
  `closed` is unchecked — closed lots drop out of that search, but a row that already references a
  lot keeps showing it even if the lot is closed afterward.

## [2.0.0] - 2026-09-10

### Added
- Role-based permissions for `Sales User`, `Purchase User`, `Sales Manager`, `Purchase Manager` on
  `EC Item Operation Rate`, `EC Lot`, `EC Process Lot`:
  - Create / Read / Write for all four roles.
  - Submit / Cancel on `EC Process Lot` for all four roles.
  - Delete additionally for `Sales Manager` and `Purchase Manager`.
- `Select` permission on the standard `Operation` and `Employee` doctypes for the same four roles
  (exported as an app fixture, `ec_production/fixtures/custom_docperm.json`), so the `operation` and
  `employee` link fields on `EC Lot Item` / `EC Process Lot Item` work for these roles without
  granting them full Read access to HR data on `Employee`.
- [`uninstall.py`](ec_production/uninstall.py) with a `before_uninstall` hook that removes the
  `Custom DocPerm` rows added to `Operation` / `Employee` when the app is uninstalled, so no
  permission residue is left behind on doctypes this app doesn't own.

### Changed
- Bumped app version to `2.0.0` — the permission model for `EC Item Operation Rate`, `EC Lot`, and
  `EC Process Lot` changed from System-Manager-only to the role matrix above; sites that relied on
  System Manager being the sole role with access should review the new grants before upgrading.

### Fixed
- Stock Entry API fix.

## [1.1.0] - 2026-08-18

### Added
- Raw material (RM) processing UI.
- New Stock Entry form is opened and pre-populated with data from the Process Lot flow.

### Fixed
- Stock Entry type and item handling.

## [1.0.0] - 2026-08-12

### Added
- `EC Process Lot` made submittable, with an editable grid for line items.
- Reports: default date-range months, voucher report redirect, payment report, sidebar report links.
- Desktop/app icon.

### Changed
- Removed Style Creator, Item Visualizer, and advanced item search (previously added, later dropped
  from scope).

### Fixed
- Duplicate job card created when receiving a partial quantity.
- `EC Process Lot` quantity validated against already-processed and available quantity, preventing
  over-processing and blocking edits to already-submitted lots.

## [0.1.0] - 2026-06-03

### Added
- Initial app scaffold: `EC Lot`, `EC Item Operation Rate`, `EC Process Lot` doctypes and their
  child tables, desktop icon, and base reports.
