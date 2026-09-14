# Release Notes — v2.1.0 - 2026-09-14

See [CHANGELOG.md](CHANGELOG.md) for the full history. This file covers what to check and do when
shipping this specific release.

## Summary

`EC Lot` now has a `Closed` checkbox. Once a lot is marked closed, it no longer appears when picking
an `EC Lot` on `EC Process Lot` line items — so a lot that's finished processing can be taken out of
circulation without deleting it or touching existing records.

## What's included

- `closed` Check field on `EC Lot` (`ec_production/doctype/ec_lot/ec_lot.json`), visible in the list
  view.
- `frm.set_query` on the `ec_lot` field of `EC Process Lot`'s `lot_items` grid
  (`ec_production/doctype/ec_process_lot/ec_process_lot.js`), filtering the search to `closed: 0`.

## Deploy steps

1. Pull this app update onto the target bench (`bench get-app` / `git pull` on `apps/ec_production`).
2. `bench --site <site> migrate` — applies the new `closed` field on `EC Lot`.
3. Clear cache / hard-refresh the browser so the updated client script on `EC Process Lot` loads.
4. Verify:
   - Mark an `EC Lot` as `Closed`, then open `EC Process Lot` and confirm that lot no longer appears
     in the `EC Lot` search on a line item.
   - An existing `EC Process Lot` line item that already references a lot still shows it correctly
     even after that lot is closed.
   - An open (not closed) lot still appears in the search as before.

## Rollback

- The `closed` field and the search filter are both declarative/client-side; reverting this app to
  the previous commit and running `bench migrate` again removes the field and the filter. No data
  migration or fixture is involved.
