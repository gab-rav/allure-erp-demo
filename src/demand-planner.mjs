import {
  latestCostSheet,
  estimateCost,
  costSheetStale,
} from "./product-costs.mjs";
import { validDate } from "./finance.mjs";
const ensure = (ok, message) => {
  if (!ok) throw new Error(message);
};
const sum = (rows) => {
  const value = rows.reduce((a, b) => a + b, 0);
  ensure(
    Number.isSafeInteger(value) && value >= 0,
    "Planning quantity is too large.",
  );
  return value;
};
const text = (v, title) => {
  ensure(
    typeof v === "string" && v.trim() && v.length <= 300,
    `${title} is required (up to 300 characters).`,
  );
  return v.trim();
};
const shipped = (state, id) =>
  sum(state.shipments.filter((s) => s.orderId === id).map((s) => s.units));
const median = (values) => {
  const a = [...values].sort((a, b) => a - b),
    m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
const addDays = (d, n) =>
  new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
export function validatePlanning(state) {
  if (!state.planning) return;
  ensure(
    Array.isArray(state.planning.assumptions),
    "Demand assumptions must be a list.",
  );
  for (const [i, a] of state.planning.assumptions.entries()) {
    ensure(a.id === `DEMAND-${i + 1}`, "Invalid demand assumption sequence.");
    ensure(
      state.products.some((p) => p.id === a.productId),
      "Demand product not found.",
    );
    ensure(
      Number.isSafeInteger(a.units) && a.units > 0 && a.units <= 1000000,
      "Expected demand must be 1–1,000,000 units.",
    );
    ensure(validDate(a.date), "Expected demand needs a valid date.");
    text(a.customer, "Customer or scenario");
    text(a.note, "Demand evidence");
    text(a.actor, "Planner");
    ensure(Number.isFinite(Date.parse(a.at)), "Invalid planning time.");
    if (a.withdrawn) {
      text(a.withdrawn.reason, "Withdrawal reason");
      text(a.withdrawn.actor, "Reviewer");
      ensure(
        Number.isFinite(Date.parse(a.withdrawn.at)),
        "Invalid withdrawal time.",
      );
    }
  }
}
export function applyPlanningAction(state, action, context) {
  state.planning ??= { assumptions: [] };
  if (action.type === "planning_assumption") {
    ensure(
      validDate(action.date) && action.date >= state.asOf,
      "Expected demand must be dated today or later.",
    );
    state.planning.assumptions.push({
      id: `DEMAND-${state.planning.assumptions.length + 1}`,
      productId: action.productId,
      units: action.units,
      date: action.date,
      customer: text(action.customer, "Customer or scenario"),
      note: text(action.note, "Demand evidence"),
      ...context,
    });
  } else if (action.type === "planning_withdraw") {
    const a = state.planning.assumptions.find((a) => a.id === action.id);
    ensure(a && !a.withdrawn, "Choose an active demand assumption.");
    a.withdrawn = {
      reason: text(action.reason, "Withdrawal reason"),
      ...context,
    };
  } else throw new Error("Unknown planning action.");
  validatePlanning(state);
}

/** Conservative cadence hints: only dated, fully dispatched order series, never invoices. */
export function reorderSuggestions(state, horizonDays = 90) {
  const groups = new Map();
  for (const o of state.orders) {
    if (
      !o.createdAt ||
      !validDate(o.createdAt.slice(0, 10)) ||
      o.createdAt.slice(0, 10) > state.asOf
    )
      continue;
    const key = JSON.stringify([o.customer, o.productId]);
    const g = groups.get(key) ?? {
      customer: o.customer,
      productId: o.productId,
      events: new Map(),
    };
    const ref = o.poReference ?? o.id,
      item = g.events.get(ref) ?? { date: o.createdAt.slice(0, 10), units: 0 };
    item.units = sum([item.units, o.units]);
    g.events.set(ref, item);
    groups.set(key, g);
  }
  const suggestions = [];
  for (const g of groups.values()) {
    if (
      state.orders.some(
        (o) =>
          o.productId === g.productId &&
          o.customer === g.customer &&
          o.units > shipped(state, o.id),
      )
    )
      continue;
    if (
      state.planning?.assumptions.some(
        (a) =>
          !a.withdrawn &&
          a.productId === g.productId &&
          a.customer === g.customer &&
          a.date >= state.asOf &&
          a.date <= addDays(state.asOf, horizonDays),
      )
    )
      continue;
    const events = [...g.events.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    if (events.length < 3 || new Set(events.map((e) => e.date)).size < 3)
      continue;
    const gaps = events
        .slice(1)
        .map((e, i) => days(e.date, events[i].date))
        .filter((d) => d > 0),
      cadence = Math.round(median(gaps));
    const last = events.at(-1),
      expected = addDays(last.date, cadence);
    if (
      expected > addDays(state.asOf, horizonDays) ||
      days(state.asOf, last.date) > cadence * 2
    )
      continue;
    suggestions.push({
      id: `cadence:${JSON.stringify([g.customer, g.productId])}`,
      productId: g.productId,
      customer: g.customer,
      units: Math.max(1, Math.round(median(events.map((e) => e.units)))),
      date: expected,
      kind: "cadence",
      note: `${events.length} dated orders; median interval ${cadence} days. A planning hint, not a confirmed order.`,
      orderCount: events.length,
    });
  }
  return suggestions;
}

/** All open orders; work in progress is a provisional plan, held output never counts as usable stock. */
export function demandPlan(
  state,
  { includeForecast = false, horizonDays = 90 } = {},
) {
  ensure(
    Number.isSafeInteger(horizonDays) && horizonDays >= 1 && horizonDays <= 365,
    "Choose a forecast horizon from 1 to 365 days.",
  );
  const through = addDays(state.asOf, horizonDays);
  const assumptions = (state.planning?.assumptions ?? [])
    .filter((a) => !a.withdrawn && a.date >= state.asOf && a.date <= through)
    .map((a) => ({ ...a, kind: "manual" }));
  const forecast = [...assumptions, ...reorderSuggestions(state, horizonDays)];
  const rows = state.products.map((product) => {
    const orders = state.orders
      .filter((o) => o.productId === product.id)
      .map((o) => ({ ...o, outstanding: o.units - shipped(state, o.id) }))
      .filter((o) => o.outstanding > 0);
    const batches = state.batches.filter((b) => b.productId === product.id);
    const released = sum(
      batches
        .filter((b) => b.status === "released")
        .map(
          (b) =>
            b.actualUnits -
            sum(
              state.shipments
                .filter((s) => s.batchId === b.id)
                .map((s) => s.units),
            ),
        ),
    );
    const held = sum(
      batches
        .filter((b) => b.status === "quality_hold")
        .map((b) => b.actualUnits),
    );
    const running = sum(
      batches
        .filter((b) => b.status === "in_progress")
        .map((b) => b.plannedUnits),
    );
    const planned = sum(
      batches.filter((b) => b.status === "planned").map((b) => b.plannedUnits),
    );
    const expected = forecast.filter((f) => f.productId === product.id),
      committed = sum(orders.map((o) => o.outstanding)),
      forecastUnits = includeForecast ? sum(expected.map((f) => f.units)) : 0;
    const demand = sum([committed, forecastUnits]);
    const stockGap = Math.max(0, demand - released),
      toPlan = Math.max(0, stockGap - running - planned);
    const sheet = latestCostSheet(state, product.id),
      stale = sheet ? costSheetStale(state, sheet) : false;
    const cost =
      toPlan && sheet && !stale ? estimateCost(state, sheet, toPlan) : null;
    return {
      product,
      orders,
      batches,
      committed,
      forecastUnits,
      expected,
      released,
      held,
      running,
      planned,
      demand,
      stockGap,
      toPlan,
      cost,
      stale,
      sheet,
    };
  });
  const materials = state.materials
    .map((material) => {
      const existing = sum(
        state.batches
          .filter((b) => b.status === "planned")
          .map((b) => {
            const recipe =
              b.recipeSnapshot ??
              state.products.find((p) => p.id === b.productId).recipe;
            return sum(
              recipe
                .filter((r) => r.materialId === material.id)
                .map((r) => r.perUnit * b.plannedUnits),
            );
          }),
      );
      const proposed = sum(
        rows.map((r) =>
          sum(
            r.product.recipe
              .filter((c) => c.materialId === material.id)
              .map((c) => c.perUnit * r.toPlan),
          ),
        ),
      );
      const available = sum(
        state.lots
          .filter(
            (l) =>
              l.materialId === material.id &&
              l.status === "released" &&
              l.expires >= state.asOf,
          )
          .map((l) => l.available),
      );
      const incoming = sum(
        (state.supplierOrders ?? []).flatMap((po) =>
          po.lines
            .filter((l) => l.materialId === material.id)
            .map(
              (l) =>
                l.quantity -
                sum(
                  state.lots
                    .filter(
                      (lot) =>
                        lot.purchaseOrderId === po.id &&
                        lot.purchaseOrderLineId === l.id,
                    )
                    .map((lot) => lot.receivedQuantity),
                ),
            ),
        ),
      );
      const required = sum([existing, proposed]);
      return {
        ...material,
        existing,
        proposed,
        required,
        available,
        incoming,
        shortfall: Math.max(0, required - available),
      };
    })
    .filter((m) => m.required > 0);
  const costs = rows.filter((r) => r.toPlan > 0);
  const completeCosts = costs.every((r) => r.cost?.totalMinor != null);
  const estimateMinor = completeCosts
    ? sum(costs.map((r) => r.cost.totalMinor))
    : null;
  return {
    rows,
    materials,
    forecast,
    through,
    includeForecast,
    estimateMinor,
    totalToPlan: sum(rows.map((r) => r.toPlan)),
    committed: sum(rows.map((r) => r.committed)),
    held: sum(rows.map((r) => r.held)),
  };
}
