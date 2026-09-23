# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _

from ec_production.ec_production.doctype.ec_job_order.ec_job_order import (
	get_available_qty,
	get_lot_item_details,
	sync_lot_item_rollups,
)


class ECProcessLot(Document):
	def validate(self):
		# Lenient: totals/amounts recompute on every save, but the Lot
		# capacity check only runs at submit time (see before_submit)
		# — a single grouped error covering every offending row rather
		# than failing on the first.

		# for row in self.lot_items:
		# 	row.process_lot_date = self.date

		self.lock_rates()

		self.total_qty = 0
		self.total_amount = 0

		for row in self.lot_items:

			row.qty = flt(row.qty)
			row.rate = flt(row.rate)

			row.amount = row.qty * row.rate

			self.total_qty += row.qty
			self.total_amount += row.amount

	def lock_rates(self):
		"""
		Only Manufacturing Managers may change a rate. For anyone else a
		row keeps the rate it was saved with (or, on an amendment, the
		rate on the amended document); a row with no such history gets
		the EC Lot's rate. The form makes the field read-only too, but
		that alone can be bypassed via the API.
		"""

		if "Manufacturing Manager" in frappe.get_roles():
			return

		previous = self.get_doc_before_save()
		previous_rows = {row.name: row for row in previous.lot_items} if previous else {}

		amended_rates = {}
		if not previous and self.amended_from:
			for row in frappe.get_doc("EC Process Lot", self.amended_from).lot_items:
				amended_rates.setdefault((row.ec_lot, row.item, row.operation), row.rate)

		for row in self.lot_items:

			key = (row.ec_lot, row.item, row.operation)
			old = previous_rows.get(row.name)

			if old and (old.ec_lot, old.item, old.operation) == key:
				row.rate = old.rate
			elif key in amended_rates:
				row.rate = amended_rates[key]
			else:
				_qty, row.rate = get_lot_item_details(*key)

	def before_submit(self):

		assigned = {}

		for row in self.lot_items:

			if not (row.ec_lot and row.item and row.operation):
				continue

			key = (row.ec_lot, row.item, row.operation)

			if key not in assigned:
				assigned[key] = {"qty": 0, "rows": []}

			assigned[key]["qty"] += flt(row.qty)
			assigned[key]["rows"].append(row.idx)

		capacity_errors = []

		for (ec_lot, item, operation), info in assigned.items():

			# Received Qty (rolled up onto EC Lot Item) already includes
			# every other *submitted* EC Process Lot against this same
			# Lot/Item/Operation (see sync_lot_item_rollups) — this
			# document's own rows aren't submitted yet, so no further
			# adjustment for "other rows" is needed.
			available_qty = flt(get_available_qty(ec_lot, item, operation))

			if info["qty"] > available_qty:

				row_numbers = ", ".join(str(idx) for idx in info["rows"])

				capacity_errors.append(_(
					"Row {0}: Item <b>{1}</b> / Operation <b>{2}</b><br>"
					"Trying to Process: <b>{3}</b><br>"
					"Available Qty (Lot Qty − Pending − Received): <b>{4}</b>"
				).format(
					row_numbers,
					item,
					operation,
					info["qty"],
					max(available_qty, 0)
				))

		if capacity_errors:
			frappe.throw("<br><br>".join(capacity_errors), title=_("Qty Exceeds Lot Availability"))

	def on_submit(self):
		self._sync_lot_rollups()

	def on_cancel(self):
		self._sync_lot_rollups()

	def _sync_lot_rollups(self):

		combos = {
			(row.ec_lot, row.item, row.operation)
			for row in self.lot_items
			if row.ec_lot and row.item and row.operation
		}

		for ec_lot, item, operation in combos:
			sync_lot_item_rollups(ec_lot, item, operation)
