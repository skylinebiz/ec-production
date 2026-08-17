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
def get_cutting_stock_entry_items(production_plan, cutting_items):
    import json

    cutting_items = json.loads(cutting_items or "[]")

    if not cutting_items:
        frappe.throw(_("No cutting items selected."))

    if len(cutting_items) != 1:
        frappe.throw(
            _(
                "Please process one cutting item at a time."
            )
        )

    item = cutting_items[0]

    item_code = item.get("item_code")
    bom_no = item.get("bom_no")
    qty = flt(item.get("qty"))

    if not item_code:
        frappe.throw(_("Item Code is required."))

    if not bom_no:
        frappe.throw(
            _("BOM is required for item {0}.").format(
                frappe.bold(item_code)
            )
        )

    bom_item = frappe.db.get_value(
        "BOM",
        bom_no,
        ["item", "company", "is_active", "docstatus"],
        as_dict=True,
    )

    if not bom_item:
        frappe.throw(_("BOM {0} does not exist.").format(bom_no))

    if bom_item.item != item_code:
        frappe.throw(
            _(
                "BOM {0} does not belong to item {1}."
            ).format(bom_no, item_code)
        )

    if not bom_item.is_active or bom_item.docstatus != 1:
        frappe.throw(
            _("BOM {0} must be active and submitted.").format(bom_no)
        )

    if qty <= 0:
        qty = 1

    production_plan_doc = frappe.get_doc(
        "Production Plan",
        production_plan
    )

    stock_entry = frappe.new_doc("Stock Entry")

    # Native Manufacture entry
    stock_entry.stock_entry_type = "Manufacture"
    stock_entry.purpose = "Manufacture"

    stock_entry.company = bom_item.company

    stock_entry.posting_date = frappe.utils.today()
    stock_entry.posting_time = frappe.utils.nowtime()

    stock_entry.from_bom = 1
    stock_entry.bom_no = bom_no
    stock_entry.fg_completed_qty = qty

    stock_entry.get_items()

    return stock_entry.as_dict()


@frappe.whitelist()
def get_rm_issue_items(production_plan):

    # ---------------------------------------------------------
    # Get Cutting Job Cards for this Production Plan
    # ---------------------------------------------------------

    job_cards = frappe.get_all(
        "Job Card",
        filters={
            "operation": "Cutting",
            "docstatus": ["<", 2],
        },
        fields=[
            "name",
            "work_order",
            "production_item",
            "item_name",
            "for_quantity",
            "bom_no",
        ],
        order_by="creation asc",
    )

    rm_items = []

    processed = set()

    for job_card in job_cards:

        if not job_card.work_order:
            continue

        # -----------------------------------------------------
        # Make sure Job Card belongs to this Production Plan
        # -----------------------------------------------------

        work_order_data = frappe.db.get_value(
            "Work Order",
            job_card.work_order,
            [
                "production_plan",
                "production_item",
                "bom_no",
            ],
            as_dict=True,
        )

        if not work_order_data:
            continue

        if work_order_data.production_plan != production_plan:
            continue

        # -----------------------------------------------------
        # Item being manufactured
        # -----------------------------------------------------

        source_item = (
            job_card.production_item
            or work_order_data.production_item
        )

        if not source_item:
            continue

        # -----------------------------------------------------
        # Prevent duplicate rows for same Cutting Job Card
        # -----------------------------------------------------

        key = job_card.name

        if key in processed:
            continue

        processed.add(key)

        # -----------------------------------------------------
        # Parent BOM
        # -----------------------------------------------------

        bom_no = (
            job_card.bom_no
            or work_order_data.bom_no
        )

        if not bom_no:
            bom_no = frappe.db.get_value(
                "Item",
                source_item,
                "default_bom",
            )

        if not bom_no:
            continue

        parent_bom = frappe.get_doc(
            "BOM",
            bom_no
        )

        # -----------------------------------------------------
        # Find Cutting component
        # -----------------------------------------------------

        for bom_item in parent_bom.items:

            if bom_item.operation != "Cutting":
                continue

            if not bom_item.item_code:
                continue

            # -------------------------------------------------
            # BOM of Cutting Item
            # -------------------------------------------------

            cut_bom_no = bom_item.bom_no

            if not cut_bom_no:
                cut_bom_no = frappe.db.get_value(
                    "Item",
                    bom_item.item_code,
                    "default_bom",
                )

            if not cut_bom_no:
                continue

            cut_bom = frappe.get_doc(
                "BOM",
                cut_bom_no
            )

            # -------------------------------------------------
            # Components
            # -------------------------------------------------

            components = []

            for cut_item in cut_bom.items:

                if not cut_item.item_code:
                    continue

                components.append({
                    "item_code": cut_item.item_code,
                    "item_name": cut_item.item_name,
                    "qty": flt(cut_item.qty),
                    "uom": cut_item.uom,
                    "stock_uom": cut_item.stock_uom,
                })

            # -------------------------------------------------
            # ONE ROW PER CUTTING JOB CARD
            # -------------------------------------------------

            rm_items.append({

                "job_card": job_card.name,

                "work_order": job_card.work_order,

                "source_item": source_item,

                "source_item_name": (
                    job_card.item_name
                    or frappe.db.get_value(
                        "Item",
                        source_item,
                        "item_name",
                    )
                ),

                "cut_item_code": bom_item.item_code,

                "cut_item_name": bom_item.item_name,

                "bom_no": cut_bom_no,

                "job_qty": flt(
                    job_card.for_quantity
                ),

                "components": components,
            })

            # We only want the Cutting component
            # for this Job Card.
            break

    return rm_items



def _get_job_card_context(job_card, qty):
    """Get and validate Job Card information used by all RM Processing steps."""

    if not job_card:
        frappe.throw(_("Job Card is required."))

    job = frappe.get_doc("Job Card", job_card)

    # if job.docstatus != 1:
    #     frappe.throw(
    #         _("Job Card {0} must be submitted before RM Processing.")
    #         .format(frappe.bold(job_card))
    #     )

    qty = flt(qty)

    if qty <= 0:
        frappe.throw(_("Quantity must be greater than zero."))

    job_qty = flt(job.for_quantity)

    # if qty > job_qty:
    #     frappe.throw(
    #         _("Quantity {0} cannot be greater than Job Card quantity {1}.")
    #         .format(qty, job_qty)
    #     )

    if not job.work_order:
        frappe.throw(
            _("Job Card {0} does not have a Work Order.")
            .format(frappe.bold(job_card))
        )

    work_order = frappe.get_doc("Work Order", job.work_order)

    return job, work_order, qty


@frappe.whitelist()
def issue_rm_for_job_card(job_card, qty):

    qty = flt(qty)

    if qty <= 0:
        frappe.throw(_("Quantity must be greater than zero."))

    # Get Job Card / Work Order

    job = frappe.get_doc("Job Card", job_card)

    work_order_name = job.work_order

    if not work_order_name:
        frappe.throw(
            _("Work Order is not set in Job Card {0}.")
            .format(frappe.bold(job_card))
        )

    work_order = frappe.get_doc(
        "Work Order",
        work_order_name
    )

    # Warehouses

    source_warehouse = (
        job.source_warehouse
        or work_order.source_warehouse
    )

    wip_warehouse = (
        job.wip_warehouse
        or work_order.wip_warehouse
    )

    if not source_warehouse:
        frappe.throw(
            _("Source Warehouse is not set.")
        )

    if not wip_warehouse:
        frappe.throw(
            _("WIP Warehouse is not set.")
        )

    cut_item = work_order.production_item
    bom_no = work_order.bom_no

    if not cut_item:
        frappe.throw(
            _("Production Item is not set in Work Order.")
        )

    if not bom_no:
        frappe.throw(
            _("BOM is not set in Work Order.")
        )

    bom = frappe.get_doc(
        "BOM",
        bom_no
    )

    # Create completely independent Stock Entry

    stock_entry = frappe.new_doc("Stock Entry")

    stock_entry.stock_entry_type = "Material Transfer"
    stock_entry.purpose = "Material Transfer"

    stock_entry.company = work_order.company

    job_qty = flt(
        work_order.qty
    ) or 1

    for bom_item in bom.items:

        component_qty = flt(
            bom_item.stock_qty
            or bom_item.qty
        )

        if component_qty <= 0:
            continue

        material_qty = (
            component_qty
            * qty
            / job_qty
        )

        if material_qty <= 0:
            continue

        stock_entry.append(
            "items",
            {
                "item_code": bom_item.item_code,

                "qty": material_qty,

                "uom": (
                    bom_item.stock_uom
                    or bom_item.uom
                ),

                "stock_uom": (
                    bom_item.stock_uom
                    or bom_item.uom
                ),

                "conversion_factor": 1,

                "s_warehouse": source_warehouse,

                "t_warehouse": wip_warehouse,
            }
        )

    if not stock_entry.items:
        frappe.throw(
            _("No BOM components found.")
        )

    stock_entry.insert(
        ignore_permissions=True
    )

    return {
        "name": stock_entry.name,
        "doctype": "Stock Entry",
        "job_card": job_card,
        "work_order": work_order_name,
        "qty": qty,
    }


@frappe.whitelist()
def process_cut_for_job_card(job_card, qty):
    """
    Process Cuts

    This should be executed AFTER the Cutting Job Card is completed.

    WIP / Cutting RM
            ↓
        Cut Item
    """

    job, work_order, qty = _get_job_card_context(job_card, qty)

    # Cutting must be completed

    if job.status != "Completed":
        frappe.throw(
            _(
                "Cutting operation is not completed for {0} qty of Job Card {1}. "
                "Please complete the Job Card before processing cuts."
            ).format(
                frappe.bold(qty),
                frappe.bold(job_card),
            )
        )

    completed_qty = flt(job.total_completed_qty)

    if completed_qty < qty:
        frappe.throw(
            _(
                "Only {0} qty has been completed in Job Card {1}. "
                "You cannot process {2} qty."
            ).format(
                frappe.bold(completed_qty),
                frappe.bold(job_card),
                frappe.bold(qty),
            )
        )

    # Required fields

    cut_item = None

    if hasattr(job, "custom_cut_item"):
        cut_item = job.custom_cut_item

    if not cut_item and hasattr(work_order, "custom_cut_item"):
        cut_item = work_order.custom_cut_item

    if not cut_item:
        frappe.throw(
            _(
                "Cut Item is not configured for Job Card {0}. "
                "Please set the Cut Item before processing cuts."
            ).format(frappe.bold(job_card))
        )

    # Find BOM for Cut Item

    bom = frappe.db.get_value(
        "BOM",
        {
            "item": cut_item,
            "is_active": 1,
            "is_default": 1,
            "docstatus": 1,
        },
        "name",
    )

    if not bom:
        bom = frappe.db.get_value(
            "Item",
            cut_item,
            "default_bom",
        )

    if not bom:
        frappe.throw(
            _("No active BOM found for Cut Item {0}.")
            .format(frappe.bold(cut_item))
        )

    # Prevent duplicate Process Cut

    existing = frappe.db.exists(
        "Stock Entry",
        {
            "job_card": job_card,
            "purpose": "Manufacture",
            "docstatus": 1,
        },
    )

    if existing:
        frappe.throw(
            _("Process Cut Stock Entry {0} already exists for Job Card {1}.")
            .format(
                frappe.bold(existing),
                frappe.bold(job_card),
            )
        )

    # Create Manufacture Stock Entry

    stock_entry = frappe.new_doc("Stock Entry")

    stock_entry.stock_entry_type = "Manufacture"
    stock_entry.purpose = "Manufacture"
    stock_entry.company = work_order.company
    stock_entry.from_bom = 1
    stock_entry.bom_no = bom
    stock_entry.fg_completed_qty = qty


    # Finished / Cut Item

    cut_item_doc = frappe.get_doc("Item", cut_item)

    stock_entry.append(
        "items",
        {
            "item_code": cut_item,
            "qty": qty,
            "uom": cut_item_doc.stock_uom,
            "stock_uom": cut_item_doc.stock_uom,
            "conversion_factor": 1,

            "is_finished_item": 1,

            "t_warehouse": job.target_warehouse
            or job.wip_warehouse,
        },
    )

    # Consume RM from WIP

    bom_doc = frappe.get_doc("BOM", bom)

    bom_qty = flt(bom_doc.quantity) or 1

    for bom_item in bom_doc.items:

        material_qty = (
            flt(bom_item.qty) / bom_qty
        ) * qty

        if material_qty <= 0:
            continue

        stock_entry.append(
            "items",
            {
                "item_code": bom_item.item_code,
                "qty": material_qty,

                "uom": bom_item.uom,
                "stock_uom": bom_item.stock_uom,
                "conversion_factor": 1,

                "s_warehouse": job.wip_warehouse,

                "is_finished_item": 0,
            },
        )

    stock_entry.insert(ignore_permissions=True)

    return {
        "name": stock_entry.name,
        "doctype": "Stock Entry",
        "purpose": stock_entry.purpose,
        "job_card": job_card,
        "work_order": work_order.name,
        "cut_item": cut_item,
        "bom": bom,
        "qty": qty,
    }


@frappe.whitelist()
def receive_rm_for_job_card(job_card, qty):
    """
    RM Receive

    Receive the processed/cut material into the final RM warehouse.

    This is intentionally a Material Receipt, not Manufacture.
    """

    job, work_order, qty = _get_job_card_context(job_card, qty)

    # Process Cut must already exist

    process_cut = frappe.db.exists(
        "Stock Entry",
        {
            "job_card": job_card,
            "purpose": "Manufacture",
            "docstatus": 1,
        },
    )

    if not process_cut:
        frappe.throw(
            _(
                "Process Cut Stock Entry is not completed for Job Card {0}. "
                "Please complete Process Cuts first."
            ).format(frappe.bold(job_card))
        )

    # Determine item to receive

    receive_item = None

    if hasattr(job, "custom_receive_item"):
        receive_item = job.custom_receive_item

    if not receive_item and hasattr(work_order, "custom_receive_item"):
        receive_item = work_order.custom_receive_item

    if not receive_item:
        frappe.throw(
            _(
                "Receive Item is not configured for Job Card {0}."
            ).format(frappe.bold(job_card))
        )

    # Determine warehouse

    receive_warehouse = None

    if hasattr(job, "custom_receive_warehouse"):
        receive_warehouse = job.custom_receive_warehouse

    if not receive_warehouse:
        receive_warehouse = job.target_warehouse

    if not receive_warehouse:
        frappe.throw(
            _(
                "Receive Warehouse is not configured for Job Card {0}."
            ).format(frappe.bold(job_card))
        )

    # Prevent duplicate RM Receive

    existing = frappe.db.exists(
        "Stock Entry",
        {
            "job_card": job_card,
            "purpose": "Material Receipt",
            "docstatus": 1,
        },
    )

    if existing:
        frappe.throw(
            _("RM Receive Stock Entry {0} already exists for Job Card {1}.")
            .format(
                frappe.bold(existing),
                frappe.bold(job_card),
            )
        )

    # Create Material Receipt

    stock_entry = frappe.new_doc("Stock Entry")

    stock_entry.stock_entry_type = "Material Receipt"
    stock_entry.purpose = "Material Receipt"

    stock_entry.company = work_order.company
    stock_entry.job_card = job_card

    stock_entry.append(
        "items",
        {
            "item_code": receive_item,
            "qty": qty,

            "uom": frappe.db.get_value(
                "Item",
                receive_item,
                "stock_uom",
            ),

            "stock_uom": frappe.db.get_value(
                "Item",
                receive_item,
                "stock_uom",
            ),

            "conversion_factor": 1,

            "t_warehouse": receive_warehouse,
        },
    )

    stock_entry.insert(ignore_permissions=True)

    return {
        "name": stock_entry.name,
        "doctype": "Stock Entry",
        "purpose": stock_entry.purpose,
        "job_card": job_card,
        "work_order": work_order.name,
        "item": receive_item,
        "qty": qty,
    }



