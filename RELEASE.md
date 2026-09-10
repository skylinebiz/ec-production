# Release Notes — v2.0.0 - 2026-09-10

See [CHANGELOG.md](CHANGELOG.md) for the full history. This file covers what to check and do when
shipping this specific release.

## Summary

This release opens up `EC Item Operation Rate`, `EC Lot`, and `EC Process Lot` to the Sales and
Purchase teams. Previously only `System Manager` had any access at all (and even System Manager
lacked Submit/Cancel on `EC Process Lot`) — which is why it worked for Administrator in dev but
failed for real users in production.

## Breaking change

Access to all three doctypes changes from *System Manager only* to the role matrix in the README.
If any current process depends on only System Manager being able to touch these records, review the
new grants (Role Permission Manager → each doctype) before deploying.

## What's included

- DocType permission changes for `EC Item Operation Rate`, `EC Lot`, `EC Process Lot` — shipped in
  each doctype's own `.json` (part of this app, applied automatically by `bench migrate`).
- `Select` permission on `Operation` and `Employee` for the four roles — shipped as a fixture
  (`ec_production/fixtures/custom_docperm.json`), also applied by `bench migrate`.
- `before_uninstall` cleanup hook (`ec_production/uninstall.py`) for the fixture rows above.

## Deploy steps

1. Pull this app update onto the target bench (`bench get-app` / `git pull` on `apps/ec_production`).
2. `bench --site <site> migrate` — this applies the doctype permission changes **and** syncs the
   `Custom DocPerm` fixture rows onto `Operation` / `Employee`.
3. Verify as a real user, not Administrator — Administrator bypasses all permission checks, so
   testing while logged in as Administrator will not catch a missing permission. Log in (or "Login
   As") as a user whose only role is `Sales User` or `Purchase User` and confirm:
   - They can create/view/edit/submit/cancel `EC Item Operation Rate`, `EC Lot`, `EC Process Lot`.
   - They can pick a value in the `Operation` and `Employee` link fields on `EC Lot` / `EC Process
     Lot` line items without a `PermissionError`.
   - They cannot open the `Employee` doctype directly (Select only, not Read) — they should not be
     able to browse the Employee list/report.
4. Repeat with a user whose only role is `Sales Manager` or `Purchase Manager` and additionally
   confirm they can **delete** records on all three doctypes.

## Rollback

- The doctype permission changes and the `Custom DocPerm` fixture are both declarative — reverting
  this app to the previous commit and running `bench migrate` again restores the prior state
  (fixtures sync is one-way from the exported JSON on every migrate, so an older fixture file simply
  reasserts the old rows).
- If the app is fully removed (`bench uninstall-app ec_production`), the `before_uninstall` hook
  removes the `Custom DocPerm` rows on `Operation`/`Employee` it added; the doctypes it owns are
  removed by `uninstall-app` itself.
