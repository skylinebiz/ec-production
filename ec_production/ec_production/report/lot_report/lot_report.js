frappe.query_reports["Lot Report"] = {
    filters: [
        {
            fieldname: "ec_lot",
            label: __("EC Lot"),
            fieldtype: "Link",
            options: "EC Lot",
            reqd: 1
        },
        {
            fieldname: "include_drafts",
            label: __("Include Drafts"),
            fieldtype: "Check",
            default: 1
        }
    ]
};
