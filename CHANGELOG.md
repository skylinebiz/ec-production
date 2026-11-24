# Changelog

All notable changes to `ec_production` are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).


## [4.0.0] - 2026-11-24

### Fixed
- **Duplicating or amending an EC Job Order copied Qty Received.** The copy showed its rows as
  already received although no Job Receipt points at them, so Process Receipt found nothing pending
  and the EC Lot's Pending Qty was too low. A new Job Order now always starts at Qty Received 0
  (reset on insert, and `qty_received` on EC Job Order Detail is now No Copy).
- **A draft EC Job Receipt could get stuck after its Job Order was cancelled.** Cancelling a Job
  Order is only blocked by submitted receipts, and the draft kept its JOD Id / Job Order (read-only
  on the form), so it failed with "Cannot link cancelled document" forever. When a draft is saved or
  submitted, links to a Job Order that is no longer submitted are dropped and the row is matched
  again against the submitted Job Orders, e.g. the amendment.
- **Editing a saved EC Job Receipt row credited the wrong Job Order.** Changing the Employee /
  Operation / Item / Lot of a row kept its old JOD Id, so the rate and Qty Received went to the Job
  Order line it was first matched to. The form now clears the link when those fields change, and
  the server re-matches any row whose JOD Id no longer fits it.
- **EC Lot Received / Pending Qty went stale.** They were only recomputed for Item / Operation pairs
  on more than one row, so removing a duplicate row (or resizing a single one) left the remaining row
  with its old share, overstating Available Qty. Every Item / Operation whose rows changed is now
  recomputed on save.
- **Production Plan "Process Cutting" could not create a Stock Entry.** The dialog sent every cutting
  item at once (the server takes one), always used Qty 1, and could not open the returned entry. Each
  cutting item now has its own Qty (defaulting to what the plan needs, exploded through the BOMs) and
  its own button, which opens a new Manufacture Stock Entry. "Used By" no longer drops plan items that
  share a sub-BOM.
- **RM Issue / Process Cuts / RM Receive were slow on large sites.** `get_rm_issue_items` loaded every
  Cutting Job Card in the system; it now reads only the plan's Job Cards in one query, caches BOMs,
  and checks read permission on the Production Plan.
- **Production Processor: Job Cards were not in operation order.** They are now listed per Work Order
  in the order of its operations (split Job Cards stay with their operation); cancelled ones are hidden.
- **Production Processor: Start crashed** for Job Cards not in status Open (e.g. Material
  Transferred) as they had no Employee field. Every Job Card that can be started now has one, an On
  Hold card offers Resume, and a card that is already running can't be started twice.
- **Production Processor: Stop could inflate a Job Card or get stuck.** Received Qty above what is
  left on the card is refused; a smaller qty completes the card and moves the rest (with its share of
  transferred material) to a new Job Card after a confirmation. When the last operation finishes, a
  failure creating the Manufacture Stock Entry no longer rolls back the Job Card: it stays completed
  and the reason is shown. The Work Order is locked while that entry is created.

- **RM Processing qty went up by 0.001 per scroll.** The Process Cuts and RM Receive qty fields (and
  Recd Qty on the Job Cards table) now step by 1.

### Added
- **Production Processor: Hold.** A running Job Card offers Hold | Stop; On Hold it offers Resume |
  Stop. Stopping a card that is On Hold completes it straight away with the qty entered.
- **RM Processing: Qty can't exceed Job Qty.** Create Stock Entry in Process Cuts and RM Receive is
  refused when the qty entered is greater than the row's Job Qty.

### Changed
- **Production Processor redesigned** with Frappe's own styles (the page used Bootstrap 5 classes that
  desk does not ship, and now also works in dark mode): Production Plan, Operation and a Load button
  at the top; a Production Summary with a card per Work Order showing progress and its operations;
  Employee (apply to all) above the Job Cards; Job Cards grouped by Work Order with numbered steps,
  links, a live timer on running cards and the qty left. RM Processing is in the page header.
- **RM Processing dialog restyled** (content, buttons and options unchanged): wider, lighter tables
  with a sticky header, codes kept on one line, the full BOM visible and components set apart.

### Upgrade notes
- Run `bench --site <site> migrate` so the form also stops copying Qty Received when duplicating.
  The server-side reset works without it.
- Restart the bench (or `bench restart`) to load the Production Processor's new server code (Hold,
  operation order, Start / Stop fixes).

## [3.9.0] - 2026-11-19

### Changed
- **App icon** — replaced the grey "EC P" text tile with a drawn icon: three stacked lots and an
  arrow on an indigo rounded square (`ec-production-logo.svg`). It has no text, so it stays readable
  at sidebar size.
- **Sidebar** — **Masters** now holds Employee, Item and Operation. EC Item Operation Rate, EC Lot,
  EC Process Lot, EC Job Order and EC Job Receipt moved to a new **Transaction** section.

### Removed
- The old `workspace_sidebar/` sidebars **EC Prod** and **EC Production**. This Frappe version no
  longer imports that folder; the app's sidebar is the module `Sidebar` under
  `ec_production/ec_production/sidebar/`.
- New patch `remove_legacy_workspace_sidebars` (pre model sync) deletes the two old `Workspace
  Sidebar` records from the database, so Frappe's sidebar upgrade does not rebuild them.

### Upgrade notes
- Run `bench --site <site> migrate`, then hard-refresh browsers to see the new icon.

## [3.8.0] - 2026-11-03

### Added
- **App icon** — EC Production now has its own icon on the Apps screen (an "EC P" tile,
  `ec-production-logo.svg`), set through `app_logo_url` / `add_to_apps_screen` in `hooks.py`.

### Changed
- **Sidebar** — the header icon is now `building` (was `hammer`). EC Item Operation Rate, EC Lot,
  EC Process Lot, EC Job Order and EC Job Receipt are grouped under a new **Masters** section, the
  **Reports** section is no longer indented, and the **Production Processor** page link was removed
  from the sidebar.

## [3.7.0] - 2026-10-22

### Fixed
- `EC Lot`: the "Cannot reduce Qty" check no longer counts cancelled Process Lots as used qty, so a
  cancelled entry no longer blocks lowering the lot's Qty.
- `EC Lot`: when the same Item and Operation are in more than one row, a row can now be deleted while
  another row still holds that Item and Operation (it was refused as "already used"). A row with its own Pending
  or Received Qty is still protected. The "Cannot reduce Qty" check now compares the used qty with the combined
  Qty of those rows rather than each row on its own.
- `EC Process Lot` / `EC Job Order` / `EC Job Receipt`: with the same Item and Operation in more than one
  `EC Lot` row, Available Qty (Lot Qty − Pending − Received) now adds up all those rows. It only looked at the
  first row, so a second row (e.g. Qty 10) was ignored and the error said Available 0. Received and Pending Qty
  are now spread over those rows first-in-first-out (Received fills row 1 up to its Qty, then row 2, and so on;
  Pending takes what is left in the same order), so a row never shows more Received Qty than its own Qty. The
  spread is recomputed when a Process Lot, Job Order or Job Receipt is submitted or cancelled, and when the EC
  Lot's rows are added, removed or resized. Lots with a single row per Item and Operation are unaffected.

## [3.6.0] - 2026-10-21

### Changed
- `Lot Report`: new **Time (in hrs)** column after Qty, with a total. It is shown only for rows paid by
  Time. Qty and Amount are taken as saved on the Process Lot (no recalculation).

## [3.5.0] - 2026-10-16

### Added
- `EC Process Lot`: submitting is blocked when any row has Qty of 0 or less. The error lists every
  offending row ("Row 2, 5: Qty must be greater than 0") and runs before the lot-capacity check.
  Applies to rows paid by Time as well. Drafts can still be saved with Qty 0.

### Changed
- `EC Lot`: "Duplicate rows" in the item grid now clears Pending Qty, Received Qty and Remarks
  on the new row (Item, Operation, Date and Rate and Qty are kept), so a copy never carries over progress
  from the original. This applies on the form only; imports and API inserts are not affected.

## [3.4.0] - 2026-10-14

### Added
- `EC Process Lot Item`: `Pay By` (Select: `Qty` — the default — or `Time`) and `Time (in hrs)`.
  The amount is Rate × Time when Pay By is Time, and Rate × Qty otherwise, calculated live on the
  form and again on save so entries made through the API follow the same rule. `Time (in hrs)` is
  shown and required only when Pay By is Time.
- A clock icon next to the Amount in the Process Lot grid marks rows paid by Time (tooltip "Paid by
  Time").

### Changed
- `Pay By` and `Time (in hrs)` are not grid columns; they are set in the row's edit form.
- Qty is still recorded on rows paid by Time and still counts toward Total Qty and the lot-capacity
  checks — only the basis of the Amount changes.
- Existing entries, draft and submitted, are paid by Qty (the field's default fills them when
  migrating), so their Amounts are unchanged. Requires `bench migrate`.

## [3.3.0] - 2026-10-12

### Added
- `Lot Report` — a new standard Script Report on `EC Process Lot` that takes an `EC Lot` (mandatory,
  checked on the server as well as in the filter) and lists every Process Lot entry made against
  it, laid out like the Voucher Report: Date, Process Lot (link), Status (Draft / Submitted),
  Employee, EC Lot, Item, Operation, Qty, Rate, Amount, and Remarks, with a Total row summing Qty,
  Rate and Amount. An "Include Drafts" checkbox (ticked by default) controls whether draft Process
  Lots are listed; cancelled ones never are. Available to `System Manager`, `Manufacturing
  Manager`, and `Manufacturing User`.
- "Reports → Lot Report" link in the Connections panel of every `EC Lot` (new
  `ec_lot_dashboard.py`); it opens the report with that lot already filled in.
- Sidebar entry for `Lot Report` under Reports.

### Changed
- App navigation now uses a `Ec Production` Workspace Sidebar (EC Item Operation Rate, EC Lot, EC
  Process Lot, EC Job Order, EC Job Receipt; Reports: Data Rate Report, Voucher Report Builder,
  Payment Report, Voucher Report, Lot Report; and the Production Processor page), and the app is
  registered on the apps screen (`add_to_apps_screen`, opening `EC Item Operation Rate`). The
  standalone `Desktop Icon` definition (`desktop_icon/ec_production.json`) was removed.
- Requires `bench migrate` to create the report and sync the sidebar.

## [3.2.4] - 2026-10-06

### Added
- Track Changes (version history) enabled on `EC Lot` and `EC Item Operation Rate`, so edits to
  lots and rates — who changed what, and when — show up in each document's timeline.

### Changed
- Removed the Submit / Cancel / Amend permission flags from `EC Lot` and `EC Item Operation Rate`
  for `System Manager`, `Manufacturing Manager`, and `Manufacturing User`. Neither doctype is
  submittable, so this has no effect on what users can do; it just tidies the permission rows.

## [3.2.3] - 2026-09-28

### Added
- `EC Lot`: an Item/Operation row already referenced by an `EC Process Lot`, `EC Job Order`, or
  `EC Job Receipt` (in any status, including drafts) can no longer be deleted or re-pointed to a
  different Item/Operation — enforced on save (`ECLot.validate_used_rows`) so it can't be bypassed
  via the API, with the grid's own `before_ec_lot_item_remove` event giving the same feedback
  immediately, before Save.
- `EC Lot` (Link) field added to `Stock Entry` (via Custom Field fixture), mandatory only for
  Stock Entry Type `Material Consumption for Manufacture` and `Material Transfer for Manufacture`.
  Enforced both on the form (`mandatory_depends_on`) and on save
  (`ec_production.api.stock_entry.validate_ec_lot`, registered as a `doc_events` hook) so it can't
  be skipped via the API; `ignore_mandatory` still bypasses it, same as any other mandatory field.

## [3.2.2] - 2026-09-24

### Changed
- "Advanced Search" button on the `EC Lot` items grid moved after "Delete row" / "Duplicate row"
  (`add_custom_button` prepends by default).
- Fixture filters for `Property Setter` and `Custom Field` broadened to export by `module` (`Ec
  Production`) instead of listing each one by name/doctype, so future Property Setters or Custom
  Fields added under this app's module are picked up automatically.

## [3.2.1] - 2026-09-24

### Changed
- `EC Process Lot`: picking an Item/Operation from the linked `EC Lot` no longer auto-populates
  Qty — only Operation and Rate are still fetched. Qty is entered manually.
- `EC Lot` Advanced Search dialog retitled to "Advanced Search (Item Variant)".

## [3.2.0] - 2026-09-22

### Added
- Rate lock on `EC Process Lot`: only `Manufacturing Manager` (and `System Manager`, always) may
  change a row's `rate`. Enforced both on the form (the field is made read-only) and on save (a
  non-manager's row keeps its previously-saved rate, or the amended document's rate on an
  amendment, or the `EC Lot`'s rate for any other row) — the server-side check can't be bypassed via
  the API.
- "Advanced Search" button on the `EC Lot` items grid, opening a popup to bulk-populate rows:
  - Select one or more Operations and a Date; results show the rate for every selected Operation as
    of that date.
  - Filter by Item Group (including sub-groups), by Style No (an Item with variants — narrows
    results to that template's variants), and by a type-to-search, scrollable filter per Item
    Attribute defined in the system (e.g. Colour, Size).
  - Entering a Qty against a result and clicking "Add to Lot" adds one row per item × operation;
    an item/operation pair that's already a row on the lot gets its Qty added instead of a
    duplicate row.
  - `ec_production.ec_production.doctype.ec_lot.ec_lot.get_rate` now falls back to a variant's
    template rate when the variant has no rate of its own, so this also improves manual row entry
    on `EC Lot` (previously gave a rate of 0 for such variants).

## [3.1.0] - 2026-09-18

### Changed
- `Voucher Report`, `Payment Report`, and `Data Rate Report` are now accessible to `Manufacturing
  Manager` and `Manufacturing User`, alongside `System Manager` (previously `System Manager` only,
  plus a stray `Administrator` entry on `Payment Report` which was removed). Editing a report's
  definition (columns/query) remains restricted to `System Manager` via Frappe's core
  `is_report_manager` check — unaffected by this change.

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
