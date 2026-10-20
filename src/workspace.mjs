import { SCHEMA_VERSION, validateState, transition, REQUIRED_CHECKS, CHECK_LABELS } from "./manufacturing.mjs";
import { applyFinanceAction } from "./finance.mjs";
import { createPurchaseOrder } from "./purchase-orders.mjs";

import { applyCostAction } from "./product-costs.mjs";
import { applyPlanningAction } from "./demand-planner.mjs";
import { applyWorkReview } from "./work-items.mjs";

function ensure(value, message) { if (!value) throw new Error(message); }
function label(value, name) {
  ensure(typeof value === "string" && value.trim().length > 0 && value.length <= 200, `${name} is required (maximum 200 characters).`);
  return value.trim();
}
function id(value) {
  const result = label(value, "Identifier");
  ensure(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}$/.test(result), "Use up to 60 letters, numbers, dots, dashes or underscores for identifiers.");
  return result;
}
function unique(rows, value) { ensure(!rows.some(row => row.id.toLowerCase() === value.toLowerCase()), "This identifier already exists."); }
function date(value) {
  ensure(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Enter a valid date.");
  return value;
}
export function createWorkspace() {
  return { schemaVersion: SCHEMA_VERSION, company: "Your company", asOf: new Date().toISOString().slice(0, 10), settings: { configured: false, sample: false, location: "Main store" }, products: [], materials: [], lots: [], batches: [], orders: [], shipments: [], audit: [] };
}

/** Configuration and master data use a validated action boundary and append a decision record. */
export function workspaceTransition(input, action, context) {
  const state = structuredClone(validateState(input));
  const actor = label(context.actor, "Recorded by");
  const at = context.at ?? new Date().toISOString();
  ensure(Number.isFinite(Date.parse(at)), "Invalid action time.");
  if (!state.settings?.sample) state.asOf = at.slice(0, 10);
  if (action.type.startsWith("cost_") || action.type.startsWith("planning_") || action.type === "work_review") {
    ensure(state.settings?.configured !== false, "Set up the company first.");
    if (action.type.startsWith("cost_")) applyCostAction(state, action, {actor,at});
    else if (action.type.startsWith("planning_")) applyPlanningAction(state, action, {actor,at});
    else applyWorkReview(state, action, {actor,at});
    state.audit.push({id:`event-${state.audit.length+1}`,type:action.type,actor,at,batchId:null,detail:JSON.stringify(action)});
    return validateState(state);
  }
  if (action.type.startsWith("finance_")) {
    ensure(state.settings?.configured !== false, "Set up the company first.");
    applyFinanceAction(state, action, { actor, at });
    state.audit.push({ id: `event-${state.audit.length + 1}`, type: action.type, actor, at, batchId: null, detail: JSON.stringify(action) });
    return validateState(state);
  }
  switch (action.type) {
    case "configure_company":
      state.company = label(action.company, "Company name");
      state.settings = { ...state.settings, configured: true, location: label(action.location, "Default finished-stock location") };
      break;
    case "add_material": {
      const materialId = id(action.id); unique(state.materials, materialId);
      ensure(["g", "each"].includes(action.unit), "Choose grams or individual pieces.");
      state.materials.push({ id: materialId, name: label(action.name, "Material name"), unit: action.unit });
      break;
    }
    case "save_product": {
      const productId = id(action.id);
      ensure(Array.isArray(action.recipe) && action.recipe.length > 0, "Add at least one recipe input.");
      const qualityChecks = (action.qualityChecks ?? REQUIRED_CHECKS.map(key => ({ key, label: CHECK_LABELS[key] }))).map(check => ({ key: id(check.key), label: label(check.label, "Inspection name") }));
      const existing = state.products.find(row => row.id === productId);
      if (!existing) unique(state.products, productId);
      const product = { id: productId, name: label(action.name, "Product name"), size: label(action.size, "Pack description"), netGrams: action.netGrams, recipe: action.recipe.map(row => ({ materialId: row.materialId, perUnit: row.perUnit })), qualityChecks, version: (existing?.version ?? 0) + 1 };
      if (existing) state.products[state.products.indexOf(existing)] = product; else state.products.push(product);
      break;
    }
    case "receive_lot": {
      const lotId = id(action.id); unique(state.lots, lotId);
      ensure(Number.isSafeInteger(action.quantity) && action.quantity > 0, "Received quantity must be a positive whole number in the material's base unit.");
      let materialId = action.materialId, supplier = action.supplier;
      const purchaseLink = {};
      if (action.purchaseOrderId || action.purchaseOrderLineId) {
        const po = state.supplierOrders?.find(row => row.id === action.purchaseOrderId);
        const line = po?.lines.find(row => row.id === action.purchaseOrderLineId);
        ensure(line, "Supplier PO line not found.");
        ensure(materialId == null || materialId === line.materialId, "Receipt material does not match the supplier PO.");
        ensure(supplier == null || supplier === po.supplier, "Receipt supplier does not match the supplier PO.");
        materialId = line.materialId; supplier = po.supplier;
        Object.assign(purchaseLink, { purchaseOrderId: po.id, purchaseOrderLineId: line.id });
      }
      state.lots.push({ id: lotId, materialId, supplier: label(supplier, "Supplier"), available: action.quantity, receivedQuantity: action.quantity, receivedAt: at, status: "quarantine", expires: date(action.expires), ...purchaseLink });
      break;
    }
    case "release_lot": {
      const lot = state.lots.find(row => row.id === action.lotId);
      ensure(lot?.status === "quarantine", "Choose a quarantined material lot.");
      ensure(lot.expires >= state.asOf, "An expired material lot cannot be released.");
      lot.releaseNote = label(action.note, "Incoming inspection note"); lot.status = "released"; lot.releasedBy = actor; lot.releasedAt = at;
      break;
    }
    case "create_order": {
      const orderId = id(action.id); unique(state.orders, orderId);
      state.orders.push({ id: orderId, productId: action.productId, customer: label(action.customer, "Customer"), destination: label(action.destination, "Ship-to destination"), units: action.units, invoicedUnits: 0 });
      break;
    }
    case "create_customer_po":
    case "create_supplier_po":
      createPurchaseOrder(state, action, actor, at);
      break;
    default:
      ensure(state.settings?.configured !== false, "Set up the company first.");
      if (action.type === "dispatch") label(action.destination ?? state.orders.find(row => row.id === action.orderId)?.destination, "Ship-to destination");
      return transition(state, action, { actor, at });
  }
  state.audit.push({ id: `event-${state.audit.length + 1}`, type: action.type, actor, at, batchId: null, detail: `${action.type.replaceAll("_", " ")}: ${action.id ?? action.lotId ?? state.company}` });
  return validateState(state);
}
