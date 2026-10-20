import {
  CURRENCIES,
  CASH_CATEGORIES,
  money,
  parseMoney,
  financeOverview,
  documentBalance,
  transactionRemaining,
  matchSuggestions,
  cashForecast,
  closeReview,
  statementCheck,
  poIdentity,
  monthBounds,
} from "../src/finance.mjs";
import { parseCsv, previewBankImport } from "../src/finance-import.mjs";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const label = (v) => v.replaceAll("_", " ");
const btn = (action, title, id = "", kind = "secondary-button") =>
  `<button type="button" class="${kind}" data-fin-action="${action}" data-id="${esc(id)}">${title}</button>`;
const option = (value, title, selected) =>
  `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(title)}</option>`;
const input = (title, name, value = "", type = "text", extra = "") =>
  `<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} required></label>`;
const optional = (title, name, value = "") =>
  `<label>${title}<input name="${name}" value="${esc(value)}" maxlength="300"></label>`;
const select = (title, name, rows, value = "", required = true) =>
  `<label>${title}<select name="${name}" ${required ? "required" : ""}>${rows.map(([id, title]) => option(id, title, value)).join("")}</select></label>`;
const note = (
  title = "Evidence or source reference",
  name = "evidence",
  value = "",
) =>
  `<label>${title}<textarea name="${name}" required maxlength="300">${esc(value)}</textarea></label>`;
const amount = (title, name, value = "") =>
  input(title, name, value, "text", 'inputmode="decimal" maxlength="20"');
const empty = (title, detail) =>
  `<div class="empty-state"><h2>${title}</h2><p>${detail}</p></div>`;
const table = (heads, rows) =>
  `<div class="table-wrap"><table class="finance-table"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const status = (title, kind = "planned") =>
  `<span class="status ${kind}">${esc(title)}</span>`;
const meta = (state) =>
  `<p class="finance-caption">${state.finance.currency} · Records through ${state.asOf}${state.settings?.sample ? " · Fictional sample" : ""}</p>`;
export const FINANCE_SCREENS = {
  overview: "Cash overview",
  documents: "Invoices & credits",
  bank: "Bank movements",
  reconcile: "Reconciliation",
  forecast: "Cash forecast",
  close: "Period review",
  settings: "Finance settings",
};
const accounts = (f) => f.accounts.map((a) => [a.id, a.name]);
function poOptions(state, lines = false) {
  const all = [];
  const ids = [...new Set(state.orders.map((o) => o.poReference ?? o.id))];
  for (const [type, list] of [
    ["customer", ids],
    ["supplier", (state.supplierOrders ?? []).map((p) => p.id)],
  ])
    for (const id of list) {
      const p = poIdentity(state, type, id);
      all.push([JSON.stringify([type, id, ""]), `${id} · ${p.party}`]);
      if (lines)
        for (const line of p.lines)
          all.push([JSON.stringify([type, id, line.id]), `${id} / ${line.id}`]);
    }
  return all;
}
function configForm(state) {
  const f = state.finance;
  return `<form data-finance-form="configure" class="finance-settings-form">${select(
    "Workspace currency",
    "currency",
    Object.keys(CURRENCIES).map((c) => [c, c]),
    f?.currency ?? state.costing?.currency ?? "USD",
  )}${select(
    "Fiscal year begins",
    "fiscalStartMonth",
    Array.from({ length: 12 }, (_, i) => [
      String(i + 1),
      new Date(2024, i, 1).toLocaleString("en", { month: "long" }),
    ]),
    String(f?.fiscalStartMonth ?? 1),
  )}${amount("Matching review tolerance", "matchingTolerance", f ? String(f.matchingToleranceMinor / 10 ** CURRENCIES[f.currency]) : "0")}<p class="help">One currency per workspace. Currency is fixed after setup. A tolerance suggests candidates for review; it never writes off a difference.</p>${actor(state)}<button class="primary">${f ? "Save finance settings" : "Set up finance"}</button></form>`;
}
const actor = (state) =>
  input(
    "Recorded by",
    "actor",
    state.settings?.sample ? "Sample finance reviewer" : "",
    "text",
    'maxlength="200"',
  );
const decimal = (state, value) =>
  value == null ? "" : String(value / 10 ** CURRENCIES[state.finance.currency]);
function dateField(state, title, name, value = state.asOf, future = false) {
  return input(title, name, value, "date", future ? "" : `max="${state.asOf}"`);
}

export function financeView(state, ui) {
  if (!state.settings?.configured)
    return `<div class="finance-workspace"><h1>Finance & Cash</h1>${empty("Set up your company first", "Open Company setup to name your company and stock location, then return here to add finance.")}</div>`;
  if (!state.finance)
    return `<div class="finance-workspace"><div class="page-heading"><div><h1>Finance & Cash</h1><p>Connect your bank movements, invoices and production commitments.</p></div></div><section class="finance-panel finance-onboarding"><h2>Start with your company’s settings</h2><p>Your existing production records stay connected. Add accounts and import history from any available year.</p>${configForm(state)}</section></div>`;
  return `<div class="finance-workspace"><div class="page-heading"><div><h1>${FINANCE_SCREENS[ui.screen]}</h1><p>${{ overview: "Follow the money behind the work.", documents: "Invoices, credits and the evidence behind each balance.", bank: "Recorded receipts and payments across your accounts.", reconcile: "Review the evidence. Confirm where each payment belongs.", forecast: "See upcoming cash needs and test your assumptions.", close: "Review statements and preserve each period’s decisions.", settings: "Your company’s accounts, currency and matching rules." }[ui.screen]}</p>${meta(state)}</div><div class="finance-heading-actions">${btn("document", "Add invoice", "", "primary")}${btn("transaction", "Record movement")}</div></div>${{ overview: overview, documents: documents, bank: bank, reconcile: reconcile, forecast: forecast, close: close, settings: settings }[ui.screen](state, ui)}</div>${ui.dialog ? dialog(state, ui) : ""}`;
}
function overview(state, ui) {
  const f = state.finance,
    year = ui.year || state.asOf.slice(0, 4);
  const start = `${year}-01-01`,
    end = `${year}-12-31` < state.asOf ? `${year}-12-31` : state.asOf;
  const v = financeOverview(state, { start, end }),
    current = financeOverview(state);
  const first = Math.min(
    Number(state.asOf.slice(0, 4)),
    ...f.accounts.map((a) => Number(a.openingDate.slice(0, 4))),
    ...f.documents.map((d) => Number(d.issueDate.slice(0, 4))),
  );
  const years = Array.from(
    { length: Number(state.asOf.slice(0, 4)) - first + 1 },
    (_, i) => String(first + i),
  ).reverse();
  const months = Array.from({ length: Number(end.slice(5, 7)) }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    return (
      v.months.find((m) => m.month === month) ?? {
        month,
        inflow: 0,
        outflow: 0,
      }
    );
  });
  const max = Math.max(1, ...months.flatMap((m) => [m.inflow, m.outflow]));
  const metrics = [
    ["Recorded cash balance", v.cash, "bank"],
    ["Money in", v.inflow, "bank"],
    ["Money out", v.outflow, "bank"],
    ["Supplier invoices outstanding", v.payables, "documents"],
  ];
  return `<div class="finance-toolbar"><label>History year<select data-fin-filter="year">${years.map((y) => option(y, y, year)).join("")}</select></label><span>History begins ${first} · Fiscal year starts ${new Date(2024, f.fiscalStartMonth - 1, 1).toLocaleString("en", { month: "long" })}</span>${btn("import", "Import bank CSV")}</div><div class="finance-metrics">${metrics.map(([title, value, screen]) => `<button data-fin-metric="${title}" data-screen="${screen}"><span>${title}</span><strong>${money(value, f.currency)}</strong><small>${title.includes("balance") || title.includes("outstanding") ? `As of ${end}` : `${year} to ${end}`}</small></button>`).join("")}</div>
 <section class="finance-panel"><div class="finance-panel-heading"><div><h2>Cash movement</h2><p>Recorded external receipts and payments. Paired account transfers are excluded.</p></div><div class="finance-legend"><span><i class="cash-in"></i>Money in</span><span><i class="cash-out"></i>Money out</span></div></div><div class="cash-chart" aria-label="Monthly cash movements">${months.map((m) => `<button class="cash-month" data-has-movement="${m.inflow || m.outflow ? "true" : "false"}" data-fin-month="${m.month}" aria-label="${m.month}: money in ${money(m.inflow, f.currency)}, money out ${money(m.outflow, f.currency)}"><span class="cash-bars"><i class="cash-in" style="height:${Math.max(m.inflow ? 2 : 0, (m.inflow / max) * 145)}px"></i><i class="cash-out" style="height:${Math.max(m.outflow ? 2 : 0, (m.outflow / max) * 145)}px"></i></span><span>${new Date(`${m.month}-15T12:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" })}</span></button>`).join("")}</div><p class="finance-caption">Select a month to inspect its movements.<span class="cash-scroll-hint"> Swipe horizontally for other months.</span> Empty months mean no recorded movements; statement coverage below establishes completeness.</p></section>
 <div class="finance-two-column"><section class="finance-panel"><div class="finance-panel-heading"><h2>Accounts</h2>${btn("account", "Add account")}</div>${v.accounts.length ? v.accounts.map((a) => `<button class="finance-account" data-fin-account="${esc(a.id)}"><span><strong>${esc(a.name)}</strong><small>${a.gaps.length ? `${a.gaps.length} gap${a.gaps.length === 1 ? "" : "s"} in statement coverage` : "Statement coverage balanced for this period"}</small></span><b>${money(a.balance, f.currency)}</b></button>`).join("") : empty("Add your first account", "Enter its opening date and balance before importing movements.")}</section><section class="finance-panel"><div class="finance-panel-heading"><h2>Review through ${state.asOf}</h2></div><div class="finance-review-summary"><strong>${current.pending.length}</strong><p>Movements awaiting classification or payment allocation.</p>${btn("go-reconcile", "Open reconciliation")}</div><p class="finance-caption">As of ${end}</p><button class="text-button" data-fin-metric="Customer invoices outstanding" data-screen="documents">Customer invoices outstanding: ${money(v.receivables, f.currency)}</button><br><button class="text-button" data-fin-metric="Unallocated supplier advances" data-screen="bank">Unallocated supplier advances: ${money(v.advances, f.currency)}</button></section></div>
 ${v.accounts.some((a) => a.gaps.length) ? `<details class="finance-coverage"><summary>Statement coverage is incomplete — inspect gaps</summary><p>These dates have no balanced statement evidence. The cash balance is calculated from recorded movements and opening balances.</p>${v.accounts.map((a) => (a.gaps.length ? `<h3>${esc(a.name)}</h3><ul>${a.gaps.map((g) => `<li>${g.start} to ${g.end}</li>`).join("")}</ul>` : "")).join("")}</details>` : ""}`;
}
function documents(state, ui) {
  const f = state.finance,
    asOf = ui.docAsOf || state.asOf;
  let docs = f.documents.filter((d) => d.issueDate <= asOf);
  if (ui.kind) docs = docs.filter((d) => d.kind === ui.kind);
  const selected = docs.find((d) => d.id === ui.document);
  return `<div class="finance-toolbar"><label>Invoice type<select data-fin-filter="kind">${[
    ["", "All invoices"],
    ["payable", "Supplier invoices"],
    ["receivable", "Customer invoices"],
  ]
    .map(([v, l]) => option(v, l, ui.kind ?? ""))
    .join(
      "",
    )}</select></label><label>Balances as of<input type="date" data-fin-filter="docAsOf" value="${asOf}" max="${state.asOf}" required></label><span>${docs.length} records · issued through ${asOf}</span>${btn("credit", "Record credit note")}</div>${selected ? documentDetail(state, selected, asOf) : ""}${
    docs.length
      ? table(
          [
            "Invoice / party",
            "Type",
            "Issued / due",
            "Total",
            "Outstanding",
            "",
          ],
          docs.map((d) => {
            const b = documentBalance(f, d, asOf);
            return `<tr><td><strong>${esc(d.reference)}</strong><small>${esc(d.party)}</small></td><td>${d.kind === "payable" ? "Supplier" : "Customer"}</td><td>${d.issueDate}<small>Due ${d.dueDate}</small></td><td>${money(d.totalMinor, f.currency)}</td><td>${money(b.outstanding, f.currency)}<small>${b.outstanding === 0 ? "Settled" : d.dueDate < asOf ? "Overdue" : "Open"}</small></td><td>${btn("inspect-document", "Open record", d.id)}</td></tr>`;
          }),
        )
      : empty(
          "No invoices yet",
          "Record a supplier or customer invoice, with its payment due date and evidence.",
        )
  }`;
}
function documentDetail(state, d, asOf) {
  const f = state.finance,
    b = documentBalance(f, d, asOf);
  const allocations = f.allocations.filter(
    (a) => a.documentId === d.id && a.date <= asOf,
  );
  const credits = f.credits.filter(
    (c) => c.documentId === d.id && c.date <= asOf,
  );
  return `<section class="finance-panel finance-detail"><div class="finance-panel-heading"><div><h2>${esc(d.reference)}</h2><p>${esc(d.party)} · ${esc(d.terms || "Payment due " + d.dueDate)}</p></div>${status(b.outstanding ? "Open" : "Settled", b.outstanding ? "planned" : "released")}</div><div class="finance-detail-balances"><span>Total<strong>${money(d.totalMinor, f.currency)}</strong></span><span>Credits<strong>${money(b.credits, f.currency)}</strong></span><span>Paid<strong>${money(b.paid, f.currency)}</strong></span><span>Outstanding<strong>${money(b.outstanding, f.currency)}</strong></span></div><p class="finance-caption">Evidence: ${esc(d.evidence)}</p>${d.poId ? `<p>Linked ${d.poType} PO: <button class="text-button" data-fin-po="${esc(d.poId)}" data-po-type="${d.poType}">${esc(d.poId)}</button>${d.poLineId ? ` / ${esc(d.poLineId)}` : ""}</p>` : ""}${
    allocations.length
      ? table(
          ["Payment reference", "Applied date", "Amount", "Evidence"],
          allocations.map(
            (a) =>
              `<tr><td>${esc(f.transactions.find((t) => t.id === a.transactionId).reference)}</td><td>${a.date}</td><td>${money(a.amountMinor, f.currency)}</td><td>${esc(a.evidence)}<small>${esc(a.actor)}</small></td></tr>`,
          ),
        )
      : '<p class="finance-caption">No payment allocated.</p>'
  }${credits.map((c) => `<p class="finance-caption">Credit ${esc(c.id)} · ${c.date} · ${money(c.amountMinor, f.currency)} · ${esc(c.evidence)}</p>`).join("")}</section>`;
}
function bank(state, ui) {
  const f = state.finance;
  const rows = f.transactions
    .filter(
      (t) =>
        (!ui.account || t.accountId === ui.account) &&
        (!ui.bankMonth || t.date.startsWith(ui.bankMonth)) &&
        (!ui.bankStart || t.date >= ui.bankStart) &&
        (!ui.bankEnd || t.date <= ui.bankEnd) &&
        (!ui.direction || t.direction === ui.direction) &&
        (!ui.externalOnly || !t.transferId) &&
        (!ui.advancesOnly ||
          (t.poType === "supplier" &&
            transactionRemaining(f, t, ui.bankEnd || state.asOf) > 0)),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const asOf = ui.bankEnd || state.asOf,
    balances = financeOverview(state, { end: asOf }).accounts.filter(
      (a) => !ui.account || a.id === ui.account,
    );
  return `<div class="finance-toolbar"><label>Account<select data-fin-filter="account">${[["", "All accounts"], ...accounts(f)].map(([v, l]) => option(v, l, ui.account ?? "")).join("")}</select></label><label>Month<input data-fin-filter="bankMonth" type="month" value="${esc(ui.bankMonth ?? "")}"></label><label>Direction<select data-fin-filter="direction">${[
    ["", "Both"],
    ["in", "Money in"],
    ["out", "Money out"],
  ]
    .map(([v, l]) => option(v, l, ui.direction ?? ""))
    .join(
      "",
    )}</select></label>${btn("clear-bank", "Clear filters")}${btn("import", "Import bank CSV")}</div><p class="finance-caption">${rows.length} movements${ui.bankStart ? " · from " + ui.bankStart : ""}${ui.bankEnd ? " · through " + ui.bankEnd : ""}${ui.externalOnly ? " · external movements only" : ""}${ui.advancesOnly ? " · unallocated supplier advances" : ""}. Recording a movement records bank evidence; it does not send a payment.</p>${ui.showBalances ? `<section class="finance-panel"><h2>Balance evidence · ${asOf}</h2>${balances.map((a) => `<p><strong>${esc(a.name)} · ${money(a.balance, f.currency)}</strong><br>Opening ${money(a.openingMinor, f.currency)} on ${a.openingDate}, plus signed movements below.</p>`).join("")}</section>` : ""}${
    rows.length
      ? table(
          [
            "Date / account",
            "Reference / party",
            "Purpose",
            "Amount",
            "Unallocated",
            "",
          ],
          rows.map(
            (t) =>
              `<tr><td>${t.date}<small>${esc(f.accounts.find((a) => a.id === t.accountId).name)}</small></td><td><strong>${esc(t.reference)}</strong><small>${esc(t.party)}</small><small>${esc(t.description)}</small></td><td>${status(label(t.category), t.category === "unclassified" ? "quality_hold" : "planned")}${t.poId ? `<small>PO ${esc(t.poId)}</small>` : ""}</td><td class="${t.direction === "in" ? "finance-in" : ""}">${t.direction === "in" ? "+" : "−"}${money(t.amountMinor, f.currency)}</td><td>${t.transferId ? "Internal transfer" : money(transactionRemaining(f, t, asOf), f.currency)}</td><td>${!t.transferId && !t.poId ? btn("classify", "Classify", t.id) : ""}${transactionRemaining(f, t) > 0 && !t.transferId ? btn("allocate", "Allocate", t.id) : ""}</td></tr>`,
          ),
        )
      : empty(
          "No bank movements in this view",
          "Import a bank CSV or record a movement. Clear filters to see earlier history.",
        )
  }`;
}
function reconcile(state, ui) {
  const f = state.finance,
    suggestions = matchSuggestions(state),
    v = financeOverview(state);
  return `<div class="finance-toolbar"><span>${v.pending.length} movements need review · ${suggestions.length} candidate matches</span>${btn("allocate", "Allocate payment")}${btn("alias", "Add party alias")}${btn("transfer", "Pair account transfer")}</div><p class="finance-caption">Candidates use party identity, reference and amount. Review the evidence before confirming. Rejections and allocations are retained when the same source is imported again.</p>${suggestions.length ? suggestions.map((s, index) => `<section class="finance-match"><div><span>Bank movement · ${s.transaction.date}</span><h2>${money(s.transaction.amountMinor, f.currency)}</h2><p>${esc(s.transaction.party)}</p><small>${esc(s.transaction.reference)} · ${esc(s.transaction.description)}</small></div><div class="finance-match-link"><span>Suggested allocation</span><strong>${money(s.amountMinor, f.currency)}</strong><small>${esc(s.reason)}</small></div><div><span>${s.document.kind === "payable" ? "Supplier" : "Customer"} invoice</span><h2>${esc(s.document.reference)}</h2><p>${esc(s.document.party)}</p><small>${money(documentBalance(f, s.document).outstanding, f.currency)} outstanding</small></div><div class="finance-match-actions">${btn("match", "Review allocation", String(index), "primary")}${btn("reject", "Reject candidate", String(index))}</div></section>`).join("") : empty("No suggested matches", "You can allocate manually, add a verified party alias, or classify a movement that does not settle an invoice.")}<details class="finance-coverage"><summary>Recorded decisions · ${f.allocations.length} allocations, ${f.rejections.length} rejections</summary>${f.allocations.map((a) => `<p>${a.date}: ${esc(f.transactions.find((t) => t.id === a.transactionId).reference)} → ${esc(f.documents.find((d) => d.id === a.documentId).reference)} · ${money(a.amountMinor, f.currency)} · ${esc(a.actor)}</p>`).join("")}${f.rejections.map((r) => `<p>Rejected: ${esc(r.transactionId)} / ${esc(r.documentId)} · ${esc(r.reason)}</p>`).join("")}</details>`;
}
function forecast(state, ui) {
  const f = state.finance,
    forecast = cashForecast(state, {
      receiptDelayDays: Number(ui.delay || 0),
      includeAssumptions: ui.assumptions !== "off",
    }),
    values = [forecast.opening, ...forecast.weeks.map((w) => w.balance)],
    min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    range = max - min || 1;
  const points = values
      .map(
        (v, i) =>
          `${40 + i * (720 / (values.length - 1))},${180 - ((v - min) / range) * 140}`,
      )
      .join(" "),
    zero = 180 - ((0 - min) / range) * 140;
  return `<div class="finance-toolbar"><label>Customer receipt delay<select data-fin-filter="delay">${[
    ["0", "On expected dates"],
    ["14", "14 days later"],
    ["30", "30 days later"],
  ]
    .map(([v, l]) => option(v, l, ui.delay ?? "0"))
    .join(
      "",
    )}</select></label><label>Planning assumptions<select data-fin-filter="assumptions">${[
    ["on", "Include assumptions"],
    ["off", "Invoices and POs only"],
  ]
    .map(([v, l]) => option(v, l, ui.assumptions ?? "on"))
    .join(
      "",
    )}</select></label>${btn("terms", "Add PO payment terms")}${btn("assumption", "Add assumption")}</div><section class="finance-panel"><div class="finance-panel-heading"><div><h2>13-week cash outlook</h2><p>Opening ${money(forecast.opening, f.currency)} · ${forecast.start} to ${forecast.end}</p></div><div class="finance-forecast-total"><small>Projected closing cash</small><strong>${money(forecast.closing, f.currency)}</strong></div></div><svg class="cash-forecast-chart" viewBox="0 0 800 210" role="img" aria-label="Weekly projected cash balance. Exact values and source events follow below."><line x1="40" x2="760" y1="${zero}" y2="${zero}" stroke="#c9ccd2" stroke-dasharray="4 4"/><polyline points="${points}" fill="none" stroke="#0071e3" stroke-width="3" stroke-linejoin="round"/><text x="40" y="205" font-size="12" fill="#6e6e73">${forecast.start}</text><text x="760" y="205" text-anchor="end" font-size="12" fill="#6e6e73">${forecast.end}</text></svg><p class="finance-caption">This is a scenario based on recorded cash, unpaid invoices, unbilled PO commitments and labelled assumptions. Overdue commitments are placed in the first week. Statement gaps can affect the opening balance. Changing this scenario does not change any records.</p></section><div class="finance-forecast-weeks">${forecast.weeks
    .map(
      (w) =>
        `<details><summary><span>${w.date}<small>Week ending ${w.end}</small></span><span><small>In / out</small>${money(w.inflow, f.currency)} / ${money(w.outflow, f.currency)}</span><strong class="${w.balance < 0 ? "finance-negative" : ""}">${money(w.balance, f.currency)}</strong></summary>${
          w.items.length
            ? table(
                ["Date", "Source", "Basis", "Direction", "Amount"],
                w.items.map(
                  (e) =>
                    `<tr><td>${e.date}${e.overdue ? "<small>Overdue</small>" : ""}</td><td>${esc(e.name)}<small>${esc(e.party ?? "")}</small></td><td>${status(e.basis, e.basis === "Assumption" ? "quality_hold" : "planned")}</td><td>${e.direction === "in" ? "In" : "Out"}</td><td>${money(e.amountMinor, f.currency)}</td></tr>`,
                ),
              )
            : "<p>No expected cash events this week.</p>"
        }</details>`,
    )
    .join(
      "",
    )}</div><details class="finance-coverage"><summary>PO payment terms and planning assumptions</summary>${f.poTerms.map((p) => `<p><strong>${esc(p.poId)}</strong> · ${esc(p.terms)}<br>${p.installments.map((i) => `${i.date}: ${money(i.amountMinor, f.currency)}`).join(" · ")}</p>`).join("")}${f.assumptions.map((p) => `<p><strong>${esc(p.name)}</strong> · ${money(p.amountMinor, f.currency)} · ${p.repeat} from ${p.date}</p>`).join("")}<p>Invoices replace the billed part of a linked PO commitment. Unallocated advances reduce its remaining commitment. Credit notes reduce invoices without reopening a PO commitment.</p></details>`;
}
function close(state, ui) {
  const f = state.finance,
    month = ui.closeMonth || state.asOf.slice(0, 7),
    report = closeReview(state, month),
    closed = f.closes.find((c) => c.month === month && !c.reopenedAt);
  return `<div class="finance-toolbar"><label>Review month<input type="month" data-fin-filter="closeMonth" value="${month}" required></label>${btn("statement", "Add statement evidence")}</div><section class="finance-panel"><div class="finance-panel-heading"><div><h2>${month} period review</h2><p>Statement coverage, balances and payment decisions.</p></div>${status(closed ? "Closed" : report.blockers.length ? "Needs review" : "Ready to close", closed ? "released" : report.blockers.length ? "quality_hold" : "ready")}</div>${report.blockers.length ? `<ul class="finance-blockers">${report.blockers.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "<p>Required statement coverage is balanced and all bank movements through this month have an explanation.</p>"}<p class="finance-caption">Closing saves this review and prevents changes dated on or before the period end. Open invoices remain outstanding. This is an operational sub-ledger review, not a statutory accounting close.</p>${closed ? `<p>Closed by ${esc(closed.actor)} · ${esc(closed.note)}</p>${btn("reopen", "Reopen with a reason", closed.id)}${btn("export-close", "Export saved close", closed.id)}` : `<form data-finance-form="close">${note("Review note", "note")}${actor(state)}<button class="primary" ${report.blockers.length ? "disabled" : ""}>Close period</button></form>`}</section>${
    f.statements.length
      ? table(
          ["Statement / account", "Coverage", "Opening", "Closing", "Check"],
          f.statements.map((s) => {
            const c = statementCheck(f, s);
            return `<tr><td>${esc(s.id)}<small>${esc(f.accounts.find((a) => a.id === s.accountId).name)}</small><small>${esc(s.evidence)}</small></td><td>${s.startDate}<small>to ${s.endDate}</small></td><td>${money(s.openingMinor, f.currency)}</td><td>${money(s.closingMinor, f.currency)}<small>Calculated ${money(c.calculatedClosing, f.currency)}</small></td><td>${status(c.passed ? "Balanced" : "Mismatch", c.passed ? "released" : "quality_hold")}</td></tr>`;
          }),
        )
      : empty(
          "No statements recorded",
          "Record opening and closing balances and covered dates from each account statement.",
        )
  }<details class="finance-coverage"><summary>Close history · ${f.closes.length} saved reviews</summary>${f.closes.map((c) => `<p>${c.month} · ${esc(c.actor)} · ${c.reopenedAt ? "Reopened: " + esc(c.reopenReason) : "Closed"} ${btn("export-close", "Export snapshot", c.id)}</p>`).join("")}</details>`;
}
function settings(state) {
  return `<div class="finance-two-column"><section class="finance-panel"><h2>Finance settings</h2>${configForm(state)}</section><section class="finance-panel"><h2>Accounts and party names</h2><p>Use opening balances from a known date. Bank names can be linked to invoice names through reviewed aliases.</p><div class="finance-toolbar">${btn("account", "Add account")}${btn("alias", "Add party alias")}</div>${state.finance.accounts.map((a) => `<p><strong>${esc(a.name)}</strong><br>${a.openingDate} · Opening ${money(a.openingMinor, state.finance.currency)}</p>`).join("")}${state.finance.aliases.map((a) => `<p>${esc(a.alias)} → ${esc(a.party)}</p>`).join("")}<p class="finance-caption">Current scope: one currency, local records, manual evidence and review. Foreign exchange, tax calculation, bank connections and protected multi-user accounting remain future work.</p></section></div>`;
}

function dialog(state, ui) {
  const f = state.finance,
    p = ui.preset ?? {},
    today = state.asOf;
  let title = "",
    fields = "",
    submit = "Save record";
  const po = () =>
    select(
      "Link to a PO (optional)",
      "poLink",
      [["", "No PO link"], ...poOptions(state, true)],
      p.poLink ?? "",
      false,
    );
  const docs = () =>
    select(
      "Invoice",
      "documentId",
      f.documents
        .filter((d) => documentBalance(f, d).outstanding > 0)
        .map((d) => [
          d.id,
          `${d.reference} · ${d.party} · ${money(documentBalance(f, d).outstanding, f.currency)}`,
        ]),
      p.documentId,
    );
  const txns = () =>
    select(
      "Bank movement",
      "transactionId",
      f.transactions
        .filter((t) => !t.transferId && transactionRemaining(f, t) > 0)
        .map((t) => [
          t.id,
          `${t.reference} · ${t.party} · ${money(transactionRemaining(f, t), f.currency)}`,
        ]),
      p.transactionId,
    );
  switch (ui.dialog) {
    case "account":
      title = "Add bank account";
      fields =
        input("Account reference", "id") +
        input("Account name", "name") +
        dateField(state, "Opening date", "openingDate") +
        amount("Opening balance", "openingMinor", "0");
      break;
    case "document":
      title = "Record an invoice";
      submit = "Record invoice";
      fields =
        select("Type", "kind", [
          ["payable", "Supplier invoice"],
          ["receivable", "Customer invoice"],
        ]) +
        po() +
        input("Invoice reference", "reference") +
        input("Customer or supplier", "party") +
        `<div class="form-grid">${dateField(state, "Issue date", "issueDate")}${dateField(state, "Payment due date", "dueDate", today, true)}</div>` +
        amount(
          `Invoice total (${f.currency}, including any tax)`,
          "totalMinor",
        ) +
        optional("Payment terms", "terms") +
        note();
      break;
    case "credit":
      title = "Record a credit note";
      fields =
        input("Credit reference", "id") +
        docs() +
        dateField(state, "Credit date", "date") +
        amount("Credit amount", "amountMinor") +
        note();
      break;
    case "transaction":
      title = "Record a bank movement";
      submit = "Record movement";
      fields =
        select("Account", "accountId", accounts(f)) +
        input("Unique bank reference", "reference") +
        dateField(state, "Transaction date", "date") +
        select("Direction", "direction", [
          ["out", "Money out"],
          ["in", "Money in"],
        ]) +
        amount(`Amount (${f.currency}, positive value)`, "amountMinor") +
        input("Counterparty", "party") +
        input("Description", "description") +
        select(
          "Purpose",
          "category",
          CASH_CATEGORIES.map((c) => [c, label(c)]),
        ) +
        po() +
        `<p class="help">For a deposit or advance, link the PO. It remains unallocated until applied to an invoice. This records evidence and does not send money.</p>`;
      break;
    case "allocate":
      title = "Allocate a payment";
      submit = "Confirm allocation";
      fields =
        txns() +
        docs() +
        dateField(state, "Allocation effective date", "date", p.date || today) +
        amount(
          "Amount to allocate",
          "amountMinor",
          decimal(state, p.amountMinor),
        ) +
        note("Evidence for this match");
      break;
    case "reject":
      title = "Reject this candidate";
      fields =
        `<p>${esc(p.transactionId)} → ${esc(p.documentId)}</p>` +
        note("Reason", "reason");
      submit = "Reject candidate";
      break;
    case "classify":
      title = "Classify bank movement";
      fields =
        `<p>${esc(p.transactionId)}</p>` +
        select(
          "Purpose",
          "category",
          CASH_CATEGORIES.filter(
            (c) => !["unclassified", "advance"].includes(c),
          ).map((c) => [c, label(c)]),
        ) +
        note("Reason or evidence", "note");
      break;
    case "alias":
      title = "Link party names";
      fields =
        input("Name appearing in bank records", "alias") +
        input("Canonical name on invoices", "party") +
        `<p class="help">Use this only when both names identify the same customer or supplier.</p>`;
      break;
    case "transfer":
      title = "Pair an internal transfer";
      fields =
        select(
          "First movement",
          "firstId",
          f.transactions
            .filter(
              (t) =>
                !t.transferId &&
                !t.poId &&
                transactionRemaining(f, t) === t.amountMinor,
            )
            .map((t) => [
              t.id,
              `${t.reference} · ${t.direction} · ${money(t.amountMinor, f.currency)}`,
            ]),
        ) +
        select(
          "Second movement",
          "secondId",
          f.transactions
            .filter(
              (t) =>
                !t.transferId &&
                !t.poId &&
                transactionRemaining(f, t) === t.amountMinor,
            )
            .map((t) => [
              t.id,
              `${t.reference} · ${t.direction} · ${money(t.amountMinor, f.currency)}`,
            ]),
        ) +
        `<p class="help">Select equal, opposite movements on the same day in different accounts. Record any fee separately.</p>`;
      break;
    case "statement":
      title = "Record statement evidence";
      fields =
        input("Statement reference", "id") +
        select("Account", "accountId", accounts(f)) +
        `<div class="form-grid">${dateField(state, "Coverage begins", "startDate", (ui.closeMonth || today.slice(0, 7)) + "-01")}${dateField(state, "Coverage ends", "endDate", monthBounds(ui.closeMonth || today.slice(0, 7)).end)}</div>` +
        amount("Statement opening balance", "openingMinor") +
        amount("Statement closing balance", "closingMinor") +
        note();
      break;
    case "terms":
      title = "PO payment terms";
      fields =
        select("Purchase order", "poLink", poOptions(state)) +
        input("Payment terms", "terms") +
        amount(`Agreed PO total (${f.currency}, including tax)`, "totalMinor") +
        amount("Deposit (zero if none)", "depositMinor", "0") +
        dateField(state, "Deposit due", "depositDate", today, true) +
        dateField(state, "Balance due", "balanceDate", today, true) +
        `<p class="help">These are cash commitments. Quantities and QC remain separate. Link later invoices to this PO so billed amounts replace the commitment.</p>`;
      break;
    case "assumption":
      title = "Add a forecast assumption";
      fields =
        input("Assumption name", "name") +
        select("Direction", "direction", [
          ["out", "Money out"],
          ["in", "Money in"],
        ]) +
        amount("Expected amount", "amountMinor") +
        dateField(state, "First expected date", "date", today, true) +
        select("Repeat", "repeat", [
          ["once", "One time"],
          ["monthly", "Monthly"],
        ]) +
        `<label>Repeat until (optional)<input type="date" name="endDate"></label><p class="help">Planning assumptions are labelled separately and do not create bank movements or invoices.</p>`;
      break;
    case "reopen":
      title = "Reopen period";
      fields = note("Reason for reopening", "reason");
      submit = "Reopen period";
      break;
    case "import":
      return importDialog(state, ui);
  }
  return `<dialog id="finance-dialog" class="finance-dialog"><form data-finance-form="${ui.dialog}"><div class="dialog-title"><h2>${title}</h2>${btn("close-dialog", "Close", "", "quiet")}</div>${fields}${actor(state)}<button class="primary">${submit}</button></form></dialog>`;
}
function importDialog(state, ui) {
  const f = state.finance,
    headers = ui.csvHeaders ?? [],
    mapping = ui.mapping ?? {};
  const rows = ui.preview ?? [];
  return `<dialog id="finance-dialog" class="finance-dialog finance-import-dialog"><form data-finance-form="import-preview"><div class="dialog-title"><h2>Import bank movements</h2>${btn("close-dialog", "Close", "", "quiet")}</div>${select("Account", "accountId", accounts(f), ui.importAccount)}<label>Paste CSV with a header<textarea name="csv" rows="6" maxlength="120000" required placeholder="Date,Reference,Amount,Party,Description">${esc(ui.csv ?? "")}</textarea></label><p class="help">Use ISO dates and signed amounts: positive for money in, negative for money out. Each account needs a unique bank reference per movement. Maximum 300 rows.</p>${btn("read-columns", "Read columns")}${
    headers.length
      ? `<div class="finance-mapping">${[
          "date",
          "reference",
          "amount",
          "party",
          "description",
        ]
          .map((field) =>
            select(
              label(field),
              "map-" + field,
              headers.map((h) => [h, h]),
              mapping[field] ||
                headers.find((h) => h.toLowerCase() === field) ||
                "",
            ),
          )
          .join(
            "",
          )}</div><button class="secondary-button">Preview import</button>`
      : ""
  }${
    rows.length
      ? `<div class="finance-import-result"><h3>${rows.filter((r) => r.status === "new").length} new · ${rows.filter((r) => r.status === "duplicate").length} already recorded · ${rows.filter((r) => r.status === "error").length} errors</h3>${table(
          ["Row", "Reference", "Amount", "Result"],
          rows.map(
            (r) =>
              `<tr><td>${r.row}</td><td>${esc(r.data?.reference ?? "")}</td><td>${r.data ? `${r.data.direction === "out" ? "−" : "+"}${money(r.data.amountMinor, f.currency)}` : ""}</td><td>${esc(r.error || r.status)}</td></tr>`,
          ),
        )}<p class="help">Existing identical rows are skipped. Their classifications and payment decisions are preserved.</p></div>`
      : ""
  }${actor(state)}<button type="button" class="primary" data-fin-action="confirm-import" ${!rows.some((r) => r.status === "new") || rows.some((r) => r.status === "error") ? "disabled" : ""}>Import reviewed rows</button></form></dialog>`;
}
const generated = (state, prefix) => {
  let n = 1;
  const ids = new Set(
    Object.values(state.finance)
      .filter(Array.isArray)
      .flatMap((rows) => rows.map((r) => r.id)),
  );
  while (ids.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
};
export function financeFormAction(state, ui, form, data) {
  const type = form.dataset.financeForm,
    f = state.finance;
  const cash = (name) => parseMoney(data[name], f?.currency ?? data.currency);
  let poLink = {};
  if (data.poLink) {
    const [poType, poId, poLineId] = JSON.parse(data.poLink);
    poLink = { poType, poId, poLineId };
  }
  switch (type) {
    case "configure":
      return {
        type: "finance_configure",
        currency: data.currency,
        fiscalStartMonth: Number(data.fiscalStartMonth),
        matchingToleranceMinor: cash("matchingTolerance"),
      };
    case "account":
      return {
        type: "finance_account",
        ...data,
        openingMinor: cash("openingMinor"),
      };
    case "document":
      return {
        type: "finance_document",
        ...data,
        id: generated(state, "DOC"),
        totalMinor: cash("totalMinor"),
        ...poLink,
      };
    case "transaction":
      return {
        type: "finance_transaction",
        ...data,
        id: generated(state, "TXN"),
        amountMinor: cash("amountMinor"),
        ...poLink,
      };
    case "credit":
      return {
        type: "finance_credit",
        ...data,
        amountMinor: cash("amountMinor"),
      };
    case "allocate":
      return {
        type: "finance_allocate",
        ...data,
        amountMinor: cash("amountMinor"),
      };
    case "classify":
      return {
        type: "finance_classify",
        ...data,
        transactionId: ui.preset.transactionId,
      };
    case "reject":
      return {
        type: "finance_reject",
        ...data,
        transactionId: ui.preset.transactionId,
        documentId: ui.preset.documentId,
      };
    case "alias":
      return { type: "finance_alias", ...data, id: generated(state, "ALIAS") };
    case "transfer":
      return { type: "finance_transfer", ...data };
    case "statement":
      return {
        type: "finance_statement",
        ...data,
        openingMinor: cash("openingMinor"),
        closingMinor: cash("closingMinor"),
      };
    case "terms": {
      const total = cash("totalMinor"),
        deposit = cash("depositMinor");
      if (deposit < 0 || deposit > total)
        throw new Error("Deposit must be between zero and the PO total.");
      return {
        type: "finance_po_terms",
        id: generated(state, "TERMS"),
        ...poLink,
        terms: data.terms,
        installments: [
          ...(deposit
            ? [{ date: data.depositDate, amountMinor: deposit }]
            : []),
          ...(total - deposit
            ? [{ date: data.balanceDate, amountMinor: total - deposit }]
            : []),
        ],
      };
    }
    case "assumption":
      return {
        type: "finance_assumption",
        ...data,
        id: generated(state, "PLAN"),
        amountMinor: cash("amountMinor"),
      };
    case "close":
      return {
        type: "finance_close",
        month: ui.closeMonth || state.asOf.slice(0, 7),
        note: data.note,
      };
    case "reopen":
      return {
        type: "finance_reopen",
        closeId: ui.preset.closeId,
        reason: data.reason,
      };
  }
}

const historyEnd = (state, ui) => {
  const end = `${ui.year || state.asOf.slice(0, 4)}-12-31`;
  return end < state.asOf ? end : state.asOf;
};
export function wireFinance(
  root,
  { getState, ui, render, apply, notify, navigate, download },
) {
  const open = () => {
    render();
    document.getElementById("finance-dialog")?.showModal();
  };
  const save = async (action, actor) => {
    const previous = ui.dialog;
    ui.dialog = "";
    if (!(await apply(action, actor, "Finance record saved.")))
      ui.dialog = previous;
  };
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const state = getState();
    if (button.dataset.finScreen) {
      ui.screen = button.dataset.finScreen;
      ui.dialog = "";
      render();
      root
        .querySelector(`[data-fin-screen="${ui.screen}"]`)
        ?.focus({ preventScroll: true });
      return;
    }
    if (button.dataset.finMonth) {
      ui.screen = "bank";
      ui.bankStart = ui.bankEnd = "";
      ui.advancesOnly = false;
      ui.showBalances = false;
      ui.bankMonth = button.dataset.finMonth;
      ui.direction = "";
      ui.externalOnly = true;
      ui.account = "";
      render();
      return;
    }
    if (button.dataset.finAccount) {
      ui.screen = "bank";
      ui.bankStart = "";
      ui.bankEnd = historyEnd(state, ui);
      ui.showBalances = true;
      ui.advancesOnly = false;
      ui.account = button.dataset.finAccount;
      ui.bankMonth = "";
      ui.direction = "";
      ui.externalOnly = false;
      render();
      return;
    }
    if (button.dataset.finMetric) {
      ui.screen = button.dataset.screen;
      ui.bankEnd = ui.docAsOf = historyEnd(state, ui);
      ui.advancesOnly =
        button.dataset.finMetric === "Unallocated supplier advances";
      ui.bankStart =
        button.dataset.finMetric === "Recorded cash balance" || ui.advancesOnly
          ? ""
          : `${ui.year || state.asOf.slice(0, 4)}-01-01`;
      ui.showBalances = button.dataset.finMetric === "Recorded cash balance";
      ui.document = "";
      ui.kind =
        ui.screen === "documents"
          ? button.dataset.finMetric === "Customer invoices outstanding"
            ? "receivable"
            : "payable"
          : "";
      ui.account = "";
      ui.externalOnly = button.dataset.finMetric !== "Recorded cash balance";
      ui.direction =
        button.dataset.finMetric === "Money in"
          ? "in"
          : button.dataset.finMetric === "Money out"
            ? "out"
            : "";
      ui.bankMonth = "";
      render();
      return;
    }
    if (button.dataset.finPo) {
      navigate(button.dataset.finPo, button.dataset.poType);
      return;
    }
    const action = button.dataset.finAction;
    if (!action) return;
    const id = button.dataset.id;
    try {
      if (action === "close-dialog") {
        ui.dialog = "";
        document.getElementById("finance-dialog").close();
        return;
      }
      if (action === "go-reconcile") {
        ui.screen = "reconcile";
        render();
        return;
      }
      if (action === "clear-bank") {
        ui.account =
          ui.bankMonth =
          ui.direction =
          ui.bankStart =
          ui.bankEnd =
            "";
        ui.showBalances = false;
        ui.advancesOnly = false;
        ui.externalOnly = false;
        render();
        return;
      }
      if (action === "inspect-document") {
        ui.document = id;
        render();
        return;
      }
      if (action === "export-close") {
        download(
          `finance-${id}.json`,
          state.finance.closes.find((c) => c.id === id),
        );
        return;
      }
      if (action === "read-columns") {
        const data = Object.fromEntries(new FormData(button.closest("form")));
        ui.csv = data.csv;
        ui.importAccount = data.accountId;
        ui.csvHeaders = parseCsv(ui.csv).headers;
        ui.mapping = {};
        ui.preview = [];
        open();
        return;
      }
      if (action === "confirm-import") {
        const data = Object.fromEntries(new FormData(button.closest("form")));
        const mapping = Object.fromEntries(
          ["date", "reference", "amount", "party", "description"].map((k) => [
            k,
            data["map-" + k],
          ]),
        );
        const current = previewBankImport(
          state,
          data.accountId,
          data.csv,
          mapping,
        );
        if (
          JSON.stringify(current) !== JSON.stringify(ui.preview) ||
          data.accountId !== ui.importAccount
        )
          throw new Error(
            "The import changed. Preview it again before saving.",
          );
        if (current.some((r) => r.status === "error"))
          throw new Error("Resolve the import errors first.");
        await save(
          {
            type: "finance_import",
            accountId: data.accountId,
            rows: current.map((r) => r.data),
          },
          data.actor,
        );
        return;
      }
      ui.preset = {};
      if (["allocate", "classify"].includes(action))
        ui.preset.transactionId = id;
      if (["match", "reject"].includes(action)) {
        const match = matchSuggestions(state)[Number(id)];
        if (!match)
          throw new Error(
            "This candidate has changed. Reload the review list.",
          );
        ui.preset = {
          transactionId: match.transaction.id,
          documentId: match.document.id,
          amountMinor: match.amountMinor,
        };
      }
      if (action === "reopen") ui.preset.closeId = id;
      if (action === "import") {
        ui.csv = ui.csv ?? "";
        ui.preview = [];
      }
      ui.dialog = action === "match" ? "allocate" : action;
      open();
    } catch (error) {
      notify(error.message, true);
    }
  });
  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target.dataset.finFilter) {
      if (target.dataset.finFilter === "bankMonth") {
        ui.bankStart = ui.bankEnd = "";
        ui.showBalances = false;
      }
      ui[target.dataset.finFilter] = target.value;
      render();
      root
        .querySelector(`[data-fin-filter="${target.dataset.finFilter}"]`)
        ?.focus();
    }
    if (target.name === "poLink" && target.value) {
      const state = getState(),
        [type, id] = JSON.parse(target.value),
        po = poIdentity(state, type, id),
        form = target.closest("form");
      if (form.elements.party) form.elements.party.value = po.party;
      if (form.elements.kind)
        form.elements.kind.value =
          type === "supplier" ? "payable" : "receivable";
      if (form.elements.category) form.elements.category.value = "advance";
      if (form.elements.direction) form.elements.direction.value = po.direction;
    }
  });
  root.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!form.dataset.financeForm) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form)),
      state = getState();
    try {
      if (form.dataset.financeForm === "import-preview") {
        ui.csv = data.csv;
        ui.importAccount = data.accountId;
        ui.mapping = Object.fromEntries(
          ["date", "reference", "amount", "party", "description"].map((k) => [
            k,
            data["map-" + k],
          ]),
        );
        ui.preview = previewBankImport(
          state,
          ui.importAccount,
          ui.csv,
          ui.mapping,
        );
        open();
        return;
      }
      const action = financeFormAction(state, ui, form, data);
      if (action) await save(action, data.actor);
    } catch (error) {
      notify(error.message, true);
    }
  });
}
