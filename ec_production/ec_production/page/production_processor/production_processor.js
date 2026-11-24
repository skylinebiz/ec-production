frappe.pages['production-processor'].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Production Processor'),
		single_column: true
	});

	wrapper.production_processor = new ProductionProcessor(page);
};

frappe.pages['production-processor'].on_page_show = function (wrapper) {
	const processor = wrapper.production_processor;
	const plan = frappe.route_options && frappe.route_options.production_plan;

	if (processor && plan) {
		frappe.route_options = null;
		processor.production_plan.set_value(plan).then(() => processor.load_data());
	}
};

const PP_STYLE = `
	.production-processor {
		padding: var(--padding-md) 15px var(--padding-xl);
	}
	.production-processor .pp-card {
		background: var(--card-bg);
		border: 1px solid var(--border-color);
		border-radius: var(--border-radius-md);
		box-shadow: var(--card-shadow);
		margin-bottom: var(--margin-lg);
	}
	.production-processor .pp-filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--padding-md) var(--padding-lg);
		align-items: flex-end;
		padding: var(--padding-md) var(--padding-lg);
	}
	.production-processor .pp-filters > .pp-filter { flex: 1 1 220px; min-width: 200px; }
	.production-processor .pp-filters .form-group { margin-bottom: 0; }
	.production-processor .pp-filters .pp-filter-actions { display: flex; gap: var(--padding-sm); flex: 0 0 auto; }
	.production-processor .pp-filters .pp-load-btn { min-width: 120px; height: 28px; }
	.production-processor .pp-section { margin-bottom: var(--margin-lg); }
	.production-processor .pp-section-title {
		font-size: var(--text-base); font-weight: 600; color: var(--heading-color);
		margin: 0 0 var(--padding-sm) 2px;
	}
	.production-processor .pp-employee-section { align-items: center; }
	.production-processor .pp-employee-section .pp-filter { flex: 0 1 360px; }
	.production-processor .pp-tip {
		flex: 1 1 300px;
		padding: var(--padding-sm) var(--padding-md);
		border-radius: var(--border-radius);
		background: var(--bg-blue);
		color: var(--text-on-blue);
		font-size: var(--text-sm);
	}

	.production-processor .pp-summary {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
		gap: var(--padding-md);
	}
	.production-processor .pp-wo-card { padding: var(--padding-md) var(--padding-lg); margin-bottom: 0; }
	.production-processor .pp-wo-head { display: flex; justify-content: space-between; gap: var(--padding-sm); }
	.production-processor .pp-wo-item { font-weight: 600; color: var(--heading-color); }
	.production-processor .pp-wo-head > div { min-width: 0; }
	.production-processor .pp-wo-head .pp-wo-item,
	.production-processor .pp-wo-head a { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.production-processor .pp-wo-head > .text-right { flex: 0 0 auto; }
	.production-processor .pp-muted { color: var(--text-muted); font-size: var(--text-sm); }
	.production-processor .pp-stats { display: flex; gap: var(--padding-xl); margin: var(--padding-md) 0 var(--padding-sm); }
	.production-processor .pp-stats .pp-muted { margin-bottom: 2px; }
	.production-processor .pp-stat-value { font-size: var(--text-xl); font-weight: 600; color: var(--heading-color); }
	.production-processor .pp-progress { height: 6px; margin: 0 0 var(--padding-md); }
	.production-processor .pp-steps { display: flex; flex-wrap: wrap; gap: var(--padding-xs) 6px; }
	.production-processor .pp-step {
		display: inline-flex; align-items: center; gap: 4px;
		padding: 3px 10px; border-radius: 999px; font-size: var(--text-xs); white-space: nowrap;
		background: var(--bg-gray); color: var(--text-on-gray); border: 1px solid var(--border-color);
	}
	.production-processor .pp-step.done { background: var(--bg-green); color: var(--text-on-green); border-color: transparent; }
	.production-processor .pp-step.active { background: var(--bg-blue); color: var(--text-on-blue); border-color: transparent; }
	.production-processor .pp-step.partial { background: var(--bg-orange); color: var(--text-on-orange); border-color: transparent; }

	.production-processor .pp-table-head {
		display: flex; justify-content: space-between; align-items: center;
		padding: var(--padding-md) var(--padding-lg);
		border-bottom: 1px solid var(--border-color);
	}
	.production-processor .pp-table-title { font-weight: 600; color: var(--heading-color); }
	.production-processor table.pp-table { width: 100%; margin: 0; }
	.production-processor table.pp-table th {
		font-size: var(--text-sm); font-weight: 500; color: var(--text-muted);
		background: var(--subtle-fg); white-space: nowrap;
		padding: var(--padding-sm) var(--padding-md);
		border-top: none;
	}
	.production-processor table.pp-table td {
		vertical-align: middle;
		padding: var(--padding-sm) var(--padding-md);
		border-top: 1px solid var(--border-color);
		white-space: nowrap;
	}
	.production-processor table.pp-table th:first-child,
	.production-processor table.pp-table td:first-child { padding-left: var(--padding-lg); }
	.production-processor table.pp-table th:last-child,
	.production-processor table.pp-table td:last-child { padding-right: var(--padding-lg); }
	.production-processor tr.pp-group td {
		background: var(--subtle-accent);
		font-weight: 600;
		color: var(--heading-color);
	}
	.production-processor tr.pp-done td:not(.pp-action) { color: var(--text-muted); }
	.production-processor tr.pp-running td { background: var(--bg-blue); }
	.production-processor .pp-seq {
		display: inline-flex; align-items: center; justify-content: center;
		width: 22px; height: 22px; border-radius: 50%;
		font-size: var(--text-xs); background: var(--bg-gray); color: var(--text-on-gray);
	}
	.production-processor tr.pp-done .pp-seq { background: var(--bg-green); color: var(--text-on-green); }
	.production-processor tr.pp-running .pp-seq { background: var(--card-bg); color: var(--text-on-blue); }
	.production-processor .pp-control .form-group { margin-bottom: 0; }
	.production-processor .pp-control { min-width: 160px; }
	.production-processor .pp-qty-control { width: 110px; display: inline-block; }
	.production-processor .pp-qty-control input { text-align: right; }
	.production-processor .pp-elapsed { font-variant-numeric: tabular-nums; font-size: var(--text-xs); color: var(--text-on-blue); margin-top: 2px; }
	.production-processor .pp-empty { padding: var(--padding-xl); text-align: center; color: var(--text-muted); }
	.production-processor .pp-num { text-align: right; white-space: nowrap; }
	.production-processor .pp-action { text-align: right; white-space: nowrap; }
	.production-processor .pp-actions { display: inline-flex; gap: 6px; justify-content: flex-end; }
	.production-processor .pp-actions .btn { min-width: 64px; }

	/* RM Processing dialog (styles only: content is built by the tabs) */
	.pp-rm-dialog .modal-dialog { max-width: min(1320px, 96vw); }
	.pp-rm-dialog .modal-body { padding: var(--padding-md) var(--padding-lg) var(--padding-lg); }
	.pp-rm-dialog .frappe-control[data-fieldname="process"] { max-width: 360px; margin-bottom: var(--margin-md); }
	.pp-rm-dialog .table-responsive {
		border: 1px solid var(--border-color);
		border-radius: var(--border-radius-md);
		overflow: auto !important;
		max-height: 65vh;
	}
	.pp-rm-dialog table.table-bordered { margin: 0; border: none; }
	.pp-rm-dialog table.table-bordered th,
	.pp-rm-dialog table.table-bordered td {
		border-left: none; border-right: none;
		border-color: var(--border-color);
		padding: var(--padding-sm) 10px;
		vertical-align: top;
	}
	.pp-rm-dialog table.table-bordered thead th {
		position: sticky; top: 0; z-index: 1;
		background: var(--subtle-fg);
		border-top: none; border-bottom: 1px solid var(--border-color);
		font-size: var(--text-sm); font-weight: 500; color: var(--text-muted);
		white-space: nowrap;
	}
	.pp-rm-dialog table.table-bordered tbody tr:hover td { background: var(--subtle-accent); }
	.pp-rm-dialog table.table-bordered td:nth-child(1),
	.pp-rm-dialog table.table-bordered td:nth-child(2) { white-space: nowrap; }
	.pp-rm-dialog table.table-bordered td strong { color: var(--heading-color); font-weight: 600; }
	.pp-rm-dialog table.table-bordered td .small { font-size: var(--text-xs); line-height: 1.5; }
	.pp-rm-dialog .rm-bom-control { min-width: 230px; }
	.pp-rm-dialog table.table-bordered td:nth-child(3) strong,
	.pp-rm-dialog table.table-bordered td:nth-child(4) strong { white-space: nowrap; }
	.pp-rm-dialog .rm-bom-control .form-group,
	.pp-rm-dialog td .frappe-control { margin-bottom: 0; }
	.pp-rm-dialog .rm-components { min-width: 170px; }
	.pp-rm-dialog .rm-components > div {
		padding: 4px 8px;
		margin-bottom: 4px !important;
		border-radius: var(--border-radius-sm);
		background: var(--subtle-fg);
		font-size: var(--text-sm);
	}
	.pp-rm-dialog .rm-components > div:last-child { margin-bottom: 0 !important; }
	.pp-rm-dialog td input.form-control { min-width: 110px; text-align: right; }
	.pp-rm-dialog td .btn { white-space: nowrap; }
	.pp-rm-dialog td .btn .fa { margin-right: 4px; }
	.pp-rm-dialog .alert { border-radius: var(--border-radius-md); margin: 0; }
`;

class ProductionProcessor {
	constructor(page) {
		this.page = page;
		this.rows = [];

		if (!document.getElementById("production-processor-style")) {
			$(`<style id="production-processor-style">${PP_STYLE}</style>`).appendTo("head");
		}

		this.wrapper = $(`
			<div class="production-processor"></div>
		`).appendTo(this.page.body);

		this.page.add_inner_button(__("RM Processing"), () => this.open_rm_processing());

		this.make_filters();
		this.make_dashboard();
		this.make_employee_section();
		this.make_table();
		this.start_clock();
	}

	// ---------------------------------------------------------------
	// Layout
	// ---------------------------------------------------------------

	make_filters() {
		const row = $(`
			<div class="pp-card pp-filters">
				<div class="pp-filter production-plan"></div>
				<div class="pp-filter operation"></div>
				<div class="pp-filter-actions">
					<button class="btn btn-primary btn-sm pp-load-btn">
						${frappe.utils.icon("refresh", "xs")} ${__("Load")}
					</button>
				</div>
			</div>
		`).appendTo(this.wrapper);

		this.production_plan = frappe.ui.form.make_control({
			parent: row.find(".production-plan"),
			df: {
				fieldtype: "Link",
				label: __("Production Plan"),
				options: "Production Plan",
				reqd: 1,
				get_query: () => ({ filters: { docstatus: 1 } })
			},
			render_input: true
		});

		this.operation = frappe.ui.form.make_control({
			parent: row.find(".operation"),
			df: {
				fieldtype: "Link",
				label: __("Operation"),
				options: "Operation",
				placeholder: __("All Operations")
			},
			render_input: true
		});

		row.find(".pp-load-btn").on("click", () => this.load_data());
	}

	make_dashboard() {
		this.dashboard_section = $(`
			<div class="pp-section" style="display: none">
				<div class="pp-section-title">${__("Production Summary")}</div>
				<div class="pp-summary"></div>
			</div>
		`).appendTo(this.wrapper);

		this.dashboard = this.dashboard_section.find(".pp-summary");
	}

	make_employee_section() {
		const section = $(`
			<div class="pp-card pp-filters pp-employee-section">
				<div class="pp-filter employee"></div>
				<div class="pp-tip">
					${__("Select an employee here to fill it on every Job Card that can be started.")}
				</div>
			</div>
		`).appendTo(this.wrapper);

		this.employee = frappe.ui.form.make_control({
			parent: section.find(".employee"),
			df: {
				fieldtype: "Link",
				label: __("Employee (apply to all)"),
				options: "Employee",
				change: () => this.apply_employee_to_all()
			},
			render_input: true
		});
	}

	make_table() {
		this.table = $(`
			<div class="pp-card">
				<div class="pp-table-head">
					<span class="pp-table-title">${__("Job Cards")}</span>
					<span class="pp-muted pp-count"></span>
				</div>
				<div class="table-responsive">
					<table class="table pp-table">
						<thead>
							<tr>
								<th style="width: 44px">#</th>
								<th>${__("Operation")}</th>
								<th>${__("Job Card")}</th>
								<th style="width: 230px">${__("Employee")}</th>
								<th class="pp-num">${__("Job Qty")}</th>
								<th class="pp-num" style="width: 150px">${__("Recd Qty")}</th>
								<th style="width: 150px">${__("Status")}</th>
								<th class="pp-action" style="width: 170px">${__("Action")}</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>
				</div>
			</div>
		`).appendTo(this.wrapper);

		this.tbody = this.table.find("tbody");
		this.render_empty(__("Select a Production Plan to see its Job Cards."));
	}

	render_empty(message) {
		this.dashboard.empty();
		this.dashboard_section.hide();
		this.table.find(".pp-count").text("");
		this.tbody.html(`
			<tr><td colspan="8" class="pp-empty">${message}</td></tr>
		`);
	}

	// ---------------------------------------------------------------
	// Data
	// ---------------------------------------------------------------

	load_data() {
		const production_plan = this.production_plan.get_value();

		if (!production_plan) {
			this.rows = [];
			this.render_empty(__("Select a Production Plan to see its Job Cards."));
			return;
		}

		return frappe.call({
			method: "ec_production.api.production_processor.load_job_cards",
			args: {
				production_plan,
				operation: this.operation.get_value()
			},
			freeze: true,
			freeze_message: __("Loading Job Cards..."),
			callback: (r) => {
				this.rows = r.message || [];
				this.render();
			}
		});
	}

	render() {
		if (!this.rows.length) {
			this.render_empty(__("No Job Cards found for this Production Plan."));
			return;
		}

		this.render_dashboard();
		this.render_table();
		this.apply_employee_to_all();
		this.tick();
	}

	group_by_work_order() {
		// Rows already come in Work Order, then operation order
		const groups = [];
		const index = {};

		this.rows.forEach(row => {
			if (!(row.work_order in index)) {
				index[row.work_order] = groups.length;
				groups.push({
					work_order: row.work_order,
					item_code: row.item_code,
					item_name: row.item_name,
					wo_qty: flt(row.wo_qty),
					produced_qty: flt(row.wo_produced_qty),
					wo_status: row.wo_status,
					rows: []
				});
			}
			groups[index[row.work_order]].rows.push(row);
		});

		return groups;
	}

	// ---------------------------------------------------------------
	// Summary: one card per Work Order, with its operations in order
	// ---------------------------------------------------------------

	render_dashboard() {
		this.dashboard.empty();
		this.dashboard_section.show();

		this.group_by_work_order().forEach(group => {
			const operations = [];
			const by_operation = {};

			group.rows.forEach(row => {
				if (!(row.operation in by_operation)) {
					by_operation[row.operation] = operations.length;
					operations.push({ operation: row.operation, done: 0, running: false });
				}
				const op = operations[by_operation[row.operation]];
				op.done += flt(row.total_completed_qty);
				op.running = op.running || !!row.is_timer_running;
			});

			const wo_qty = group.wo_qty || 1;
			const percent = Math.min(100, Math.round((group.produced_qty / wo_qty) * 100));

			const steps = operations.map((op, i) => {
				let cls = "";
				let icon = "";
				if (op.done >= group.wo_qty) {
					cls = "done";
					icon = "✓";
				} else if (op.running) {
					cls = "active";
					icon = "●";
				} else if (op.done > 0) {
					cls = "partial";
				}
				return `
					<span class="pp-step ${cls}" title="${frappe.utils.escape_html(op.operation)}: ${format_qty(op.done)} / ${format_qty(group.wo_qty)}">
						${icon} ${i + 1}. ${frappe.utils.escape_html(op.operation)}
						<span>${format_qty(op.done)}/${format_qty(group.wo_qty)}</span>
					</span>
				`;
			}).join("");

			$(`
				<div class="pp-card pp-wo-card">
					<div class="pp-wo-head">
						<div>
							<div class="pp-wo-item">${frappe.utils.escape_html(group.item_code || "")}</div>
							<div class="pp-muted">${frappe.utils.escape_html(group.item_name && group.item_name !== group.item_code ? group.item_name : "")}</div>
						</div>
						<div class="text-right">
							<a class="pp-muted" href="/app/work-order/${encodeURIComponent(group.work_order)}" target="_blank">
								${frappe.utils.escape_html(group.work_order)}
							</a>
							<div class="pp-muted">${frappe.utils.escape_html(__(group.wo_status || ""))}</div>
						</div>
					</div>

					<div class="pp-stats">
						<div>
							<div class="pp-muted">${__("WO Qty")}</div>
							<div class="pp-stat-value">${format_qty(group.wo_qty)}</div>
						</div>
						<div>
							<div class="pp-muted">${__("Produced")}</div>
							<div class="pp-stat-value text-success">${format_qty(group.produced_qty)}</div>
						</div>
						<div>
							<div class="pp-muted">${__("Pending")}</div>
							<div class="pp-stat-value text-warning">${format_qty(Math.max(0, group.wo_qty - group.produced_qty))}</div>
						</div>
					</div>

					<div class="progress pp-progress">
						<div class="progress-bar bg-success" style="width: ${percent}%"></div>
					</div>

					<div class="pp-steps">${steps}</div>
				</div>
			`).appendTo(this.dashboard);
		});
	}

	// ---------------------------------------------------------------
	// Table: grouped by Work Order, operations in Work Order order
	// ---------------------------------------------------------------

	render_table() {
		this.tbody.empty();

		const running = this.rows.filter(r => r.is_timer_running).length;
		const open = this.rows.filter(r => r.docstatus === 0).length;
		this.table.find(".pp-count").text(
			__("{0} Job Cards · {1} open · {2} running", [this.rows.length, open, running])
		);

		this.group_by_work_order().forEach(group => {
			this.tbody.append(`
				<tr class="pp-group">
					<td colspan="8">
						<a href="/app/work-order/${encodeURIComponent(group.work_order)}" target="_blank">
							${frappe.utils.escape_html(group.work_order)}
						</a>
						<span class="pp-muted"> · ${frappe.utils.escape_html(group.item_code || "")}
							· ${__("Qty")} ${format_qty(group.wo_qty)}</span>
					</td>
				</tr>
			`);

			let seq = 0;
			let last_operation = null;

			group.rows.forEach(row => {
				// Split Job Cards of the same operation share its number
				if (row.operation !== last_operation) {
					seq += 1;
					last_operation = row.operation;
				}
				this.render_row(row, seq);
			});
		});
	}

	render_row(row, seq) {
		row.employee_control = null;
		row.qty_control = null;

		const state = get_row_state(row);

		const tr = $(`
			<tr class="${state === "done" ? "pp-done" : ""} ${state === "running" ? "pp-running" : ""}">
				<td><span class="pp-seq">${seq}</span></td>
				<td>${frappe.utils.escape_html(row.operation || "")}</td>
				<td>
					<a href="/app/job-card/${encodeURIComponent(row.job_card)}" target="_blank">
						${frappe.utils.escape_html(row.job_card)}
					</a>
				</td>
				<td class="pp-employee"></td>
				<td class="pp-num">${this.render_job_qty(row)}</td>
				<td class="pp-num pp-recd"></td>
				<td>${this.render_status(row, state)}</td>
				<td class="pp-action"></td>
			</tr>
		`).appendTo(this.tbody);

		this.render_employee(tr.find(".pp-employee"), row, state);
		this.render_received_qty(tr.find(".pp-recd"), row, state);
		this.render_action(tr.find(".pp-action"), row, state);
	}

	render_job_qty(row) {
		const total = format_qty(row.for_quantity);

		if (row.docstatus === 0 && flt(row.total_completed_qty) > 0) {
			return `${total}<div class="pp-muted">${__("{0} left", [format_qty(row.remaining_qty)])}</div>`;
		}

		return total;
	}

	render_status(row, state) {
		const map = {
			running: ["blue", __("Running")],
			paused: ["orange", __("On Hold")],
			started: ["orange", __("In Progress")],
			ready: ["gray", __("Ready")],
			done: ["green", __("Completed")]
		};

		const [color, label] = map[state] || ["gray", __(row.status)];

		let html = `<span class="indicator-pill ${color}">${label}</span>`;

		if (state === "running") {
			html += `<div class="pp-elapsed" data-start="${frappe.utils.escape_html(row.timer_started_at)}"></div>`;
		}

		return html;
	}

	render_employee(cell, row, state) {
		if (state === "done" || state === "running") {
			cell.html(frappe.utils.escape_html(row.employee_name || row.employee || "–"));
			return;
		}

		const wrapper = $(`<div class="pp-control"></div>`).appendTo(cell);

		row.employee_control = frappe.ui.form.make_control({
			parent: wrapper,
			df: {
				fieldtype: "Link",
				options: "Employee",
				placeholder: __("Employee")
			},
			only_input: true,
			render_input: true
		});

		row.employee_control.set_value(row.employee || "");
	}

	render_received_qty(cell, row, state) {
		// Qty is asked for whenever the card can be stopped
		if (state !== "running" && state !== "paused") {
			cell.html(format_qty(row.total_completed_qty));
			return;
		}

		// A plain number input: the Float control pads values to the
		// system precision (40 shows as 40.000)
		const wrapper = $(`<div class="pp-control pp-qty-control"></div>`).appendTo(cell);
		const $input = $(`<input type="number" class="form-control input-xs" min="0" step="1">`)
			.attr({ max: flt(row.remaining_qty), placeholder: __("Qty") })
			.val(flt(row.remaining_qty, 3))
			.appendTo(wrapper);

		row.qty_control = {
			$input,
			get_value: () => flt($input.val())
		};
		cell.append(`<div class="pp-muted">${__("of {0}", [format_qty(row.remaining_qty)])}</div>`);
	}

	render_action(cell, row, state) {
		if (state === "done") {
			cell.html(`<span class="text-success">${frappe.utils.icon("check", "sm")} ${__("Done")}</span>`);
			return;
		}

		const group = $(`<div class="pp-actions"></div>`).appendTo(cell);
		const add = (label, cls, handler) => {
			const btn = $(`<button class="btn btn-sm ${cls}">${label}</button>`).appendTo(group);
			btn.on("click", () => handler(btn));
		};

		// Running: Hold | Stop · On Hold: Resume | Stop · otherwise: Start
		if (state === "running") {
			add(__("Hold"), "btn-default", btn => this.hold_timer(row, btn));
			add(__("Stop"), "btn-danger", btn => this.stop_timer(row, btn));
			return;
		}

		if (state === "paused") {
			add(__("Resume"), "btn-primary", btn => this.start_timer(row, btn));
			add(__("Stop"), "btn-danger", btn => this.stop_timer(row, btn));
			return;
		}

		add(__("Start"), "btn-primary", btn => this.start_timer(row, btn));
	}

	apply_employee_to_all() {
		const employee = this.employee && this.employee.get_value();

		if (!employee) {
			return;
		}

		this.rows.forEach(row => {
			if (row.employee_control) {
				row.employee_control.set_value(employee);
			}
		});
	}

	// ---------------------------------------------------------------
	// Running timers
	// ---------------------------------------------------------------

	start_clock() {
		if (this.clock) {
			return;
		}
		this.clock = setInterval(() => this.tick(), 1000);
	}

	tick() {
		const now = moment(frappe.datetime.now_datetime());

		this.tbody.find(".pp-elapsed").each(function () {
			const start = $(this).attr("data-start");
			if (!start) {
				return;
			}
			const seconds = Math.max(0, now.diff(moment(start), "seconds"));
			$(this).text(format_duration(seconds));
		});
	}

	// ---------------------------------------------------------------
	// Actions
	// ---------------------------------------------------------------

	start_timer(row, btn) {
		const employee = row.employee_control && row.employee_control.get_value();

		if (!employee) {
			frappe.show_alert({ message: __("Please select an Employee for {0}", [row.job_card]), indicator: "orange" });
			row.employee_control && row.employee_control.$input.focus();
			return;
		}

		btn.prop("disabled", true);

		frappe.call({
			method: "ec_production.api.production_processor.start_job_timer",
			args: {
				job_card: row.job_card,
				employee
			},
			freeze: true,
			freeze_message: __("Starting Timer...")
		}).then(() => {
			frappe.show_alert({ message: __("{0} started", [row.job_card]), indicator: "blue" });
		}).always(() => {
			this.load_data();
		});
	}

	hold_timer(row, btn) {
		btn.prop("disabled", true);

		frappe.call({
			method: "ec_production.api.production_processor.hold_job_timer",
			args: {
				job_card: row.job_card
			},
			freeze: true,
			freeze_message: __("Putting On Hold...")
		}).then(() => {
			frappe.show_alert({ message: __("{0} is On Hold", [row.job_card]), indicator: "orange" });
		}).always(() => {
			this.load_data();
		});
	}

	stop_timer(row, btn) {
		const qty = flt(row.qty_control && row.qty_control.get_value());
		const remaining = flt(row.remaining_qty);

		if (qty <= 0) {
			frappe.show_alert({ message: __("Please enter Received Qty for {0}", [row.job_card]), indicator: "orange" });
			row.qty_control && row.qty_control.$input.focus();
			return;
		}

		if (qty > remaining) {
			frappe.msgprint({
				title: __("Qty Exceeds Job Card"),
				message: __("Received Qty {0} cannot be more than the {1} left on {2}.", [
					format_qty(qty), format_qty(remaining), row.job_card
				]),
				indicator: "red"
			});
			return;
		}

		const submit = () => {
			btn.prop("disabled", true);

			frappe.call({
				method: "ec_production.api.production_processor.stop_job_timer",
				args: {
					job_card: row.job_card,
					qty
				},
				freeze: true,
				freeze_message: __("Completing Job Card...")
			}).then((r) => {
				const result = r.message || {};

				let message = __("{0} completed", [row.job_card]);
				if (result.new_job_card) {
					message += " · " + __("{0} created for the rest", [result.new_job_card]);
				}
				frappe.show_alert({ message, indicator: "green" }, 7);

				if (result.stock_entry) {
					frappe.show_alert({
						message: __("Manufacture Stock Entry {0} created", [result.stock_entry]),
						indicator: "green"
					}, 7);
				}

				if (result.stock_entry_error) {
					frappe.msgprint({
						title: __("Stock Entry not created"),
						message: result.stock_entry_error,
						indicator: "orange"
					});
				}
			}).always(() => {
				this.load_data();
			});
		};

		if (qty < remaining) {
			frappe.confirm(
				__("{0} of {1} will be completed on {2}, and a new Job Card will be created for the remaining {3}. Continue?", [
					format_qty(qty), format_qty(remaining), row.job_card, format_qty(remaining - qty)
				]),
				submit
			);
			return;
		}

		submit();
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

		dialog.$wrapper.addClass("pp-rm-dialog");
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
		// console.log(
		// 	"[RM ISSUE] Rendering items:",
		// 	rm_items
		// );

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
						step="1"
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

				if (qty > flt(item.job_qty)) {
					frappe.msgprint({
						title: __("Qty Exceeds Job Qty"),
						message: __("Qty {0} cannot be greater than the Job Qty {1} of {2}.", [
							qty, flt(item.job_qty), item.job_card
						]),
						indicator: "red"
					});
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
						step="1"
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

				if (qty > flt(item.job_qty)) {
					frappe.msgprint({
						title: __("Qty Exceeds Job Qty"),
						message: __("Qty {0} cannot be greater than the Job Qty {1} of {2}.", [
							qty, flt(item.job_qty), item.job_card
						]),
						indicator: "red"
					});
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


// What a Job Card row can do now
function get_row_state(row) {
	if (row.docstatus === 1 || row.status === "Completed") {
		return "done";
	}
	if (row.is_timer_running) {
		return "running";
	}
	if (row.is_paused) {
		return "paused";
	}
	if (flt(row.total_completed_qty) > 0) {
		return "started";
	}
	return "ready";
}

function format_qty(value) {
	const rounded = flt(value, 3);
	const decimals = (String(rounded).split(".")[1] || "").length;
	return format_number(rounded, null, decimals);
}

function format_duration(seconds) {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const pad = n => String(n).padStart(2, "0");
	return `${h ? h + ":" : ""}${pad(m)}:${pad(s)}`;
}
