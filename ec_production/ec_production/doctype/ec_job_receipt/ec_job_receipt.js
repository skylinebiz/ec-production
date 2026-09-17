// Copyright (c) 2026, SkylineBiz Private Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("EC Job Receipt", {

	setup(frm) {

		frm.set_query("lot", "job_receipt_details", function () {
			return {
				filters: {
					closed: 0
				}
			};
		});

		frm.set_query("item", "job_receipt_details", function (doc, cdt, cdn) {

			const row = locals[cdt][cdn];

			return {
				filters: {
					name: ["in", row.allowed_items || [""]]
				}
			};
		});

		frm.set_query("operation", "job_receipt_details", function (doc, cdt, cdn) {

			const row = locals[cdt][cdn];

			return {
				filters: {
					name: ["in", row.allowed_operations || [""]]
				}
			};
		});
	}
});


async function calculate_amount(cdt, cdn) {

	const row = locals[cdt][cdn];

	await frappe.model.set_value(
		cdt,
		cdn,
		"amount",
		flt(row.qty_received) * flt(row.rate)
	);
}


async function update_rate_and_pending(cdt, cdn) {

	const row = locals[cdt][cdn];

	row.__pending = null;

	if (!(row.employee && row.operation && row.item && row.lot)) {
		await frappe.model.set_value(cdt, cdn, "rate", "");
		return;
	}

	const r = await frappe.call({
		method: "ec_production.ec_production.doctype.ec_job_receipt.ec_job_receipt.get_matching_jod",
		args: {
			employee: row.employee,
			operation: row.operation,
			item: row.item,
			lot: row.lot
		}
	});

	if (!r.message) {
		frappe.msgprint(
			__("No submitted Job Order found for this Employee / Operation / Item / Lot combination.")
		);
		await frappe.model.set_value(cdt, cdn, "rate", "");
		return;
	}

	row.__pending = flt(r.message.pending);

	await frappe.model.set_value(cdt, cdn, "rate", r.message.rate);
	await calculate_amount(cdt, cdn);
}


frappe.ui.form.on("EC Job Receipt Detail", {

	employee(frm, cdt, cdn) {
		update_rate_and_pending(cdt, cdn);
	},

	async lot(frm, cdt, cdn) {

		const row = locals[cdt][cdn];

		row.lot_data = null;
		row.allowed_items = [];
		row.allowed_operations = [];

		await frappe.model.set_value(cdt, cdn, "item", "");
		await frappe.model.set_value(cdt, cdn, "operation", "");
		await frappe.model.set_value(cdt, cdn, "qty_received", "");
		await frappe.model.set_value(cdt, cdn, "rate", "");
		await frappe.model.set_value(cdt, cdn, "amount", "");

		if (!row.lot) {
			frm.refresh_field("job_receipt_details");
			return;
		}

		const lot = await frappe.db.get_doc("EC Lot", row.lot);

		row.lot_data = lot.ec_lot_item || [];

		row.allowed_items = [
			...new Set(
				row.lot_data.map(d => d.item)
			)
		];

		frm.refresh_field("job_receipt_details");
	},

	async item(frm, cdt, cdn) {

		const row = locals[cdt][cdn];

		row.allowed_operations = [];

		await frappe.model.set_value(cdt, cdn, "operation", "");
		await frappe.model.set_value(cdt, cdn, "qty_received", "");
		await frappe.model.set_value(cdt, cdn, "rate", "");
		await frappe.model.set_value(cdt, cdn, "amount", "");

		if (!row.lot_data || !row.item) {
			frm.refresh_field("job_receipt_details");
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

		frm.refresh_field("job_receipt_details");

		if (matches.length === 1) {
			await frappe.model.set_value(cdt, cdn, "operation", matches[0].operation);
			await update_rate_and_pending(cdt, cdn);
		}
	},

	operation(frm, cdt, cdn) {
		update_rate_and_pending(cdt, cdn);
	},

	async qty_received(frm, cdt, cdn) {
		// Pending-qty availability is only checked on submit (a single
		// grouped error covering every offending row) — not while
		// editing/saving a draft, so any qty can be entered here.
		await calculate_amount(cdt, cdn);
	}
});
