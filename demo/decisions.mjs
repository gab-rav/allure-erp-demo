import { CURRENCIES, money, parseMoney } from "../src/finance.mjs";
import {
  latestCostSheet,
  latestQuote,
  estimateCost,
  costSheetStale,
} from "../src/product-costs.mjs";
import { demandPlan } from "../src/demand-planner.mjs";
import { workItems } from "../src/work-items.mjs";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (v) => new Intl.NumberFormat("en").format(v);
const currency = (s) => s.costing?.currency ?? s.finance?.currency ?? "USD";
const cash = (s, v) => (v == null ? "Not established" : money(v, currency(s)));
const qty = (n, u) =>
  `${num(u === "g" ? n / 1000 : n)} ${u === "g" ? "kg" : n === 1 ? "piece" : "pieces"}`;
const decimal = (s, n) =>
  n == null ? "" : String(n / 10 ** CURRENCIES[currency(s)]);
const option = (v, label, selected) =>
  `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(label)}</option>`;
const button = (action, title, id = "", kind = "secondary-button") =>
  `<button type="button" class="${kind}" data-decision="${action}" data-id="${esc(id)}">${title}</button>`;
const input = (label, name, value = "", type = "text", attrs = "") =>
  `<label>${label}<input name="${name}" value="${esc(value)}" type="${type}" ${attrs}></label>`;
const note = (label, name, value = "") =>
  `<label>${label}<textarea name="${name}" required maxlength="300">${esc(value)}</textarea></label>`;
const actor = (s) =>
  input(
    "Recorded by",
    "actor",
    s.settings?.sample ? "Sample reviewer" : "",
    "text",
    'required maxlength="200"',
  );
const select = (label, name, rows, value) =>
  `<label>${label}<select name="${name}" required>${rows.map(([v, l]) => option(v, l, value)).join("")}</select></label>`;
const fieldMoney = (s, label, name, value) =>
  input(
    label,
    name,
    decimal(s, value),
    "text",
    'inputmode="decimal" maxlength="20"',
  );
const link = (target, id, title) =>
  `<button class="text-button" data-decision="navigate" data-target="${target}" data-id="${esc(id)}">${esc(title)}</button>`;
const tag = (label, kind = "planned") =>
  `<span class="status ${kind}">${esc(label)}</span>`;
const empty = (title, detail) =>
  `<section class="finance-panel empty-state"><h2>${title}</h2><p>${detail}</p><button class="secondary-button" data-view="setup">Open company setup</button></section>`;
const heading = (title, subtitle, actions = "") =>
  `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="decision-actions">${actions}</div></div>`;
const selectedProduct = (s, ui) =>
  s.products.find((p) => p.id === ui.productId) ?? s.products[0];
const selectedSheet = (s, ui, p) =>
  s.costing?.sheets.find((v) => v.id === ui.version && v.productId === p.id) ??
  latestCostSheet(s, p.id);
const currencyField = (s) =>
  s.costing || s.finance
    ? `<p class="help">${currency(s)} · Workspace currency</p>`
    : select(
        "Costing currency",
        "currency",
        Object.keys(CURRENCIES).map((c) => [c, c]),
        "USD",
      );

export function costsView(state, ui) {
  if (!state.products.length)
    return (
      heading(
        "Product costs",
        "Understand the cost behind each finished unit.",
      ) +
      empty(
        "Add your first product",
        "Configure its recipe, then add quoted material prices and conversion costs.",
      )
    );
  const p = selectedProduct(state, ui),
    s = selectedSheet(state, ui, p),
    v = s ? estimateCost(state, s, ui.volume ?? 1000) : null,
    unit = s ? estimateCost(state, s) : null;
  const versions =
    state.costing?.sheets
      .filter((s) => s.productId === p.id)
      .sort((a, b) => b.sequence - a.sequence) ?? [];
  const stale = s && costSheetStale(state, s),
    latest = latestCostSheet(state, p.id);
  const controls = `<div class="decision-toolbar"><label>Product<select id="cost-product">${state.products.map((p2) => option(p2.id, `${p2.name} · ${p2.size}`, p.id)).join("")}</select></label>${versions.length ? `<label>Saved version<select id="cost-version">${versions.map((s2) => option(s2.id, `${s2.effectiveDate} · ${s2.id}`, s?.id)).join("")}</select></label>` : ""}</div>`;
  const top = heading(
    "Product costs",
    "See every input, its source and the cost still unknown.",
    button("quote", "Add material price") +
      button("sheet", "Save cost version", p.id, "primary"),
  );
  const noSheet = `<section class="finance-panel"><h2>Build a cost sheet for ${esc(p.name)}</h2><p>Add prices for the recipe inputs below, then save a version with your conversion costs and selling price. Unknown costs stay visible.</p><div class="cost-input-list">${p.recipe
    .map((r) => {
      const m = state.materials.find((m) => m.id === r.materialId),
        q = latestQuote(state, m.id);
      return `<div><span><strong>${esc(m.name)}</strong><small>${qty(r.perUnit, m.unit)} per finished unit · ${q ? cash(state, q.amountMinor) + " / " + qty(q.basisQuantity, m.unit) : "Price missing"}</small></span>${button("quote", q ? "Update price" : "Add price", m.id)}</div>`;
    })
    .join("")}</div></section>`;
  const body = s
    ? `${stale ? '<div class="decision-notice">The recipe has changed. This version preserves the earlier estimate; save a new cost version before using it in the planner.</div>' : s.id !== latest.id ? '<div class="decision-notice">Viewing an earlier saved estimate. The demand planner uses the latest effective cost version.</div>' : ""}
  <div class="cost-layout"><section class="finance-panel cost-breakdown"><div class="finance-panel-heading"><div><h2>${esc(s.productName)}</h2><p>Recipe version ${s.recipeVersion} · Effective ${s.effectiveDate}</p></div>${tag(v.missing.length ? "Incomplete estimate" : "Inputs reviewed", v.missing.length ? "quality_hold" : "released")}</div>
  <form data-decision-form="volume" class="decision-volume">${input("Estimate quantity", "units", ui.volume ?? 1000, "number", 'min="1" max="1000000" step="1" required')}<button class="secondary-button">Update estimate</button></form>
  <div class="table-wrap"><table class="decision-table"><thead><tr><th>Cost input</th><th>Source / basis</th><th>For ${num(v.units)} units</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>${v.lines.map((l) => `<tr><td><strong>${esc(l.label)}</strong><small>${l.materialId ? qty(l.perUnit, l.unit) + " per unit" : "Per finished unit"}</small></td><td>${l.materialId ? (l.quote ? `${cash(state, l.quote.amountMinor)} / ${qty(l.quote.basisQuantity, l.unit)}<small>${esc(l.quote.evidence)}<br>${l.quote.effectiveDate} · <span class="id">${l.quote.id}</span></small>` : '<span class="cost-unknown">Price missing</span>') : `<small>${esc(l.evidence || "Evidence needed")}</small>`}</td><td class="numeric ${l.amountMinor === null ? "cost-unknown" : ""}">${l.amountMinor === null ? "Unknown" : cash(state, l.amountMinor)}</td><td>${l.materialId ? button("quote", "Update price", l.materialId, "text-button") : ""}</td></tr>`).join("")}</tbody></table></div><p class="help">Material costs are calculated at the quoted quantity. Totals round once at the requested volume; displayed line amounts can differ from the total by a minor unit.</p>
  <details class="cost-history"><summary>Review evidence</summary><p>${esc(s.note)}</p><p>${esc(s.actor)} · ${esc(s.at)}</p>${button("export-cost", "Export this cost record", s.id)}</details></section>
  <aside class="finance-panel cost-summary"><p>Estimated cost per unit</p><strong class="cost-price">${unit.totalMinor === null ? "Unknown" : cash(state, unit.totalMinor)}</strong><small>${unit.totalMinor === null ? `${cash(state, unit.knownMinor)} known subtotal` : "Based on this saved cost version"}</small>
  <dl><div><dt>Estimate for ${num(v.units)} units</dt><dd>${cash(state, v.totalMinor)}</dd></div><div><dt>Selling price / unit</dt><dd>${cash(state, s.sellingMinor)}</dd></div><div><dt>Estimated contribution</dt><dd>${cash(state, v.marginMinor)}</dd></div><div><dt>Contribution margin</dt><dd>${v.marginPercent === null ? "Not established" : `${v.marginPercent.toFixed(1)}%`}</dd></div></dl>
  ${v.missing.length ? `<div class="cost-missing"><strong>Still needed</strong><ul>${v.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : ""}<p class="help">${esc(s.sellingEvidence || "Add a selling price source to compare contribution.")}<br>This is an estimate, not measured batch cost, net profit or a cash movement.</p>${button("sheet", "Review cost version", p.id)}</aside></div>`
    : noSheet;
  return `<div class="decisions-workspace">${top}${controls}${body}</div>${decisionDialog(state, ui)}`;
}

export function plannerView(state, ui) {
  const plan = demandPlan(state, {
    includeForecast: Boolean(ui.includeForecast),
  });
  if (!state.products.length)
    return (
      heading("Demand planner", "Turn open demand into a production plan.") +
      empty(
        "Start with products and orders",
        "Create a product recipe and customer PO to see production requirements.",
      )
    );
  const metrics = `<div class="metric-strip"><div><span>Open customer demand</span><strong>${num(plan.committed)}<small>units not yet dispatched</small></strong></div><div><span>Additional production</span><strong>${num(plan.totalToPlan)}<small>units beyond existing plans</small></strong></div><div><span>Held output</span><strong>${num(plan.held)}<small>excluded from usable stock</small></strong></div><div><span>Estimated new production cost</span><strong class="planner-money ${plan.estimateMinor == null ? "is-unknown" : ""}">${cash(state, plan.estimateMinor)}<small>${plan.estimateMinor == null ? "Needs complete, current cost sheets" : "From current cost sheets"}</small></strong></div></div>`;
  const rows = plan.rows
    .map(
      (r) =>
        `<tr><td><button class="text-button planner-expand" data-decision="expand" data-id="${esc(r.product.id)}" aria-expanded="${ui.expanded === r.product.id}"><strong>${esc(r.product.name)}</strong></button><small>${esc(r.product.size)}</small></td><td class="numeric">${num(r.committed)}${r.forecastUnits ? `<small>+ ${num(r.forecastUnits)} expected</small>` : ""}</td><td class="numeric">${num(r.released)}${r.held ? `<small>${num(r.held)} held</small>` : ""}</td><td class="numeric">${num(r.running)}<small>planned output</small></td><td class="numeric">${num(r.planned)}</td><td class="numeric"><strong class="planner-proposal ${r.toPlan ? "" : "is-zero"}">${num(r.toPlan)}</strong><small>${r.toPlan ? cash(state, r.cost?.totalMinor) : "Covered by current plan"}</small></td><td>${r.toPlan ? button("plan", "Plan batch", r.product.id) : link("production", "", "View batches")}</td></tr>${
          ui.expanded === r.product.id
            ? `<tr class="planner-detail"><td colspan="7"><div><strong>Why ${num(r.toPlan)} additional units?</strong><p>${num(r.demand)} demand − ${num(r.released)} released − ${num(r.running)} in production − ${num(r.planned)} planned, floored at zero. Held stock is excluded.</p><p>${r.orders.map((o) => `${link("customer", o.poReference ?? o.id, o.poReference ?? o.id)}: ${num(o.outstanding)} units`).join(" · ") || "No open customer orders."}</p><p>${r.batches
                .filter((b) => b.status !== "released")
                .map((b) => link("batch", b.id, b.id))
                .join(
                  " · ",
                )}</p>${link("costs", r.product.id, r.stale ? "Update changed recipe costs" : "Inspect cost sheet")}${r.held ? '<p class="help">Review held stock before creating replacement work. Existing production is provisional; this view does not reserve stock or promise delivery dates.</p>' : ""}</div></td></tr>`
            : ""
        }`,
    )
    .join("");
  const materials = `<section class="finance-panel"><div class="finance-panel-heading"><div><h2>Material readiness</h2><p>All planned batches plus the additional production above. Issued inputs are already deducted from stock.</p></div><button class="text-button" data-view="materials">View material lots</button></div><div class="table-wrap"><table class="decision-table"><thead><tr><th>Material</th><th>Required</th><th>Released & unexpired</th><th>Shortfall</th><th>On supplier POs</th></tr></thead><tbody>${plan.materials.map((m) => `<tr><td><strong>${esc(m.name)}</strong><small>${qty(m.existing, m.unit)} existing plans · ${qty(m.proposed, m.unit)} proposals</small></td><td>${qty(m.required, m.unit)}</td><td>${qty(m.available, m.unit)}</td><td>${m.shortfall ? tag(`${qty(m.shortfall, m.unit)} short`, "quality_hold") : tag("Covered", "released")}</td><td>${qty(m.incoming, m.unit)}</td></tr>`).join("") || '<tr><td colspan="5">No planned or proposed material demand.</td></tr>'}</tbody></table></div><p class="help">Incoming orders and quarantined lots do not cover shortages until received and released. Materials still use a shared stock pool.</p></section>`;
  const allAssumptions = state.planning?.assumptions ?? [];
  const forecast = `<section class="finance-panel"><div class="finance-panel-heading"><div><h2>Expected demand</h2><p>Optional planning scenarios through ${plan.through}. These do not create orders.</p></div>${button("demand", "Add assumption")}</div>${plan.forecast.length ? `<div class="demand-assumptions">${plan.forecast.map((a) => `<article><div>${tag(a.kind === "manual" ? "Assumption" : "Reorder hint")}<strong>${esc(state.products.find((p) => p.id === a.productId).name)}</strong><p>${num(a.units)} units · ${esc(a.customer)} · ${a.date}</p><small>${esc(a.note)}</small></div>${a.kind === "manual" ? button("withdraw", "Withdraw", a.id) : ""}</article>`).join("")}</div>` : "<p>No active assumptions or supported reorder hints. Cadence hints need at least three distinct dated orders and no open demand for that customer/product.</p>"}
  ${
    allAssumptions.some(
      (a) => a.withdrawn || a.date < state.asOf || a.date > plan.through,
    )
      ? `<details class="cost-history"><summary>Other assumptions and history</summary>${allAssumptions
          .filter(
            (a) => a.withdrawn || a.date < state.asOf || a.date > plan.through,
          )
          .map(
            (a) =>
              `<p><strong>${esc(a.customer)}</strong> · ${num(a.units)} units · ${a.date}<br>${a.withdrawn ? `Withdrawn: ${esc(a.withdrawn.reason)}` : a.date < state.asOf ? "Expired; excluded from planning" : "Outside the current horizon"} ${!a.withdrawn ? button("withdraw", "Withdraw", a.id, "text-button") : ""}</p>`,
          )
          .join("")}</details>`
      : ""
  }<p class="help">Reorder hints use observed order intervals and typical quantities. They are not commitments or calibrated probabilities. Manual assumptions are additional to existing orders.</p></section>`;
  const expectedUnits = plan.forecast.reduce((n, a) => n + a.units, 0);
  const scenario = `<div class="scenario-bar"><label class="switch"><input type="checkbox" role="switch" id="include-demand-forecast" ${ui.includeForecast ? "checked" : ""}> Include expected demand</label><span>${ui.includeForecast ? `Confirmed orders plus ${plan.forecast.length} expected-demand ${plan.forecast.length === 1 ? "entry" : "entries"} (${num(expectedUnits)} units) through ${plan.through}.` : `Confirmed customer orders only.${plan.forecast.length ? ` ${plan.forecast.length} expected-demand ${plan.forecast.length === 1 ? "entry is" : "entries are"} excluded.` : ""}`}</span></div>`;
  return `<div class="decisions-workspace">${heading("Demand planner", "What needs making, what is already covered, and what could hold it up.", button("demand", "Add demand assumption"))}${scenario}${metrics}<section class="finance-panel planner-panel"><div class="table-wrap"><table class="decision-table"><thead><tr><th>Product</th><th>Demand</th><th>Released</th><th>In production</th><th>Planned</th><th>To plan</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>${rows}</tbody></table></div><p class="help">All outstanding customer orders are included, regardless of due date. Proposals consider quantities, not equipment capacity or production lead times. Cost estimates do not change the cash forecast.</p></section>${materials}${forecast}</div>${decisionDialog(state, ui)}`;
}

export function workView(state, ui) {
  const all = workItems(state),
    items = all.filter((i) => !ui.area || i.area === ui.area);
  const history = state.workReviews ?? [];
  return `<div class="decisions-workspace">${heading("Work queue", "Resolve the missing evidence and exceptions behind the numbers.")}<div class="decision-toolbar"><label>Team<select id="work-area-filter">${["", "Operations", "Quality", "Purchasing", "Finance"].map((a) => option(a, `${a || "All teams"} (${all.filter((i) => !a || i.area === a).length})`, ui.area ?? "")).join("")}</select></label><p>${items.length} open items · Conditions clear when their source records are resolved.</p></div><div class="work-list">${items.map((i) => `<article class="work-item"><span class="work-signal priority-${i.priority}"><span class="work-priority priority-${i.priority}" aria-hidden="true"></span>${i.priority === 1 ? "Needs attention" : "Review"}</span><div class="work-content"><div class="work-title"><h2>${esc(i.title)}</h2>${tag(i.area)}</div><p>${esc(i.detail)}</p><div class="work-owner ${i.review ? "" : "unassigned"}"><strong>${i.review ? `Owner: ${esc(i.review.owner)}` : "Unassigned"}</strong>${i.review ? `<span>${esc(i.review.note)}</span><small>${esc(i.review.actor)} · ${esc(i.review.at.slice(0, 10))}</small>` : ""}</div></div><div class="work-actions">${link(i.target, i.id, "Open source")}${button("review", "Assign / note", i.key)}</div></article>`).join("") || '<section class="finance-panel"><h2>No open items in this view</h2><p>The configured checks have no current exceptions. This is not a complete audit of company records.</p></section>'}</div>${
    history.length
      ? `<details class="finance-panel cost-history"><summary>Review history · ${history.length} records</summary>${[
          ...history,
        ]
          .reverse()
          .map(
            (r) =>
              `<p><strong>${esc(r.owner)}</strong> · ${all.some((i) => i.key === r.key) ? "Issue remains open" : "Source condition cleared"}<br>${esc(r.note)}<br><small>${esc(r.key)} · ${esc(r.actor)} · ${esc(r.at)}</small></p>`,
          )
          .join("")}</details>`
      : ""
  }<p class="help">This queue covers cost completeness, changed recipes/prices, material shortages, held batches, overdue POs/invoices, bank review and expired demand assumptions. Owner labels do not grant permissions or send notifications.</p></div>${decisionDialog(state, ui)}`;
}
function extraRow(state, e = { label: "", amountMinor: null, evidence: "" }) {
  return `<div class="cost-extra-row">${input("Cost name", "extraLabel", e.label, "text", 'maxlength="100"')}${fieldMoney(state, "Cost per unit", "extraAmount", e.amountMinor)}${input("Source / assumption", "extraEvidence", e.evidence, "text", 'maxlength="300"')}${button("remove-extra", "Remove", "", "text-button")}</div>`;
}
function decisionDialog(state, ui) {
  if (!ui.dialog) return "";
  const p = selectedProduct(state, ui),
    current = p ? latestCostSheet(state, p.id) : null;
  let title = "",
    fields = "";
  if (ui.dialog === "quote") {
    title = "Add material price";
    const material =
        state.materials.find((m) => m.id === ui.recordId) ?? state.materials[0],
      q = material ? latestQuote(state, material.id) : null;
    fields = `<p>Save a price observation. Existing cost sheets retain their original quote; save another cost version to use this price.</p>${currencyField(state)}${select(
      "Material",
      "materialId",
      state.materials.map((m) => [m.id, `${m.name} (${m.unit})`]),
      material?.id,
    )}<div class="form-grid">${fieldMoney(state, "Quoted total", "amountMinor", q?.amountMinor)}${input("Quoted quantity in base units (g or pieces)", "basisQuantity", q?.basisQuantity ?? 1000, "number", 'required min="1" max="1000000000" step="1"')}</div>${input("Effective date", "effectiveDate", state.asOf, "date", `required max="${state.asOf}"`)}${note("Quote reference or evidence", "evidence")}`;
  } else if (ui.dialog === "sheet") {
    title = "Save cost version";
    fields = `<p>${esc(p.name)} · Current recipe version ${p.version ?? 1}. Uses the latest material prices on or before the effective date. Earlier versions remain available.</p>${currencyField(state)}${input("Effective date", "effectiveDate", state.asOf, "date", `required max="${state.asOf}"`)}<h3>Additional costs per finished unit</h3><p class="help">Add all costs relevant to your estimate, such as filling, labour, freight or overhead. Leave an amount blank when unknown; enter zero only with supporting evidence.</p><div class="cost-extra-lines">${(current?.extras.length ? current.extras : [{ label: "Conversion", amountMinor: null, evidence: "" }]).map((e) => extraRow(state, e)).join("")}</div>${button("add-extra", "Add cost line")}<label class="scenario-toggle"><input name="overheadsReviewed" type="checkbox" ${current?.overheadsReviewed ? "checked" : ""}> All applicable non-material costs have been considered</label><div class="form-grid">${fieldMoney(state, "Selling price per unit (optional)", "sellingMinor", current?.sellingMinor)}${input("Selling price source", "sellingEvidence", current?.sellingEvidence ?? "", "text", 'maxlength="300"')}</div>${note("Review note / estimate scope", "note", current?.note ?? "")}`;
  } else if (ui.dialog === "demand") {
    title = "Add expected demand";
    fields = `<p>An unconfirmed quantity, additional to open customer orders. It affects the planner only when the expected-demand scenario is enabled.</p>${select(
      "Product",
      "productId",
      state.products.map((p) => [p.id, p.name]),
      p?.id,
    )}${input("Customer or scenario", "customer", "", "text", 'required maxlength="200"')}<div class="form-grid">${input("Expected units", "units", 100, "number", 'min="1" max="1000000" step="1" required')}${input("Expected date", "date", state.asOf, "date", `min="${state.asOf}" required`)}</div>${note("Evidence / assumption", "note")}`;
  } else if (ui.dialog === "withdraw") {
    title = "Withdraw demand assumption";
    fields = `<p>The original assumption remains in history and will stop contributing to planning.</p>${note("Reason", "reason")}`;
  } else if (ui.dialog === "review") {
    const item = workItems(state).find((i) => i.key === ui.recordId);
    if (!item) return "";
    title = "Assign and review";
    fields = `<p>${esc(item.title)}</p>${input("Owner / responsible team", "owner", item.review?.owner ?? "", "text", 'required maxlength="200"')}${note("Next action / review note", "note", item.review?.note ?? "")}<p class="help">This records responsibility. The issue stays open until its underlying condition is resolved.</p>`;
  }
  return `<dialog id="decision-dialog" class="decision-dialog"><form data-decision-form="${ui.dialog}"><div class="dialog-title"><h2>${title}</h2>${button("close", "Close", "", "quiet")}</div>${fields}${actor(state)}<button class="primary">Save ${ui.dialog === "sheet" ? "cost version" : ui.dialog === "quote" ? "price" : ui.dialog === "review" ? "review" : "assumption"}</button></form></dialog>`;
}
export function wireDecisions(
  root,
  { getState, ui, render, apply, notify, navigate, planBatch, download },
) {
  const open = () => {
    render();
    document.getElementById("decision-dialog")?.showModal();
  };
  root.addEventListener("click", async (event) => {
    const b = event.target.closest("[data-decision]");
    if (!b || root.getAttribute("aria-busy") === "true") return;
    const state = getState(),
      action = b.dataset.decision,
      id = b.dataset.id;
    try {
      if (action === "close") {
        ui.dialog = "";
        document.getElementById("decision-dialog")?.close();
        return;
      }
      if (action === "navigate") {
        ui.dialog = "";
        if (b.dataset.target === "costs") {
          ui.productId = id;
          ui.version = "";
        }
        navigate(b.dataset.target, id);
        return;
      }
      if (action === "expand") {
        ui.expanded = ui.expanded === id ? "" : id;
        render();
        root
          .querySelector(`[data-decision="expand"][data-id="${id}"]`)
          ?.focus();
        return;
      }
      if (action === "plan") {
        const row = demandPlan(state, {
          includeForecast: Boolean(ui.includeForecast),
        }).rows.find((r) => r.product.id === id);
        if (row?.toPlan) planBatch(id, Math.min(row.toPlan, 1000000));
        return;
      }
      if (action === "add-extra") {
        if (root.querySelectorAll(".cost-extra-row").length < 30)
          root
            .querySelector(".cost-extra-lines")
            .insertAdjacentHTML("beforeend", extraRow(state));
        return;
      }
      if (action === "remove-extra") {
        b.closest(".cost-extra-row").remove();
        return;
      }
      if (action === "export-cost") {
        const sheet = state.costing.sheets.find((s) => s.id === id);
        download(`${id.toLowerCase()}-estimate.json`, {
          notice:
            "Estimated cost, not measured batch cost or an accounting entry.",
          currency: currency(state),
          sheet,
          quotes: state.costing.quotes.filter((q) =>
            sheet.recipe.some((r) => r.quoteId === q.id),
          ),
          estimate: estimateCost(state, sheet, ui.volume ?? 1000),
        });
        return;
      }
      ui.dialog = action;
      ui.recordId = id;
      if (action === "sheet")
        ui.productId = id || selectedProduct(state, ui)?.id;
      open();
    } catch (error) {
      notify(error.message, true);
    }
  });
  root.addEventListener("change", (event) => {
    const { id, value, checked } = event.target;
    if (id === "cost-product") {
      ui.productId = value;
      ui.version = "";
    } else if (id === "cost-version") ui.version = value;
    else if (id === "include-demand-forecast") ui.includeForecast = checked;
    else if (id === "work-area-filter") ui.area = value;
    else return;
    render();
    document.getElementById(id)?.focus({ preventScroll: true });
  });
  root.addEventListener("submit", async (event) => {
    const form = event.target,
      type = form.dataset.decisionForm;
    if (!type) return;
    event.preventDefault();
    if (root.getAttribute("aria-busy") === "true") return;
    const data = Object.fromEntries(new FormData(form)),
      state = getState(),
      code = data.currency ?? currency(state);
    const amount = (value) =>
      String(value ?? "").trim() === "" ? null : parseMoney(value, code);
    try {
      if (type === "volume") {
        const n = Number(data.units);
        if (!Number.isSafeInteger(n) || n < 1 || n > 1000000)
          throw new Error("Choose 1–1,000,000 units.");
        ui.volume = n;
        render();
        return;
      }
      let action;
      if (type === "quote") {
        const n = amount(data.amountMinor);
        if (n === null)
          throw new Error(
            "Enter the quoted total, including zero when supported.",
          );
        action = {
          type: "cost_quote",
          currency: code,
          materialId: data.materialId,
          amountMinor: n,
          basisQuantity: Number(data.basisQuantity),
          effectiveDate: data.effectiveDate,
          evidence: data.evidence,
        };
      } else if (type === "sheet")
        action = {
          type: "cost_sheet",
          currency: code,
          productId: selectedProduct(state, ui).id,
          effectiveDate: data.effectiveDate,
          sellingMinor: amount(data.sellingMinor),
          sellingEvidence: data.sellingEvidence,
          overheadsReviewed: data.overheadsReviewed === "on",
          note: data.note,
          extras: [...form.querySelectorAll(".cost-extra-row")].map((row) => ({
            label: row.querySelector('[name="extraLabel"]').value,
            amountMinor: amount(
              row.querySelector('[name="extraAmount"]').value,
            ),
            evidence: row.querySelector('[name="extraEvidence"]').value,
          })),
        };
      else if (type === "demand")
        action = {
          type: "planning_assumption",
          productId: data.productId,
          customer: data.customer,
          units: Number(data.units),
          date: data.date,
          note: data.note,
        };
      else if (type === "withdraw")
        action = {
          type: "planning_withdraw",
          id: ui.recordId,
          reason: data.reason,
        };
      else if (type === "review")
        action = {
          type: "work_review",
          key: ui.recordId,
          owner: data.owner,
          note: data.note,
        };
      if (!action) return;
      const previous = ui.dialog;
      ui.dialog = "";
      if (await apply(action, data.actor, "Saved to the workspace.")) {
        if (type === "sheet") {
          ui.version = "";
          render();
        }
      } else ui.dialog = previous;
    } catch (error) {
      notify(error.message, true);
    }
  });
}
