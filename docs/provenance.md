# What was extracted and what is new

[Back to the project](../README.md)

Allure ERP grew from an internal operations application built for Allure Laboratories. This repository is a separate private release candidate with a limited first manufacturing module. It does not contain the private application's Git history, datasets, customer documents, credentials or operational repair scripts.

| Candidate component | Provenance |
| --- | --- |
| `src/po-quantities.mjs` | Adapted from the internal `po-quantities.ts` module. Type annotations were removed for direct use in browsers and Node. It preserves signed invoice balances and caps fulfilment per product line. |
| `src/manufacturing.mjs` | New manufacturing workflow implementation. It applies lessons from the internal system's separation of physical and commercial quantities, evidence-backed decisions and explicit state changes. It is not an extraction of a production-certified batch/QC system. |
| `src/finance.mjs` and `src/finance-import.mjs` | New portable operational sub-ledger, cash projections, mapped CSV import and explicit review rules. Inspired by internal workflows; not a direct port of the complete Python finance engine. |
| `demo/finance-seed.mjs` | Invented USD accounts, invoices, bank references, historical statements and planning assumptions. No real financial records. |
| `src/product-costs.mjs`, `src/demand-planner.mjs` and `src/work-items.mjs` | New portable product estimates, physical-demand projections and source-derived review queue. Informed by internal workflow needs; no internal costing or forecasting engine was copied. |
| `demo/planning-seed.mjs` | Invented quotations, product cost versions, unconfirmed demand and owner notes. No real prices, customers or operating results. |
| `demo/seed.mjs` | Invented company, products, material lots, recipes, batches, inspection outcomes and orders. No source business records were transformed into these fixtures. |
| `demo/app.mjs` and styles | New interface designed around production and quality workflows. |
| Documentation and SVGs | New original guides and diagrams for this release. |

Company configuration, local persistence and production maps are also new implementations in this candidate. The finance preview likewise uses new portable code rather than importing the internal application or its databases.

The internal application also contains manufacturing costing, order matching, payment reconciliation, evidence management and monthly-close functions. The candidate now implements a limited independent version of payment allocation and period review. Its complete internal matching rules, source-specific repairs, cost engine and live adapters are not included. Their extraction needs separate data separation and validation. Four synthetic fee/receipt cases were compared privately with an isolated pure internal amount function; no internal module initialization or database refresh was run. This establishes only normalized cash-total agreement for those cases, not complete finance parity.

The repository's licence covers the code and original assets actually included here. Names and brand references identify the project and its origin; they do not grant endorsement or trademark rights.
