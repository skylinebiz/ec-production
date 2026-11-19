import frappe

# Old v16-style sidebars this app used to ship from `ec_production/workspace_sidebar/`.
# The app now ships its sidebar as a module `Sidebar` (ec_production/ec_production/sidebar/),
# so these rows are dead weight. Left in the database, Frappe's
# `convert_sidebars` upgrade patch would turn them back into a sidebar.
LEGACY_SIDEBARS = ("EC Prod", "EC Production")


def execute():
	if not frappe.db.exists("DocType", "Workspace Sidebar"):
		return

	for name in LEGACY_SIDEBARS:
		frappe.delete_doc(
			"Workspace Sidebar",
			name,
			ignore_permissions=True,
			ignore_missing=True,
			force=True,
		)

	frappe.clear_cache()
