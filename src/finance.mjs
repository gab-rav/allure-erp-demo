// Finance sub-ledger: exact minor-unit amounts, explicit allocations and dated evidence.
// No network calls, bank credentials, statutory accounting or foreign-exchange conversion.
export const CURRENCIES = {
  MYR: 2,
  GBP: 2,
  USD: 2,
  EUR: 2,
  SGD: 2,
  AUD: 2,
  JPY: 0,
};
export const CASH_CATEGORIES = [
  "unclassified",
  "customer_receipt",
  "supplier_payment",
  "advance",
  "wages",
  "rent",
  "utilities",
  "freight",
  "bank_fee",
  "tax",
  "owner_funding",
  "other",
];
const arrays = [
  "accounts",
  "documents",
  "credits",
  "transactions",
  "allocations",
  "rejections",
  "statements",
  "poTerms",
  "assumptions",
  "closes",
  "aliases",
];
const ensure = (value, message) => {
  if (!value) throw new Error(message);
};
const text = (value, label) => {
  ensure(
    typeof value === "string" && value.trim() && value.length <= 300,
    `${label} is required (up to 300 characters).`,
  );
  return value.trim();
};
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function day(value) {
  ensure(validDate(value), "Use a valid date in YYYY-MM-DD format.");
  return value;
}
const int = (value) =>
  Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000_000_000;
function amount(value, positive = true) {
  ensure(
    int(value) && (!positive || value > 0),
    "Enter a valid monetary amount within the supported range.",
  );
  return value;
}
export function sumMoney(values) {
  // Keep even large, offsetting histories exact before checking the final bound.
  const total = values.reduce((a, b) => a + BigInt(amount(b, false)), 0n);
  ensure(
    total >= -1_000_000_000_000n && total <= 1_000_000_000_000n,
    "The combined amount exceeds the supported range.",
  );
  return Number(total);
}
const find = (rows, id, label) => {
  const row = rows.find((r) => r.id === id);
  ensure(row, `${label} not found.`);
  return row;
};
const key = (value) => String(value).trim().toLowerCase().replace(/\s+/g, " ");
const unique = (rows, id) =>
  ensure(
    !rows.some((r) => key(r.id) === key(id)),
    "This reference already exists.",
  );
export const nextDay = (value) =>
  new Date(Date.parse(value) + 86400000).toISOString().slice(0, 10);
export function monthBounds(month) {
  ensure(
    /^\d{4}-\d{2}$/.test(month) && validDate(`${month}-01`),
    "Choose a valid month.",
  );
  const start = `${month}-01`;
  const end = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
  )
    .toISOString()
    .slice(0, 10);
  return { start, end };
}
export function parseMoney(value, currency = "GBP") {
  ensure(Object.hasOwn(CURRENCIES, currency), "Choose a supported currency.");
  const digits = CURRENCIES[currency],
    raw = String(value).trim();
  ensure(
    new RegExp(`^-?\\d+(?:\\.\\d{1,${digits || 1}})?$`).test(raw) &&
      (digits > 0 || !raw.includes(".")),
    `Enter an amount with at most ${digits} decimal places, without currency symbols or separators.`,
  );
  const negative = raw.startsWith("-"),
    [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
  const result =
    Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0") || 0);
  return amount(negative ? -result : result, false);
}
export function money(value, currency = "GBP") {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(value / 10 ** CURRENCIES[currency]);
}
export function newFinance(currency, fiscalStartMonth = 1) {
  return {
    version: 1,
    currency,
    fiscalStartMonth,
    matchingToleranceMinor: 0,
    ...Object.fromEntries(arrays.map((a) => [a, []])),
  };
}
export function poIdentity(state, type, id) {
  if (type === "supplier") {
    const po = find(state.supplierOrders ?? [], id, "Supplier PO");
    return { party: po.supplier, lines: po.lines, direction: "out" };
  }
  ensure(type === "customer", "Choose customer or supplier PO.");
  const lines = state.orders.filter((r) => (r.poReference ?? r.id) === id);
  ensure(lines.length, "Customer PO not found.");
  return { party: lines[0].customer, lines, direction: "in" };
}
const resolvedParty = (f, party) =>
  f.aliases.find((a) => key(a.alias) === key(party))?.party ?? party;
const sameParty = (f, a, b) =>
  key(resolvedParty(f, a)) === key(resolvedParty(f, b));
function checkPo(state, row) {
  if (!row.poId) {
    ensure(!row.poType && !row.poLineId, "Select a PO for this link.");
    return;
  }
  const po = poIdentity(state, row.poType, row.poId);
  ensure(
    sameParty(state.finance, row.party, po.party),
    "The party must match the linked PO.",
  );
  if (row.poLineId)
    ensure(
      po.lines.some((l) => l.id === row.poLineId),
      "PO line not found.",
    );
  if (row.kind)
    ensure(
      (row.kind === "payable" ? "out" : "in") === po.direction,
      "The invoice type must match the PO.",
    );
  if (row.direction)
    ensure(
      row.direction === po.direction,
      "The payment direction must match the PO.",
    );
}
export function documentBalance(f, doc, asOf = "9999-12-31") {
  const credits = sumMoney(
    f.credits
      .filter((c) => c.documentId === doc.id && c.date <= asOf)
      .map((c) => c.amountMinor),
  );
  const paid = sumMoney(
    f.allocations
      .filter((a) => a.documentId === doc.id && a.date <= asOf)
      .map((a) => a.amountMinor),
  );
  return {
    credits,
    paid,
    outstanding: doc.totalMinor - credits - paid,
    net: doc.totalMinor - credits,
  };
}
export function transactionRemaining(f, txn, asOf = "9999-12-31") {
  return (
    txn.amountMinor -
    sumMoney(
      f.allocations
        .filter((a) => a.transactionId === txn.id && a.date <= asOf)
        .map((a) => a.amountMinor),
    )
  );
}
export function accountBalance(f, account, asOf) {
  return sumMoney([
    account.openingMinor,
    ...f.transactions
      .filter((t) => t.accountId === account.id && t.date <= asOf)
      .map((t) => (t.direction === "in" ? t.amountMinor : -t.amountMinor)),
  ]);
}
function assertOpen(f, date) {
  ensure(
    !f.closes.some((c) => !c.reopenedAt && date <= monthBounds(c.month).end),
    "This date is in a closed period. Reopen the latest close with a reason before changing it.",
  );
}
function actualDate(state, value) {
  const result = day(value);
  ensure(
    result <= state.asOf,
    "Actual records cannot be dated after the workspace date. Use the forecast for future cash.",
  );
  assertOpen(state.finance, result);
  return result;
}
function evidence(value) {
  return text(value, "Evidence or source reference");
}
function entry(rows, row) {
  unique(rows, row.id);
  rows.push(row);
  return row;
}
function id(action) {
  return text(action.id, "Reference");
}
const linked = (action) => ({
  poType: action.poId ? action.poType : "",
  poId: action.poId || "",
  poLineId: action.poId ? action.poLineId || "" : "",
});

export function validateFinance(state) {
  const f = state.finance;
  if (!f) return;
  ensure(
    f.version === 1 && Object.hasOwn(CURRENCIES, f.currency),
    "Unsupported finance configuration.",
  );
  ensure(
    Number.isInteger(f.fiscalStartMonth) &&
      f.fiscalStartMonth >= 1 &&
      f.fiscalStartMonth <= 12,
    "Fiscal start month must be 1–12.",
  );
  ensure(
    int(f.matchingToleranceMinor) && f.matchingToleranceMinor >= 0,
    "Invalid matching tolerance.",
  );
  for (const a of arrays) {
    ensure(Array.isArray(f[a]), `Finance ${a} must be a list.`);
    ensure(
      new Set(f[a].map((r) => key(r.id))).size === f[a].length,
      `Finance ${a} references must be unique.`,
    );
    for (const r of f[a]) text(r.id, "Reference");
  }
  for (const a of f.aliases) {
    text(a.alias, "Alias");
    text(a.party, "Party");
    ensure(
      !f.aliases.some((b) => key(b.alias) === key(a.party)),
      "Aliases must point directly to a canonical party, without chains.",
    );
    ensure(
      !f.aliases.some((b) => b !== a && key(b.alias) === key(a.alias)),
      "This alias already exists.",
    );
  }
  for (const a of f.accounts) {
    text(a.name, "Account");
    day(a.openingDate);
    ensure(
      a.openingDate <= state.asOf,
      "Opening date is after the workspace date.",
    );
    amount(a.openingMinor, false);
  }
  for (const d of f.documents) {
    ensure(["payable", "receivable"].includes(d.kind), "Invalid invoice kind.");
    text(d.party, "Party");
    day(d.issueDate);
    ensure(d.issueDate <= state.asOf, "Invoice is after the workspace date.");
    text(d.reference, "Invoice reference");
    day(d.dueDate);
    ensure(d.dueDate >= d.issueDate, "Payment due date precedes the invoice.");
    amount(d.totalMinor);
    evidence(d.evidence);
    checkPo(state, d);
    ensure(
      documentBalance(f, d).outstanding >= 0,
      "Credits or payments exceed the invoice balance.",
    );
  }
  ensure(
    new Set(
      f.documents.map((d) => `${d.kind}|${key(d.party)}|${key(d.reference)}`),
    ).size === f.documents.length,
    "This invoice reference already exists for this party.",
  );
  for (const t of f.transactions) {
    const a = find(f.accounts, t.accountId, "Account");
    day(t.date);
    ensure(t.date <= state.asOf, "Bank movement is after the workspace date.");
    ensure(
      t.date >= a.openingDate,
      "A transaction precedes its account opening date.",
    );
    ensure(["in", "out"].includes(t.direction), "Invalid cash direction.");
    amount(t.amountMinor);
    text(t.party, "Party");
    text(t.description, "Description");
    text(t.reference, "Bank reference");
    ensure(
      CASH_CATEGORIES.includes(t.category) || t.category === "transfer",
      "Choose a supported cash category.",
    );
    ensure(
      t.category !== "transfer" || t.transferId,
      "Pair internal transfers with the transfer workflow.",
    );
    checkPo(state, t);
    ensure(
      transactionRemaining(f, t) >= 0,
      "Allocations exceed the bank movement.",
    );
    if (t.poId)
      ensure(
        t.category === "advance",
        "PO-linked bank movements must be recorded as advances.",
      );
    if (t.category === "advance") ensure(t.poId, "Link an advance to its PO.");
  }
  ensure(
    new Set(f.transactions.map((t) => `${t.accountId}|${key(t.reference)}`))
      .size === f.transactions.length,
    "A bank reference is already recorded for this account.",
  );
  for (const c of f.credits) {
    const d = find(f.documents, c.documentId, "Invoice");
    day(c.date);
    ensure(c.date <= state.asOf, "Credit is after the workspace date.");
    ensure(c.date >= d.issueDate, "A credit predates its invoice.");
    amount(c.amountMinor);
    evidence(c.evidence);
  }
  for (const a of f.allocations) {
    const t = find(f.transactions, a.transactionId, "Bank movement"),
      d = find(f.documents, a.documentId, "Invoice");
    day(a.date);
    ensure(a.date <= state.asOf, "Allocation is after the workspace date.");
    ensure(
      a.date >= t.date && a.date >= d.issueDate,
      "An allocation predates its payment or invoice.",
    );
    ensure(
      t.direction === (d.kind === "payable" ? "out" : "in") && !t.transferId,
      "Payment direction does not match this invoice.",
    );
    ensure(
      sameParty(f, t.party, d.party),
      "Payment and invoice parties do not match. Add a verified party alias if needed.",
    );
    if (t.poId)
      ensure(
        t.poId === d.poId && t.poType === d.poType,
        "An advance can settle only invoices for its linked PO.",
      );
    amount(a.amountMinor);
    evidence(a.evidence);
  }
  for (const r of f.rejections) {
    find(f.transactions, r.transactionId, "Bank movement");
    find(f.documents, r.documentId, "Invoice");
    evidence(r.reason);
  }
  const transfers = new Map();
  for (const t of f.transactions.filter((t) => t.transferId)) {
    transfers.set(t.transferId, [...(transfers.get(t.transferId) ?? []), t]);
  }
  for (const pair of transfers.values())
    ensure(
      pair.length === 2 &&
        pair[0].accountId !== pair[1].accountId &&
        pair[0].direction !== pair[1].direction &&
        pair[0].amountMinor === pair[1].amountMinor &&
        pair[0].date === pair[1].date &&
        pair.every(
          (t) =>
            t.category === "transfer" &&
            !t.poId &&
            transactionRemaining(f, t) === t.amountMinor,
        ),
      "A transfer needs two equal, opposite, unallocated movements on the same date in different accounts.",
    );
  for (const s of f.statements) {
    const account = find(f.accounts, s.accountId, "Account");
    day(s.startDate);
    ensure(
      s.startDate >= account.openingDate,
      "Statement coverage precedes the account opening date.",
    );
    day(s.endDate);
    ensure(s.endDate <= state.asOf, "Statement is after the workspace date.");
    ensure(s.endDate >= s.startDate, "Statement dates are reversed.");
    amount(s.openingMinor, false);
    amount(s.closingMinor, false);
    evidence(s.evidence);
    ensure(
      !f.statements.some(
        (o) =>
          o !== s &&
          o.accountId === s.accountId &&
          o.startDate <= s.endDate &&
          o.endDate >= s.startDate,
      ),
      "Statement coverage cannot overlap.",
    );
  }
  for (const p of f.poTerms) {
    const po = poIdentity(state, p.poType, p.poId);
    text(p.terms, "Payment terms");
    ensure(p.direction === po.direction, "PO direction mismatch.");
    ensure(
      Array.isArray(p.installments) &&
        p.installments.length > 0 &&
        p.installments.length <= 12,
      "Add 1–12 payment installments.",
    );
    for (const i of p.installments) {
      day(i.date);
      amount(i.amountMinor);
    }
    sumMoney(p.installments.map((i) => i.amountMinor));
  }
  ensure(
    new Set(f.poTerms.map((p) => `${p.poType}|${p.poId}`)).size ===
      f.poTerms.length,
    "PO terms already exist.",
  );
  for (const p of f.assumptions) {
    day(p.date);
    text(p.name, "Assumption name");
    ensure(
      ["in", "out"].includes(p.direction) &&
        ["once", "monthly"].includes(p.repeat),
      "Invalid forecast assumption.",
    );
    amount(p.amountMinor);
    if (p.endDate)
      ensure(
        validDate(p.endDate) && p.endDate >= p.date,
        "Invalid recurrence end date.",
      );
  }
  for (const c of f.closes) {
    monthBounds(c.month);
    ensure(
      c.snapshot && Array.isArray(c.snapshot.accounts),
      "Close snapshot is missing.",
    );
    text(c.actor, "Close reviewer");
    evidence(c.note);
  }
}

function bankRow(state, action, allowClosed = false) {
  const f = state.finance,
    account = find(f.accounts, action.accountId, "Account");
  const date = day(action.date);
  ensure(
    date <= state.asOf,
    "Actual records cannot be dated after the workspace date.",
  );
  if (!allowClosed) assertOpen(f, date);
  ensure(
    date >= account.openingDate,
    "A transaction precedes its account opening date.",
  );
  return {
    id: id(action),
    accountId: account.id,
    reference: text(action.reference, "Bank reference"),
    date,
    direction: action.direction,
    amountMinor: amount(action.amountMinor),
    party: text(action.party, "Party"),
    description: text(action.description, "Description"),
    category: text(action.category || "unclassified", "Category"),
    ...linked(action),
  };
}

/** Mutates only the private clone supplied by workspaceTransition. */
export function applyFinanceAction(state, action, { actor, at }) {
  if (action.type === "finance_configure") {
    const existing = state.finance;
    if (existing) {
      ensure(
        action.currency === existing.currency,
        "Currency is fixed once finance is configured. Use a separate workspace for another currency.",
      );
      ensure(
        action.fiscalStartMonth === existing.fiscalStartMonth ||
          !existing.closes.some((c) => !c.reopenedAt),
        "Reopen closed periods before changing the fiscal calendar.",
      );
    }
    state.finance ??= newFinance(action.currency, action.fiscalStartMonth);
    state.finance.fiscalStartMonth = action.fiscalStartMonth;
    state.finance.matchingToleranceMinor = action.matchingToleranceMinor ?? 0;
    return;
  }
  const f = state.finance;
  ensure(f, "Configure Finance & Cash first.");
  const stamp = { actor, at };
  switch (action.type) {
    case "finance_account":
      entry(f.accounts, {
        id: id(action),
        name: text(action.name, "Account name"),
        openingDate: actualDate(state, action.openingDate),
        openingMinor: amount(action.openingMinor, false),
        ...stamp,
      });
      break;
    case "finance_document":
      entry(f.documents, {
        id: id(action),
        reference: text(action.reference, "Invoice reference"),
        kind: action.kind,
        party: text(action.party, "Party"),
        issueDate: actualDate(state, action.issueDate),
        dueDate: day(action.dueDate),
        totalMinor: amount(action.totalMinor),
        evidence: evidence(action.evidence),
        terms: action.terms ? text(action.terms, "Payment terms") : "",
        ...linked(action),
        ...stamp,
      });
      break;
    case "finance_credit":
      entry(f.credits, {
        id: id(action),
        documentId: action.documentId,
        date: actualDate(state, action.date),
        amountMinor: amount(action.amountMinor),
        evidence: evidence(action.evidence),
        ...stamp,
      });
      break;
    case "finance_transaction":
      entry(f.transactions, { ...bankRow(state, action), ...stamp });
      break;
    case "finance_import": {
      ensure(
        Array.isArray(action.rows) &&
          action.rows.length > 0 &&
          action.rows.length <= 300,
        "Import between 1 and 300 rows.",
      );
      for (const row of action.rows) {
        const candidate = bankRow(
          state,
          {
            ...row,
            accountId: action.accountId,
            id: `import-${f.transactions.length + 1}`,
          },
          true,
        );
        const source = {
          date: candidate.date,
          reference: candidate.reference,
          direction: candidate.direction,
          amountMinor: candidate.amountMinor,
          party: candidate.party,
          description: candidate.description,
        };
        const existing = f.transactions.find(
          (t) =>
            t.accountId === candidate.accountId &&
            key(t.reference) === key(candidate.reference),
        );
        if (existing) {
          ensure(
            existing.source &&
              JSON.stringify(existing.source) === JSON.stringify(source),
            `Bank reference ${candidate.reference} conflicts with an existing record.`,
          );
          continue;
        }
        assertOpen(f, candidate.date);
        let n = f.transactions.length + 1;
        while (f.transactions.some((t) => t.id === `import-${n}`)) n++;
        entry(f.transactions, {
          ...candidate,
          id: `import-${n}`,
          source,
          ...stamp,
        });
      }
      break;
    }
    case "finance_classify": {
      const t = find(f.transactions, action.transactionId, "Bank movement");
      assertOpen(f, t.date);
      ensure(
        !t.transferId && !t.poId,
        "This transfer or advance already has a specific purpose.",
      );
      ensure(
        action.category !== "advance" && action.category !== "transfer",
        "Use the dedicated advance or transfer workflow.",
      );
      t.category = text(action.category, "Category");
      t.classificationNote = evidence(action.note);
      t.classifiedBy = actor;
      break;
    }
    case "finance_allocate": {
      const t = find(f.transactions, action.transactionId, "Bank movement"),
        d = find(f.documents, action.documentId, "Invoice");
      const date = actualDate(
        state,
        action.date || [t.date, d.issueDate].sort().at(-1),
      );
      entry(f.allocations, {
        id: `allocation-${f.allocations.length + 1}`,
        transactionId: t.id,
        documentId: d.id,
        date,
        amountMinor: amount(action.amountMinor),
        evidence: evidence(action.evidence),
        ...stamp,
      });
      break;
    }
    case "finance_reject":
      entry(f.rejections, {
        id: `rejection-${f.rejections.length + 1}`,
        transactionId: action.transactionId,
        documentId: action.documentId,
        reason: evidence(action.reason),
        ...stamp,
      });
      break;
    case "finance_alias":
      entry(f.aliases, {
        id: id(action),
        alias: text(action.alias, "Bank party name"),
        party: text(action.party, "Invoice party name"),
        ...stamp,
      });
      break;
    case "finance_transfer": {
      const a = find(f.transactions, action.firstId, "First bank movement"),
        b = find(f.transactions, action.secondId, "Second bank movement");
      assertOpen(f, a.date);
      assertOpen(f, b.date);
      ensure(
        !a.transferId && !b.transferId,
        "A selected movement is already paired.",
      );
      const transferId = `transfer-${a.id}-${b.id}`;
      a.transferId = transferId;
      b.transferId = transferId;
      a.category = b.category = "transfer";
      break;
    }
    case "finance_statement":
      entry(f.statements, {
        id: id(action),
        accountId: action.accountId,
        startDate: actualDate(state, action.startDate),
        endDate: actualDate(state, action.endDate),
        openingMinor: amount(action.openingMinor, false),
        closingMinor: amount(action.closingMinor, false),
        evidence: evidence(action.evidence),
        ...stamp,
      });
      break;
    case "finance_po_terms": {
      const po = poIdentity(state, action.poType, action.poId);
      ensure(
        !f.poTerms.some(
          (p) => p.poType === action.poType && p.poId === action.poId,
        ),
        "Payment terms are already recorded for this PO.",
      );
      entry(f.poTerms, {
        id: id(action),
        poType: action.poType,
        poId: action.poId,
        direction: po.direction,
        party: po.party,
        terms: text(action.terms, "Payment terms"),
        installments: action.installments,
        ...stamp,
      });
      break;
    }
    case "finance_assumption":
      entry(f.assumptions, {
        id: id(action),
        name: text(action.name, "Assumption name"),
        direction: action.direction,
        date: day(action.date),
        amountMinor: amount(action.amountMinor),
        repeat: action.repeat,
        endDate: action.endDate || "",
        ...stamp,
      });
      break;
    case "finance_close": {
      ensure(
        !f.closes.some((c) => c.month === action.month && !c.reopenedAt),
        "This period is already closed.",
      );
      ensure(
        !f.closes.some((c) => !c.reopenedAt && c.month > action.month),
        "Close periods in chronological order.",
      );
      const report = closeReview(state, action.month);
      ensure(!report.blockers.length, report.blockers.join(" "));
      entry(f.closes, {
        id: `close-${f.closes.length + 1}`,
        month: action.month,
        snapshot: report,
        note: evidence(action.note),
        ...stamp,
      });
      break;
    }
    case "finance_reopen": {
      const c = f.closes
        .filter((c) => !c.reopenedAt)
        .sort((a, b) => b.month.localeCompare(a.month))[0];
      ensure(
        c && c.id === action.closeId,
        "Reopen the latest closed period first.",
      );
      c.reopenedAt = at;
      c.reopenedBy = actor;
      c.reopenReason = evidence(action.reason);
      break;
    }
    default:
      throw new Error("Unknown finance action.");
  }
}

export function statementCheck(f, s) {
  const a = find(f.accounts, s.accountId, "Account");
  const opening = accountBalance(
    f,
    a,
    new Date(Date.parse(s.startDate) - 86400000).toISOString().slice(0, 10),
  );
  const movements = sumMoney(
    f.transactions
      .filter(
        (t) =>
          t.accountId === a.id && t.date >= s.startDate && t.date <= s.endDate,
      )
      .map((t) => (t.direction === "in" ? t.amountMinor : -t.amountMinor)),
  );
  const calculatedClosing = sumMoney([s.openingMinor, movements]);
  return {
    ...s,
    calculatedOpening: opening,
    calculatedClosing,
    passed: opening === s.openingMinor && calculatedClosing === s.closingMinor,
  };
}
export function coverageGaps(f, account, start, end) {
  const from = start > account.openingDate ? start : account.openingDate;
  if (from > end) return [];
  let cursor = from;
  const gaps = [];
  for (const s of f.statements
    .filter(
      (s) =>
        s.accountId === account.id &&
        s.endDate >= from &&
        s.startDate <= end &&
        statementCheck(f, s).passed,
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (s.startDate > cursor)
      gaps.push({
        start: cursor,
        end: new Date(Date.parse(s.startDate) - 86400000)
          .toISOString()
          .slice(0, 10),
      });
    if (s.endDate >= cursor) cursor = nextDay(s.endDate);
  }
  if (cursor <= end) gaps.push({ start: cursor, end });
  return gaps;
}
export function financeOverview(state, { start = "", end = state.asOf } = {}) {
  const f = state.finance;
  ensure(f, "Configure finance first.");
  day(end);
  if (start) day(start);
  const rows = f.transactions.filter(
    (t) => (!start || t.date >= start) && t.date <= end,
  );
  const external = rows.filter((t) => !t.transferId);
  const accounts = f.accounts
    .filter((a) => a.openingDate <= end)
    .map((a) => ({
      ...a,
      balance: accountBalance(f, a, end),
      gaps: coverageGaps(f, a, start || a.openingDate, end),
    }));
  const docs = f.documents
    .filter((d) => d.issueDate <= end)
    .map((d) => ({ ...d, ...documentBalance(f, d, end) }));
  const monthly = new Map();
  for (const t of external) {
    const month = t.date.slice(0, 7);
    const row = monthly.get(month) ?? { month, inflow: 0, outflow: 0 };
    row[t.direction === "in" ? "inflow" : "outflow"] = sumMoney([
      row[t.direction === "in" ? "inflow" : "outflow"],
      t.amountMinor,
    ]);
    monthly.set(month, row);
  }
  const pending = f.transactions.filter(
    (t) =>
      t.date <= end &&
      !t.transferId &&
      ["unclassified", "supplier_payment", "customer_receipt"].includes(
        t.category,
      ) &&
      transactionRemaining(f, t, end) > 0,
  );
  return {
    accounts,
    transactions: rows,
    documents: docs,
    pending,
    months: [...monthly.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
    cash: sumMoney(accounts.map((a) => a.balance)),
    inflow: sumMoney(
      external.filter((t) => t.direction === "in").map((t) => t.amountMinor),
    ),
    outflow: sumMoney(
      external.filter((t) => t.direction === "out").map((t) => t.amountMinor),
    ),
    payables: sumMoney(
      docs.filter((d) => d.kind === "payable").map((d) => d.outstanding),
    ),
    receivables: sumMoney(
      docs.filter((d) => d.kind === "receivable").map((d) => d.outstanding),
    ),
    advances: sumMoney(
      f.transactions
        .filter((t) => t.poType === "supplier" && t.date <= end)
        .map((t) => transactionRemaining(f, t, end)),
    ),
  };
}
export function matchSuggestions(state) {
  const f = state.finance;
  const rows = [];
  for (const t of f.transactions.filter(
    (t) => !t.transferId && transactionRemaining(f, t) > 0,
  ))
    for (const d of f.documents.filter(
      (d) => documentBalance(f, d).outstanding > 0,
    )) {
      if (
        t.direction !== (d.kind === "payable" ? "out" : "in") ||
        !sameParty(f, t.party, d.party) ||
        (t.poId && (d.poId !== t.poId || d.poType !== t.poType)) ||
        f.rejections.some(
          (r) => r.transactionId === t.id && r.documentId === d.id,
        )
      )
        continue;
      const remaining = transactionRemaining(f, t),
        outstanding = documentBalance(f, d).outstanding;
      const exact = remaining === outstanding,
        reference = key(`${t.description} ${t.reference}`).includes(
          key(d.reference),
        );
      if (
        !exact &&
        !reference &&
        Math.abs(remaining - outstanding) > f.matchingToleranceMinor
      )
        continue;
      rows.push({
        transaction: t,
        document: d,
        amountMinor: Math.min(remaining, outstanding),
        reason: exact
          ? "Same party and exact remaining amount"
          : reference
            ? "Same party and invoice reference"
            : "Same party and amount within review tolerance",
      });
    }
  return rows;
}
export function closeReview(state, month) {
  const f = state.finance,
    { start, end } = monthBounds(month),
    overview = financeOverview(state, { start, end }),
    blockers = [];
  if (end > state.asOf) blockers.push("The month has not ended.");
  if (!overview.accounts.length)
    blockers.push("Add a bank account before closing.");
  for (const a of overview.accounts)
    if (a.gaps.length)
      blockers.push(`${a.name}: missing or unbalanced statement coverage.`);
  if (overview.pending.length)
    blockers.push(
      `${overview.pending.length} bank movements still need classification or allocation.`,
    );
  return {
    month,
    start,
    end,
    currency: f.currency,
    cash: overview.cash,
    inflow: overview.inflow,
    outflow: overview.outflow,
    payables: overview.payables,
    receivables: overview.receivables,
    accounts: overview.accounts,
    blockers,
  };
}
function subtractEarliest(installments, used) {
  return [...installments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((i) => {
      const take = Math.min(used, i.amountMinor);
      used -= take;
      return { ...i, amountMinor: i.amountMinor - take };
    })
    .filter((i) => i.amountMinor > 0);
}
export function cashForecast(
  state,
  { weeks = 13, receiptDelayDays = 0, includeAssumptions = true } = {},
) {
  ensure(
    Number.isInteger(weeks) &&
      weeks >= 1 &&
      weeks <= 26 &&
      Number.isInteger(receiptDelayDays) &&
      receiptDelayDays >= 0 &&
      receiptDelayDays <= 90,
    "Invalid forecast horizon or delay.",
  );
  const f = state.finance,
    start = nextDay(state.asOf),
    end = new Date(Date.parse(start) + (weeks * 7 - 1) * 86400000)
      .toISOString()
      .slice(0, 10),
    events = [];
  const add = (row) => {
    const overdue = row.date < start;
    const scheduled = overdue ? start : row.date;
    const date =
      row.direction === "in" && row.basis !== "Assumption"
        ? new Date(Date.parse(scheduled) + receiptDelayDays * 86400000)
            .toISOString()
            .slice(0, 10)
        : scheduled;
    if (date <= end) events.push({ ...row, date, overdue });
  };
  for (const d of f.documents.filter((d) => d.issueDate <= state.asOf)) {
    const b = documentBalance(f, d, state.asOf);
    if (b.outstanding)
      add({
        id: d.id,
        name: d.reference,
        party: d.party,
        direction: d.kind === "payable" ? "out" : "in",
        date: d.dueDate,
        amountMinor: b.outstanding,
        basis: "Invoice",
      });
  }
  for (const p of f.poTerms) {
    const billed = sumMoney(
      f.documents
        .filter(
          (d) =>
            d.poId === p.poId &&
            d.poType === p.poType &&
            d.issueDate <= state.asOf,
        )
        .map((d) => d.totalMinor),
    );
    const advances = sumMoney(
      f.transactions
        .filter(
          (t) =>
            t.poId === p.poId && t.poType === p.poType && t.date <= state.asOf,
        )
        .map((t) => transactionRemaining(f, t, state.asOf)),
    );
    for (const [i, row] of subtractEarliest(
      p.installments,
      billed + advances,
    ).entries())
      add({
        ...row,
        id: `${p.id}-${i}`,
        name: p.poId,
        party: p.party,
        direction: p.direction,
        basis: "Unbilled PO",
      });
  }
  if (includeAssumptions)
    for (const p of f.assumptions) {
      if (p.repeat === "once") {
        if (p.date >= start) add({ ...p, basis: "Assumption" });
        continue;
      }
      const originalDay = Number(p.date.slice(8));
      let month = start.slice(0, 7);
      for (let n = 0; n <= 7; n++) {
        const bounds = monthBounds(month),
          date = `${month}-${String(Math.min(originalDay, Number(bounds.end.slice(8)))).padStart(2, "0")}`;
        if (
          date >= p.date &&
          date >= start &&
          date <= end &&
          (!p.endDate || date <= p.endDate)
        )
          add({ ...p, id: `${p.id}-${month}`, date, basis: "Assumption" });
        month = nextDay(bounds.end).slice(0, 7);
      }
    }
  let balance = financeOverview(state).cash;
  const opening = balance,
    rows = [];
  for (let i = 0; i < weeks; i++) {
    const date = new Date(Date.parse(start) + i * 7 * 86400000)
        .toISOString()
        .slice(0, 10),
      until = new Date(Date.parse(date) + 6 * 86400000)
        .toISOString()
        .slice(0, 10);
    const items = events.filter((e) => e.date >= date && e.date <= until);
    const inflow = sumMoney(
        items.filter((e) => e.direction === "in").map((e) => e.amountMinor),
      ),
      outflow = sumMoney(
        items.filter((e) => e.direction === "out").map((e) => e.amountMinor),
      );
    balance = sumMoney([balance, inflow, -outflow]);
    rows.push({ date, end: until, inflow, outflow, balance, items });
  }
  return {
    start,
    end,
    opening,
    closing: balance,
    weeks: rows,
    events: events.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
