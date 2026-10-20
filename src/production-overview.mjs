import { availableFinished, batchStatus, latestCheck, materialPlan, requiredChecks, shippedFromBatch } from "./manufacturing.mjs";

/** Read-only overview: planned quantities never become finished stock or a reservation. */
export function productionOverview(state, { site = null, status = "all", query = "" } = {}) {
  const allRows = state.batches.map(batch => {
    const product = state.products.find(row => row.id === batch.productId);
    const checks = requiredChecks(batch).map(key => latestCheck(batch, key));
    const plan = batch.status === "planned" ? materialPlan(state, batch.productId, batch.plannedUnits, batch.recipeSnapshot) : [];
    return {
      id: batch.id, productId: batch.productId, productName: batch.productName ?? product.name,
      site: batch.productionSite ?? "", line: batch.productionLine ?? "", status: batch.status, statusLabel: batchStatus(batch),
      plannedUnits: batch.plannedUnits,
      actualUnits: ["quality_hold", "released"].includes(batch.status) ? batch.actualUnits : null,
      availableUnits: availableFinished(state, batch), dispatchedUnits: shippedFromBatch(state, batch.id),
      passedChecks: checks.filter(check => check?.result === "pass").length,
      failedChecks: checks.filter(check => check?.result === "fail").length,
      requiredChecks: checks.length, shortages: plan.filter(row => row.shortfall > 0),
    };
  });
  const term = query.trim().toLocaleLowerCase();
  const rows = allRows.filter(row => (site === null || row.site === site)
    && (status === "all" || (status === "active" ? row.status !== "released" : row.status === status))
    && (!term || [row.id, row.productName, row.productId, row.site, row.line].join(" ").toLocaleLowerCase().includes(term)));
  const priority = { in_progress: 0, quality_hold: 1, planned: 2, released: 3 };
  rows.sort((a, b) => priority[a.status] - priority[b.status] || a.id.localeCompare(b.id, "en", { numeric: true }));
  const sites = [...new Set(allRows.map(row => row.site))].sort((a, b) => a ? b ? a.localeCompare(b) : -1 : 1);
  const groups = sites.map(name => ({ site: name, rows: rows.filter(row => row.site === name) })).filter(group => group.rows.length)
    .sort((a, b) => priority[a.rows[0].status] - priority[b.rows[0].status]);
  const running = allRows.filter(row => row.status === "in_progress");
  const busyLines = [...new Set(running.filter(row => row.site && row.line).map(row => JSON.stringify([row.site, row.line])))].map(key => {
    const [site, line] = JSON.parse(key);
    return { site, line, batches: running.filter(row => row.site === site && row.line === line).map(row => row.id) };
  });
  // All plants draw from the existing shared material pool. Aggregate demand exposes
  // shortages that checking two planned batches independently could otherwise hide.
  const demand = new Map();
  for (const batch of state.batches.filter(row => row.status === "planned")) {
    for (const row of materialPlan(state, batch.productId, batch.plannedUnits, batch.recipeSnapshot)) {
      const current = demand.get(row.id) ?? { materialId: row.id, name: row.name, unit: row.unit, required: 0, available: row.available };
      current.required += row.required; demand.set(row.id, current);
    }
  }
  return {
    sites, rows, groups, busyLines,
    counts: { running: rows.filter(row => row.status === "in_progress").length, planned: rows.filter(row => row.status === "planned").length, held: rows.filter(row => row.status === "quality_hold").length, availableUnits: rows.reduce((sum, row) => sum + row.availableUnits, 0) },
    materialPressure: [...demand.values()].filter(row => row.required > row.available).map(row => ({ ...row, shortfall: row.required - row.available })),
  };
}
