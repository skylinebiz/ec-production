# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import cint, flt
from frappe.utils.nestedset import get_descendants_of
from frappe import _


class ECLot(Document):

	def validate(self):
		self.set_rates()
		self.validate_used_qty()
		self.calculate_totals()

	def set_rates(self):
		for row in self.ec_lot_item:
			if row.item and row.operation and row.date and not row.rate:
				row.rate = get_rate(
					row.item,
					row.operation,
					row.date
				)

	def calculate_totals(self):
		self.total_qty = sum(
			flt(row.qty)
			for row in self.ec_lot_item
		)

	def validate_used_qty(self):
		"""
		If this lot has already been used in any Process Lot
		(draft/submitted/cancelled), do not allow reducing qty
		below the quantity already consumed.
		"""

		if self.is_new():
			return

		for row in self.ec_lot_item:

			used_qty = frappe.db.sql("""
				SELECT COALESCE(SUM(qty), 0)
				FROM `tabEC Process Lot Item`
				WHERE ec_lot = %s
				  AND item = %s
				  AND operation = %s
			""", (
				self.name,
				row.item,
				row.operation
			))[0][0] or 0

			if flt(row.qty) < flt(used_qty):
				frappe.throw(
					_(
						"Cannot reduce Qty for Item <b>{item}</b> ({operation}).<br><br>"
						"Qty in EC Lot: <b>{lot_qty}</b><br>"
						"Qty already used in Process Lots: <b>{used_qty}</b><br><br>"
						"Qty must be at least <b>{used_qty}</b>."
					).format(
						item=row.item,
						operation=row.operation,
						lot_qty=row.qty,
						used_qty=used_qty
					)
				)


@frappe.whitelist()
def get_rate(item, operation, date):

    return flt(get_rates([item], [operation], date).get((item, operation)))


def get_rates(items, operations, date):
    """
    Latest EC Item Operation Rate effective on/before `date`, as
    {(item, operation): rate}. A variant with no rate of its own falls
    back to its template's rate (rates are usually maintained per style,
    not per colour/size). Pairs with no rate are absent from the result.
    """

    if not (items and operations and date):
        return {}

    template_of = {
        row.name: row.variant_of
        for row in frappe.get_all(
            "Item",
            filters={"name": ["in", items], "variant_of": ["is", "set"]},
            fields=["name", "variant_of"],
            limit_page_length=0
        )
    }

    rows = frappe.get_all(
        "EC Item Operation Rate",
        filters={
            "item": ["in", list(set(items) | set(template_of.values()))],
            "operation": ["in", operations],
            "effective_from": ["<=", date]
        },
        fields=["item", "operation", "rate"],
        order_by="effective_from desc, creation desc",
        limit_page_length=0
    )

    latest = {}
    for row in rows:
        latest.setdefault((row.item, row.operation), flt(row.rate))

    rates = {}
    for item in items:
        for operation in operations:
            for source in (item, template_of.get(item)):
                if (source, operation) in latest:
                    rates[(item, operation)] = latest[(source, operation)]
                    break

    return rates


@frappe.whitelist()
def get_item_attributes():
    """
    Every Item Attribute with its selectable values, in creation order —
    drives the attribute filters of the Advanced Search popup.
    """

    frappe.has_permission("EC Lot", "read", throw=True)

    attributes = frappe.get_all(
        "Item Attribute",
        fields=["name", "numeric_values"],
        order_by="creation asc",
        limit_page_length=0
    )

    values = {}
    for d in frappe.get_all(
        "Item Attribute Value",
        filters={"parent": ["in", [a.name for a in attributes]]},
        fields=["parent", "attribute_value"],
        order_by="idx asc",
        limit_page_length=0
    ):
        values.setdefault(d.parent, []).append(d.attribute_value)

    return [
        {
            "attribute": a.name,
            "numeric": cint(a.numeric_values),
            "values": values.get(a.name, [])
        }
        for a in attributes
    ]


@frappe.whitelist()
def search_lot_items(
    operations,
    date,
    item_group=None,
    style=None,
    attributes=None
):
    """
    Advanced Search for the EC Lot grid. Returns matching (non-template,
    enabled) items with the rate for each requested operation as of `date`.

    `style` is an Item that has variants (limits the search to that
    template's variants); `attributes` is {Item Attribute: value}.
    """

    frappe.has_permission("EC Lot", "read", throw=True)

    operations = frappe.parse_json(operations) if isinstance(operations, str) else operations
    operations = list(dict.fromkeys(operations or []))
    attributes = frappe.parse_json(attributes) if isinstance(attributes, str) else attributes
    attributes = {k: v for k, v in (attributes or {}).items() if v}

    if not operations:
        frappe.throw(_("Please select at least one Operation"))

    filters = [
        ["Item", "has_variants", "=", 0],
        ["Item", "disabled", "=", 0]
    ]

    if item_group:
        groups = [item_group, *get_descendants_of("Item Group", item_group)]
        filters.append(["Item", "item_group", "in", groups])

    if style:
        filters.append(["Item", "variant_of", "=", style])

    for attribute, value in attributes.items():
        parents = frappe.get_all(
            "Item Variant Attribute",
            filters={"attribute": attribute, "attribute_value": value},
            pluck="parent",
            limit_page_length=0
        )
        filters.append(["Item", "name", "in", parents or [""]])

    # One extra row tells the caller whether the list was cut short
    limit = 500
    items = frappe.get_all(
        "Item",
        filters=filters,
        fields=["name", "item_name", "item_group"],
        order_by="item_name asc, name asc",
        limit_page_length=limit + 1
    )

    has_more = len(items) > limit
    items = items[:limit]
    names = [d.name for d in items]

    item_attributes = {}
    for d in frappe.get_all(
        "Item Variant Attribute",
        filters={"parent": ["in", names]},
        fields=["parent", "attribute", "attribute_value"],
        limit_page_length=0
    ):
        item_attributes.setdefault(d.parent, {})[d.attribute] = d.attribute_value

    rates = get_rates(names, operations, date)

    return {
        "has_more": has_more,
        "items": [
            {
                "item": d.name,
                "item_name": d.item_name,
                "item_group": d.item_group,
                "attributes": item_attributes.get(d.name, {}),
                "rates": {
                    operation: rates.get((d.name, operation), 0)
                    for operation in operations
                }
            }
            for d in items
        ]
    }


def get_dashboard_data():
    return {
        "transactions": [
            {
                "label": "References",
                "items": ["EC Process Lot"]
            }
        ]
    }