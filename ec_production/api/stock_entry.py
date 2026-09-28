import frappe
from frappe import _

# Keep this in sync with `mandatory_depends_on` on the `Stock Entry-ec_lot`
# Custom Field (ec_production/fixtures/custom_field.json), which is what
# marks the field mandatory on the form. `mandatory_depends_on` is a
# client-side rule only, so it is enforced again here.
EC_LOT_REQUIRED_TYPES = (
	"Material Consumption for Manufacture",
	"Material Transfer for Manufacture",
)


def validate_ec_lot(doc, method=None):
	if doc.flags.ignore_mandatory:
		return

	if doc.stock_entry_type in EC_LOT_REQUIRED_TYPES and not doc.get("ec_lot"):
		frappe.throw(
			_("EC Lot is mandatory for Stock Entry Type {0}").format(
				frappe.bold(doc.stock_entry_type)
			),
			exc=frappe.MandatoryError,
			title=_("Missing Value"),
		)
