import frappe
from frappe import _
from frappe.utils import now_datetime, flt
from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry

@frappe.whitelist()
def load_data(production_plan, operation=None):
    """
    Load dashboard and job cards for Production Processor.
    """

    if not production_plan:
        frappe.throw(_("Production Plan is required"))

    # Get Job Cards
    filters = {
        "production_plan": production_plan,
        "docstatus": 1
    }

    if operation:
        filters["operation"] = operation

    job_cards = frappe.get_all(
        "Job Card",
        filters=filters,
        fields=[
            "*",
        ],
        order_by="work_order asc"
    )

    # Dashboard summary
    dashboard = {}

    for row in job_cards:
        item = row.production_item

        if item not in dashboard:
            dashboard[item] = {
                "item_name": item,
                "qty": 0,
                "completed": 0,
                "pending": 0,
            }

        dashboard[item]["qty"] += row.for_quantity or 0

        if row.status == "Completed":
            dashboard[item]["completed"] += row.for_quantity or 0
        else:
            dashboard[item]["pending"] += row.for_quantity or 0

    return {
        "dashboard": list(dashboard.values()),
        "job_cards": job_cards
    }

@frappe.whitelist()
def load_production_plan(production_plan):
    if not production_plan:
        frappe.throw(_("Production Plan is required"))

    work_orders = frappe.get_all(
        "Work Order",
        filters={
            "production_plan": production_plan,
            "docstatus": 1,
        },
        fields=[
            "*"
        ],
        order_by="creation asc",
    )

    return work_orders


@frappe.whitelist()
def load_job_cards(production_plan, operation=None):
    """
    Job Cards (not cancelled) of the Production Plan's Work Orders, in the
    order of each Work Order's operations, with what the page needs to
    show their timer and remaining qty.
    """

    if not production_plan:
        frappe.throw(_("Production Plan is required"))

    frappe.has_permission("Production Plan", "read", production_plan, throw=True)
    frappe.has_permission("Job Card", "read", throw=True)

    conditions = [
        "wo.production_plan = %(production_plan)s",
        "jc.docstatus < 2",
    ]
    values = {"production_plan": production_plan}

    if operation:
        conditions.append("jc.operation = %(operation)s")
        values["operation"] = operation

    job_cards = frappe.db.sql(
        f"""
        SELECT
            jc.name AS job_card,
            jc.work_order,
            wo.production_item AS item_code,
            wo.item_name,
            wo.qty AS wo_qty,
            wo.produced_qty AS wo_produced_qty,
            wo.status AS wo_status,
            jc.operation,
            jc.workstation,
            jc.status,
            jc.docstatus,
            jc.is_paused,
            jc.for_quantity,
            jc.total_completed_qty,
            jc.process_loss_qty,
            jc.pending_qty,
            COALESCE(woo.idx, 0) AS operation_seq,

            (
                SELECT MIN(jctl.from_time)
                FROM `tabJob Card Time Log` jctl
                WHERE jctl.parent = jc.name
                  AND jctl.parenttype = 'Job Card'
                  AND jctl.from_time IS NOT NULL
                  AND jctl.to_time IS NULL
            ) AS timer_started_at,

            (
                SELECT jctl.employee
                FROM `tabJob Card Time Log` jctl
                WHERE jctl.parent = jc.name
                  AND jctl.parenttype = 'Job Card'
                ORDER BY jctl.idx DESC
                LIMIT 1
            ) AS employee

        FROM `tabJob Card` jc
        INNER JOIN `tabWork Order` wo
            ON wo.name = jc.work_order
        LEFT JOIN `tabWork Order Operation` woo
            ON woo.name = jc.operation_id

        WHERE {" AND ".join(conditions)}

        ORDER BY
            wo.creation ASC,
            wo.name ASC,
            COALESCE(woo.idx, 9999) ASC,
            jc.creation ASC
        """,
        values,
        as_dict=True,
    )

    employee_names = {}
    employees = list({row.employee for row in job_cards if row.employee})
    if employees:
        employee_names = dict(
            frappe.get_all(
                "Employee",
                filters={"name": ["in", employees]},
                fields=["name", "employee_name"],
                as_list=True,
            )
        )

    for row in job_cards:
        row.is_timer_running = 1 if row.timer_started_at else 0
        row.employee_name = employee_names.get(row.employee)
        row.remaining_qty = get_remaining_qty(row)

    return job_cards


def get_remaining_qty(jc):
    """Qty of this Job Card not yet completed (or lost)."""

    return max(
        flt(jc.for_quantity)
        - flt(jc.total_completed_qty)
        - flt(jc.process_loss_qty),
        0,
    )


@frappe.whitelist()
def process_job(job_card, employee, qty):
    qty = flt(qty)

    if qty <= 0:
        frappe.throw(_("Received Qty must be greater than zero."))

    jc = frappe.get_doc("Job Card", job_card)

    if jc.docstatus == 2:
        frappe.throw(_("Job Card is Cancelled."))

    if jc.status == "Completed":
        frappe.throw(_("Job Card is already Completed."))

    if qty > jc.pending_qty:
        frappe.throw(
            _("Received Qty cannot be greater than Pending Qty ({0}).").format(
                jc.pending_qty
            )
        )

    # ------------------------------------------------------------------
    # Create Time Log
    # ------------------------------------------------------------------

    jc.append(
        "time_logs",
        {
            "employee": employee,
            "from_time": now_datetime(),
            "to_time": now_datetime(),
            "completed_qty": qty,
        },
    )

    # ------------------------------------------------------------------
    # Update Quantities
    # ------------------------------------------------------------------

    jc.total_completed_qty = flt(jc.total_completed_qty) + qty
    jc.pending_qty = flt(jc.for_quantity) - jc.total_completed_qty

    if jc.pending_qty <= 0:
        jc.pending_qty = 0
        jc.status = "Completed"
    else:
        jc.status = "Open"

    jc.flags.ignore_validate_update_after_submit = True
    jc.save()

    employee_name = frappe.db.get_value(
        "Employee",
        employee,
        "employee_name",
    )

    return {
        "job_card": jc.name,
        "work_order": jc.work_order,
        "item_name": frappe.db.get_value(
            "Work Order",
            jc.work_order,
            "production_item",
        ),
        "operation": jc.operation,
        "status": jc.status,
        "for_quantity": jc.for_quantity,
        "total_completed_qty": jc.total_completed_qty,
        "pending_qty": jc.pending_qty,
        "employee": employee,
        "employee_name": employee_name,
    }


@frappe.whitelist()
def process_job_timer(job_card, employee, qty):
    qty = flt(qty)

    jc = frappe.get_doc("Job Card", job_card)

    if jc.docstatus == 2:
        frappe.throw(_("Job Card is Cancelled"))

    # Start timer
    jc.start_timer(
        start_time=now_datetime(),
        employees=[
            {
                "employee": employee
            }
        ]
    )

    # Complete Job
    jc.complete_job_card(
        qty=qty,
        for_quantity=qty,
        pending_qty=max(0, jc.pending_qty - qty),
        process_loss_qty=0,
        end_time=now_datetime(),
        sub_operation=None,
    )

    jc.reload()

    return load_job_cards(
        production_plan=frappe.db.get_value(
            "Work Order",
            jc.work_order,
            "production_plan"
        )
    )


def get_running_logs(jc):
    return [
        log for log in jc.time_logs
        if log.from_time and not log.to_time
    ]


def validate_job_card_editable(jc):
    if jc.docstatus == 2:
        frappe.throw(_("Job Card {0} is Cancelled.").format(frappe.bold(jc.name)))

    if jc.docstatus == 1:
        frappe.throw(_("Job Card {0} is already Completed.").format(frappe.bold(jc.name)))


@frappe.whitelist()
def start_job_timer(job_card, employee):
    """Start (or, when On Hold, resume) the Job Card's timer for an Employee."""

    if not employee:
        frappe.throw(_("Please select an Employee."))

    jc = frappe.get_doc("Job Card", job_card, for_update=True)

    validate_job_card_editable(jc)

    if get_running_logs(jc):
        frappe.throw(
            _("Job Card {0} is already running. Reload the page to see its latest status.")
            .format(frappe.bold(jc.name)),
            title=_("Already Started"),
        )

    if not get_remaining_qty(jc):
        frappe.throw(
            _("Nothing is left to process on Job Card {0}.").format(frappe.bold(jc.name))
        )

    # A paused card is resumed with whoever is chosen now, not
    # necessarily the employees it was paused with
    if jc.is_paused:
        jc.is_paused = 0
        jc.db_set("is_paused", 0)

    jc.start_timer(
        start_time=now_datetime(),
        employees=[{"employee": employee}],
    )

    return {
        "message": _("Timer Started"),
        "job_card": jc.name,
    }


@frappe.whitelist()
def hold_job_timer(job_card):
    """Put a running Job Card On Hold: its timer stops, nothing is completed."""

    jc = frappe.get_doc("Job Card", job_card, for_update=True)

    validate_job_card_editable(jc)

    if not get_running_logs(jc):
        frappe.throw(
            _("Job Card {0} has no running timer. Reload the page to see its latest status.")
            .format(frappe.bold(jc.name)),
            title=_("Not Started"),
        )

    jc.pause_job(end_time=now_datetime())

    return {
        "message": _("Job Card On Hold"),
        "job_card": jc.name,
    }


def reopen_held_job_card(jc):
    """
    Stopping a Job Card that is On Hold: ERPNext only records completed qty
    on an open time log and won't submit a card On Hold, so take it off
    hold with a log for its last employee that the completion closes
    straight away (no time is added).
    """

    employee = next(
        (log.employee for log in reversed(jc.time_logs) if log.employee),
        None,
    )

    jc.is_paused = 0
    jc.db_set("is_paused", 0)

    jc.start_timer(
        start_time=now_datetime(),
        employees=[{"employee": employee}],
    )


@frappe.whitelist()
def stop_job_timer(
    job_card,
    qty,
    process_loss_qty=0,
    pending_qty=None,
    sub_operation=None,
):
    """
    Stop the running timer and record `qty` as completed:

    - `qty` covers everything left on the card: it is completed and submitted.
    - `qty` is less: the card is reduced to what was done and completed, and
      a new Job Card is created for the rest of the qty.

    When this completes the Work Order's last operation, its Manufacture
    Stock Entry is created. That is done in a savepoint, so a stock
    problem never stops the Job Card from being completed: the operator
    is told, and the entry can be made from the Work Order.
    """

    qty = flt(qty)
    process_loss_qty = flt(process_loss_qty)

    jc = frappe.get_doc("Job Card", job_card, for_update=True)

    validate_job_card_editable(jc)

    running = bool(get_running_logs(jc))

    if not running and not jc.is_paused:
        frappe.throw(
            _("Job Card {0} has no running timer. Reload the page to see its latest status.")
            .format(frappe.bold(jc.name)),
            title=_("Not Started"),
        )

    precision = jc.precision("total_completed_qty")
    remaining_qty = flt(get_remaining_qty(jc), precision)

    if qty <= 0:
        frappe.throw(_("Received Qty must be greater than zero."))

    if process_loss_qty < 0:
        frappe.throw(_("Process Loss Qty cannot be negative."))

    if flt(qty + process_loss_qty, precision) > remaining_qty:
        frappe.throw(
            _("Received Qty {0} cannot be more than the {1} left on Job Card {2}.").format(
                frappe.bold(flt(qty + process_loss_qty, precision)),
                frappe.bold(remaining_qty),
                frappe.bold(jc.name),
            ),
            title=_("Qty Exceeds Job Card"),
        )

    left_over = flt(remaining_qty - qty - process_loss_qty, precision)

    result = {"completed_job_card": jc.name}

    if not running:
        reopen_held_job_card(jc)

    if left_over > 0:
        new_jc = split_job_card(jc, left_over)
        result["new_job_card"] = new_jc.name

    complete_job_card(
        jc,
        qty=qty,
        pending_qty=0,
        process_loss_qty=process_loss_qty,
        sub_operation=sub_operation,
    )

    result.update(make_manufacture_entry_safely(jc))

    return result


def complete_job_card(
    jc,
    qty,
    pending_qty,
    process_loss_qty,
    sub_operation=None,
):
    jc.complete_job_card(
        qty=qty,
        for_quantity=qty + pending_qty + process_loss_qty,
        pending_qty=pending_qty,
        process_loss_qty=process_loss_qty,
        end_time=now_datetime(),
        sub_operation=sub_operation,
        auto_submit=True,
    )

    jc.reload()

    return jc


def split_job_card(jc, left_over):
    """
    Move `left_over` qty of a running card to a new draft Job Card. The
    running card keeps what has been processed so far plus this cycle's
    qty; material already transferred to it is shared out in the same
    ratio, so neither card asks for its material again.
    """

    original_qty = flt(jc.for_quantity)
    kept_qty = original_qty - left_over

    if original_qty <= 0 or kept_qty <= 0:
        frappe.throw(_("Cannot split Job Card {0}.").format(frappe.bold(jc.name)))

    kept_ratio = kept_qty / original_qty
    moved_ratio = left_over / original_qty

    new_jc = frappe.copy_doc(jc)
    reset_job_card(new_jc)

    new_jc.for_quantity = left_over
    new_jc.time_required = flt(jc.time_required) * moved_ratio
    new_jc.transferred_qty = flt(jc.transferred_qty) * moved_ratio

    for row in new_jc.items:
        row.required_qty = flt(row.required_qty) * moved_ratio
        row.transferred_qty = flt(row.transferred_qty) * moved_ratio
        row.consumed_qty = 0

    jc.for_quantity = kept_qty
    jc.pending_qty = 0
    jc.time_required = flt(jc.time_required) * kept_ratio
    jc.transferred_qty = flt(jc.transferred_qty) * kept_ratio

    for row in jc.items:
        row.required_qty = flt(row.required_qty) * kept_ratio
        row.transferred_qty = flt(row.transferred_qty) * kept_ratio

    jc.save(ignore_permissions=True)

    new_jc.insert(ignore_permissions=True)

    return new_jc


def reset_job_card(jc):
    jc.name = None
    jc.amended_from = None
    jc.docstatus = 0
    jc.status = "Open"
    jc.is_paused = 0

    jc.total_completed_qty = 0
    jc.process_loss_qty = 0
    jc.pending_qty = 0
    jc.manufactured_qty = 0
    jc.total_time_in_mins = 0

    jc.actual_start_date = None
    jc.actual_end_date = None

    jc.time_logs = []
    jc.scheduled_time_logs = []
    jc.employee = []

    for row in jc.get("sub_operations") or []:
        row.status = "Pending"
        row.completed_qty = 0
        row.process_loss_qty = 0
        row.completed_time = None


def make_manufacture_entry_safely(jc):
    """
    Run create_stock_entry_if_all_operations_complete in a savepoint. On
    failure only the Stock Entry is rolled back; the Job Card completion
    stays, and the reason is returned for the page to show.
    """

    savepoint = "ec_manufacture_entry"
    frappe.db.savepoint(savepoint)

    try:
        stock_entry = create_stock_entry_if_all_operations_complete(jc)
    except Exception as e:
        frappe.db.rollback(save_point=savepoint)
        frappe.clear_last_message()
        frappe.log_error(
            title=_("Production Processor: Manufacture entry failed for {0}").format(jc.work_order),
            reference_doctype="Work Order",
            reference_name=jc.work_order,
        )

        return {
            "stock_entry_error": _(
                "Job Card completed, but the Manufacture Stock Entry for Work Order {0} "
                "could not be created: {1}"
            ).format(frappe.bold(jc.work_order), frappe.utils.strip_html(str(e)))
        }

    frappe.db.release_savepoint(savepoint)

    return {"stock_entry": stock_entry.name} if stock_entry else {}


def create_stock_entry_if_last_operation(job_card):
    if not job_card.work_order:
        return

    work_order = frappe.get_doc("Work Order", job_card.work_order)

    # Get all operations from the Work Order
    operations = frappe.get_all(
        "Work Order Operation",
        filters={
            "parent": work_order.name,
            "parenttype": "Work Order",
        },
        fields=["name", "operation", "sequence_id"],
        order_by="sequence_id asc",
    )

    if not operations:
        return

    # Check every operation
    for operation in operations:

        # Find submitted Job Cards for this operation
        job_cards = frappe.get_all(
            "Job Card",
            filters={
                "work_order": work_order.name,
                "operation": operation.operation,
                "docstatus": 1,
            },
            fields=["name", "status"],
        )

        # No Job Card completed for this operation
        if not job_cards:
            return

        # At least one Job Card for this operation is not completed
        if any(jc.status != "Completed" for jc in job_cards):
            return

    # All Work Order operations are completed
    # Prevent duplicate Stock Entry
    if frappe.db.exists(
        "Stock Entry",
        {
            "work_order": work_order.name,
            "stock_entry_type": "Material Transfer for Manufacture",
            "docstatus": 1,
        },
    ):
        return

    # Create Stock Entry
    stock_entry = work_order.make_stock_entry(
        purpose="Material Transfer for Manufacture"
    )

    stock_entry.insert(ignore_permissions=True)
    stock_entry.submit()

    return stock_entry


def create_stock_entry_if_all_operations_complete(job_card):
    if not job_card.work_order:
        return

    # Locked, so two Job Cards finishing at the same time can't both
    # pass the duplicate check below
    work_order = frappe.get_doc("Work Order", job_card.work_order, for_update=True)

    if work_order.docstatus != 1:
        return

    if not work_order.operations:
        return

    # Make sure operation statuses are calculated using ERPNext logic
    work_order.update_operation_status()

    # Every operation must be completed
    if not all(
        operation.status == "Completed"
        for operation in work_order.operations
    ):
        return

    # Already fully produced
    if flt(work_order.produced_qty) >= flt(work_order.qty):
        return

    # Remaining quantity
    remaining_qty = flt(work_order.qty) - flt(work_order.produced_qty)

    if remaining_qty <= 0:
        return

    # Prevent duplicate Manufacture Stock Entry
    if frappe.db.exists(
        "Stock Entry",
        {
            "work_order": work_order.name,
            "purpose": "Manufacture",
            "docstatus": 1,
        },
    ):
        return

    stock_entry_data = make_stock_entry(
        work_order_id=work_order.name,
        purpose="Manufacture",
        qty=remaining_qty,
    )

    stock_entry = frappe.get_doc(stock_entry_data)

    stock_entry.insert(ignore_permissions=True)
    stock_entry.submit()

    return stock_entry