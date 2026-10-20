import { productionOverview } from "../src/production-overview.mjs";
import { workItems } from "../src/work-items.mjs";
import { lifecycle } from "./ui.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = value => new Intl.NumberFormat("en").format(value);
const quantity = row => `${num(row.unit === "g" ? row.shortfall / 1000 : row.shortfall)} ${row.unit === "g" ? "kg" : "pieces"}`;
const statuses = { all: "All batches", active: "Active batches", in_progress: "In production", planned: "Planned", quality_hold: "Awaiting quality release", released: "Released" };
// Operations-facing exceptions; finance items remain in the shared work queue.
const ATTENTION_AREAS = new Set(["Operations", "Quality", "Purchasing"]);

function nextStep(row) {
  if (row.status === "in_progress") return "Record output when complete";
  if (row.status === "planned") return row.shortages.length ? `${row.shortages.length} material ${row.shortages.length === 1 ? "shortage" : "shortages"}` : "Materials available · not reserved";
  if (row.status === "quality_hold") return row.failedChecks ? `${row.failedChecks} failed · ${row.passedChecks}/${row.requiredChecks} checks passed` : `${row.passedChecks}/${row.requiredChecks} checks passed`;
  return `${num(row.dispatchedUnits)} dispatched · ${num(row.availableUnits)} available`;
}

function attentionPanel(state) {
  const all = workItems(state);
  const items = all.filter(item => item.priority === 1 && ATTENTION_AREAS.has(item.area));
  // Pooled material shortfalls share one cause and one destination, so they are listed together.
  const shortfalls = items.filter(item => item.key.startsWith("material:"));
  const shown = [...items.filter(item => !item.key.startsWith("material:")), ...(shortfalls.length > 1 ? [{
    title: `${shortfalls.length} material shortfalls`, area: "Operations", target: "planner", id: "", review: null,
    detail: `${shortfalls.map(item => item.title.replace(/^Material shortfall: /, "")).join(", ")}. Across planned and proposed batches; incoming POs are not usable stock.`,
  }] : shortfalls)].slice(0, 5);
  return `<aside class="overview-attention" aria-labelledby="attention-heading"><header><h2 id="attention-heading">Needs attention</h2><span>${items.length} ${items.length === 1 ? "item" : "items"}</span></header>
    ${shown.length ? `<ol>${shown.map(item => `<li><span class="work-priority priority-1" aria-hidden="true"></span><span class="attention-title">${esc(item.title)}</span><span class="attention-detail">${esc(item.detail)}</span><span class="attention-actions"><button class="text-button" data-decision="navigate" data-target="${esc(item.target)}" data-id="${esc(item.id)}">Open record</button><span class="status planned">${esc(item.area)}</span>${item.review ? `<span>Owner: ${esc(item.review.owner)}</span>` : ""}</span></li>`).join("")}</ol>` : '<p class="empty-note">No production, quality or purchasing exceptions in the configured checks.</p>'}
    <footer><button class="text-button" data-view="work">${all.length ? `Open work queue · ${all.length} open` : "Open work queue"}</button></footer></aside>`;
}

export function overviewView(state, filters) {
  const view = productionOverview(state, filters);
  // Tile counts follow the plant scope only, so choosing a status never hides the others.
  const scope = productionOverview(state, { site: filters.site });
  const tiles = [
    ["in_progress", "In production", num(scope.counts.running), scope.counts.running === 1 ? "batch running" : "batches running"],
    ["quality_hold", "Quality hold", num(scope.counts.held), "finished batches held", scope.counts.held > 0],
    ["planned", "Planned", num(scope.counts.planned), "batches waiting to start"],
    ["released", "Released stock", num(scope.counts.availableUnits), "units available to dispatch"],
  ];
  return `<div class="operations-workspace">
    <div class="page-heading"><div><h1>Production overview</h1><p>Every plant and batch, with the next step each one needs.</p></div><button class="primary" data-action="plan">Plan batch</button></div>
    <div class="overview-tiles" role="group" aria-label="Show batches by status">${tiles.map(([status, label, value, sub, caution]) => `<button type="button" data-overview-status="${status}" aria-pressed="${filters.status === status}"><span class="tile-label"><i class="${status}" aria-hidden="true"></i>${label}</span><span class="tile-value ${caution ? "caution" : ""}">${value}</span><span class="tile-sub">${sub}</span></button>`).join("")}</div>
    <div class="overview-layout">${attentionPanel(state)}<div class="overview-main">
    <form class="operations-filters" data-form="overview-search" role="search" aria-label="Filter production"><label>Plant<select id="overview-site">${[[null, "All plants"], ...view.sites.map(site => [site, site || "Unassigned plant"])].map(([site, label]) => `<option value="${esc(JSON.stringify(site))}" ${site === filters.site ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label><label>Status<select id="overview-status">${Object.entries(statuses).map(([value, label]) => `<option value="${value}" ${filters.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>Find a batch or product<input type="search" name="query" value="${esc(filters.query)}" placeholder="Batch, product or line"></label><button class="secondary-button" type="submit">Search</button>${filters.site !== null || filters.status !== "all" || filters.query ? '<button class="quiet" type="button" data-action="clear-overview">Clear</button>' : ""}</form>
    ${view.materialPressure.length ? `<aside class="operations-alert"><strong>Shared materials need attention</strong><p>Across all planned batches and plants, additional released stock is needed: ${view.materialPressure.map(row => `${esc(row.name)} (${quantity(row)})`).join("; ")}. Starting a batch uses the shared stock immediately.</p></aside>` : ""}
    <div class="operations-result"><h2>${filters.site === null ? "All production" : esc(filters.site || "Unassigned plant")}</h2><span>${view.rows.length} of ${state.batches.length} batches${filters.status !== "all" ? ` · ${esc(statuses[filters.status])}` : ""}</span></div>
    ${view.groups.map(group => `<section class="plant-panel" aria-label="${esc(group.site || "Unassigned plant")} production"><header><div><h3>${esc(group.site || "Unassigned plant")}</h3><p>${group.rows.filter(row => row.status === "in_progress").length} running · ${group.rows.length} ${group.rows.length === 1 ? "batch" : "batches"} shown</p></div><span class="plant-note">${group.site ? "Production assignment" : "Add a plant before starting new work"}</span></header><table class="operations-table" role="table"><thead><tr><th scope="col">Batch / product</th><th scope="col">Production line</th><th scope="col">Status & next step</th><th scope="col">Output</th><th scope="col"><span class="sr-only">Traceability</span></th></tr></thead><tbody>${group.rows.map(row => `<tr class="${row.status === "in_progress" ? "is-running" : ""}"><th scope="row"><button class="text-button" data-open-batch="${esc(row.id)}" aria-label="Open ${esc(row.id)} production record">${esc(row.id)}</button><span class="operations-product">${esc(row.productName)}</span></th><td><span class="operations-mobile-label">Line</span><span class="operations-line">${esc(row.line || "Unassigned")}</span>${row.status === "in_progress" ? '<small class="operations-running"><i aria-hidden="true"></i>Running now</small>' : ''}</td><td><span class="operations-state"><span class="status ${row.status}">${esc(row.statusLabel)}</span>${lifecycle(row.status)}</span><small class="operations-next ${row.shortages.length || row.failedChecks ? "needs-attention" : ""}">${esc(nextStep(row))}</small></td><td class="operations-output"><span class="operations-mobile-label">Output</span><strong>${num(row.actualUnits ?? row.plannedUnits)}</strong><small>${row.actualUnits === null ? 'planned units' : `of ${num(row.plannedUnits)} planned`}</small>${row.actualUnits === null ? '<span class="operations-unrecorded">Output not recorded</span>' : ''}</td><td class="operations-actions"><button class="secondary-button" data-map-batch="${esc(row.id)}" aria-label="Open ${esc(row.id)} trace map">Trace map <span aria-hidden="true">↗</span></button></td></tr>`).join("")}</tbody></table></section>`).join("")}
    ${view.rows.length ? "" : `<div class="empty-state"><h2>${state.batches.length ? "No batches match these filters." : "Plan your first production batch."}</h2><p>${state.batches.length ? "Choose another plant or status, or clear your search." : "Choose a product, planned quantity and production location. Each batch keeps its own materials, output and quality records."}</p>${state.batches.length ? '<button class="secondary-button" data-action="clear-overview">Clear filters</button>' : '<button class="primary" data-action="plan">Plan batch</button>'}</div>`}
    <p class="operations-footnote">Plants and lines organise production. Materials currently use one shared stock pool; assignment does not reserve materials or enforce line capacity.</p>
  </div></div></div>`;
}

export function assignmentFields(state, batch = {}) {
  const suffix = batch.id ? "batch" : "plan";
  const sites = [...new Set(state.batches.map(row => row.productionSite).filter(Boolean))];
  const lines = [...new Set(state.batches.map(row => row.productionLine).filter(Boolean))];
  return `<div class="form-grid"><label>Production plant (optional)<input name="productionSite" maxlength="200" value="${esc(batch.productionSite)}" placeholder="e.g. North plant" list="production-sites-${suffix}"></label><label>Production line (optional)<input name="productionLine" maxlength="200" value="${esc(batch.productionLine)}" placeholder="e.g. Filling line 1" list="production-lines-${suffix}"></label></div><datalist id="production-sites-${suffix}">${sites.map(site => `<option value="${esc(site)}"></option>`).join("")}</datalist><datalist id="production-lines-${suffix}">${lines.map(line => `<option value="${esc(line)}"></option>`).join("")}</datalist>`;
}
