# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _


class ECJobOrder(Document):
	def validate(self):
		# Lenient: can be saved as a draft even if it would currently
		# exceed the Lot's available capacity — that hard check only
		# runs at submit time (see before_submit).
		self._process_details(strict=False)
		self.total_qty = sum(flt(row.qty) for row in self.job_order_details)

	def before_submit(self):
		if not self.job_order_details:
			frappe.throw(_("Please add at least one row in Job Order Details before submitting."))
		self._process_details(strict=True)

	def on_submit(self):
		self._sync_lot_rollups()

	def on_cancel(self):
		self._sync_lot_rollups()

	def _process_details(self, strict):

		capacity_errors = []

		for row in self.job_order_details:

			if not (row.lot and row.item and row.operation):
				continue

			lot_qty, lot_rate = get_lot_item_details(
				row.lot,
				row.item,
				row.operation
			)

			if not row.rate:
				row.rate = lot_rate

			if not row.qty:
				row.qty = lot_qty

			if flt(row.qty) < flt(row.qty_received):
				frappe.throw(_(
					"Row #{0}: Qty <b>{1}</b> cannot be less than the Qty already "
					"Received (<b>{2}</b>) against this row."
				).format(row.idx, row.qty, row.qty_received))

			if strict:

				available = get_available_qty(row.lot, row.item, row.operation)

				# Other rows in *this* document referencing the same
				# Lot/Item/Operation haven't been counted yet (this doc
				# isn't submitted until after this check completes).
				available -= sum(
					flt(r.qty)
					for r in self.job_order_details
					if r.lot == row.lot and r.item == row.item
					and r.operation == row.operation and r.name != row.name
				)

				if flt(row.qty) > available:
					capacity_errors.append(_(
						"{0}. {1} - {2} - {3} - {4} can only use <b>{5}</b> qty"
					).format(
						len(capacity_errors) + 1,
						row.employee_name, row.lot, row.item, row.operation,
						max(available, 0)
					))

			row.amount = flt(row.qty) * flt(row.rate)

		if capacity_errors:
			frappe.throw("<br>".join(capacity_errors), title=_("Qty Exceeds Lot Availability"))

	def _sync_lot_rollups(self):

		combos = {
			(row.lot, row.item, row.operation)
			for row in self.job_order_details
			if row.lot and row.item and row.operation
		}

		for lot, item, operation in combos:
			sync_lot_item_rollups(lot, item, operation)


@frappe.whitelist()
def get_lot_item_details(lot, item, operation):

	lot_item = frappe.db.get_value(
		"EC Lot Item",
		{
			"parent": lot,
			"item": item,
			"operation": operation
		},
		["qty", "rate"],
		as_dict=True
	)

	if not lot_item:
		return 0, 0

	return flt(lot_item.qty), flt(lot_item.rate)


@frappe.whitelist()
def get_available_qty(lot, item, operation):
	"""Lot Qty minus what's already Pending and Received for this
	Item/Operation (per the Lot's own rollup fields). Used both by
	the JO submit-time check and for live client-side feedback."""

	lot_item = frappe.db.get_value(
		"EC Lot Item",
		{
			"parent": lot,
			"item": item,
			"operation": operation
		},
		["qty", "pending_qty", "received_qty"],
		as_dict=True
	)

	if not lot_item:
		return 0

	return flt(lot_item.qty) - flt(lot_item.pending_qty) - flt(lot_item.received_qty)


def sync_lot_item_rollups(lot, item, operation):
	"""Recompute the matching EC Lot Item row's Pending Qty and Received
	Qty from current submitted EC Job Order Detail / EC Job Receipt
	Detail data. Self-healing — always recomputed from scratch rather
	than incremented, so it can't drift."""

	pending_qty = flt(frappe.db.sql("""
		SELECT COALESCE(SUM(qty - qty_received), 0)
		FROM `tabEC Job Order Detail`
		WHERE lot = %s AND item = %s AND operation = %s AND docstatus = 1
	""", (lot, item, operation))[0][0])

	received_qty = flt(frappe.db.sql("""
		SELECT COALESCE(SUM(qty_received), 0)
		FROM `tabEC Job Receipt Detail`
		WHERE lot = %s AND item = %s AND operation = %s AND docstatus = 1
	""", (lot, item, operation))[0][0])

	frappe.db.set_value(
		"EC Lot Item",
		{"parent": lot, "item": item, "operation": operation},
		{"pending_qty": pending_qty, "received_qty": received_qty}
	)


@frappe.whitelist()
def process_receipt(job_order):
	"""Create and submit an EC Job Receipt covering everything still
	Pending on this submitted EC Job Order, in one step."""

	jo = frappe.get_doc("EC Job Order", job_order)

	if jo.docstatus != 1:
		frappe.throw(_("Job Order must be submitted first."))

	rows = []

	for row in jo.job_order_details:

		pending = flt(row.qty) - flt(row.qty_received)

		if pending <= 0:
			continue

		rows.append({
			"employee": row.employee,
			"lot": row.lot,
			"item": row.item,
			"operation": row.operation,
			"qty_received": pending,
			"jod_id": row.name
		})

	if not rows:
		frappe.throw(_("Nothing Pending to receive for this Job Order."))

	jr = frappe.new_doc("EC Job Receipt")
	jr.date = frappe.utils.today()

	for row in rows:
		jr.append("job_receipt_details", row)

	jr.insert()
	jr.submit()

	return jr.name
