// Entirely fictional multi-year finance history. No internal financial records.
import { workspaceTransition } from "../src/workspace.mjs";
export function addSampleFinance(input) {
  let state = input;
  const run = (action) =>
    (state = workspaceTransition(state, action, {
      actor: "Elena Brooks · Finance",
      at: "2026-09-30T18:00:00.000Z",
    }));
  run({ type: "finance_configure", currency: "USD", fiscalStartMonth: 4 });
  for (const [id, name, openingMinor] of [
    ["BANK", "Operating account", 500000],
    ["RESERVE", "Reserve account", 200000],
  ])
    run({
      type: "finance_account",
      id,
      name,
      openingDate: "2024-01-01",
      openingMinor,
    });
  const doc = (id, kind, party, date, due, total, po = {}) =>
    run({
      type: "finance_document",
      id,
      reference: id,
      kind,
      party,
      issueDate: date,
      dueDate: due,
      totalMinor: total,
      evidence: `Fictional document ${id}`,
      terms: "Payment on the stated due date",
      ...po,
    });
  const txn = (
    id,
    date,
    direction,
    value,
    party,
    category,
    description,
    extra = {},
  ) =>
    run({
      type: "finance_transaction",
      id,
      reference: id,
      accountId: "BANK",
      date,
      direction,
      amountMinor: value,
      party,
      category,
      description,
      ...extra,
    });
  const allocation = (transactionId, documentId, date, amountMinor) =>
    run({
      type: "finance_allocate",
      transactionId,
      documentId,
      date,
      amountMinor,
      evidence: "Bank reference and fictional invoice reviewed",
    });
  doc(
    "SALE-2024-014",
    "receivable",
    "Willow Salon Group",
    "2024-02-01",
    "2024-02-20",
    100000,
  );
  txn(
    "BANK-240220",
    "2024-02-20",
    "in",
    100000,
    "Willow Salon Group",
    "customer_receipt",
    "Settlement SALE-2024-014",
  );
  allocation("BANK-240220", "SALE-2024-014", "2024-02-20", 100000);
  txn(
    "RENT-240201",
    "2024-02-01",
    "out",
    40000,
    "Riverside Estates",
    "rent",
    "February workshop rent",
  );
  doc(
    "SALE-2025-031",
    "receivable",
    "Northline Salon Supply",
    "2025-06-03",
    "2025-06-30",
    200000,
  );
  txn(
    "BANK-250630",
    "2025-06-30",
    "in",
    200000,
    "Northline Salon Supply",
    "customer_receipt",
    "Settlement SALE-2025-031",
  );
  allocation("BANK-250630", "SALE-2025-031", "2025-06-30", 200000);
  doc(
    "SUP-2025-018",
    "payable",
    "Westmere Packaging",
    "2025-06-10",
    "2025-06-25",
    60000,
  );
  txn(
    "BANK-250625",
    "2025-06-25",
    "out",
    60000,
    "Westmere Packaging",
    "supplier_payment",
    "Settlement SUP-2025-018",
  );
  allocation("BANK-250625", "SUP-2025-018", "2025-06-25", 60000);
  for (const [accountId, balance] of [
    ["BANK", 700000],
    ["RESERVE", 200000],
  ])
    run({
      type: "finance_statement",
      id: `ST-${accountId}-2512`,
      accountId,
      startDate: "2025-12-01",
      endDate: "2025-12-31",
      openingMinor: balance,
      closingMinor: balance,
      evidence: "Fictional December 2025 statement",
    });
  run({
    type: "finance_close",
    month: "2025-12",
    note: "Fictional December statement balances and allocations reviewed. Earlier gaps remain visible in history.",
  });
  run({
    type: "finance_po_terms",
    id: "TERMS-SUP-041",
    poType: "supplier",
    poId: "SPO-2609-041",
    terms: "30% deposit; remainder on delivery",
    installments: [
      { date: "2026-09-20", amountMinor: 30000 },
      { date: "2026-10-15", amountMinor: 70000 },
    ],
  });
  run({
    type: "finance_po_terms",
    id: "TERMS-CUST-215",
    poType: "customer",
    poId: "CPO-2609-215",
    terms: "Customer deposit; balance due 20 October",
    installments: [
      { date: "2026-09-22", amountMinor: 30000 },
      { date: "2026-10-20", amountMinor: 240000 },
    ],
  });
  txn(
    "DEP-SUP-260920",
    "2026-09-20",
    "out",
    30000,
    "Westmere Packaging",
    "advance",
    "Packaging PO deposit",
    { poType: "supplier", poId: "SPO-2609-041" },
  );
  txn(
    "DEP-CUST-260922",
    "2026-09-22",
    "in",
    30000,
    "Harbour House Hotels",
    "advance",
    "Customer PO deposit",
    { poType: "customer", poId: "CPO-2609-215" },
  );
  doc(
    "SUP-2026-041",
    "payable",
    "Westmere Packaging",
    "2026-09-24",
    "2026-10-15",
    100000,
    { poType: "supplier", poId: "SPO-2609-041" },
  );
  allocation("DEP-SUP-260920", "SUP-2026-041", "2026-09-24", 30000);
  run({
    type: "finance_credit",
    id: "CN-260926",
    documentId: "SUP-2026-041",
    date: "2026-09-26",
    amountMinor: 5000,
    evidence: "Fictional agreed packaging price adjustment",
  });
  doc(
    "SALE-2026-215",
    "receivable",
    "Harbour House Hotels",
    "2026-09-29",
    "2026-10-20",
    270000,
    { poType: "customer", poId: "CPO-2609-215" },
  );
  allocation("DEP-CUST-260922", "SALE-2026-215", "2026-09-29", 30000);
  doc(
    "FREIGHT-260925",
    "payable",
    "Oakbridge Carriers",
    "2026-09-25",
    "2026-09-30",
    12500,
  );
  txn(
    "BANK-260929",
    "2026-09-29",
    "out",
    12500,
    "Oakbridge Carriers",
    "unclassified",
    "FREIGHT-260925 transport payment",
  );
  txn(
    "RENT-260901",
    "2026-09-01",
    "out",
    45000,
    "Riverside Estates",
    "rent",
    "September workshop rent",
  );
  txn(
    "FEE-260930",
    "2026-09-30",
    "out",
    150,
    "Sample Bank",
    "bank_fee",
    "Monthly account fee",
  );
  txn(
    "MOVE-OUT-260915",
    "2026-09-15",
    "out",
    50000,
    "Alder & Coast",
    "other",
    "Move to reserve",
  );
  txn(
    "MOVE-IN-260915",
    "2026-09-15",
    "in",
    50000,
    "Alder & Coast",
    "other",
    "Move from operating",
    { accountId: "RESERVE" },
  );
  run({
    type: "finance_transfer",
    firstId: "MOVE-OUT-260915",
    secondId: "MOVE-IN-260915",
  });
  for (const [accountId, openingMinor, closingMinor] of [
    ["BANK", 700000, 592350],
    ["RESERVE", 200000, 250000],
  ])
    run({
      type: "finance_statement",
      id: `ST-${accountId}-2609`,
      accountId,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      openingMinor,
      closingMinor,
      evidence: "Fictional September 2026 statement",
    });
  for (const [id, name, date, amountMinor] of [
    ["RENT", "Workshop rent", "2026-10-01", 45000],
    ["PAYROLL", "Team payroll", "2026-10-28", 120000],
    ["UTILITIES", "Utilities estimate", "2026-10-12", 12000],
  ])
    run({
      type: "finance_assumption",
      id,
      name,
      date,
      amountMinor,
      direction: "out",
      repeat: "monthly",
      endDate: "2027-09-30",
    });
  return state;
}
