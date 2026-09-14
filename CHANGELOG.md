# Changelog

All notable changes to `ec_production` are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
