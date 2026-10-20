// Entirely invented personal-care filling and packing fixture.
// Bulk products are already formulated; these are not cosmetic formulation instructions.
// Company, supplier, customer and inspection records are fictional.
import { addSamplePlanning } from "./planning-seed.mjs";
import { SCHEMA_VERSION, transition } from "../src/manufacturing.mjs";
import { addSampleFinance } from "./finance-seed.mjs";
import { workspaceTransition } from "../src/workspace.mjs";

export function createDemo() {
  const qualityChecks = [
    { key: "appearance", label: "Appearance & fragrance" },
    { key: "consistency", label: "Texture / consistency" },
    { key: "fill_weight", label: "Net fill weight" },
  ];
  let state = {
    schemaVersion: SCHEMA_VERSION, company: "Alder & Coast Personal Care", asOf: "2026-09-30",
    products: [
      { id: "SHAM-MOIST-500", name: "Hair Shampoo (Moisturising)", size: "500 g · pump bottle", netGrams: 500, qualityChecks, recipe: [{ materialId: "BULK-SHAM", perUnit: 500 }, { materialId: "BOTTLE-500", perUnit: 1 }, { materialId: "LABEL-SHAM", perUnit: 1 }] },
      { id: "WASH-TEA-250", name: "Body Wash (White Tea & Bergamot)", size: "250 g · flip-top bottle", netGrams: 250, qualityChecks, recipe: [{ materialId: "BULK-WASH", perUnit: 250 }, { materialId: "BOTTLE-250", perUnit: 1 }, { materialId: "LABEL-WASH", perUnit: 1 }] },
      { id: "COND-COCO-500", name: "Hair Conditioner (Coconut & Vanilla)", size: "500 g · pump bottle", netGrams: 500, qualityChecks, recipe: [{ materialId: "BULK-COND", perUnit: 500 }, { materialId: "BOTTLE-500", perUnit: 1 }, { materialId: "LABEL-COND", perUnit: 1 }] },
    ],
    materials: [
      { id: "BULK-SHAM", name: "Moisturising shampoo bulk", unit: "g" },
      { id: "BULK-WASH", name: "White tea & bergamot wash bulk", unit: "g" },
      { id: "BULK-COND", name: "Coconut & vanilla conditioner bulk", unit: "g" },
      { id: "BOTTLE-500", name: "500 g bottle + pump", unit: "each" },
      { id: "BOTTLE-250", name: "250 g bottle + flip-top cap", unit: "each" },
      { id: "LABEL-SHAM", name: "Moisturising shampoo label", unit: "each" },
      { id: "LABEL-WASH", name: "White tea & bergamot wash label", unit: "each" },
      { id: "LABEL-COND", name: "Coconut & vanilla conditioner label", unit: "each" },
    ],
    lots: [
      { id: "SHAM-BULK-260915", materialId: "BULK-SHAM", available: 750000, status: "released", expires: "2027-09-15", supplier: "Oakmere Cosmetic Bulk" },
      { id: "WASH-BULK-260916", materialId: "BULK-WASH", available: 250000, status: "released", expires: "2027-09-16", supplier: "Oakmere Cosmetic Bulk" },
      { id: "WASH-BULK-260929", materialId: "BULK-WASH", available: 100000, status: "quarantine", expires: "2027-09-29", supplier: "Oakmere Cosmetic Bulk" },
      { id: "COND-BULK-260918", materialId: "BULK-COND", available: 500000, status: "released", expires: "2027-09-18", supplier: "Oakmere Cosmetic Bulk" },
      { id: "PUMP-500-260901", materialId: "BOTTLE-500", available: 3000, status: "released", expires: "2028-09-01", supplier: "Westmere Packaging" },
      { id: "CAP-250-260902", materialId: "BOTTLE-250", available: 1000, status: "released", expires: "2028-09-02", supplier: "Westmere Packaging" },
      { id: "LBL-SHAM-260910", materialId: "LABEL-SHAM", available: 2000, status: "released", expires: "2028-09-10", supplier: "Paperbrook Label Works" },
      { id: "LBL-WASH-260910", materialId: "LABEL-WASH", available: 1200, status: "released", expires: "2028-09-10", supplier: "Paperbrook Label Works" },
      { id: "LBL-COND-260910", materialId: "LABEL-COND", available: 1000, status: "released", expires: "2028-09-10", supplier: "Paperbrook Label Works" },
    ],
    batches: [],
    orders: [
      { id: "ORDER-DEMO-101", customer: "Willow Salon Group", destination: "Salon replenishment hub, Manchester", productId: "SHAM-MOIST-500", units: 1000, invoicedUnits: 960 },
      { id: "ORDER-DEMO-102", customer: "Saltwick Bath & Body", destination: "Retail stockroom, York", productId: "WASH-TEA-250", units: 600, invoicedUnits: 0 },
      { id: "ORDER-DEMO-103", customer: "Northline Salon Supply", destination: "Salon distribution centre, Leeds", productId: "COND-COCO-500", units: 480, invoicedUnits: 480 },
    ],
    shipments: [], audit: [],
  };
  let event = 0;
  const run = (action, actor = "Maya Chen · Production") => {
    const at = new Date(Date.parse("2026-09-30T08:00:00.000Z") + event++ * 15 * 60000).toISOString();
    state = transition(state, action, { actor, at });
  };
  run({ type: "plan_batch", id: "BATCH-101", productId: "SHAM-MOIST-500", units: 1000, productionSite: "Riverside plant", productionLine: "Filling line 1" });
  run({ type: "start_batch", batchId: "BATCH-101" });
  run({ type: "finish_batch", batchId: "BATCH-101", units: 960, note: "Line 1: 960 shampoo bottles filled and labelled. The run stopped 40 units below plan for filler adjustment; output remains on quality hold." });
  run({ type: "record_check", batchId: "BATCH-101", key: "appearance", result: "pass", note: "Pearlescent appearance and fragrance match the retained reference sample." }, "Aisha Patel · Quality");
  run({ type: "record_check", batchId: "BATCH-101", key: "consistency", result: "pass", note: "Sample is uniform with no visible separation; texture matches the batch reference." }, "Aisha Patel · Quality");
  run({ type: "record_check", batchId: "BATCH-101", key: "fill_weight", result: "fail", note: "Sample bottles below the 500 g net fill target. Adjust the filler and record a new inspection before release." }, "Aisha Patel · Quality");
  run({ type: "plan_batch", id: "BATCH-102", productId: "WASH-TEA-250", units: 600, productionSite: "Meadowbrook plant", productionLine: "Filling line 1" });
  run({ type: "plan_batch", id: "BATCH-103", productId: "COND-COCO-500", units: 500, productionSite: "Riverside plant", productionLine: "Filling line 2" });
  run({ type: "start_batch", batchId: "BATCH-103" });
  run({ type: "finish_batch", batchId: "BATCH-103", units: 480, note: "Line 2: 480 conditioner bottles filled, capped and labelled. Twenty planned units were not completed during pump setup; material losses were not measured separately." });
  const notes = {
    appearance: "Cream appearance and coconut-vanilla fragrance match the retained reference sample.",
    consistency: "Smooth, uniform texture with no visible separation in the inspected sample.",
    fill_weight: "Inspected bottles meet the sample product's 500 g net fill target.",
  };
  for (const key of ["appearance", "consistency", "fill_weight"]) run({ type: "record_check", batchId: "BATCH-103", key, result: "pass", note: notes[key] }, "Aisha Patel · Quality");
  run({ type: "release_batch", batchId: "BATCH-103", note: "Batch record and required sample inspections reviewed. Release 480 units to finished goods." }, "Ben Carter · Release");
  run({ type: "dispatch", batchId: "BATCH-103", orderId: "ORDER-DEMO-103", units: 360, reference: "DISPATCH-DEMO-001" }, "Daniel Brooks · Warehouse");
  return state;
}

export function createSampleCompany() {
  let state = createDemo();
  state.settings = { configured: true, sample: true, location: "Finished goods · Zone B" };
  for (const batch of state.batches.filter(row => row.actualUnits > 0)) batch.stockLocation = state.settings.location;
  state.shipments[0].customer = state.orders[2].customer;
  state.shipments[0].destination = state.orders[2].destination;
  state.orders.push({ id: "ORDER-DEMO-104", productId: "COND-COCO-500", customer: "Briar House Spa", destination: "Spa stockroom, Bristol", units: 120, invoicedUnits: 0 });
  state = transition(state, { type: "dispatch", batchId: "BATCH-103", orderId: "ORDER-DEMO-104", units: 60, reference: "DISPATCH-DEMO-002" }, { actor: "Daniel Brooks · Warehouse", at: "2026-09-30T14:00:00.000Z" });
  const context = { actor: "Maya Chen · Production", at: "2026-09-30T15:00:00.000Z" };
  for (const action of [
    { type: "create_supplier_po", id: "SPO-2609-041", supplier: "Westmere Packaging", dueDate: "2026-09-30", lines: [{ materialId: "BOTTLE-500", quantity: 1000 }, { materialId: "BOTTLE-250", quantity: 2000 }] },
    { type: "receive_lot", id: "PUMP-500-260930", purchaseOrderId: "SPO-2609-041", purchaseOrderLineId: "L1", quantity: 1000, expires: "2028-08-30" },
    { type: "release_lot", lotId: "PUMP-500-260930", note: "Bottle finish and pump fit accepted against the sample packing specification." },
    { type: "receive_lot", id: "CAP-250-260930", purchaseOrderId: "SPO-2609-041", purchaseOrderLineId: "L2", quantity: 600, expires: "2028-08-30" },
    { type: "create_customer_po", id: "CPO-2609-215", customer: "Harbour House Hotels", destination: "Amenities store, Bath", dueDate: "2026-10-03", lines: [{ productId: "SHAM-MOIST-500", units: 300 }, { productId: "COND-COCO-500", units: 400 }] },
    { type: "plan_batch", id: "BATCH-104", productId: "SHAM-MOIST-500", units: 300, productionSite: "Riverside plant", productionLine: "Filling line 1" },
    { type: "start_batch", batchId: "BATCH-104" },
    { type: "plan_batch", id: "BATCH-105", productId: "COND-COCO-500", units: 400, productionSite: "Riverside plant", productionLine: "Filling line 2" },
    { type: "start_batch", batchId: "BATCH-105" },
  ]) state = workspaceTransition(state, action, context);
  return addSamplePlanning(addSampleFinance(state));
}
