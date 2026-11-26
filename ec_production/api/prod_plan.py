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


def _get_bom(bom_name, bom_cache):
    """BOM documents are read many times while walking a plan; load each once."""

    if bom_name not in bom_cache:
        bom_cache[bom_name] = frappe.get_doc("BOM", bom_name)

    return bom_cache[bom_name]


def get_cutting_items_from_bom(
    bom_name,
    result,
    path,
    source_item_code=None,
    qty=1,
    bom_cache=None,
):
    """
    Walk `bom_name` down through each component's default BOM and collect
    the Cutting items into `result`, adding up the qty needed to make `qty`
    of the BOM's item.

    `path` holds the BOMs on the way down to this one, so only a real
    circular BOM is cut short: the same sub-BOM reached from two plan items
    (or twice in one tree) is walked each time, so both its "Used By" and
    its qty are counted.
    """

    if not bom_name or bom_name in path:
        return

    bom_cache = {} if bom_cache is None else bom_cache
    bom = _get_bom(bom_name, bom_cache)

    if bom.docstatus != 1:
        frappe.throw(
            _("BOM {0} must be submitted.").format(bom_name)
        )

    per_unit = flt(qty) / (flt(bom.quantity) or 1)

    path.add(bom_name)

    try:
        for row in bom.items:

            if not row.item_code:
                continue

            row_qty = flt(row.stock_qty or row.qty) * per_unit

            # Cutting Item

            if row.operation == "Cutting":

                item_code = row.item_code

                if item_code not in result:

                    result[item_code] = {
                        "item_code": item_code,
                        "item_name": row.item_name or frappe.db.get_value(
                            "Item",
                            item_code,
                            "item_name",
                        ),
                        "qty": 0,
                        "source_items": [],
                        "source_boms": [],
                        "current_bom": get_default_bom(item_code),
                    }

                result[item_code]["qty"] += row_qty

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

            child_bom = row.bom_no or get_default_bom(row.item_code)

            if child_bom:

                get_cutting_items_from_bom(
                    bom_name=child_bom,
                    result=result,
                    path=path,
                    source_item_code=source_item_code,
                    qty=row_qty,
                    bom_cache=bom_cache,
                )
    finally:
        path.discard(bom_name)


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
    pp.check_permission("read")

    result = {}
    bom_cache = {}

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
            path=set(),
            source_item_code=pp_item.item_code,
            qty=flt(pp_item.planned_qty) or 1,
            bom_cache=bom_cache,
        )

    return list(result.values())


@frappe.whitelist()
def get_cutting_stock_entry_items(production_plan, cutting_items):
    """
    Values for a new (unsaved) Manufacture Stock Entry for one cutting item.
    A Manufacture entry has a single finished item, so the dialog sends one
    item per call; the client opens the result as a new form to review.
    """

    cutting_items = frappe.parse_json(cutting_items or "[]")

    if isinstance(cutting_items, dict):
        cutting_items = [cutting_items]

    if not cutting_items:
        frappe.throw(_("No cutting items selected."))

    if len(cutting_items) != 1:
        frappe.throw(
            _(
                "Please process one cutting item at a time."
            )
        )

    frappe.has_permission("Production Plan", "read", production_plan, throw=True)
    frappe.has_permission("Stock Entry", "create", throw=True)

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

    if qty <= 0:
        frappe.throw(
            _("Qty for item {0} must be greater than zero.").format(
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
    """
    The Cutting Job Cards (not cancelled) of this Production Plan's Work
    Orders, each with the cut item found in its parent BOM and that cut
    item's BOM components.
    """

    if not production_plan:
        frappe.throw(_("Production Plan is required."))

    frappe.has_permission("Production Plan", "read", production_plan, throw=True)

    # Only this plan's Job Cards, in one query (the plan is on the Work Order)
    job_cards = frappe.db.sql(
        """
        SELECT
            jc.name,
            jc.work_order,
            jc.production_item,
            jc.item_name,
            jc.for_quantity,
            jc.bom_no,
            wo.production_item AS wo_production_item,
            wo.bom_no AS wo_bom_no
        FROM `tabJob Card` jc
        INNER JOIN `tabWork Order` wo
            ON wo.name = jc.work_order
        WHERE wo.production_plan = %s
            AND jc.operation = 'Cutting'
            AND jc.docstatus < 2
        ORDER BY jc.creation ASC
        """,
        (production_plan,),
        as_dict=True,
    )

    if not job_cards:
        return []

    bom_cache = {}
    item_cache = {}

    def get_item_value(item_code, fieldname):
        if item_code not in item_cache:
            item_cache[item_code] = frappe.db.get_value(
                "Item",
                item_code,
                ["item_name", "default_bom"],
                as_dict=True,
            ) or frappe._dict()

        return item_cache[item_code].get(fieldname)

    rm_items = []

    for job_card in job_cards:

        source_item = (
            job_card.production_item
            or job_card.wo_production_item
        )

        if not source_item:
            continue

        # Parent BOM
        parent_bom_no = (
            job_card.bom_no
            or job_card.wo_bom_no
            or get_item_value(source_item, "default_bom")
        )

        if not parent_bom_no:
            continue

        parent_bom = _get_bom(parent_bom_no, bom_cache)

        # Find Cutting / Semi Finished Item

        for bom_item in parent_bom.items:

            if not bom_item.item_code:
                continue

            cut_bom_no = (
                bom_item.bom_no
                or get_item_value(bom_item.item_code, "default_bom")
            )

            if not cut_bom_no:
                continue

            # Get Cut Item BOM

            cut_bom = _get_bom(cut_bom_no, bom_cache)

            components = [
                {
                    "item_code": cut_item.item_code,
                    "item_name": cut_item.item_name,
                    "qty": flt(cut_item.qty),
                    "uom": cut_item.uom,
                    "stock_uom": cut_item.stock_uom,
                }
                for cut_item in cut_bom.items
                if cut_item.item_code
            ]

            if not components:
                continue

            rm_items.append({
                "job_card": job_card.name,
                "work_order": job_card.work_order,
                "source_item": source_item,
                "source_item_name": (
                    job_card.item_name
                    or get_item_value(source_item, "item_name")
                ),
                "cut_item_code": bom_item.item_code,
                "cut_item_name": bom_item.item_name,
                "bom_no": cut_bom_no,
                "job_qty": flt(
                    job_card.for_quantity
                ),
                "components": components,
            })

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



