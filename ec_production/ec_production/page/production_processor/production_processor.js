frappe.pages['production-processor'].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Production Processor',
		single_column: true
	});

	new ProductionProcessor(page);
};

class ProductionProcessor {
	constructor(page) {
		this.page = page;
		this.rows = [];

		this.wrapper = $(`
			<div class="production-processor container-fluid py-4"></div>
		`).appendTo(this.page.body);

		this.make_filters();
		this.make_dashboard();
		this.make_employee_section();
		this.make_table();
		this.bind_events();
	}

	make_filters() {
		let row = $(`
			<div class="row g-3 align-items-center mb-4">
				<div class="col-lg-5 production-plan"></div>

				<div class="col-lg-5 operation"></div>

				<div class="col-lg-2">
					<button class="btn btn-primary w-100 load-btn">
						Load
					</button>
				</div>
			</div>
		`).appendTo(this.wrapper);

		this.production_plan = frappe.ui.form.make_control({
			parent: row.find(".production-plan"),
			df: {
				fieldtype: "Link",
				label: "Production Plan",
				options: "Production Plan"
			},
			render_input: true
		});

		this.operation = frappe.ui.form.make_control({
			parent: row.find(".operation"),
			df: {
				fieldtype: "Link",
				label: "Operation",
				options: "Operation"
			},
			render_input: true
		});

		row.find(".load-btn").on("click", () => {
			this.load_data();
		});
	}

	make_dashboard() {
		this.dashboard = $(`
		<div class="mb-4">

			<div class="d-flex justify-content-between align-items-center mb-3">
				<h5 class="mb-0">Production Summary</h5>
			</div>

			<div class="row dashboard-cards g-3"></div>

		</div>
	`).appendTo(this.wrapper);

		this.dashboard_cards = this.dashboard.find(".dashboard-cards");
	}


	render_dashboard(rows) {

		this.dashboard_cards.empty();

		if (!rows || !rows.length) {
			this.dashboard_cards.html(`
			<div class="col-12">
				<div class="text-center text-muted py-5">
					No Job Cards Found
				</div>
			</div>
		`);
			return;
		}

		const summary = {};

		rows.forEach(row => {

			if (!summary[row.item_name]) {
				summary[row.item_name] = {
					item_name: row.item_name,
					qty: 0,
					completed: 0,
					pending: 0
				};
			}

			summary[row.item_name].qty += flt(row.for_quantity);
			summary[row.item_name].completed += flt(row.total_completed_qty);

		});

		Object.values(summary).forEach(item => {

			item.pending = Math.max(0, item.qty - item.completed);

			this.add_card(item);
		});
	}


	add_card(item) {

		$(`
		<div class="col-xl-3 col-lg-4 col-md-6">

			<div class="card shadow-sm border-0 h-100">

				<div class="card-body">

					<h6 class="fw-bold mb-3">
						${item.item_name}
					</h6>

					<div class="row text-center">

						<div class="col">
							<div class="small text-muted">
								WO Qty
							</div>

							<div class="fs-4 fw-bold">
								${item.qty}
							</div>
						</div>

						<div class="col">
							<div class="small text-muted">
								Completed
							</div>

							<div class="fs-4 fw-bold text-success">
								${item.completed}
							</div>
						</div>

						<div class="col">
							<div class="small text-muted">
								Pending
							</div>

							<div class="fs-4 fw-bold text-warning">
								${item.pending}
							</div>
						</div>

					</div>

				</div>

			</div>

		</div>
	`).appendTo(this.dashboard_cards);

	}

	make_employee_section() {
		this.employee_section = $(`
		<div class="card mb-4">

			<div class="card-body">

				<div class="row align-items-end">

					<div class="col-lg-4 employee-field"></div>

					<div class="col-lg-8">

						<div class="alert alert-info py-2 mb-0">

							<strong>Tip:</strong>
							Select an employee here to automatically fill
							all <strong>Open</strong> Job Cards.

						</div>

					</div>

				</div>

			</div>

		</div>
	`).appendTo(this.wrapper);

		this.employee = frappe.ui.form.make_control({
			parent: this.employee_section.find(".employee-field"),
			df: {
				fieldtype: "Link",
				label: "Employee (Apply to All)",
				options: "Employee",
				placeholder: "Select Employee",
				change: () => {
					this.apply_employee_to_all();
				}
			},
			render_input: true
		});

		this.employee.refresh();

		this.employee.$input.on("change", () => {
			const employee = this.employee.get_value();

			this.rows.forEach(row => {
				if (row.status === "Open" && row.employee_control) {
					row.employee_control.set_value(employee);
				}
			});
		});
	}

	make_table() {
		this.table = $(`
		<div class="card">

		 <div class="card-header d-flex justify-content-between align-items-center">
            
            <span>
                ${__("Job Cards")}
            </span>

            <button type="button"
                class="btn btn-sm btn-primary rm-processing-btn"
            >
                ${__("RM Processing")}
            </button>

        </div>

			<div class="table-responsive" style="overflow:visible;">

				<table class="table table-hover align-middle mb-0">

					<thead>

						<tr>
							<th class="text-center" style="width:160px">Job Card</th>
							<th class="text-center" style="width:160px">Operation</th>
							<th class="text-center" style="width:160px">Work Order</th>
							<th class="text-center">Item</th>
							<th class="text-center" style="width:220px">Employee</th>
							<th class="text-center" style="width:100px">
								Job Qty
							</th>

							<th class="text-center" style="width:120px">
								Recd Qty
							</th>
							<th class="text-center" style="width:120px">Status</th>
							<th class="text-center" style="width:120px" class="text-center">
								Action
							</th>
						</tr>

					</thead>

					<tbody></tbody>

				</table>

			</div>

		</div>
	`).appendTo(this.wrapper);

		this.tbody = this.table.find("tbody");
	}


	render_table(rows) {

		const status_order = {
			"Work In Progress": 1,
			"Open": 2,        // displayed as Ready
			"On Hold": 3,
			"Completed": 4,
			"Cancelled": 5
		};

		rows.sort((a, b) => {
			return (
				(status_order[a.status] || 99) -
				(status_order[b.status] || 99)
			);
		});

		this.tbody.empty();

		if (!rows.length) {

			this.tbody.append(`
			<tr>
				<td colspan="8" class="text-center text-muted py-5">
					No Job Cards Found
				</td>
			</tr>
		`);

			return;
		}

		rows.forEach(row => {

			const tr = $(`
			<tr>

				<td class="text-center align-middle">
					${row.job_card} 
				</td>

				<td class="text-center align-middle">
					${row.operation}
				</td>

				<td class="text-center align-middle">
					${row.work_order}
				</td>

				<td class="text-center align-middle">
					${row.item_name}
				</td>

				<td class="employee-cell"></td>

				<td class="text-center align-middle">
					${frappe.format(row.for_quantity, {
				fieldtype: "Float"
			})}
				</td>

				<td class="text-center align-middle received-qty-cell"></td>

				<td class="text-center align-middle">
					${this.render_status(row)}
				</td>

				<td class="text-center align-middle action-cell"></td>

			</tr>
		`);

			this.tbody.append(tr);

			this.create_employee_control(
				tr.find(".employee-cell"),
				row
			);

			this.create_received_qty_control(
				tr.find(".received-qty-cell"),
				row
			);

			this.create_action(
				tr.find(".action-cell"),
				row
			);

		});
	}

	render_status(row) {

		// Running timer
		if (row.status === "Open" && row.is_timer_running) {
			return `
			<span class="badge rounded-pill bg-info-subtle text-info border">
				<i class="fa fa-clock-o me-1"></i>
				Running
			</span>
		`;
		}

		const map = {
			"Open": {
				color: "warning",
				icon: "🟡",
				text: "Ready"
			},

			"On Hold": {
				color: "secondary",
				icon: "🟣",
				text: "On Hold"
			},

			"Completed": {
				color: "success",
				icon: "🟢",
				text: "Completed"
			},

			"Cancelled": {
				color: "danger",
				icon: "🔴",
				text: "Cancelled"
			}
		};

		const s = map[row.status] || {
			color: "secondary",
			icon: "⚪",
			text: row.status
		};

		return `
		<span class="badge rounded-pill bg-${s.color}-subtle text-${s.color} border">
			${s.icon} ${s.text}
		</span>
	`;
	}

	create_employee_control(parent, row) {

		parent.addClass("text-center");

		if (row.status !== "Open") {
			parent.html(row.employee_name || "-");
			return;
		}

		const wrapper = $('<div class="d-flex justify-content-center"></div>').appendTo(parent);

		const employee = frappe.ui.form.make_control({
			parent: wrapper,
			df: {
				fieldtype: "Link",
				options: "Employee",
				placeholder: "Employee"
			},
			render_input: true
		});

		employee.set_value(row.employee);

		row.employee_control = employee;
	}

	create_received_qty_control(parent, row) {

		parent.addClass("text-center align-middle");

		// Show input while the timer is running
		if (row.status === "Work In Progress") {

			const wrapper = $('<div class="d-flex justify-content-center"></div>').appendTo(parent);

			const qty = frappe.ui.form.make_control({
				parent: wrapper,
				df: {
					fieldtype: "Float",
					precision: 3
				},
				render_input: true
			});

			qty.refresh();
			qty.set_value(row.for_quantity);

			row.qty_control = qty;
			return;
		}

		// Otherwise show completed quantity
		parent.html(
			frappe.format(row.total_completed_qty, {
				fieldtype: "Float"
			})
		);
	}

	create_action(parent, row) {

		parent.empty();

		// Completed
		if (row.status === "Completed") {

			parent.html(`
			<span class="text-success fw-semibold">
				<i class="fa fa-check-circle me-1"></i>
				Done
			</span>
		`);

			return;
		}

		// Cancelled
		if (row.status === "Cancelled") {

			parent.html(`
			<span class="text-danger">
				Cancelled
			</span>
		`);

			return;
		}

		const employee = row.employee_control;

		const qty = row.qty_control;

		// -----------------------------------------------------
		// START
		// -----------------------------------------------------

		if (!row.is_timer_running) {

			const btn = $(`
			<button class="btn btn-success btn-sm rounded-pill px-3">
				<i class="fa fa-play me-1"></i>
				Start
			</button>
		`);

			parent.append(btn);

			btn.on("click", () => {

				const emp = employee.get_value();

				if (!emp) {
					frappe.msgprint(__("Please select Employee"));
					return;
				}

				btn.prop("disabled", true);

				this.start_timer(row, emp).then(() => {
					this.load_data();
				});

			});

			return;
		}

		// -----------------------------------------------------
		// STOP
		// -----------------------------------------------------

		const btn = $(`
		<button class="btn btn-danger btn-sm rounded-pill px-3">
			<i class="fa fa-stop me-1"></i>
			Stop
		</button>
	`);

		parent.append(btn);

		btn.on("click", () => {

			const recd_qty = qty.get_value();

			if (!recd_qty || recd_qty <= 0) {
				frappe.msgprint(__("Please enter Received Qty"));
				return;
			}

			btn.prop("disabled", true);

			this.stop_timer(row, recd_qty).then(() => {
				this.load_data();
			});

		});

	}


	get_status_badge(status) {

		switch (status) {

			case "Open":
				return "bg-warning text-dark";

			case "Completed":
				return "bg-success";

			case "Cancelled":
				return "bg-danger";

			case "Work In Progress":
				return "bg-info";

			default:
				return "bg-secondary";
		}

	}


	bind_events() {

		// Load Button
		this.wrapper.find(".load-btn").on("click", () => {
			this.load_data();
		});

		// Apply Employee To All
		this.employee.$input.on("change", () => {
			this.apply_employee_to_all();
		});

		this.wrapper
			.find(".rm-processing-btn")
			.on("click", () => {
				this.open_rm_processing();
			});
	}


	apply_employee_to_all() {

		const employee = this.employee.get_value();

		if (!employee) {
			return;
		}

		this.rows.forEach(row => {

			if (
				row.status === "Open" &&
				row.employee_control
			) {
				row.employee_control.set_value(employee);
			}

		});

	}


	load_data() {

		const production_plan = this.production_plan.get_value();
		const operation = this.operation.get_value();

		if (!production_plan) {
			frappe.msgprint(__("Please select Production Plan"));
			return;
		}

		frappe.call({
			method: "ec_production.api.production_processor.load_job_cards",
			args: {
				production_plan,
				operation
			},
			freeze: true,
			freeze_message: __("Loading Job Cards..."),

			callback: (r) => {

				this.rows = r.message || [];

				this.render_dashboard(this.rows);
				this.render_table(this.rows);

			}
		});

	}

	process_job(row, employee, qty) {

		frappe.call({
			method: "ec_production.api.production_processor.process_job_timer",
			args: {
				job_card: row.job_card,
				employee: employee,
				qty: qty
			},
			freeze: true,
			freeze_message: __("Processing Job Card..."),

			callback: (r) => {
				console.log(r);

				if (r.exc) {
					return;
				}

				frappe.show_alert({
					message: __("Job Card Processed"),
					indicator: "green"
				});

				// Reload latest data
				this.load_data();

			}
		});

	}

	start_timer(row, employee) {

		return frappe.call({
			method: "ec_production.api.production_processor.start_job_timer",
			args: {
				job_card: row.job_card,
				employee
			},
			freeze: true,
			freeze_message: __("Starting Timer...")
		});

	}


	stop_timer(row, qty) {

		return frappe.call({
			method: "ec_production.api.production_processor.stop_job_timer",
			args: {
				job_card: row.job_card,
				qty
			},
			freeze: true,
			freeze_message: __("Stopping Timer...")
		});

	}


	refresh_row(updated_row) {

		const index = this.rows.findIndex(
			d => d.job_card === updated_row.job_card
		);

		if (index === -1) {
			return;
		}

		this.rows[index] = {
			...this.rows[index],
			...updated_row
		};

		this.render_dashboard(this.rows);
		this.render_table(this.rows);

	}


	open_rm_processing() {
		const dialog = new frappe.ui.Dialog({

			title: __("RM Processing"),

			fields: [
				{
					fieldtype: "Select",
					fieldname: "process",
					label: __("Process"),
					reqd: 1,
					options: [
						"",
						"RM Issue",
						"Process Cuts",
						"RM Receive"
					]
				},

				{
					fieldtype: "HTML",
					fieldname: "process_content"
				}
			],

			size: "extra-large",
		});

		dialog.show();

		const process_control = dialog.fields_dict.process;
		const process_input = process_control.$input;
		const content_wrapper = dialog.fields_dict.process_content.$wrapper;


		// Prevent Frappe router from receiving select events

		process_input.on("click", function (e) {
			e.stopPropagation();
		});


		process_input.on("mousedown", function (e) {
			e.stopPropagation();
		});


		// Process changed

		process_input.on("change", (e) => {
			e.stopPropagation();
			const process = e.target.value;

			content_wrapper.empty();

			// Nothing selected
			if (!process) {

				content_wrapper.html(`
				<div class="text-center text-muted py-5">
					${__("Select a process to continue.")}
				</div>
			`);

				return;
			}


			// RM Issue
			if (process === "RM Issue") {
				this.load_rm_issue_content(
					content_wrapper,
					dialog
				);

				return;
			}

			// Process Cuts
			if (process === "Process Cuts") {
				this.load_process_cuts_content(
					content_wrapper,
					dialog
				);

				return;
			}

			// RM Receive
			if (process === "RM Receive") {
				this.load_rm_receive_content(
					content_wrapper,
					dialog
				);

				return;
			}

		});

		this.rm_processing_dialog = dialog;
	}



	load_rm_issue_content(wrapper, dialog) {

		wrapper.html(`
		<div class="text-center text-muted py-5">

			<div class="mb-3">
				<i class="fa fa-spinner fa-spin fa-2x"></i>
			</div>

			<div>
				${__("Finding RM Items...")}
			</div>

		</div>
	`);


		const production_plan =
			this.production_plan.get_value();

		if (!production_plan) {

			wrapper.html(`
			<div class="alert alert-warning">
				${__("Please select Production Plan first.")}
			</div>
		`);

			return;
		}

		frappe.call({

			method:
				"ec_production.api.prod_plan.get_rm_issue_items",

			args: {
				production_plan: production_plan
			},

			freeze: true,

			callback: (r) => {
				const rm_items =
					r.message || [];

				if (!rm_items.length) {

					wrapper.html(`
					<div class="text-center text-muted py-5">
						${__("No RM items found.")}
					</div>
				`);

					return;
				}

				// IMPORTANT:
				// render directly here
				this.render_rm_issue_items(
					wrapper,
					rm_items,
					dialog
				);

			},

			error: (r) => {
				wrapper.html(`
				<div class="alert alert-danger">
					${__("Unable to load RM Issue items.")}
				</div>
			`);

			}

		});
	}


	render_rm_issue_items(wrapper, rm_items, dialog) {
		console.log(
			"[RM ISSUE] Rendering items:",
			rm_items
		);

		this.rm_issue_items = rm_items;

		let html = `
		<div class="rm-issue-items">

			<div class="table-responsive" style="overflow:visible;">

				<table class="table table-bordered">

					<thead>
						<tr>
							<th>${__("Job Card")}</th>
							<th>${__("Work Order")}</th>
							<th>${__("Item")}</th>
							<th>${__("Cut Item")}</th>
							<th>${__("BOM")}</th>
							<th>${__("Components")}</th>
							<th style="width: 150px;">
								${__("Action")}
							</th>
						</tr>
					</thead>

					<tbody>
	`;

		rm_items.forEach((item, index) => {

			const components = item.components || [];

			let components_html = "";

			if (!components.length) {

				components_html = `
				<span class="text-muted">
					${__("No components")}
				</span>
			`;

			} else {

				components_html = components
					.map((component) => {

						return `
						<div class="mb-1">

							<strong>
								${frappe.utils.escape_html(
							component.item_code || ""
						)}
							</strong>

							<span class="text-muted">
								-
								${frappe.utils.escape_html(
							component.item_name || ""
						)}
							</span>

							<div class="text-muted small">

								${component.qty || 0}

								${frappe.utils.escape_html(
							component.uom || ""
						)}

							</div>

						</div>
					`;

					})
					.join("");
			}

			html += `
			<tr data-index="${index}">

				<td>
					${frappe.utils.escape_html(
				item.job_card || ""
			)}
				</td>

				<td>
					${frappe.utils.escape_html(
				item.work_order || ""
			)}
				</td>

				<td>

					<strong>
						${frappe.utils.escape_html(
				item.source_item || ""
			)}
					</strong>

					<div class="text-muted small">
						${frappe.utils.escape_html(
				item.source_item_name || ""
			)}
					</div>

					<div class="text-muted small">
						Qty:
						${item.job_qty || 0}
					</div>

				</td>

				<td>

					<strong>
						${frappe.utils.escape_html(
				item.cut_item_code || ""
			)}
					</strong>

					<div class="text-muted small">
						${frappe.utils.escape_html(
				item.cut_item_name || ""
			)}
					</div>

				</td>

				<td>
					<div class="rm-bom-control"></div>
				</td>

				<td>
					<div class="rm-components">
						${components_html}
					</div>
				</td>

				<td class="text-center">

					<button
						class="btn btn-sm btn-primary create-rm-stock-entry"
						data-index="${index}"
					>
						<i class="fa fa-plus"></i>
						${__("Create Stock Entry")}
					</button>

				</td>

			</tr>
		`;
		});

		html += `
					</tbody>

				</table>

			</div>

		</div>
	`;

		wrapper.html(html);

		// Create native Frappe BOM Link controls

		wrapper.find("tbody tr").each((index, tr) => {

			const item = rm_items[index];

			const bom_wrapper =
				$(tr).find(".rm-bom-control");

			const bom_control = frappe.ui.form.make_control({

				parent: bom_wrapper,

				df: {
					fieldtype: "Link",
					fieldname: `bom_${index}`,
					options: "BOM",

					get_query: () => {

						return {
							filters: {
								item: item.cut_item_code,
								docstatus: 1,
								is_active: 1
							}
						};

					}
				},

				render_input: true

			});

			bom_control.refresh();

			// Set current BOM
			if (item.bom_no) {

				bom_control.set_value(
					item.bom_no
				);

			}

			// Store control against item
			item.bom_control = bom_control;

			// BOM changed
			bom_control.$input.on("change", (e) => {

				e.preventDefault();
				e.stopPropagation();

				const bom_no =
					bom_control.get_value();

				if (!bom_no) {
					return;
				}

				// Update selected BOM
				item.bom_no = bom_no;

				// Fetch latest components
				this.load_rm_bom_components(
					item,
					$(tr).find(".rm-components")
				);

			});

		});

		wrapper
			.find(".create-rm-stock-entry")
			.on("click", (e) => {

				e.preventDefault();
				e.stopPropagation();

				const index = $(e.currentTarget).data("index");
				const item = rm_items[index];

				if (!item) {
					frappe.msgprint(__("Unable to find selected RM item."));
					return;
				}

				frappe.new_doc("Stock Entry", {}, (doc) => {

					doc.stock_entry_type = "Material Transfer for Manufacture";
					doc.items = [];

					(item.components || []).forEach((component) => {

						const row = frappe.model.add_child(
							doc,
							"Stock Entry Detail",
							"items"
						);

						row.item_code = component.item_code;
						row.item_name = component.item_name;
						row.qty = component.qty;
						row.uom = component.uom;

					});

					const cut_row = frappe.model.add_child(
						doc,
						"Stock Entry Detail",
						"items"
					);

					cut_row.item_code = item.cut_item_code;
					cut_row.item_name = item.cut_item_name;
					cut_row.qty = item.job_qty;

					// const source_row = frappe.model.add_child(
					// 	doc,
					// 	"Stock Entry Detail",
					// 	"items"
					// );

					// source_row.item_code = item.source_item;
					// source_row.item_name = item.source_item_name;
					// source_row.qty = item.job_qty;
				});
			});
	}


	load_rm_bom_components(item, components_wrapper) {

		const bom_no = item.bom_no;

		if (!bom_no) {
			return;
		}

		components_wrapper.html(`
		<div class="text-muted">
			<i class="fa fa-spinner fa-spin"></i>
			${__("Loading components...")}
		</div>
	`);

		frappe.call({

			method:
				"erpnext.manufacturing.doctype.bom.bom.get_bom_items",

			args: {

				bom: bom_no,

				company:
					frappe.defaults.get_user_default("Company"),

				qty: 1,

				// IMPORTANT:
				// only direct BOM items
				fetch_exploded: 0
			},

			freeze: false,

			callback: (r) => {
				const components =
					r.message || [];

				// Replace old components
				item.components = components;

				if (!components.length) {

					components_wrapper.html(`
					<span class="text-muted">
						${__("No components")}
					</span>
				`);

					return;
				}

				const html = components
					.map((component) => {

						return `
						<div class="mb-1">

							<strong>
								${frappe.utils.escape_html(
							component.item_code || ""
						)}
							</strong>

							<span class="text-muted">
								-
								${frappe.utils.escape_html(
							component.item_name || ""
						)}
							</span>

							<div class="text-muted small">

								${component.qty || 0}

								${frappe.utils.escape_html(
							component.stock_uom || ""
						)}

							</div>

						</div>
					`;

					})
					.join("");

				components_wrapper.html(html);

			},

			error: (r) => {

				console.error(
					"[RM ISSUE] BOM component error:",
					r
				);

				components_wrapper.html(`
				<div class="text-danger">
					${__("Unable to load BOM components.")}
				</div>
			`);
			}
		});
	}



	load_process_cuts_content(wrapper, dialog) {

		wrapper.html(`
		<div class="p-4">

			<h5>
				${__("Process Cuts")}
			</h5>

			<div class="text-center text-muted py-5">
				<i class="fa fa-spinner fa-spin fa-2x"></i>

				<div class="mt-3">
					${__("Finding Process Cut Items...")}
				</div>
			</div>

		</div>
	`);

		const production_plan =
			this.production_plan.get_value();

		if (!production_plan) {

			wrapper.html(`
			<div class="alert alert-warning">
				${__("Please select Production Plan first.")}
			</div>
		`);

			return;
		}

		frappe.call({

			method:
				"ec_production.api.prod_plan.get_rm_issue_items",

			args: {
				production_plan: production_plan
			},

			freeze: true,

			freeze_message:
				__("Finding Process Cut Items..."),

			callback: (r) => {

				const rm_items = r.message || [];

				if (!rm_items.length) {

					wrapper.html(`
					<div class="text-center text-muted py-5">
						${__("No Process Cut items found.")}
					</div>
				`);

					return;
				}

				this.render_process_cuts_items(
					wrapper,
					rm_items,
					dialog
				);
			},

			error: () => {

				wrapper.html(`
				<div class="alert alert-danger">
					${__("Unable to load Process Cut items.")}
				</div>
			`);
			}
		});
	}


	render_process_cuts_items(wrapper, rm_items, dialog) {

		let html = `
		<div class="process-cuts-items">

			<div class="table-responsive" style="overflow:visible;">

				<table class="table table-bordered">

					<thead>
						<tr>
							<th>${__("Job Card")}</th>
							<th>${__("Work Order")}</th>
							<th>${__("Item")}</th>
							<th>${__("Cut Item")}</th>
							<th style="width: 140px;">
								${__("Qty")}
							</th>
							<th style="width: 180px;">
								${__("Action")}
							</th>
						</tr>
					</thead>

					<tbody>
	`;

		rm_items.forEach((item, index) => {

			html += `
			<tr data-index="${index}">

				<td>
					${frappe.utils.escape_html(
				item.job_card || ""
			)}
				</td>

				<td>
					${frappe.utils.escape_html(
				item.work_order || ""
			)}
				</td>

				<td>
					<strong>
						${frappe.utils.escape_html(
				item.source_item || ""
			)}
					</strong>

					<div class="text-muted small">
						${frappe.utils.escape_html(
				item.source_item_name || ""
			)}
					</div>
				</td>

				<td>
					<strong>
						${frappe.utils.escape_html(
				item.cut_item_code || ""
			)}
					</strong>

					<div class="text-muted small">
						${frappe.utils.escape_html(
				item.cut_item_name || ""
			)}
					</div>
				</td>

				<td>

					<input
						type="number"
						class="form-control process-cut-qty"
						data-index="${index}"
						min="0"
						step="0.001"
						placeholder="${__("Enter Qty")}"
					>

					<div class="text-muted small mt-1">
						Qty: ${item.job_qty || 0}
					</div>

				</td>

				<td class="text-center">

					<button
						class="btn btn-sm btn-primary create-process-cuts-stock-entry"
						data-index="${index}"
					>
						<i class="fa fa-plus"></i>
						${__("Create Stock Entry")}
					</button>

				</td>

			</tr>
		`;
		});

		html += `
					</tbody>

				</table>

			</div>

		</div>
	`;

		wrapper.html(html);

		wrapper
			.find(".create-process-cuts-stock-entry")
			.on("click", (e) => {

				e.preventDefault();
				e.stopPropagation();

				const index = $(e.currentTarget).data("index");
				const item = rm_items[index];

				if (!item) {
					frappe.msgprint(__("Unable to find selected RM item."));
					return;
				}

				const qty = flt(
					$(e.currentTarget)
						.closest("tr")
						.find(".process-cut-qty")
						.val()
				);

				if (qty <= 0) {
					frappe.msgprint(__("Please enter a valid quantity."));
					return;
				}

				frappe.new_doc("Stock Entry", {}, (doc) => {

					doc.stock_entry_type = "Manufacture";
					doc.items = [];

					(item.components || []).forEach((component) => {

						const row = frappe.model.add_child(
							doc,
							"Stock Entry Detail",
							"items"
						);

						row.item_code = component.item_code;
						row.item_name = component.item_name;
						row.qty = component.qty;
						row.uom = component.uom;

					});

					const cut_row = frappe.model.add_child(
						doc,
						"Stock Entry Detail",
						"items"
					);

					cut_row.item_code = item.cut_item_code;
					cut_row.item_name = item.cut_item_name;
					cut_row.qty = qty;

					// const source_row = frappe.model.add_child(
					// 	doc,
					// 	"Stock Entry Detail",
					// 	"items"
					// );

					// source_row.item_code = item.source_item;
					// source_row.item_name = item.source_item_name;
					// source_row.qty = qty;
				});
			});
	}



	load_rm_receive_content(wrapper, dialog) {

		wrapper.html(`
		<div class="p-4">

			<h5>
				${__("RM Receive")}
			</h5>

			<div class="text-center text-muted py-5">

				<i class="fa fa-spinner fa-spin fa-2x"></i>

				<div class="mt-3">
					${__("Finding RM Receive Items...")}
				</div>

			</div>

		</div>
	`);

		const production_plan =
			this.production_plan.get_value();

		if (!production_plan) {

			wrapper.html(`
			<div class="alert alert-warning">
				${__("Please select Production Plan first.")}
			</div>
		`);

			return;
		}

		frappe.call({

			method:
				"ec_production.api.prod_plan.get_rm_issue_items",

			args: {
				production_plan: production_plan
			},

			freeze: true,

			freeze_message:
				__("Finding RM Receive Items..."),

			callback: (r) => {

				const rm_items =
					r.message || [];

				if (!rm_items.length) {

					wrapper.html(`
					<div class="text-center text-muted py-5">
						${__("No RM Receive items found.")}
					</div>
				`);

					return;
				}

				this.render_rm_receive_items(
					wrapper,
					rm_items,
					dialog
				);
			},

			error: () => {

				wrapper.html(`
				<div class="alert alert-danger">
					${__("Unable to load RM Receive items.")}
				</div>
			`);
			}
		});
	}


	render_rm_receive_items(wrapper, rm_items, dialog) {

		let html = `
		<div class="rm-receive-items">

			<div class="table-responsive" style="overflow:visible;">

				<table class="table table-bordered">

					<thead>
						<tr>
							<th>${__("Job Card")}</th>
							<th>${__("Work Order")}</th>
							<th>${__("Item")}</th>
							<th>${__("Cut Item")}</th>
							<th style="width: 140px;">
								${__("Qty")}
							</th>
							<th style="width: 180px;">
								${__("Action")}
							</th>
						</tr>
					</thead>

					<tbody>
	`;

		rm_items.forEach((item, index) => {

			html += `
			<tr data-index="${index}">

				<td>
					${frappe.utils.escape_html(
				item.job_card || ""
			)}
				</td>

				<td>
					${frappe.utils.escape_html(
				item.work_order || ""
			)}
				</td>

				<td>

					<strong>
						${frappe.utils.escape_html(
				item.source_item || ""
			)}
					</strong>

					<div class="text-muted small">
						${frappe.utils.escape_html(
				item.source_item_name || ""
			)}
					</div>

				</td>

				<td>

					<strong>
						${frappe.utils.escape_html(
				item.cut_item_code || ""
			)}
					</strong>

					<div class="text-muted small">
						${frappe.utils.escape_html(
				item.cut_item_name || ""
			)}
					</div>

				</td>

				<td>

					<input
						type="number"
						class="form-control rm-receive-qty"
						data-index="${index}"
						min="0"
						step="0.001"
						placeholder="${__("Enter Qty")}"
					>

					<div class="text-muted small mt-1">
						Qty: ${item.job_qty || 0}
					</div>

				</td>

				<td class="text-center">

					<button
						class="btn btn-sm btn-primary create-rm-receive-stock-entry"
						data-index="${index}"
					>
						<i class="fa fa-plus"></i>
						${__("Create Stock Entry")}
					</button>

				</td>

			</tr>
		`;
		});

		html += `
					</tbody>

				</table>

			</div>

		</div>
	`;

		wrapper.html(html);

		wrapper
			.find(".create-rm-receive-stock-entry")
			.on("click", (e) => {

				e.preventDefault();
				e.stopPropagation();

				const index = $(e.currentTarget).data("index");
				const item = rm_items[index];

				if (!item) {
					frappe.msgprint(__("Unable to find selected RM item."));
					return;
				}

				const qty = flt(
					$(e.currentTarget)
						.closest("tr")
						.find(".rm-receive-qty")
						.val()
				);

				if (qty <= 0) {
					frappe.msgprint(__("Please enter a valid quantity."));
					return;
				}

				frappe.new_doc("Stock Entry", {}, (doc) => {

					doc.stock_entry_type = "Material Transfer";
					doc.items = [];

					(item.components || []).forEach((component) => {

						const row = frappe.model.add_child(
							doc,
							"Stock Entry Detail",
							"items"
						);

						row.item_code = component.item_code;
						row.item_name = component.item_name;
						row.qty = component.qty;
						row.uom = component.uom;
						// row.s_warehouse = source_warehouse;

					});

					const cut_row = frappe.model.add_child(
						doc,
						"Stock Entry Detail",
						"items"
					);

					cut_row.item_code = item.cut_item_code;
					cut_row.item_name = item.cut_item_name;
					cut_row.qty = qty;
					// cut_row.t_warehouse = target_warehouse;


					// const source_row = frappe.model.add_child(
					// 	doc,
					// 	"Stock Entry Detail",
					// 	"items"
					// );

					// source_row.item_code = item.source_item;
					// source_row.item_name = item.source_item_name;
					// source_row.qty = qty;
				});
			});

	}
}