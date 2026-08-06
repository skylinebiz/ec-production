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

	// constructor(page) {
	// 	this.page = page;

	// 	this.wrapper = $(`
	// 		<div class="production-processor container-fluid py-4"></div>
	// 	`).appendTo(this.page.body);

	// 	this.make_filters();
	// 	this.make_dashboard();
	// 	this.make_employee_section();
	// 	this.make_table();
	// }

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
			summary[row.item_name].pending += flt(row.pending_qty);

		});

		Object.values(summary).forEach(item => {
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

			<div class="card-header">
				<h5 class="mb-0">Job Cards</h5>
			</div>

			<div class="table-responsive" style="overflow:visible;">

				<table class="table table-hover align-middle mb-0">

					<thead>

						<tr>
							<th class="text-center" style="width:160px">Job Card</th>
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

		this.tbody.empty();

		if (!rows.length) {

			this.tbody.append(`
			<tr>
				<td colspan="7" class="text-center text-muted py-5">
					No Job Cards Found
				</td>
			</tr>
		`);

			return;
		}

		rows.forEach(row => {

			const tr = $(`
			<tr>

				<td class="text-center align-middle" >${row.job_card}</td>

				<td class="text-center align-middle" >${row.work_order}</td>

				<td class="text-center align-middle">${row.item_name}</td>

				<td class="employee-cell"></td>

				<td class="text-center align-middle" >
					${frappe.format(row.for_quantity, {
				fieldtype: "Float"
			})}
				</td>

				<td class=" text-center align-middle received-qty-cell"></td>	

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
}