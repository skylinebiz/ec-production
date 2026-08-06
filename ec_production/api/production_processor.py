import frappe
from frappe import _
from frappe.utils import now_datetime, flt

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
    if not production_plan:
        frappe.throw(_("Production Plan is required"))

    conditions = ["wo.production_plan = %(production_plan)s"]
    values = {"production_plan": production_plan}

    if operation:
        conditions.append("jc.operation = %(operation)s")
        values["operation"] = operation

    job_cards = frappe.db.sql(
        f"""
        SELECT
            jc.name AS job_card,
            jc.work_order,
            wo.production_item AS item_name,
            jc.operation,
            jc.status,
            jc.for_quantity,
            jc.total_completed_qty,
            jc.pending_qty,

            EXISTS (
                SELECT 1
                FROM `tabJob Card Time Log` jctl
                WHERE jctl.parent = jc.name
                  AND jctl.to_time IS NULL
            ) AS is_timer_running,

            (
                SELECT jctl.employee
                FROM `tabJob Card Time Log` jctl
                WHERE jctl.parent = jc.name
                ORDER BY jctl.idx DESC
                LIMIT 1
            ) AS employee,

            (
                SELECT emp.employee_name
                FROM `tabJob Card Time Log` jctl
                INNER JOIN `tabEmployee` emp
                    ON emp.name = jctl.employee
                WHERE jctl.parent = jc.name
                ORDER BY jctl.idx DESC
                LIMIT 1
            ) AS employee_name

        FROM `tabJob Card` jc
        INNER JOIN `tabWork Order` wo
            ON wo.name = jc.work_order

        WHERE {" AND ".join(conditions)}

        ORDER BY wo.name, jc.idx
        """,
        values,
        as_dict=True,
    )

    return job_cards


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


@frappe.whitelist()
def start_job_timer(job_card, employee):
    jc = frappe.get_doc("Job Card", job_card)

    if jc.docstatus == 2:
        frappe.throw(_("Job Card is Cancelled."))

    if jc.status == "Completed":
        frappe.throw(_("Job Card is already Completed."))

    jc.start_timer(
        start_time=now_datetime(),
        employees=[
            {
                "employee": employee
            }
        ]
    )

    return {
        "message": _("Timer Started"),
        "job_card": jc.name,
    }


@frappe.whitelist()
def stop_job_timer(
    job_card,
    qty,
    process_loss_qty=0,
    pending_qty=None,
    sub_operation=None,
):
    qty = flt(qty)
    process_loss_qty = flt(process_loss_qty)

    jc = frappe.get_doc("Job Card", job_card)

    if jc.docstatus == 2:
        frappe.throw(_("Job Card is Cancelled."))

    if qty >= flt(jc.for_quantity):
        return stop_time_and_submit(
            jc,
            qty,
            process_loss_qty,
            pending_qty,
            sub_operation,
        )

    return stop_and_create_duplicate(
        jc,
        qty,
        process_loss_qty,
        sub_operation,
    )

def stop_time_and_submit(
    jc,
    qty,
    process_loss_qty=0,
    pending_qty=None,
    sub_operation=None,
):
    if pending_qty is None:
        pending_qty = max(0, flt(jc.pending_qty) - qty)

    jc.complete_job_card(
        qty=qty,
        for_quantity=qty + process_loss_qty + pending_qty,
        pending_qty=pending_qty,
        process_loss_qty=process_loss_qty,
        end_time=now_datetime(),
        sub_operation=sub_operation,
        auto_submit=True,
    )

    jc.reload()

    return {
        "completed_job_card": jc.name,
    }


def stop_and_create_duplicate(
    jc,
    qty,
    process_loss_qty=0,
    sub_operation=None,
):
    original_qty = flt(jc.for_quantity)
    remaining_qty = original_qty - flt(qty)

    jc = complete_partial_job_card(
        jc,
        qty,
        process_loss_qty,
        sub_operation,
    )

    new_jc = create_remaining_job_card(jc, remaining_qty)

    return {
        "completed_job_card": jc.name,
        "new_job_card": new_jc.name,
    }


def complete_partial_job_card(
    jc,
    qty,
    process_loss_qty=0,
    sub_operation=None,
):
    qty = flt(qty)
    original_qty = flt(jc.for_quantity)

    # Reduce Job Card quantity
    jc.for_quantity = qty
    jc.pending_qty = 0

    if original_qty:
        jc.time_required = (flt(jc.time_required) / original_qty) * qty

    jc.save(ignore_permissions=True)

    # Complete Job Card
    jc.complete_job_card(
        qty=qty,
        for_quantity=qty,
        pending_qty=0,
        process_loss_qty=process_loss_qty,
        end_time=now_datetime(),
        sub_operation=sub_operation,
        auto_submit=True,
    )

    jc.reload()

    return jc

def create_remaining_job_card(jc, remaining_qty):
    qty = flt(jc.for_quantity)

    new_jc = frappe.copy_doc(jc)

    new_jc.name = None
    new_jc.amended_from = None
    new_jc.docstatus = 0
    new_jc.status = "Open"

    # Remaining quantity
    new_jc.for_quantity = remaining_qty
    new_jc.pending_qty = remaining_qty

    # Reset production values
    new_jc.total_completed_qty = 0
    new_jc.process_loss_qty = 0
    new_jc.manufactured_qty = 0
    new_jc.transferred_qty = 0

    # Reset dates
    new_jc.actual_start_date = None
    new_jc.actual_end_date = None

    # Scale estimated time
    if qty:
        new_jc.time_required = (flt(jc.time_required) / qty) * remaining_qty

    new_jc.total_time_in_mins = 0

    # Remove production history
    new_jc.time_logs = []
    new_jc.scheduled_time_logs = []

    new_jc.insert(ignore_permissions=True)

    return new_jc

