import frappe
from frappe import _
from frappe.utils import flt, nowdate, nowtime
import json

@frappe.whitelist()
def validate(doc):

	doc = frappe.parse_json(doc)

	created_items = []

	for row in doc.get("po_items", []):

		item_code = row.get("item_code")

		if not item_code:
			continue

		cut_item_code = ensure_cut_item(item_code)

		if not cut_item_code:
			continue

		ensure_cut_bom(cut_item_code)

		ensure_item_bom(
			item_code,
			cut_item_code
		)

		created_items.append(cut_item_code)

	return created_items


def ensure_cut_item(item_code):
	"""
	Example:
		JM4723-RED-101-36
			↓
		JM4723
			↓
		Colour = RED
		Colour Code = 101
			↓
		JM4723-RED-101-CUT
	"""

	item = frappe.get_doc("Item", item_code)

	if not item.variant_of:
		return None

	template = frappe.get_doc("Item", item.variant_of)

	colour = None
	colour_code = None

	for attr in item.attributes:

		if attr.attribute == "Colour":
			colour = attr.attribute_value

		elif attr.attribute == "Colour Code":
			colour_code = attr.attribute_value

	if not colour:
		frappe.throw(
			_("Colour is missing for Item {0}").format(item_code)
		)

	if not colour_code:
		frappe.throw(
			_("Colour Code is missing for Item {0}").format(item_code)
		)

	cut_item_code = f"{template.name}-{colour}-{colour_code}-CUT"

	# Already exists
	if frappe.db.exists("Item", cut_item_code):
		return cut_item_code

	# Create Item Variant
	cut_item = frappe.new_doc("Item")

	cut_item.item_code = cut_item_code
	cut_item.item_name = cut_item_code
	cut_item.item_group = template.item_group
	cut_item.stock_uom = template.stock_uom
	cut_item.is_stock_item = template.is_stock_item
	cut_item.include_item_in_manufacturing = (
		template.include_item_in_manufacturing
	)
	cut_item.variant_of = template.name

	# Copy attributes
	for attr in item.attributes:

		if attr.attribute == "Colour":
			cut_item.append("attributes", {
				"attribute": "Colour",
				"attribute_value": colour,
			})

		elif attr.attribute == "Colour Code":
			cut_item.append("attributes", {
				"attribute": "Colour Code",
				"attribute_value": colour_code,
			})

	cut_item.insert()

	return cut_item_code

def ensure_cut_bom(cut_item_code, routing=None):
	"""
	BOM:

	JM4723-RED-101-CUT
		|
		└── Fabric
	"""

	# Existing submitted/default BOM
	bom_name = frappe.db.get_value(
		"BOM",
		{
			"item": cut_item_code,
			"docstatus": 1,
			"is_active": 1,
			"is_default": 1,
		},
		"name",
	)

	if bom_name:
		return bom_name

	# Check for an existing draft BOM
	draft_bom = frappe.db.get_value(
		"BOM",
		{
			"item": cut_item_code,
			"docstatus": 0,
			"is_active": 1,
		},
		"name",
	)

	if draft_bom:
		bom = frappe.get_doc("BOM", draft_bom)

	else:
		bom = frappe.new_doc("BOM")

		bom.item = cut_item_code
		bom.quantity = 1
		bom.is_active = 1
		bom.is_default = 1

		# Component

		bom.append("items", {
			"item_code": "Cotton Fabric",
			"qty": 1,
		})

	# Routing

	if routing:
		bom.routing = routing
		bom.with_operations = 1

	bom.save()

	# Submit BOM

	if bom.docstatus == 0:
		bom.submit()

	return bom.name


def ensure_item_bom(item_code, cut_item_code, routing=None):
	"""
	BOM:

	JM4723-RED-101-36
		|
		└── JM4723-RED-101-CUT
	"""

	# Existing submitted/default BOM
	bom_name = frappe.db.get_value(
		"BOM",
		{
			"item": item_code,
			"docstatus": 1,
			"is_active": 1,
			"is_default": 1,
		},
		"name",
	)

	if bom_name:
		return bom_name

	# Check draft BOM
	draft_bom = frappe.db.get_value(
		"BOM",
		{
			"item": item_code,
			"docstatus": 0,
			"is_active": 1,
		},
		"name",
	)

	if draft_bom:
		bom = frappe.get_doc("BOM", draft_bom)

	else:
		bom = frappe.new_doc("BOM")

		bom.item = item_code
		bom.quantity = 1
		bom.is_active = 1
		bom.is_default = 1

		# -------------------------------------------------
		# CUT Item as component
		# -------------------------------------------------

		bom.append("items", {
			"item_code": cut_item_code,
			"qty": 1,
		})

	#  
	# Routing
	#  

	if routing:
		bom.routing = routing
		bom.with_operations = 1

	bom.save()

	#  
	# Submit
	#  

	if bom.docstatus == 0:
		bom.submit()

	return bom.name


@frappe.whitelist()
def ensure_cut_item_and_boms(item_code):

	if not item_code:
		return None

	item = frappe.get_doc("Item", item_code)

	if not item.variant_of:
		return None

	#  ----
	# 1. Create / find CUT Item
	#  ----

	cut_item_code = ensure_cut_item(item_code)

	#  ----
	# 2. Find BOM for CUT Item
	#  ----

	cut_bom = frappe.db.get_value(
		"BOM",
		{
			"item": cut_item_code,
			"docstatus": 1,
			"is_active": 1,
			"is_default": 1,
		},
		"name",
	)

	if not cut_bom:
		frappe.throw(
			frappe._(
				"BOM required for CUT Item {0}"
			).format(cut_item_code)
		)

	#  ----
	# 3. Find BOM for original Item
	#  ----

	item_bom = frappe.db.get_value(
		"BOM",
		{
			"item": item_code,
			"docstatus": 1,
			"is_active": 1,
			"is_default": 1,
		},
		"name",
	)

	if not item_bom:
		frappe.throw(
			frappe._(
				"BOM required for Item {0}"
			).format(item_code)
		)

	return {
		"item_code": item_code,
		"cut_item_code": cut_item_code,
		"cut_bom": cut_bom,
		"item_bom": item_bom,
	}





@frappe.whitelist()
@frappe.whitelist()
def get_cutting_items(production_plan):

	if not production_plan:
		frappe.throw(_("Production Plan is required"))

	pp = frappe.get_doc("Production Plan", production_plan)

	result = {}

	for row in pp.po_items:

		if not row.item_code:
			continue

		#  
		# Get BOM from Production Plan Item
		#  

		bom_name = row.bom_no

		if not bom_name:
			bom_name = frappe.db.get_value(
				"BOM",
				{
					"item": row.item_code,
					"docstatus": 1,
					"is_active": 1,
					"is_default": 1,
				},
				"name",
			)

		if not bom_name:
			frappe.throw(
				_("BOM required for {0}").format(
					row.item_code
				)
			)

		bom = frappe.get_doc("BOM", bom_name)

		#  
		# Find CUT component directly inside this BOM
		#  

		for bom_item in bom.items:

			if not bom_item.item_code:
				continue

			# We only want the -CUT component
			if not bom_item.item_code.endswith("-CUT"):
				continue

			cut_item_code = bom_item.item_code

			# -------------------------------------------------
			# Unique CUT Item
			# -------------------------------------------------

			if cut_item_code not in result:

				result[cut_item_code] = {
					"item_code": cut_item_code,
					"item_name": frappe.db.get_value(
						"Item",
						cut_item_code,
						"item_name",
					),
					"source_items": [],
					"source_boms": [],
					"current_bom": get_default_bom(
						cut_item_code
					),
				}

			# -------------------------------------------------
			# Keep all Production Plan items that use this CUT
			# -------------------------------------------------

			if row.item_code not in result[cut_item_code]["source_items"]:

				result[cut_item_code]["source_items"].append(
					row.item_code
				)

			if bom_name not in result[cut_item_code]["source_boms"]:

				result[cut_item_code]["source_boms"].append(
					bom_name
				)

	return list(result.values())


def _get_cutting_items_from_bom(
	bom_name,
	result,
	visited,
	source_item_code=None
):

	if bom_name in visited:
		return

	visited.add(bom_name)

	bom = frappe.get_doc("BOM", bom_name)

	for row in bom.items:

		if not row.item_code:
			continue

		# --------------------------------------------------
		# Cutting Item
		# --------------------------------------------------

		if row.operation == "Cutting":

			item_code = row.item_code

			if item_code not in result:

				# Original Production Plan item
				source_item_name = None

				if source_item_code:
					source_item_name = frappe.db.get_value(
						"Item",
						source_item_code,
						"item_name"
					)

				result[item_code] = {
					"item_code": item_code,

					# IMPORTANT:
					# This is the original item's name
					# e.g. 101-36
					"item_name": source_item_name or "",

					"source_item_code": source_item_code,

					"source_bom": bom_name,

					"current_bom": get_default_bom(
						item_code
					),
				}

			continue

		# --------------------------------------------------
		# Traverse child BOM
		# --------------------------------------------------

		child_bom = get_default_bom(row.item_code)

		if child_bom:

			_get_cutting_items_from_bom(
				child_bom,
				result,
				visited,
				source_item_code
			)


def get_default_bom(item_code):

	return frappe.db.get_value(
		"BOM",
		{
			"item": item_code,
			"docstatus": 1,
			"is_active": 1,
			"is_default": 1,
		},
		"name",
	)


@frappe.whitelist()
def get_cutting_stock_entry_items(
	production_plan,
	cutting_items
):

	if not production_plan:
		frappe.throw(_("Production Plan is required"))

	if isinstance(cutting_items, str):
		cutting_items = json.loads(cutting_items)

	pp = frappe.get_doc(
		"Production Plan",
		production_plan
	)

	#  ----
	# Selected CUT items and Process Cutting Qty
	#  ----

	selected_items = {}

	for item in cutting_items:

		item_code = item.get("item_code")
		bom = item.get("bom")
		process_qty = flt(item.get("qty"))

		if not item_code:
			continue

		if not bom:
			frappe.throw(
				_("BOM is required for {0}")
				.format(item_code)
			)

		if process_qty <= 0:
			frappe.throw(
				_("Quantity must be greater than zero for {0}")
				.format(item_code)
			)

		selected_items[item_code] = {
			"bom": bom,
			"process_qty": process_qty,
		}

	#  ----
	# Accumulate CUT component quantities
	#  ----

	cutting_qty = {}

	for row in pp.po_items:

		if not row.item_code:
			continue

		#  
		# Production Plan Item BOM
		#  

		bom_name = row.bom_no

		if not bom_name:

			bom_name = frappe.db.get_value(
				"BOM",
				{
					"item": row.item_code,
					"docstatus": 1,
					"is_active": 1,
					"is_default": 1,
				},
				"name",
			)

		if not bom_name:
			frappe.throw(
				_("BOM required for {0}")
				.format(row.item_code)
			)

		bom = frappe.get_doc(
			"BOM",
			bom_name
		)

		#  
		# Find CUT component
		#  

		for bom_item in bom.items:

			cut_item_code = bom_item.item_code

			if not cut_item_code:
				continue

			if not cut_item_code.endswith("-CUT"):
				continue

			# This CUT item must have been selected
			# in Process Cutting dialog
			if cut_item_code not in selected_items:
				continue

			# -------------------------------------------------
			# Add the BOM component quantity
			# -------------------------------------------------

			component_qty = flt(
				bom_item.qty
			)

			cutting_qty[cut_item_code] = (
				cutting_qty.get(
					cut_item_code,
					0
				)
				+ component_qty
			)

	#  ----
	# Apply Process Cutting Qty
	#  ----

	items = []

	for cut_item_code, total_component_qty in cutting_qty.items():

		process_qty = flt(
			selected_items[cut_item_code]["process_qty"]
		)

		final_qty = (
			total_component_qty
			* process_qty
		)

		if final_qty <= 0:
			continue

		uom = frappe.db.get_value(
			"Item",
			cut_item_code,
			"stock_uom"
		)

		items.append({
			"item_code": cut_item_code,
			"qty": final_qty,
			"uom": uom,
		})

	return {
		"stock_entry_type": "Manufacture",
		"posting_date": nowdate(),
		"posting_time": nowtime(),
		"production_plan": production_plan,
		"items": items,
	}

