# Allure ERP — interactive demo

**[Open the demo ↗](https://gab-rav.github.io/allure-erp-demo/)**

A manufacturing workspace connecting materials, production batches, quality release, customer shipments and cash planning. Built by [Gabriel Ravindran](https://www.gabrielrav.com/) from lessons in Allure Laboratories' internal operations.

This repository contains the browser demo distribution. The application repository and its development history remain private while an open-source release is prepared.

All companies, people, recipes, prices and financial records in the sample are fictional.

## Try these workflows

1. **Overview:** explore five batches across two plants. Filter by plant or status and inspect work needing attention.
2. **Production maps:** select the Coconut & Vanilla conditioner batch. Follow its input lots, 480 finished units, 420 shipped units and 60 units of remaining stock. Select a node to inspect its record.
3. **Quality control:** inspect the shampoo batch on hold, record a passing retest and review the separate release decision.
4. **Purchase orders:** switch between customer and supplier orders to see partial shipments and material receipts.
5. **Finance:** switch work areas to explore fictional USD cash history, reconciliation and the 13-week forecast.
6. **Demand planner and Product costs:** inspect production proposals, material shortages and saved cost estimates.

Changes are saved in this browser only. They are not shared with other visitors or sent to an Allure ERP backend. Use **Reset sample**, then **Confirm reset**, to restore the starting records. Use fictional data only.

## Scope and limits

This is an early interactive product demo, not a shared factory system. It demonstrates workflow rules and linked records; it does not establish factory adoption or regulatory compliance.

- No login, team permissions or shared database.
- Browser storage can be cleared and is not a backup. Multiple tabs are not coordinated.
- Batch tracing records quantities and destinations, not individually numbered units.
- Material issue is distinct from measured consumption. Scrap, rework and post-release holds remain future work.
- Finance is a single-currency operational sub-ledger, not a full accounting or tax system.
- Live connectors, correction/reversal workflows and tested operational recovery remain future work.

GitHub Pages serves these static files. This distribution contains no internal Allure records, server workspace files or credentials. The JavaScript needed to run the demo is included; the local workspace server and private repository history are not.

## Feedback

Use this repository's issues for demo feedback. Describe the screen, your action and the result you expected. Do not include real company records, formulations, bank files or credentials. For security concerns, use the contact link on [gabrielrav.com](https://www.gabrielrav.com/).

Code and original assets in this distribution are covered by [Apache-2.0](LICENSE). See [NOTICE](NOTICE) and the [provenance notes](docs/provenance.md).
