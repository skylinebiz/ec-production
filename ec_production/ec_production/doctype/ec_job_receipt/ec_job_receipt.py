# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _

from ec_production.ec_production.doctype.ec_job_order.ec_job_order import sync_lot_item_rollups


class ECJobReceipt(Document):
	def validate(self):
		# Lenient: can be saved as a draft even if a row can't yet be
		# resolved/fully validated — that hard check only runs at
		# submit time (see before_submit).
		self._process_details(strict=False)

	def before_submit(self):
		if not self.job_receipt_details:
			frappe.throw(_("Please add at least one row in Job Receipt Details before submitting."))
		self._process_details(strict=True)

	def on_submit(self):
		self.sync_jod_received_qty(include_self=True)
		self._sync_lot_rollups()

	def on_cancel(self):
		self.sync_jod_received_qty(include_self=False)
		self._sync_lot_rollups()

	def _process_details(self, strict):

		for row in self.job_receipt_details:

			if not (row.employee and row.operation and row.item and row.lot and row.qty_received):
				continue

			try:
				jod = self._get_jod_for_row(row)
			except frappe.ValidationError:
				if strict:
					raise
				continue

			pending = flt(jod.qty) - self.get_other_received_qty(jod.name, row.name)

			if flt(row.qty_received) > pending:
				if strict:
					frappe.throw(_(
						"Row #{0}: Qty Received <b>{1}</b> exceeds the Pending Qty of "
						"<b>{2}</b> for Employee <b>{3}</b>, Operation <b>{4}</b>, "
						"Item <b>{5}</b>, Lot <b>{6}</b>."
					).format(
						row.idx, row.qty_received, pending,
						row.employee_name, row.operation, row.item, row.lot
					))
				continue

			row.jod_id = jod.name
			row.job_order = jod.parent
			row.rate = flt(jod.rate)
			row.amount = flt(row.rate) * flt(row.qty_received)

	def _get_jod_for_row(self, row):
		"""If a JOD Id is already attached (e.g. set by Job Order's
		"Process Receipt" button), trust it directly rather than
		re-searching — it's an exact, unambiguous match."""

		if row.jod_id:

			jod = frappe.db.get_value(
				"EC Job Order Detail",
				row.jod_id,
				["name", "parent", "qty", "rate"],
				as_dict=True
			)

			if not jod:
				frappe.throw(_(
					"Row #{0}: Invalid JOD Id <b>{1}</b>."
				).format(row.idx, row.jod_id))

			return jod

		return self.resolve_jod(row)

	def resolve_jod(self, row):
		"""Find the submitted Job Order Detail row matching this receipt
		row's Employee / Operation / Item / Lot, with enough Pending Qty
		to cover Qty Received. When the same combination was ordered in
		more than one batch (Job Order), the oldest batch with enough
		Pending Qty is used."""

		candidates = frappe.get_all(
			"EC Job Order Detail",
			filters={
				"employee": row.employee,
				"operation": row.operation,
				"item": row.item,
				"lot": row.lot,
				"docstatus": 1
			},
			fields=["name", "parent", "qty", "rate"],
			order_by="creation asc"
		)

		if not candidates:
			frappe.throw(_(
				"Row #{0}: No submitted Job Order found for Employee <b>{1}</b>, "
				"Operation <b>{2}</b>, Item <b>{3}</b>, Lot <b>{4}</b>."
			).format(row.idx, row.employee_name, row.operation, row.item, row.lot))

		for jod in candidates:

			pending = flt(jod.qty) - self.get_other_received_qty(jod.name, row.name)

			if flt(row.qty_received) <= pending:
				return jod

		frappe.throw(_(
			"Row #{0}: Qty Received <b>{1}</b> exceeds the Pending Qty available for "
			"Employee <b>{2}</b>, Operation <b>{3}</b>, Item <b>{4}</b>, Lot <b>{5}</b> "
			"(across all matching Job Order batches). Please split this into multiple "
			"rows if receiving against multiple batches."
		).format(row.idx, row.qty_received, row.employee_name, row.operation, row.item, row.lot))

	def get_other_received_qty(self, jod_id, row_name):
		"""Qty Received already recorded against this JOD, from every
		*submitted* Job Receipt Detail row except this one (across all
		documents, including other rows within this same document)."""

		other_docs_qty = flt(frappe.db.sql("""
			SELECT COALESCE(SUM(qty_received), 0)
			FROM `tabEC Job Receipt Detail`
			WHERE jod_id = %s AND parent != %s AND docstatus = 1
		""", (jod_id, self.name or ""))[0][0])

		same_doc_qty = sum(
			flt(row.qty_received)
			for row in self.job_receipt_details
			if row.jod_id == jod_id and row.name != row_name
		)

		return other_docs_qty + same_doc_qty

	def sync_jod_received_qty(self, include_self):

		jod_ids = {row.jod_id for row in self.job_receipt_details if row.jod_id}

		for jod_id in jod_ids:

			total_received = flt(frappe.db.sql("""
				SELECT COALESCE(SUM(qty_received), 0)
				FROM `tabEC Job Receipt Detail`
				WHERE jod_id = %s AND parent != %s AND docstatus = 1
			""", (jod_id, self.name or ""))[0][0])

			if include_self:
				total_received += sum(
					flt(row.qty_received)
					for row in self.job_receipt_details
					if row.jod_id == jod_id
				)

			frappe.db.set_value(
				"EC Job Order Detail",
				jod_id,
				"qty_received",
				total_received,
				update_modified=False
			)

	def _sync_lot_rollups(self):

		combos = {
			(row.lot, row.item, row.operation)
			for row in self.job_receipt_details
			if row.lot and row.item and row.operation
		}

		for lot, item, operation in combos:
			sync_lot_item_rollups(lot, item, operation)


@frappe.whitelist()
def get_matching_jod(employee, operation, item, lot):
	"""Best-effort preview used by the client to show Rate / Pending
	before save. The authoritative match (including picking the right
	batch when there are several) happens server-side in validate() /
	before_submit()."""

	row = frappe.db.get_value(
		"EC Job Order Detail",
		{
			"employee": employee,
			"operation": operation,
			"item": item,
			"lot": lot,
			"docstatus": 1
		},
		["name", "rate", "qty", "qty_received"],
		as_dict=True,
		order_by="creation asc"
	)

	if not row:
		return None

	return {
		"rate": flt(row.rate),
		"pending": flt(row.qty) - flt(row.qty_received)
	}
