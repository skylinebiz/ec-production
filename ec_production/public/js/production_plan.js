frappe.ui.form.on("Production Plan", {

    refresh(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(
                __("Process Cutting"),
                () => {
                    open_cutting_dialog(frm);
                }
            );
        }
    }
});


async function open_cutting_dialog(frm) {
    const r = await frappe.call({
        method: "ec_production.api.prod_plan.get_cutting_items",
        args: {
            production_plan: frm.doc.name
        },
        freeze: true,
        freeze_message: __("Finding Cutting Items...")
    });

    const cutting_items = r.message || [];

    if (!cutting_items.length) {

        frappe.msgprint({
            title: __("Process Cutting"),
            message: __("No items found at Cutting stage."),
            indicator: "orange"
        });

        return;
    }

    // Build Table HTML. A Manufacture Stock Entry has a single finished
    // item, so each cutting item is processed on its own, from its row.

    let html = `
        <div class="cutting-items-table">

            <table class="table table-bordered">

                <thead>
                    <tr>
                        <th style="width: 24%;">${__("Item")}</th>
                        <th style="width: 20%;">${__("Used By")}</th>
                        <th style="width: 14%;">${__("Qty")}</th>
                        <th style="width: 28%;">${__("BOM")}</th>
                        <th style="width: 14%;"></th>
                    </tr>
                </thead>

                <tbody>
    `;

    cutting_items.forEach((item, index) => {

        html += `
            <tr>

                <td class="align-middle">
                    <strong>
                        ${frappe.utils.escape_html(item.item_code || "")}
                    </strong>
                    <br>
                    <small class="text-muted">
                        ${frappe.utils.escape_html(item.item_name || "")}
                    </small>
                </td>

                <td class="align-middle">
                    ${frappe.utils.escape_html((item.source_items || []).join(", "))}
                </td>

                <td>
                    <div class="qty-field" data-index="${index}"></div>
                </td>

                <td>
                    <div class="bom-field" data-index="${index}"></div>
                </td>

                <td class="align-middle">
                    <button
                        class="btn btn-xs btn-primary process-cutting-item"
                        data-index="${index}"
                    >
                        ${__("Stock Entry")}
                    </button>
                </td>

            </tr>
        `;

    });

    html += `
                </tbody>

            </table>

        </div>
    `;

    // Dialog

    const dialog = new frappe.ui.Dialog({

        title: __("Process Cutting"),

        fields: [
            {
                fieldtype: "HTML",
                fieldname: "cutting_items_html",
                options: html
            }
        ],

        size: "extra-large"
    });

    dialog.show();

    const controls = [];

    // Create Qty / BOM fields

    cutting_items.forEach((item, index) => {

        const qty_wrapper = dialog.$wrapper.find(`.qty-field[data-index="${index}"]`);
        const bom_wrapper = dialog.$wrapper.find(`.bom-field[data-index="${index}"]`);

        if (!qty_wrapper.length || !bom_wrapper.length) {
            return;
        }

        const qty = frappe.ui.form.make_control({
            parent: qty_wrapper[0],
            df: {
                fieldtype: "Float",
                fieldname: `qty_${index}`
            },
            render_input: true
        });

        // Default: what the plan needs of this cutting item
        qty.set_value(flt(item.qty, 3));

        const bom = frappe.ui.form.make_control({
            parent: bom_wrapper[0],
            df: {
                fieldtype: "Link",
                fieldname: `bom_${index}`,
                options: "BOM",

                get_query: function () {
                    return {
                        filters: {
                            item: item.item_code,
                            docstatus: 1,
                            is_active: 1
                        }
                    };
                }
            },
            render_input: true
        });

        // Default BOM
        if (item.current_bom) {
            bom.set_value(item.current_bom);
        }

        controls[index] = { qty, bom };
    });

    dialog.$wrapper.on("click", ".process-cutting-item", async function () {

        const index = cint($(this).attr("data-index"));
        const item = cutting_items[index];
        const control = controls[index];

        if (!item || !control) {
            return;
        }

        const bom_no = (control.bom.get_value() || "").trim();
        const qty = flt(control.qty.get_value());

        if (!bom_no) {
            frappe.msgprint({
                title: __("BOM Required"),
                message: __("Select a BOM for {0} before processing.", [item.item_code]),
                indicator: "red"
            });
            return;
        }

        if (qty <= 0) {
            frappe.msgprint({
                title: __("Qty Required"),
                message: __("Enter a Qty greater than zero for {0}.", [item.item_code]),
                indicator: "red"
            });
            return;
        }

        const r = await frappe.call({
            method: "ec_production.api.prod_plan.get_cutting_stock_entry_items",
            args: {
                production_plan: frm.doc.name,
                cutting_items: JSON.stringify([{
                    item_code: item.item_code,
                    qty: qty,
                    bom_no: bom_no
                }])
            },
            freeze: true,
            freeze_message: __("Preparing Stock Entry...")
        });

        if (!r.message) {
            return;
        }

        dialog.hide();

        open_new_stock_entry(r.message);
    });
}


// The server returns the values of an unsaved Stock Entry; it has no
// name, so build a proper new local document from them and open it.
function open_new_stock_entry(values) {

    const SKIP = [
        "name", "doctype", "docstatus", "idx", "owner", "creation",
        "modified", "modified_by", "parent", "parentfield", "parenttype",
        "__islocal", "__unsaved"
    ];

    const copy = (target, source) => {
        Object.keys(source).forEach(key => {
            if (!SKIP.includes(key) && !Array.isArray(source[key])) {
                target[key] = source[key];
            }
        });
    };

    frappe.model.with_doctype("Stock Entry", () => {

        const stock_entry = frappe.model.get_new_doc("Stock Entry");

        copy(stock_entry, values);

        (values.items || []).forEach(item => {
            const row = frappe.model.add_child(stock_entry, "items");
            copy(row, item);
        });

        frappe.set_route("Form", "Stock Entry", stock_entry.name);
    });
}


// frappe.ui.form.on("Production Plan", {

// 	before_save: async function (frm) {

// 		for (const row of (frm.doc.po_items || [])) {

// 			if (!row.item_code) {
// 				continue;
// 			}

// 			const r = await frappe.call({
// 				method: "ec_production.api.production_plan.ensure_cut_item_and_boms",
// 				args: {
// 					item_code: row.item_code
// 				},
// 				freeze: true,
// 				freeze_message: __(
// 					"Checking BOM for {0}...",
// 					[row.item_code]
// 				)
// 			});

// 			if (!r.message) {
// 				continue;
// 			}

// 			// Set the valid BOM on Production Plan Item
// 			if (r.message.item_bom) {

// 				await frappe.model.set_value(
// 					row.doctype,
// 					row.name,
// 					"bom_no",
// 					r.message.item_bom
// 				);

// 			}
// 		}

// 		frm.refresh_field("po_items");
// 	}

// });



// frappe.ui.form.on("Production Plan Item", {

//     item_code(frm, cdt, cdn) {

//         const row = locals[cdt][cdn];

//         if (!row.item_code) {
//             return;
//         }

//         frappe.call({
//             method: "ec_production.api.production_plan.ensure_cut_item_and_boms",
//             args: {
//                 item_code: row.item_code,
//                 routing: "Garment Processing"
//             },
//             freeze: true,
//             freeze_message: __("Preparing Item and BOM...")
//         }).then(r => {

//             if (!r.message) {
//                 return;
//             }

//             // Set BOM against Production Plan Item
//             frappe.model.set_value(
//                 cdt,
//                 cdn,
//                 "bom_no",
//                 r.message.item_bom
//             );

//             frappe.model.set_value(
//                 cdt,
//                 cdn,
//                 "planned_qty",
//                 row.planned_qty || 1
//             );

//             frm.refresh_field("po_items");

//         });

//     }

// });
