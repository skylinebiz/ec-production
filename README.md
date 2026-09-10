### Ec Production

### Doctypes

- **EC Item Operation Rate** — per-item, per-operation rate master.
- **EC Lot** — a lot of items available to be processed against an operation.
- **EC Process Lot** — records qty actually processed per item/operation against an `EC Lot`;
  submittable, with quantity validated against what's already been processed and what the `EC Lot`
  allows.

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
