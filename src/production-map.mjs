import { batchStatus, shippedFromBatch, availableFinished } from "./manufacturing.mjs";

/** A projection of recorded quantities; it never creates a stock or sales movement. */
export function productionMap(state, batchId) {
  const batch = state.batches.find(row => row.id === batchId);
  if (!batch) throw new Error("Batch not found.");
  const product = state.products.find(row => row.id === batch.productId);
  const planned = batch.status === "planned";
  const inputs = planned
    ? (batch.recipeSnapshot ?? product.recipe).map(row => ({ materialId: row.materialId, quantity: row.perUnit * batch.plannedUnits, lotId: null }))
    : batch.allocations;
  const shipments = state.shipments.filter(row => row.batchId === batch.id).map(row => {
    const order = state.orders.find(order => order.id === row.orderId);
    return { ...row, customer: row.customer ?? order.customer, destination: row.destination ?? order.destination ?? "Destination not recorded" };
  });
  const shipped = shippedFromBatch(state, batch.id);
  return {
    batchId, productId: product.id, productName: batch.productName ?? product.name,
    productionSite: batch.productionSite ?? "", productionLine: batch.productionLine ?? "",
    recipeVersion: batch.recipeVersion ?? null, status: batchStatus(batch), planned,
    inputs: inputs.map((row, index) => {
      const material = state.materials.find(material => material.id === row.materialId);
      const lot = state.lots.find(lot => lot.id === row.lotId);
      return { ...row, id: `input-${index}`, name: material.name, unit: material.unit, supplier: lot?.supplier ?? null, expires: lot?.expires ?? null, basis: planned ? "Required by recipe" : "Recorded material issue" };
    }),
    plannedUnits: batch.plannedUnits, actualUnits: batch.actualUnits,
    // This is attainment of the planned unit count, NOT mass balance or measured process loss.
    unitYield: ["quality_hold", "released"].includes(batch.status) ? batch.actualUnits / batch.plannedUnits : null,
    belowPlan: ["quality_hold", "released"].includes(batch.status) ? batch.plannedUnits - batch.actualUnits : null,
    heldUnits: batch.status === "quality_hold" ? batch.actualUnits : 0,
    remainingUnits: availableFinished(state, batch), shippedUnits: shipped, shipments,
    productionNote: batch.productionNote ?? "Output has not been recorded.",
    location: batch.stockLocation ?? state.settings?.location ?? "Finished-goods store",
  };
}

export function traceSourceLot(state, lotId) {
  if (!state.lots.some(lot => lot.id === lotId)) throw new Error("Material lot not found.");
  return state.batches.filter(batch => batch.allocations.some(row => row.lotId === lotId)).map(batch => productionMap(state, batch.id));
}
