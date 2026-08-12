import frappe

from frappe import _
from frappe.utils import flt


def get_default_bom(item_code):
    """Return the active, submitted default BOM for an Item."""

    if not item_code:
        return None

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


def get_cutting_items_from_bom(
    bom_name,
    result,
    visited,
    source_item_code=None,
):

    if not bom_name:
        return

    # Prevent circular BOM recursion
    if bom_name in visited:
        return

    visited.add(bom_name)

    bom = frappe.get_doc("BOM", bom_name)

    if bom.docstatus != 1:
        frappe.throw(
            _("BOM {0} must be submitted.").format(bom_name)
        )

    for row in bom.items:

        if not row.item_code:
            continue

        # Cutting Item

        if row.operation == "Cutting":

            item_code = row.item_code

            if item_code not in result:

                result[item_code] = {
                    "item_code": item_code,
                    "item_name": frappe.db.get_value(
                        "Item",
                        item_code,
                        "item_name",
                    ),
                    "source_items": [],
                    "source_boms": [],
                    "current_bom": get_default_bom(item_code),
                }

            # Keep track of Production Plan items
            if (
                source_item_code
                and source_item_code
                not in result[item_code]["source_items"]
            ):
                result[item_code]["source_items"].append(
                    source_item_code
                )

            # Keep track of BOMs where this item was found
            if (
                bom_name
                not in result[item_code]["source_boms"]
            ):
                result[item_code]["source_boms"].append(
                    bom_name
                )

            continue

        child_bom = get_default_bom(row.item_code)

        if child_bom:

            get_cutting_items_from_bom(
                bom_name=child_bom,
                result=result,
                visited=visited,
                source_item_code=source_item_code,
            )


@frappe.whitelist()
def get_cutting_items(production_plan):
    if not production_plan:
        frappe.throw(
            _("Production Plan is required.")
        )

    pp = frappe.get_doc(
        "Production Plan",
        production_plan,
    )

    result = {}
    visited = set()

    for pp_item in pp.po_items:

        if not pp_item.item_code:
            continue

        # Production Plan BOM takes priority
        bom_name = pp_item.bom_no

        # Fallback to default BOM
        if not bom_name:
            bom_name = get_default_bom(
                pp_item.item_code
            )

        if not bom_name:

            frappe.throw(
                _(
                    "BOM is required for Production Plan Item {0}."
                ).format(
                    pp_item.item_code
                )
            )

        get_cutting_items_from_bom(
            bom_name=bom_name,
            result=result,
            visited=visited,
            source_item_code=pp_item.item_code,
        )

    return list(result.values())


@frappe.whitelist()
def get_cutting_stock_entry_items(
    production_plan,
    cutting_items,
):
    if not production_plan:
        frappe.throw(
            _("Production Plan is required.")
        )

    if not cutting_items:
        frappe.throw(
            _("Cutting Items are required.")
        )

    if isinstance(cutting_items, str):
        cutting_items = frappe.parse_json(
            cutting_items
        )

    if not isinstance(cutting_items, list):
        frappe.throw(
            _("Invalid Cutting Items.")
        )

    pp = frappe.get_doc(
        "Production Plan",
        production_plan,
    )

    available_cutting_items = get_cutting_items(
        production_plan
    )

    available_item_map = {
        row["item_code"]: row
        for row in available_cutting_items
    }

    selected_items = {}

    for row in cutting_items:

        item_code = row.get("item_code")

        if not item_code:
            frappe.throw(
                _("Cutting Item is required.")
            )

        if item_code not in available_item_map:

            frappe.throw(
                _(
                    "Item {0} is not a valid Cutting item "
                    "for Production Plan {1}."
                ).format(
                    item_code,
                    production_plan,
                )
            )

        qty = flt(
            row.get("qty")
        )

        if qty <= 0:

            frappe.throw(
                _(
                    "Quantity must be greater than zero "
                    "for {0}."
                ).format(
                    item_code
                )
            )

        bom_no = row.get("bom_no")

        if not bom_no:

            frappe.throw(
                _(
                    "BOM is required for Cutting Item {0}."
                ).format(
                    item_code
                )
            )

        bom = frappe.db.get_value(
            "BOM",
            bom_no,
            [
                "name",
                "item",
                "docstatus",
                "is_active",
            ],
            as_dict=True,
        )

        if not bom:

            frappe.throw(
                _(
                    "BOM {0} does not exist."
                ).format(
                    bom_no
                )
            )

        if bom.item != item_code:

            frappe.throw(
                _(
                    "BOM {0} does not belong to Item {1}."
                ).format(
                    bom_no,
                    item_code,
                )
            )

        if bom.docstatus != 1:

            frappe.throw(
                _(
                    "BOM {0} must be submitted."
                ).format(
                    bom_no
                )
            )

        if not bom.is_active:

            frappe.throw(
                _(
                    "BOM {0} is not active."
                ).format(
                    bom_no
                )
            )

        if item_code in selected_items:

            frappe.throw(
                _(
                    "Cutting Item {0} is selected more than once."
                ).format(
                    item_code
                )
            )

        selected_items[item_code] = {
            "item_code": item_code,
            "qty": qty,
            "bom_no": bom_no,
        }

    missing_items = []

    for item_code in available_item_map:

        if item_code not in selected_items:

            missing_items.append(
                item_code
            )

    if missing_items:

        frappe.throw(
            _(
                "Please provide BOM and quantity for all "
                "Cutting items. Missing: {0}"
            ).format(
                ", ".join(missing_items)
            )
        )


    items = []

    for item_code, data in selected_items.items():

        item = frappe.db.get_value(
            "Item",
            item_code,
            [
                "item_name",
                "stock_uom",
            ],
            as_dict=True,
        )

        if not item:
            frappe.throw(
                _("Item {0} does not exist.").format(
                    item_code
                )
            )

        stock_uom = item.stock_uom

        # Get UOM from BOM item if available
        bom_item_uom = frappe.db.get_value(
            "BOM Item",
            {
                "parent": data["bom_no"],
                "item_code": item_code,
            },
            "uom",
        )

        uom = bom_item_uom or stock_uom

        items.append(
            {
                "item_code": item_code,
                "item_name": item.item_name,
                "qty": data["qty"],
                "uom": uom,
                "stock_uom": stock_uom,
                "bom_no": data["bom_no"],
            }
        )

    if not items:

        frappe.throw(
            _("No Cutting items were selected.")
        )

    return {
        "stock_entry_type": "Manufacture",
        "posting_date": frappe.utils.today(),
        "posting_time": frappe.utils.nowtime(),
        "production_plan": production_plan,
        "items": items,
    }