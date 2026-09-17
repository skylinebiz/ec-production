# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _

from ec_production.ec_production.doctype.ec_job_order.ec_job_order import get_available_qty


class ECProcessLot(Document):
	def validate(self):
		# Lenient: totals/amounts recompute on every save, but the Lot
		# capacity check only runs at submit time (see before_submit)
		# — a single grouped error covering every offending row rather
		# than failing on the first.

		# for row in self.lot_items:
		# 	row.process_lot_date = self.date

		self.total_qty = 0
		self.total_amount = 0

		for row in self.lot_items:

			row.qty = flt(row.qty)
			row.rate = flt(row.rate)

			row.amount = row.qty * row.rate

			self.total_qty += row.qty
			self.total_amount += row.amount

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

			processed_rows = frappe.get_all(
				"EC Process Lot Item",
				filters={
					"ec_lot": ec_lot,
					"item": item,
					"operation": operation,
					"parent": ["!=", self.name]
				},
				fields=["qty"]
			)

			processed_qty = sum(flt(row.qty) for row in processed_rows)

			# Same capacity formula as EC Job Order: Lot Qty − Pending
			# (unreceived, ordered qty) − Received, then further
			# reduced by whatever other EC Process Lots have already
			# processed against this same Lot/Item/Operation.
			available_qty = flt(get_available_qty(ec_lot, item, operation)) - processed_qty

			if info["qty"] > available_qty:

				row_numbers = ", ".join(str(idx) for idx in info["rows"])

				capacity_errors.append(_(
					"Row {0}: Item <b>{1}</b> / Operation <b>{2}</b><br>"
					"Already Processed (other Process Lots): <b>{3}</b><br>"
					"Trying to Process: <b>{4}</b><br>"
					"Available Qty (Lot Qty − Pending − Received − Already Processed): <b>{5}</b>"
				).format(
					row_numbers,
					item,
					operation,
					processed_qty,
					info["qty"],
					max(available_qty, 0)
				))

		if capacity_errors:
			frappe.throw("<br><br>".join(capacity_errors), title=_("Qty Exceeds Lot Availability"))
