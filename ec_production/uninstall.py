# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe

# Keep this in sync with the `fixtures` filter in hooks.py /
# ec_production/fixtures/custom_docperm.json
FOREIGN_DOCPERM_PARENTS = ["Operation", "Employee"]
FOREIGN_DOCPERM_ROLES = ["Sales User", "Purchase User", "Sales Manager", "Purchase Manager"]


def before_uninstall():
	"""
	Clean up customizations this app made to DocTypes it does not own.

	`bench uninstall-app` already deletes every DocType and record that
	belongs to this app (EC Item Operation Rate, EC Lot, EC Process Lot,
	their child tables, etc.), so nothing needs to be done for those here.

	It does NOT know about the `Custom DocPerm` rows this app added to
	foreign doctypes (Operation, Employee) via fixtures, to let the EC
	sales/purchase roles select those as link values. Those rows live on
	doctypes owned by other apps (erpnext/hrms) and would otherwise be left
	behind after uninstall, so remove them explicitly here.
	"""

	remove_custom_docperm(FOREIGN_DOCPERM_PARENTS, FOREIGN_DOCPERM_ROLES)


def remove_custom_docperm(parents, roles):
	names = frappe.get_all(
		"Custom DocPerm",
		filters={"parent": ["in", parents], "role": ["in", roles]},
		pluck="name",
	)

	for name in names:
		frappe.delete_doc("Custom DocPerm", name, ignore_permissions=True, force=True)

	if names:
		frappe.db.commit()
