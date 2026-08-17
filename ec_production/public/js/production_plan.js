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

    // Build Table HTML

    let html = `
        <div class="cutting-items-table">

            <table class="table table-bordered">

                <thead>
                    <tr>

                        <th style="width: 25%;">
                            ${__("Item")}
                        </th>

                        <th style="width: 25%;">
                            ${__("Used By")}
                        </th>

                        <th style="width: 35%;">
                            ${__("BOM")}
                        </th>

                    </tr>
                </thead>

                <tbody>
    `;

    cutting_items.forEach((item, index) => {

        html += `
            <tr>

                <td class="align-middle">
                    <strong>
                        ${frappe.utils.escape_html(
                            item.item_code || ""
                        )}
                    </strong>
                    <br>
                    <small class="text-muted">
                        ${frappe.utils.escape_html(
                            item.item_name || ""
                        )}
                    </small>
                </td>

                <td class="align-middle">
                    ${frappe.utils.escape_html(
                        (item.source_items || []).join(", ")
                    )}
                </td>

                <td>

                    <div
                        class="bom-field"
                        data-index="${index}"
                    ></div>

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

        size: "large",

        primary_action_label: __("Process Stock Entry"),

        primary_action: async function () {
            const selected_items = [];

            for (let index = 0; index < cutting_items.length; index++) {
                const item = cutting_items[index];

                const bom_control =
                    dialog[`bom_control_${index}`];

                const bom_no =
                    bom_control?.get_value()?.trim();

                if (!bom_no) {
                    frappe.msgprint({
                        title: __("BOM Required"),
                        message: __(
                            "Select a BOM for {0} before processing.",
                            [item.item_code]
                        ),
                        indicator: "red"
                    });

                    return;
                }

                selected_items.push({
                    item_code: item.item_code,
                    qty: flt(item.qty) || 1,
                    bom_no: bom_no
                });
            }

            if (!selected_items.length) {
                return;
            }

            const r = await frappe.call({
                method:
                    "ec_production.api.prod_plan.get_cutting_stock_entry_items",

                args: {
                    production_plan: frm.doc.name,
                    cutting_items: JSON.stringify(selected_items)
                },

                freeze: true,
                freeze_message: __("Preparing Stock Entry...")
            });

            if (!r.message) {
                return;
            }

            dialog.hide();

            const stock_entry_data = r.message;

            stock_entry_data.__islocal = 1;
            stock_entry_data.docstatus = 0;

            frappe.model.sync(stock_entry_data);

            frappe.set_route(
                "Form",
                "Stock Entry",
                stock_entry_data.name
            );
        }

    });

    dialog.show();

    // Create BOM Link Fields

    cutting_items.forEach(
        (item, index) => {

            const wrapper =
                dialog.$wrapper.find(
                    `.bom-field[data-index="${index}"]`
                );


            if (!wrapper.length) {
                return;
            }

            const control =
                frappe.ui.form.make_control({

                    parent: wrapper[0],

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
                control.set_value(
                    item.current_bom
                );
            }
            // Store control on dialog
            dialog[
                `bom_control_${index}`
            ] = control;
        }
    );
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
