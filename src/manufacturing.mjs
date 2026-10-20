// Portable manufacturing workflow core. No network, filesystem or UI dependencies.
// Finance is validated by a separate sub-ledger; chemical/process control remains outside scope.
import { validateFinance } from "./finance.mjs";
import { validatePurchasing } from "./purchase-orders.mjs";
import { validateCosting } from "./product-costs.mjs";
import { validatePlanning } from "./demand-planner.mjs";
import { validateWorkReviews } from "./work-items.mjs";
export const SCHEMA_VERSION = 1;
export const REQUIRED_CHECKS = ["appearance", "consistency", "fill_weight"];
export const CHECK_LABELS = { appearance: "Appearance", consistency: "Consistency", fill_weight: "Fill weight" };
const STATUSES = new Set(["planned", "in_progress", "quality_hold", "released"]);

function requireThat(condition, message) { if (!condition) throw new Error(message); }
function positive(value, name) {
  requireThat(Number.isSafeInteger(value) && value > 0, `${name} must be a positive whole number.`);
}
function nonnegative(value, name) {
  requireThat(Number.isSafeInteger(value) && value >= 0, `${name} must be a non-negative whole number.`);
}
function byId(rows, id, label) {
  const row = rows.find((item) => item.id === id);
  requireThat(row, `${label} not found.`);
  return row;
}
function text(value, label) {
  requireThat(typeof value === "string" && value.trim().length > 0 && value.length <= 500, `${label} is required (maximum 500 characters).`);
  return value.trim();
}

function assignment(site, line) {
  const productionSite = site == null || site === "" ? "" : text(site, "Production plant");
  const productionLine = line == null || line === "" ? "" : text(line, "Production line");
  requireThat(!productionLine || productionSite, "Choose a production plant before assigning a line.");
  return { productionSite, productionLine };
}

/** Guard saved workspace structure and stock invariants. */
export function validateState(state) {
  requireThat(state?.schemaVersion === SCHEMA_VERSION, "Unsupported workspace version. Preserve the file and migrate it before opening.");
  requireThat(typeof state.company === "string" && /^\d{4}-\d{2}-\d{2}$/.test(state.asOf), "Invalid company or workspace date.");
  for (const name of ["products", "materials", "lots", "batches", "orders", "shipments", "audit"]) {
    requireThat(Array.isArray(state[name]), `${name} must be a list.`);
    const ids = state[name].map((item) => item.id);
    requireThat(ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length, `${name} must have unique IDs.`);
  }
  for (const material of state.materials) {
    requireThat(["g", "each"].includes(material.unit), "Unsupported material unit.");
    text(material.name, "Material name");
  }
  for (const product of state.products) {
    text(product.name, "Product name");
    positive(product.netGrams, "Unit net weight");
    requireThat(Array.isArray(product.recipe) && product.recipe.length > 0, "Recipe is missing.");
    requireThat(new Set(product.recipe.map((r) => r.materialId)).size === product.recipe.length, "Recipe components must be unique.");
    for (const component of product.recipe) {
      byId(state.materials, component.materialId, "Recipe material");
      positive(component.perUnit, "Recipe quantity");
    }
    if (product.qualityChecks) {
      requireThat(Array.isArray(product.qualityChecks) && product.qualityChecks.length > 0 && new Set(product.qualityChecks.map(c => c.key)).size === product.qualityChecks.length, "Quality checks must be unique and non-empty.");
      for (const check of product.qualityChecks) { text(check.key, "Check key"); text(check.label, "Check label"); }
    }
  }
  for (const lot of state.lots) {
    byId(state.materials, lot.materialId, "Lot material");
    nonnegative(lot.available, "Available material");
    requireThat(["released", "quarantine"].includes(lot.status), "Invalid incoming quality status.");
    requireThat(/^\d{4}-\d{2}-\d{2}$/.test(lot.expires), "Invalid lot expiry.");
  }
  for (const batch of state.batches) {
    assignment(batch.productionSite, batch.productionLine);
    byId(state.products, batch.productId, "Batch product");
    positive(batch.plannedUnits, "Planned units");
    nonnegative(batch.actualUnits, "Actual units");
    requireThat(batch.actualUnits <= batch.plannedUnits && STATUSES.has(batch.status), "Invalid batch state.");
    requireThat(Array.isArray(batch.allocations) && Array.isArray(batch.checks), "Batch records are missing.");
    if (batch.qualityChecks) {
      requireThat(Array.isArray(batch.qualityChecks) && batch.qualityChecks.length > 0 && new Set(batch.qualityChecks.map(c => c.key)).size === batch.qualityChecks.length, "Batch quality checks must be unique and non-empty.");
      for (const check of batch.qualityChecks) { text(check.key, "Check key"); text(check.label, "Check label"); }
    }
    if (batch.recipeSnapshot) {
      requireThat(Array.isArray(batch.recipeSnapshot) && batch.recipeSnapshot.length > 0 && new Set(batch.recipeSnapshot.map(row => row.materialId)).size === batch.recipeSnapshot.length, "Batch recipe must contain unique inputs.");
      for (const row of batch.recipeSnapshot) { byId(state.materials, row.materialId, "Recipe material"); positive(row.perUnit, "Recipe quantity"); }
    }
    for (const allocation of batch.allocations) {
      const lot = byId(state.lots, allocation.lotId, "Allocated lot");
      requireThat(lot.materialId === allocation.materialId, "Allocated material does not match its lot.");
      positive(allocation.quantity, "Issued quantity");
    }
    for (const check of batch.checks) {
      requireThat(requiredChecks(batch).includes(check.key) && ["pass", "fail"].includes(check.result), "Invalid quality check.");
      text(check.note, "Inspection evidence"); text(check.actor, "Inspector");
    }
    if (batch.status === "released") {
      requireThat(batch.actualUnits > 0 && qualityReady(batch), "Released batch must have passing quality checks.");
      text(batch.releasedBy, "Release reviewer");
    }
  }
  for (const order of state.orders) {
    byId(state.products, order.productId, "Order product");
    positive(order.units, "Ordered units"); nonnegative(order.invoicedUnits, "Invoiced units");
  }
  for (const shipment of state.shipments) {
    const batch = byId(state.batches, shipment.batchId, "Shipment batch");
    const order = byId(state.orders, shipment.orderId, "Shipment order");
    positive(shipment.units, "Shipment units");
    requireThat(batch.status === "released" && batch.productId === order.productId, "Shipment requires a released, matching batch.");
  }
  requireThat(new Set(state.shipments.map((s) => s.reference)).size === state.shipments.length, "Dispatch references must be unique.");
  for (const batch of state.batches) requireThat(shippedFromBatch(state, batch.id) <= batch.actualUnits, "Batch is overshipped.");
  for (const order of state.orders) requireThat(shippedToOrder(state, order.id) <= order.units, "Order is overshipped.");
  validatePurchasing(state);
  validateFinance(state);
  validateCosting(state);
  validatePlanning(state);
  validateWorkReviews(state);
  return state;
}

export function latestCheck(batch, key) { return batch.checks.filter((check) => check.key === key).at(-1); }
export function requiredChecks(batch) { return batch.qualityChecks?.map(check => check.key) ?? REQUIRED_CHECKS; }
export function checkLabel(batch, key) { return batch.qualityChecks?.find(check => check.key === key)?.label ?? CHECK_LABELS[key] ?? key; }
export function qualityReady(batch) { return requiredChecks(batch).every((key) => latestCheck(batch, key)?.result === "pass"); }
export function shippedFromBatch(state, id) { return state.shipments.filter((s) => s.batchId === id).reduce((sum, s) => sum + s.units, 0); }
export function shippedToOrder(state, id) { return state.shipments.filter((s) => s.orderId === id).reduce((sum, s) => sum + s.units, 0); }
export function availableFinished(state, batch) { return batch.status === "released" ? batch.actualUnits - shippedFromBatch(state, batch.id) : 0; }
export function batchStatus(batch) {
  if (batch.status === "quality_hold" && qualityReady(batch)) return "Ready for release";
  return { planned: "Planned", in_progress: "In production", quality_hold: "Quality hold", released: "Released" }[batch.status];
}
export function materialPlan(state, productId, units, recipe) {
  positive(units, "Planned units");
  const product = byId(state.products, productId, "Product");
  return (recipe ?? product.recipe).map((component) => {
    const material = byId(state.materials, component.materialId, "Material");
    const required = component.perUnit * units;
    requireThat(Number.isSafeInteger(required), "Batch is too large.");
    const available = state.lots.filter((lot) => lot.materialId === material.id && lot.status === "released" && lot.expires >= state.asOf)
      .reduce((sum, lot) => sum + lot.available, 0);
    return { ...material, required, available, shortfall: Math.max(0, required - available) };
  });
}
export function traceBatch(state, batchId) {
  const batch = byId(state.batches, batchId, "Batch");
  return {
    batch,
    inputs: batch.allocations.map((allocation) => ({ ...allocation, lot: byId(state.lots, allocation.lotId, "Lot"), material: byId(state.materials, allocation.materialId, "Material") })),
    inspections: batch.checks,
    shipments: state.shipments.filter((shipment) => shipment.batchId === batch.id),
    events: state.audit.filter((event) => event.batchId === batch.id),
  };
}

/** Atomic transitions: clone first; validate before returning; never alter input state. */
export function transition(input, action, context = {}) {
  validateState(input);
  const state = structuredClone(input);
  const actor = text(context.actor, "Actor");
  const at = context.at ?? new Date().toISOString();
  requireThat(Number.isFinite(Date.parse(at)), "Invalid action time.");
  const event = { id: `event-${state.audit.length + 1}`, type: action.type, actor, at, batchId: action.batchId ?? null };
  switch (action.type) {
    case "plan_batch": {
      const batchId = text(action.id, "Batch ID"); positive(action.units, "Planned units");
      requireThat(!state.batches.some((b) => b.id.toLowerCase() === batchId.toLowerCase()), "Batch ID already exists.");
      const product = byId(state.products, action.productId, "Product");
      materialPlan(state, action.productId, action.units);
      const location = assignment(action.productionSite, action.productionLine);
      state.batches.push({ id: batchId, productId: action.productId, plannedUnits: action.units, actualUnits: 0, status: "planned", allocations: [], checks: [], ...location, recipeSnapshot: structuredClone(product.recipe), recipeVersion: product.version ?? 1, qualityChecks: structuredClone(product.qualityChecks ?? REQUIRED_CHECKS.map(key => ({ key, label: CHECK_LABELS[key] }))), productName: product.name, productSize: product.size });
      event.batchId = batchId; event.detail = `Planned ${action.units} units.${location.productionSite ? ` Production: ${location.productionSite}${location.productionLine ? ` / ${location.productionLine}` : ""}.` : ""}`;
      break;
    }
    case "assign_batch": {
      const batch = byId(state.batches, action.batchId, "Batch");
      requireThat(batch.status === "planned", "Production assignment can only change before a batch starts.");
      const location = assignment(action.productionSite, action.productionLine);
      Object.assign(batch, location);
      event.detail = location.productionSite ? `Assigned production to ${location.productionSite}${location.productionLine ? ` / ${location.productionLine}` : ""}.` : "Cleared production assignment.";
      break;
    }
    case "start_batch": {
      const batch = byId(state.batches, action.batchId, "Batch");
      requireThat(batch.status === "planned", "Only a planned batch can start.");
      const plan = materialPlan(state, batch.productId, batch.plannedUnits, batch.recipeSnapshot);
      requireThat(plan.every((row) => row.shortfall === 0), "Insufficient released, unexpired materials. Resolve the shortage first.");
      for (const row of plan) {
        let remaining = row.required;
        const candidates = state.lots.filter((lot) => lot.materialId === row.id && lot.status === "released" && lot.expires >= state.asOf)
          .sort((a, b) => a.expires.localeCompare(b.expires) || a.id.localeCompare(b.id));
        for (const lot of candidates) {
          const quantity = Math.min(lot.available, remaining);
          if (quantity > 0) { lot.available -= quantity; remaining -= quantity; batch.allocations.push({ lotId: lot.id, materialId: row.id, quantity }); }
        }
      }
      batch.status = "in_progress"; batch.startedAt = at;
      event.detail = "Materials issued by earliest expiry. Input lot allocation recorded.";
      break;
    }
    case "finish_batch": {
      const batch = byId(state.batches, action.batchId, "Batch");
      requireThat(batch.status === "in_progress", "Only an active batch can finish.");
      positive(action.units, "Actual units");
      requireThat(action.units <= batch.plannedUnits, "This alpha supports output up to the planned quantity.");
      const note = text(action.note, "Production note");
      batch.actualUnits = action.units; batch.status = "quality_hold"; batch.finishedAt = at;
      batch.productionNote = note;
      batch.stockLocation = state.settings?.location ?? "Finished-goods store";
      event.detail = `Recorded ${action.units} units; ${batch.plannedUnits - action.units} units below plan. ${note}`;
      break;
    }
    case "record_check": {
      const batch = byId(state.batches, action.batchId, "Batch");
      requireThat(batch.status === "quality_hold", "Quality results can only be recorded for a held batch.");
      requireThat(requiredChecks(batch).includes(action.key), "Unknown inspection check.");
      requireThat(["pass", "fail"].includes(action.result), "Record pass or fail.");
      const note = text(action.note, "Inspection evidence or retest reason");
      batch.checks.push({ key: action.key, result: action.result, note, actor, at });
      event.detail = `${checkLabel(batch, action.key)}: ${action.result}. ${note}`;
      break;
    }
    case "release_batch": {
      const batch = byId(state.batches, action.batchId, "Batch");
      requireThat(batch.status === "quality_hold", "Only a held batch can be released.");
      requireThat(qualityReady(batch), "All required quality checks must pass before release.");
      const note = text(action.note, "Release note");
      batch.status = "released"; batch.releasedAt = at; batch.releasedBy = actor;
      event.detail = `Released ${batch.actualUnits} units. ${note}`;
      break;
    }
    case "dispatch": {
      const batch = byId(state.batches, action.batchId, "Batch");
      const order = byId(state.orders, action.orderId, "Order");
      requireThat(batch.status === "released", "Quality hold: release the batch before dispatch.");
      requireThat(batch.productId === order.productId, "The batch product does not match the order.");
      positive(action.units, "Dispatch quantity");
      requireThat(action.units <= availableFinished(state, batch), "Dispatch exceeds available released stock.");
      requireThat(action.units <= order.units - shippedToOrder(state, order.id), "Dispatch exceeds the outstanding order.");
      const reference = text(action.reference, "Dispatch reference");
      requireThat(!state.shipments.some((s) => s.reference.toUpperCase() === reference.toUpperCase()), "Dispatch reference already exists; it cannot be posted twice.");
      state.shipments.push({ id: `shipment-${state.shipments.length + 1}`, reference, batchId: batch.id, orderId: order.id, units: action.units, customer: order.customer, destination: action.destination?.trim() || order.destination || "Destination not recorded", actor, at });
      event.detail = `Dispatched ${action.units} units against ${order.id}; ${reference}.`;
      break;
    }
    default: throw new Error("Unknown workflow action.");
  }
  state.audit.push(event);
  return validateState(state);
}
