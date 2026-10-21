# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint, flt


def execute(filters=None):
	filters = frappe._dict(filters or {})

	# `reqd` on the filter is a client-side rule only
	if not filters.ec_lot:
		frappe.throw(_("Please select an EC Lot"))

	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"label": _("Date"), "fieldname": "date", "fieldtype": "Date", "width": 110},
		{
			"label": _("Process Lot"),
			"fieldname": "process_lot",
			"fieldtype": "Link",
			"options": "EC Process Lot",
			"width": 160,
		},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
		{"label": _("Employee"), "fieldname": "employee", "fieldtype": "Data", "width": 250},
		{
			"label": _("EC Lot"),
			"fieldname": "ec_lot",
			"fieldtype": "Link",
			"options": "EC Lot",
			"width": 150,
		},
		{
			"label": _("Item"),
			"fieldname": "item",
			"fieldtype": "Link",
			"options": "Item",
			"width": 180,
		},
		{
			"label": _("Operation"),
			"fieldname": "operation",
			"fieldtype": "Link",
			"options": "Operation",
			"width": 150,
		},
		{"label": _("Qty"), "fieldname": "qty", "fieldtype": "Float", "width": 100},
		{"label": _("Time (in hrs)"), "fieldname": "time", "fieldtype": "Float", "width": 110},
		{"label": _("Rate"), "fieldname": "rate", "fieldtype": "Currency", "width": 120},
		{"label": _("Amount"), "fieldname": "amount", "fieldtype": "Currency", "width": 120},
		{"label": _("Remarks"), "fieldname": "remarks", "fieldtype": "Data", "width": 200},
	]


def get_data(filters):
	# Cancelled Process Lots never count; drafts are optional
	docstatuses = (0, 1) if cint(filters.include_drafts) else (1,)

	data = frappe.db.sql(
		"""
		SELECT
			pl.date AS date,
			pl.name AS process_lot,
			CASE pl.docstatus WHEN 0 THEN 'Draft' ELSE 'Submitted' END AS status,
			CONCAT(pli.employee, ': ', emp.employee_name) AS employee,
			pli.ec_lot AS ec_lot,
			pli.item AS item,
			pli.operation AS operation,
			pli.qty AS qty,
			pli.pay_by AS pay_by,
			pli.time AS time,
			pli.rate AS rate,
			pli.amount AS amount,
			pli.remarks AS remarks
		FROM `tabEC Process Lot Item` pli
		INNER JOIN `tabEC Process Lot` pl
			ON pl.name = pli.parent
		LEFT JOIN `tabEmployee` emp
			ON emp.name = pli.employee
		WHERE pli.ec_lot = %(ec_lot)s
			AND pl.docstatus IN %(docstatuses)s
		ORDER BY pl.date DESC, pl.name DESC, pli.idx
		""",
		{"ec_lot": filters.ec_lot, "docstatuses": docstatuses},
		as_dict=True,
	)

	# `qty` is a Data field on the child table, so it comes back as text
	for row in data:
		row.qty = flt(row.qty)

		# Time is only meaningful (and shown) for rows paid by Time; Qty and
		# Amount are as saved on the Process Lot
		row.time = flt(row.time) if row.pay_by == "Time" else None

	if data:
		data.append({
			"process_lot": _("Total"),
			"qty": sum(row.qty for row in data),
			"time": sum(flt(row.time) for row in data),
			"rate": sum(flt(row.rate) for row in data),
			"amount": sum(flt(row.amount) for row in data),
		})

	return data
