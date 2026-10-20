import {
  latestCostSheet,
  latestQuote,
  estimateCost,
  costSheetStale,
} from "./product-costs.mjs";
import { demandPlan } from "./demand-planner.mjs";
import { financeOverview, documentBalance } from "./finance.mjs";
export function validateWorkReviews(state) {
  if (!state.workReviews) return;
  if (!Array.isArray(state.workReviews))
    throw new Error("Work reviews must be a list.");
  for (const r of state.workReviews) {
    for (const key of ["key", "owner", "note", "actor"])
      if (typeof r[key] !== "string" || !r[key].trim() || r[key].length > 300)
        throw new Error(`Review ${key} is required (up to 300 characters).`);
    if (!Number.isFinite(Date.parse(r.at)))
      throw new Error("Invalid review time.");
  }
}
export function workItems(state) {
  const items = [],
    add = (key, area, title, detail, target, id, priority = 2) =>
      items.push({ key, area, title, detail, target, id, priority });
  for (const p of state.products) {
    const s = latestCostSheet(state, p.id);
    if (!s)
      add(
        `cost:${p.id}`,
        "Finance",
        `Cost ${p.name}`,
        "No saved cost sheet. Add material prices and review non-material costs.",
        "costs",
        p.id,
      );
    else {
      const v = estimateCost(state, s),
        stale = costSheetStale(state, s);
      if (stale || v.missing.length)
        add(
          `cost:${p.id}`,
          "Finance",
          `Review ${p.name} costs`,
          stale
            ? "The product recipe changed after this cost version."
            : `Missing: ${v.missing.join(", ")}.`,
          "costs",
          p.id,
        );
      else if (v.marginMinor !== null && v.marginMinor < 0)
        add(
          `margin:${p.id}`,
          "Finance",
          `Selling price below estimated cost`,
          `${p.name}: inspect the price and cost sources before accepting the estimate.`,
          "costs",
          p.id,
          1,
        );
      const newer = s.recipe.some((r) => {
        const q = latestQuote(state, r.materialId);
        return q && q.id !== r.quoteId;
      });
      if (newer && !stale)
        add(
          `quotes:${p.id}`,
          "Finance",
          `New price evidence for ${p.name}`,
          "A newer material price is available. Saved costs remain unchanged until you save another version.",
          "costs",
          p.id,
          3,
        );
    }
  }
  const plan = demandPlan(state);
  for (const m of plan.materials.filter((m) => m.shortfall > 0))
    add(
      `material:${m.id}`,
      "Operations",
      `Material shortfall: ${m.name}`,
      `${m.shortfall.toLocaleString("en")} ${m.unit} short across planned and proposed batches. Incoming POs are not usable stock.`,
      "planner",
      m.id,
      1,
    );
  for (const b of state.batches.filter((b) => b.status === "quality_hold"))
    add(
      `quality:${b.id}`,
      "Quality",
      `Review ${b.id}`,
      `${b.actualUnits.toLocaleString("en")} finished units remain held until inspection and explicit release.`,
      "batch",
      b.id,
      1,
    );
  for (const po of state.supplierOrders ?? []) {
    const outstanding = po.lines.reduce(
      (n, l) =>
        n +
        l.quantity -
        state.lots
          .filter(
            (lot) =>
              lot.purchaseOrderId === po.id && lot.purchaseOrderLineId === l.id,
          )
          .reduce((n, l) => n + l.receivedQuantity, 0),
      0,
    );
    if (po.dueDate && po.dueDate < state.asOf && outstanding > 0)
      add(
        `supplier:${po.id}`,
        "Purchasing",
        `Overdue supplier PO ${po.id}`,
        `Expected ${po.dueDate}. One or more material lines remain outstanding.`,
        "supplier",
        po.id,
        1,
      );
  }
  for (const o of state.orders) {
    const outstanding =
      o.units -
      state.shipments
        .filter((s) => s.orderId === o.id)
        .reduce((n, s) => n + s.units, 0);
    if (o.dueDate && o.dueDate < state.asOf && outstanding > 0)
      add(
        `order:${o.id}`,
        "Operations",
        `Dispatch overdue: ${o.poReference ?? o.id}`,
        `${outstanding.toLocaleString("en")} units outstanding for ${o.customer}; due ${o.dueDate}.`,
        "customer",
        o.poReference ?? o.id,
        1,
      );
  }
  if (state.finance) {
    for (const d of state.finance.documents)
      if (
        d.dueDate < state.asOf &&
        documentBalance(state.finance, d, state.asOf).outstanding > 0
      )
        add(
          `invoice:${d.id}`,
          "Finance",
          `Invoice overdue: ${d.reference}`,
          `Due ${d.dueDate}; review the remaining balance and payment evidence.`,
          "invoice",
          d.id,
          1,
        );
    const pending = financeOverview(state).pending;
    if (pending.length)
      add(
        "bank:review",
        "Finance",
        `Review ${pending.length} bank movement${pending.length === 1 ? "" : "s"}`,
        "Classification or payment allocation is still needed. Open the supporting records.",
        "reconcile",
        "",
        2,
      );
  }
  for (const a of state.planning?.assumptions ?? [])
    if (!a.withdrawn && a.date < state.asOf)
      add(
        `demand:${a.id}`,
        "Operations",
        `Review expired demand assumption`,
        `${a.customer}: expected ${a.date}. It is excluded from future planning; withdraw or replace it.`,
        "planner",
        a.productId,
        2,
      );
  return items
    .map((item) => ({
      ...item,
      review:
        state.workReviews?.filter((r) => r.key === item.key).at(-1) ?? null,
    }))
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
}
export function applyWorkReview(state, action, context) {
  if (!workItems(state).some((i) => i.key === action.key))
    throw new Error(
      "This issue has changed or is resolved. Refresh before reviewing it.",
    );
  state.workReviews ??= [];
  state.workReviews.push({
    key: action.key,
    owner: action.owner?.trim(),
    note: action.note?.trim(),
    ...context,
  });
  validateWorkReviews(state);
}
