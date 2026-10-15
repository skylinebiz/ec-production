// Copyright (c) 2026, SkylineBiz Private Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("EC Process Lot", {

    setup(frm) {
        const amount_df = frappe.meta.get_docfield("EC Process Lot Item", "amount");

        if (amount_df) {
            amount_df.formatter = amount_formatter;
        }

        frm.set_query("ec_lot", "lot_items", function () {
            return {
                filters: {
                    closed: 0
                }
            };
        });

        frm.set_query("item", "lot_items", function (doc, cdt, cdn) {

            const row = locals[cdt][cdn];

            return {
                filters: {
                    name: ["in", row.allowed_items || [""]]
                }
            };
        });

        frm.set_query("operation", "lot_items", function (doc, cdt, cdn) {

            const row = locals[cdt][cdn];

            return {
                filters: {
                    name: ["in", row.allowed_operations || [""]]
                }
            };
        });
    },

    refresh(frm) {
        lock_rates(frm);
        update_totals(frm);
    },

    validate(frm) {
        // Lot-capacity availability is only checked on submit (a
        // single grouped error covering every offending row) — not
        // while editing/saving a draft.
        update_totals(frm);
    }
});


// Only Manufacturing Managers may change rates; for everyone else the
// rate is whatever the EC Lot carries (enforced again on the server).
function lock_rates(frm) {

    if (frappe.user.has_role("Manufacturing Manager")) {
        return;
    }

    frm.fields_dict.lot_items.grid.update_docfield_property(
        "rate",
        "read_only",
        1
    );
}


// Pay By Time: Rate x Time (hrs); otherwise (Qty, the default) Rate x Qty
function get_amount(row) {

    const basis = row.pay_by === "Time" ? flt(row.time) : flt(row.qty);

    return basis * flt(row.rate);
}


function calculate_amount(cdt, cdn) {

    frappe.model.set_value(
        cdt,
        cdn,
        "amount",
        get_amount(locals[cdt][cdn])
    );
}


// Amount cell in the grid: a clock icon marks rows that are paid by Time
function amount_formatter(value, df, options, doc) {

    const amount = frappe.form.get_formatter("Currency")(
        value,
        df,
        { ...options, inline: 1 },
        doc
    );

    if (!doc || doc.pay_by !== "Time") {
        return `<div style="text-align: right">${amount}</div>`;
    }

    return `<div style="text-align: right">
        <span title="${__("Paid by Time")}">${frappe.utils.icon("clock", "sm")}</span>
        ${amount}
    </div>`;
}


function update_totals(frm) {

    let total_qty = 0;
    let total_amount = 0;

    (frm.doc.lot_items || []).forEach(row => {

        total_qty += flt(row.qty);
        total_amount += flt(row.amount);

    });

    frm.set_value("total_qty", total_qty);
    frm.set_value("total_amount", total_amount);
}


function populate_row(cdt, cdn, data) {

    frappe.model.set_value(cdt, cdn, "operation", data.operation);
    // frappe.model.set_value(cdt, cdn, "qty", data.qty);
    frappe.model.set_value(cdt, cdn, "rate", data.rate);

    calculate_amount(cdt, cdn);
}


frappe.ui.form.on("EC Process Lot Item", {

    ec_lot(frm, cdt, cdn) {

        const row = locals[cdt][cdn];

        if (!row.ec_lot) {
            return;
        }

        frappe.db.get_doc("EC Lot", row.ec_lot).then(doc => {

            row.lot_data = doc.ec_lot_item || [];

            row.allowed_items = [
                ...new Set(
                    row.lot_data.map(d => d.item)
                )
            ];

            row.allowed_operations = [];

            frm.refresh_field("lot_items");
        });
    },

    item(frm, cdt, cdn) {

        const row = locals[cdt][cdn];

        if (!row.lot_data || !row.item) {
            return;
        }

        const matches = row.lot_data.filter(
            d => d.item === row.item
        );

        row.allowed_operations = [
            ...new Set(
                matches.map(d => d.operation)
            )
        ];

        frappe.model.set_value(cdt, cdn, "operation", "");
        frappe.model.set_value(cdt, cdn, "qty", "");
        frappe.model.set_value(cdt, cdn, "rate", "");
        frappe.model.set_value(cdt, cdn, "amount", "");

        if (matches.length === 1) {
            populate_row(cdt, cdn, matches[0]);
        }

        frm.refresh_field("lot_items");
    },

    operation(frm, cdt, cdn) {

        const row = locals[cdt][cdn];

        if (!row.lot_data || !row.item || !row.operation) {
            return;
        }

        const match = row.lot_data.find(
            d =>
                d.item === row.item &&
                d.operation === row.operation
        );

        if (match) {
            populate_row(cdt, cdn, match);
        }

        update_totals(frm);
    },

    qty(frm, cdt, cdn) {
        calculate_amount(cdt, cdn);
        update_totals(frm);
    },

    rate(frm, cdt, cdn) {
        calculate_amount(cdt, cdn);
        update_totals(frm);
    },

    time(frm, cdt, cdn) {
        calculate_amount(cdt, cdn);
        update_totals(frm);
    },

    pay_by(frm, cdt, cdn) {
        calculate_amount(cdt, cdn);
        update_totals(frm);
    }
});

frappe.ui.form.on("EC Process Lot Item", {

    // Duplicating rows updates total
    lot_items_add(frm) {
        update_totals(frm);
    },

    // Removing rows updates total
    lot_items_remove(frm) {
        update_totals(frm);
    }

});