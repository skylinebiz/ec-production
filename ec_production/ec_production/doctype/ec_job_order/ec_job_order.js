// Copyright (c) 2026, SkylineBiz Private Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("EC Job Order", {

	setup(frm) {

		frm.set_query("lot", "job_order_details", function () {
			return {
				filters: {
					closed: 0
				}
			};
		});

		frm.set_query("item", "job_order_details", function (doc, cdt, cdn) {

			const row = locals[cdt][cdn];

			return {
				filters: {
					name: ["in", row.allowed_items || [""]]
				}
			};
		});

		frm.set_query("operation", "job_order_details", function (doc, cdt, cdn) {

			const row = locals[cdt][cdn];

			return {
				filters: {
					name: ["in", row.allowed_operations || [""]]
				}
			};
		});
	},

	refresh(frm) {

		update_total_qty(frm);

		if (frm.doc.docstatus === 1) {

			frm.add_custom_button(__("Process Receipt"), () => {

				frappe.confirm(
					__("Create and submit a Job Receipt for everything Pending on this Job Order?"),
					() => {
						frappe.call({
							method: "ec_production.ec_production.doctype.ec_job_order.ec_job_order.process_receipt",
							args: { job_order: frm.doc.name },
							freeze: true,
							freeze_message: __("Creating Job Receipt..."),
						}).then(r => {

							if (!r.message) {
								return;
							}

							frappe.show_alert({
								message: __("Job Receipt {0} created and submitted.", [r.message]),
								indicator: "green"
							});

							frm.reload_doc();
						});
					}
				);
			});
		}
	},

	job_order_details_add(frm) {
		update_total_qty(frm);
	},

	job_order_details_remove(frm) {
		update_total_qty(frm);
	}
});


function update_total_qty(frm) {

	const total_qty = (frm.doc.job_order_details || []).reduce(
		(sum, row) => sum + flt(row.qty),
		0
	);

	frm.set_value("total_qty", total_qty);
}


async function calculate_amount(cdt, cdn) {

	const row = locals[cdt][cdn];

	await frappe.model.set_value(
		cdt,
		cdn,
		"amount",
		flt(row.qty) * flt(row.rate)
	);

	update_total_qty(cur_frm);
}


async function get_available_qty(cdt, cdn) {

	const row = locals[cdt][cdn];

	const r = await frappe.call({
		method: "ec_production.ec_production.doctype.ec_job_order.ec_job_order.get_available_qty",
		args: {
			lot: row.lot,
			item: row.item,
			operation: row.operation
		}
	});

	return flt(r.message);
}


function populate_row(cdt, cdn, data, available) {

	frappe.model.set_value(cdt, cdn, "operation", data.operation);
	frappe.model.set_value(cdt, cdn, "rate", data.rate);
	frappe.model.set_value(
		cdt, cdn, "qty",
		Math.max(Math.min(flt(data.qty), flt(available)), 0)
	);

	setTimeout(() => calculate_amount(cdt, cdn), 50);
}


frappe.ui.form.on("EC Job Order Detail", {

	async lot(frm, cdt, cdn) {

		const row = locals[cdt][cdn];

		row.lot_data = null;
		row.allowed_items = [];
		row.allowed_operations = [];

		await frappe.model.set_value(cdt, cdn, "item", "");
		await frappe.model.set_value(cdt, cdn, "operation", "");
		await frappe.model.set_value(cdt, cdn, "qty", "");
		await frappe.model.set_value(cdt, cdn, "rate", "");
		await frappe.model.set_value(cdt, cdn, "amount", "");
		update_total_qty(frm);

		if (!row.lot) {
			frm.refresh_field("job_order_details");
			return;
		}

		const lot = await frappe.db.get_doc("EC Lot", row.lot);

		row.lot_data = lot.ec_lot_item || [];

		row.allowed_items = [
			...new Set(
				row.lot_data.map(d => d.item)
			)
		];

		frm.refresh_field("job_order_details");
	},

	async item(frm, cdt, cdn) {

		const row = locals[cdt][cdn];

		row.allowed_operations = [];

		await frappe.model.set_value(cdt, cdn, "operation", "");
		await frappe.model.set_value(cdt, cdn, "qty", "");
		await frappe.model.set_value(cdt, cdn, "rate", "");
		await frappe.model.set_value(cdt, cdn, "amount", "");
		update_total_qty(frm);

		if (!row.lot_data || !row.item) {
			frm.refresh_field("job_order_details");
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

		frm.refresh_field("job_order_details");

		if (matches.length === 1) {

			await frappe.model.set_value(cdt, cdn, "operation", matches[0].operation);

			const available = await get_available_qty(cdt, cdn);

			populate_row(cdt, cdn, matches[0], available);
		}
	},

	async operation(frm, cdt, cdn) {

		const row = locals[cdt][cdn];

		if (!row.lot_data || !row.item || !row.operation) {
			return;
		}

		const match = row.lot_data.find(
			d => d.item === row.item && d.operation === row.operation
		);

		if (!match) {
			return;
		}

		const available = await get_available_qty(cdt, cdn);

		populate_row(cdt, cdn, match, available);
	},

	async qty(frm, cdt, cdn) {

		const row = locals[cdt][cdn];

		// Lot-capacity availability is only checked on submit (a
		// summarized error listing every offending row) — not while
		// editing/saving a draft, so any qty can be entered here.

		if (flt(row.qty) < flt(row.qty_received)) {

			frappe.msgprint(
				__("Qty cannot be less than the Qty already Received ({0}).", [row.qty_received])
			);

			await frappe.model.set_value(cdt, cdn, "qty", row.qty_received);
		}

		await calculate_amount(cdt, cdn);
	},

	async rate(frm, cdt, cdn) {
		await calculate_amount(cdt, cdn);
	}
});
