// Copyright (c) 2026, SkylineBiz Private Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("EC Lot Item", {
    item: fetch_rate,
    operation: fetch_rate,
    date: fetch_rate,

    qty(frm) {
        update_total_qty(frm);
    }
});

frappe.ui.form.on("EC Lot Item", {
    ec_lot_item_remove(frm) {

        setTimeout(() => {
            update_total_qty(frm);
        }, 100);

    }
});

frappe.ui.form.on("EC Lot", {

    refresh(frm) {
        update_total_qty(frm);

        const grid = frm.fields_dict.ec_lot_item.grid;

        // add_custom_button prepends; move it after Delete / Duplicate row
        grid.add_custom_button(
            __("Advanced Search"),
            () => open_advanced_search(frm)
        ).appendTo(grid.grid_buttons);
    },

    validate(frm) {
        update_total_qty(frm);
    }

});

function open_advanced_search(frm) {

    frappe.call({
        method: "ec_production.ec_production.doctype.ec_lot.ec_lot.get_item_attributes",
        freeze: true,
        callback: ({ message }) => show_advanced_search(frm, message || [])
    });
}

function show_advanced_search(frm, attributes) {

    let results = [];
    let operations = [];

    // One filter per Item Attribute: a type-to-search, scrollable list of
    // its values (a plain input for numeric attributes, which have none),
    // four to a row.
    const attribute_fields = [];

    attributes.forEach((attr, i) => {

        attribute_fields.push(
            i % 4 === 0
                ? { fieldtype: "Section Break" }
                : { fieldtype: "Column Break" }
        );

        attribute_fields.push({
            fieldname: `attribute_${i}`,
            label: __(attr.attribute),
            fieldtype: attr.numeric ? "Data" : "Autocomplete",
            options: attr.numeric ? "" : attr.values,
            max_items: Math.max(99, attr.values.length)
        });
    });

    const d = new frappe.ui.Dialog({
        title: __("Advanced Search (Item Variant)"),
        size: "extra-large",
        fields: [
            {
                fieldname: "operations",
                label: __("Operations"),
                fieldtype: "MultiSelectList",
                options: "Operation",
                reqd: 1,
                get_data: txt => frappe.db.get_link_options("Operation", txt, {}, 100)
            },
            {
                fieldname: "date",
                label: __("Date"),
                fieldtype: "Date",
                reqd: 1,
                default: frm.doc.date || frappe.datetime.get_today(),
                description: __("Rates are picked as on this date")
            },
            { fieldtype: "Column Break" },
            {
                fieldname: "item_group",
                label: __("Item Group"),
                fieldtype: "Link",
                options: "Item Group"
            },
            {
                fieldname: "style",
                label: __("Style No / Item"),
                fieldtype: "Link",
                options: "Item",
                description: __("Item with variants"),
                get_query: () => ({
                    filters: { has_variants: 1, disabled: 0 }
                })
            },
            ...attribute_fields,
            { fieldtype: "Section Break" },
            {
                fieldname: "search",
                label: __("Search"),
                fieldtype: "Button",
                click: () => search()
            },
            {
                fieldname: "results",
                fieldtype: "HTML"
            }
        ],
        primary_action_label: __("Add to Lot"),
        primary_action() {
            add_to_lot();
        }
    });

    function search() {

        const values = d.get_values();

        if (!values) {
            return;
        }

        if (!(values.operations || []).length) {
            frappe.msgprint(__("Please select at least one Operation"));
            return;
        }

        operations = values.operations;

        frappe.call({
            method: "ec_production.ec_production.doctype.ec_lot.ec_lot.search_lot_items",
            args: {
                operations,
                date: values.date,
                item_group: values.item_group,
                style: values.style,
                attributes: Object.fromEntries(
                    attributes.map((attr, i) => [attr.attribute, values[`attribute_${i}`]])
                )
            },
            freeze: true,
            callback: ({ message }) => {
                results = message.items;
                render_results(message.has_more);
            }
        });
    }

    function render_results(has_more) {

        const esc = frappe.utils.escape_html;
        const $results = d.fields_dict.results.$wrapper;

        if (!results.length) {
            $results.html(
                `<p class="text-muted">${__("No items found")}</p>`
            );
            return;
        }

        const rate_headers = operations
            .map(op => `<th class="text-right">${esc(op)} ${__("Rate")}</th>`)
            .join("");

        const attribute_headers = attributes
            .map(attr => `<th>${esc(__(attr.attribute))}</th>`)
            .join("");

        const rows = results.map((item, i) => {

            const rate_cells = operations.map(op => {
                const rate = flt(item.rates[op]);
                return `<td class="text-right ${rate ? "" : "text-muted"}">${rate ? format_currency(rate) : "-"
                    }</td>`;
            }).join("");

            const attribute_cells = attributes
                .map(attr => `<td>${esc(item.attributes[attr.attribute] || "")}</td>`)
                .join("");

            return `
                <tr data-idx="${i}">
                    <td>${esc(item.item)}</td>
                    <td>${esc(item.item_name || "")}</td>
                    <td>${esc(item.item_group || "")}</td>
                    ${attribute_cells}
                    ${rate_cells}
                    <td style="width:110px">
                        <input type="number" min="0" step="any"
                            class="form-control input-xs qty-input">
                    </td>
                </tr>`;
        }).join("");

        $results.html(`
            ${has_more ? `<p class="text-muted">${__("Showing the first {0} items. Narrow the search to see more.", [results.length])
                }</p>` : ""}
            <div style="max-height:45vh; overflow:auto;">
                <table class="table table-bordered table-sm">
                    <thead>
                        <tr>
                            <th>${__("Item")}</th>
                            <th>${__("Item Name")}</th>
                            <th>${__("Item Group")}</th>
                            ${attribute_headers}
                            ${rate_headers}
                            <th>${__("Qty")}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `);
    }

    function add_to_lot() {

        const date = d.get_value("date");
        const picked = [];

        d.fields_dict.results.$wrapper.find("tbody tr").each(function () {

            const qty = flt($(this).find(".qty-input").val());

            if (qty > 0) {
                picked.push({ item: results[$(this).data("idx")], qty });
            }
        });

        if (!picked.length) {
            frappe.msgprint(__("Please enter Qty against at least one item"));
            return;
        }

        let added = 0;
        let updated = 0;

        // One row per item x operation. add_child (rather than
        // set_value) so the row-level fetch_rate handlers don't fire
        // once per field for what the search already resolved.
        picked.forEach(({ item, qty }) => {
            operations.forEach(operation => {

                const existing = (frm.doc.ec_lot_item || []).find(
                    row => row.item === item.item && row.operation === operation
                );

                if (existing) {
                    existing.qty = flt(existing.qty) + qty;
                    updated++;
                    return;
                }

                frm.add_child("ec_lot_item", {
                    item: item.item,
                    operation,
                    qty,
                    date,
                    rate: flt(item.rates[operation])
                });
                added++;
            });
        });

        frm.refresh_field("ec_lot_item");
        frm.dirty();
        update_total_qty(frm);

        d.hide();

        frappe.show_alert({
            message: __("{0} row(s) added, {1} row(s) updated", [added, updated]),
            indicator: "green"
        });
    }

    d.show();
}

function update_total_qty(frm) {

    let total_qty = 0;

    (frm.doc.ec_lot_item || []).forEach(row => {
        total_qty += flt(row.qty);
    });

    frm.set_value("total_qty", total_qty);
}

function fetch_rate(frm, cdt, cdn) {

    const row = locals[cdt][cdn];

    if (!(row.item && row.operation && row.date)) {
        return;
    }

    frappe.call({
        method: "ec_production.ec_production.doctype.ec_lot.ec_lot.get_rate",
        args: {
            item: row.item,
            operation: row.operation,
            date: row.date
        },
        callback: ({ message }) => {
            frappe.model.set_value(
                cdt,
                cdn,
                "rate",
                flt(message)
            );
        }
    });
}