def get_data():
	return {
		# Report filter that receives this EC Lot's name when the report is
		# opened from the Connections panel
		"non_standard_fieldnames": {"Lot Report": "ec_lot"},
		"reports": [{"label": "Reports", "items": ["Lot Report"]}],
	}
