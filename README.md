### Ec Production

### Doctypes

- **EC Item Operation Rate** — per-item, per-operation rate master.
- **EC Lot** — a lot of items available to be processed against an operation. Tracks Pending Qty and
  Received Qty per item/operation, rolled up from submitted `EC Job Order`, `EC Job Receipt`, and
  `EC Process Lot` records.
- **EC Process Lot** — records qty actually processed per item/operation against an `EC Lot`;
  submittable, with quantity validated against the Lot's available capacity, and updates the Lot's
  Received Qty on submit/cancel.
- **EC Job Order** — submittable; a batch of work assigned per Employee/Lot/Item/Operation, validated
  against the Lot's available capacity at submit time. A submitted Job Order exposes a "Process
  Receipt" button that creates and submits a matching `EC Job Receipt` for whatever's still pending.
- **EC Job Receipt** — submittable; records qty received against a matching `EC Job Order` (resolved
  server-side from Employee/Lot/Item/Operation), and updates both the Job Order's received qty and
  the Lot's Received Qty on submit/cancel.

See [CHANGELOG.md](CHANGELOG.md) for version history and [RELEASE.md](RELEASE.md) for release/deploy
notes.

### Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch main
bench install-app ec_production
```

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/ec_production
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit
