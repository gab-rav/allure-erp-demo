import { productionMap, traceSourceLot } from "../src/production-map.mjs";
import { lifecycle } from "./ui.mjs";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = value => new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
const quantity = (value, unit) => `${num(unit === "g" ? value / 1000 : value)} ${unit === "g" ? "kg" : "pieces"}`;
const symbols = {
  input: '<path d="m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4m-8 4v10"/>',
  batch: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>',
  shipment: '<path d="M3 6h11v12H3V6Zm11 5h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  stock: '<path d="M4 9h16v12H4V9Zm-1-6h18v6H3V3Zm6 11h6"/>',
  hold: '<circle cx="12" cy="12" r="9"/><path d="M9 8v8m6-8v8"/>',
  pending: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6"/>',
  map: '<rect x="2" y="3" width="6" height="6" rx="2"/><rect x="16" y="15" width="6" height="6" rx="2"/><path d="M8 6h11v9M5 9v9h11"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M3 15h18M10 10v10"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name] ?? symbols.input}</svg>`;

export function mapsView(state, selected, activeNode = "batch", display = "map") {
  if (!state.batches.length) return `<div class="page-heading"><div><h1>Production maps</h1><p>Every input. Every batch. Every destination.</p></div></div><div class="empty-state"><span class="empty-icon">${icon("map")}</span><h2>Your first batch starts here.</h2><p>Set up a product recipe and plan production to create its map.</p><button class="primary" data-view="setup">Set up your company</button><button class="secondary-button" data-view="production">Plan production</button></div>`;
  const batch = state.batches.find(row => row.id === selected) ?? state.batches[0];
  const map = productionMap(state, batch.id);
  const outputs = map.shipments.map(row => ({ id: row.id, label: row.customer, sub: row.destination, quantity: row.units, kind: "shipment", detail: row.reference, ...row }));
  if (map.remainingUnits) outputs.push({ id: "remaining", label: "Available stock", sub: map.location, quantity: map.remainingUnits, kind: "stock", detail: "Ready for dispatch" });
  if (map.heldUnits) outputs.push({ id: "held", label: "Quality hold", sub: map.location, quantity: map.heldUnits, kind: "hold", detail: "Awaiting quality release" });
  if (map.unitYield === null) outputs.push({ id: "pending", label: map.planned ? "Planned output" : "Output pending", sub: map.planned ? "Target only · no finished stock" : "Production is in progress", quantity: map.planned ? map.plannedUnits : null, kind: "pending", detail: "No shipment recorded" });

  const product = state.products.find(row => row.id === batch.productId);
  const variant = map.productName.match(/^(.+?)\s+\((.+)\)$/);
  const productTitle = variant?.[1] ?? map.productName;
  const productVariant = variant?.[2] ?? '';
  const node = (id, kind, title, subtitle, amount, side) => `<button class="trace-node ${kind} ${activeNode === id ? 'chosen' : ''}" type="button" data-map-node="${esc(id)}" data-trace-side="${side}" aria-pressed="${activeNode === id}"><span class="trace-node-icon">${icon(kind)}</span><strong>${esc(title)}</strong><span class="trace-node-sub">${esc(subtitle)}</span><span class="trace-node-quantity">${esc(amount)}</span></button>`;
  const batchNode = `<button type="button" class="trace-node trace-batch ${activeNode === 'batch' ? 'chosen' : ''}" data-map-node="batch" aria-pressed="${activeNode === 'batch'}"><span class="trace-batch-id">${icon('batch')}${esc(map.batchId)}</span><strong class="trace-batch-name">${esc(productTitle)}</strong>${productVariant ? `<span class="trace-batch-variant">${esc(productVariant)}</span>` : ''}<span class="trace-batch-quantity">${num(map.unitYield === null ? map.plannedUnits : map.actualUnits)}<small>${map.unitYield === null ? 'planned units' : 'units produced'}</small></span><span class="trace-batch-state">${lifecycle(batch.status, { decorative: true })}<span>${map.unitYield === null ? esc(map.status) : `${num(map.unitYield * 100)}% unit yield · ${esc(map.status)}`}</span></span></button>`;
  const flow = `<div class="trace-flow" data-trace-flow><svg class="trace-connections" aria-hidden="true"></svg><div class="trace-column"><h3>${map.planned ? 'Recipe inputs' : 'Input lots'} <span>${map.inputs.length}</span></h3><div class="trace-nodes">${map.inputs.map(row => node(row.id, 'input', row.name, row.lotId ?? 'Lot assigned on material issue', quantity(row.quantity, row.unit), 'input')).join('')}</div></div><div class="trace-column trace-batch-column"><h3>Production batch</h3><div class="trace-batch-slot">${batchNode}</div></div><div class="trace-column"><h3>Destinations & stock <span>${outputs.length}</span></h3><div class="trace-nodes">${outputs.map(row => node(row.id, row.kind, row.label, row.sub, row.quantity === null ? 'Awaiting output' : `${num(row.quantity)} units`, 'output')).join('')}</div></div></div>`;

  const source = map.inputs.find(row => row.id === activeNode);
  const destination = outputs.find(row => row.id === activeNode);
  let inspector;
  if (source) {
    const related = source.lotId ? traceSourceLot(state, source.lotId) : [];
    inspector = `<div class="trace-inspector-heading"><span class="trace-inspector-icon">${icon('input')}</span><div><span class="eyebrow">${source.lotId ? 'Source lot' : 'Recipe input'}</span><h3>${esc(source.name)}${source.lotId ? `<span class="id">${esc(source.lotId)}</span>` : ''}</h3></div><span class="trace-inspector-quantity">${quantity(source.quantity, source.unit)}</span></div><p>${source.supplier ? `${esc(source.supplier)} · Expires ${esc(source.expires)}.` : 'The source lot is assigned when production starts.'} ${map.planned ? 'Required for' : 'Issued to'} ${esc(map.batchId)}.</p>${related.length ? `<div class="trace-related"><span class="eyebrow">Batches supplied by this lot</span>${related.map(row => `<div><button class="text-button" data-map-batch="${esc(row.batchId)}">${esc(row.batchId)}</button><span>${esc(row.productName)}<small>${esc(row.status)}</small></span><span>${row.shipments.length ? row.shipments.map(shipment => `${esc(shipment.customer)}: ${num(shipment.units)} units<br><small>${esc(shipment.destination)}</small>`).join('<br>') : 'No dispatch recorded'}</span></div>`).join('')}</div>` : ''}${source.lotId ? `<div class="trace-inspector-actions"><button class="secondary-button" data-open-lot="${esc(source.lotId)}">Open lot record</button></div>` : ''}`;
  } else if (destination) {
    const order = destination.kind === 'shipment' ? state.orders.find(row => row.id === destination.orderId) : null;
    const poReference = order ? order.poReference ?? order.id : '';
    inspector = `<div class="trace-inspector-heading"><span class="trace-inspector-icon">${icon(destination.kind)}</span><div><span class="eyebrow">${destination.kind === 'shipment' ? 'Recorded dispatch' : 'Finished output'}</span><h3>${esc(destination.label)}</h3></div><span class="trace-inspector-quantity">${destination.quantity === null ? 'Pending' : `${num(destination.quantity)} units`}</span></div><p>${esc(destination.sub)}</p>${destination.kind === 'shipment' ? `<dl class="trace-inspector-facts"><div><dt>Order</dt><dd class="id">${esc(destination.orderId)}</dd></div><div><dt>Reference</dt><dd class="id">${esc(destination.reference)}</dd></div><div><dt>Dispatched</dt><dd>${esc(destination.at.slice(0, 10))}</dd></div><div><dt>Recorded by</dt><dd>${esc(destination.actor)}</dd></div></dl><p class="trace-inspector-footnote">Dispatch recorded. Delivery and payment are separate records.</p>${poReference ? `<div class="trace-inspector-actions"><button class="secondary-button" data-decision="navigate" data-target="customer" data-id="${esc(poReference)}">Open customer PO</button></div>` : ''}` : `<p>${esc(destination.detail)}.</p>${destination.kind === 'hold' ? `<div class="trace-inspector-actions"><button class="secondary-button" data-open-batch="${esc(map.batchId)}">Review quality checks</button></div>` : destination.kind === 'stock' ? `<div class="trace-inspector-actions"><button class="secondary-button" data-view="dispatch">Open dispatch</button></div>` : ''}`}`;
  } else inspector = `<div class="trace-inspector-heading"><span class="trace-inspector-icon">${icon('batch')}</span><div><span class="eyebrow">${map.recipeVersion ? `Recipe version ${map.recipeVersion}` : 'Batch record'}</span><h3>${esc(map.productName)}<span class="id">${esc(map.batchId)}</span></h3></div></div><p>${esc(map.productionNote)}</p><p class="trace-inspector-footnote">${map.unitYield === null ? 'Unit yield is available once actual output is recorded.' : `${num(map.actualUnits)} actual ÷ ${num(map.plannedUnits)} planned = ${num(map.unitYield * 100)}% unit yield. The ${num(map.belowPlan)}-unit shortfall does not measure material waste.`}</p><div class="trace-inspector-actions"><button class="secondary-button" data-open-batch="${esc(map.batchId)}">View batch record</button></div>`;

  const table = `<div class="table-wrap trace-records" role="region" aria-label="Trace records" tabindex="0"><table><caption>All input quantities and output destinations for ${esc(map.batchId)}</caption><thead><tr><th>Stage</th><th>Record</th><th>Quantity</th><th>Source / destination</th></tr></thead><tbody>${map.inputs.map(row => `<tr><td><span class="record-type">${map.planned ? 'Required' : 'Issued'}</span></td><td><strong>${esc(row.name)}</strong><span class="cell-sub">${esc(row.lotId ?? row.materialId)}</span></td><td class="numeric">${quantity(row.quantity, row.unit)}</td><td>${esc(row.supplier ?? 'Not allocated')}</td></tr>`).join('')}${outputs.map(row => `<tr><td><span class="record-type ${row.kind}">${esc(({ shipment: 'Dispatched', stock: 'Available', hold: 'Held', pending: 'Pending' })[row.kind])}</span></td><td><strong>${esc(row.label)}</strong><span class="cell-sub">${esc(row.detail)}</span></td><td class="numeric">${row.quantity === null ? 'Pending' : `${num(row.quantity)} units`}</td><td>${esc(row.sub)}</td></tr>`).join('')}</tbody></table></div>`;
  const released = batch.status === 'released';
  const dispatchedShare = released && map.actualUnits ? Math.min(100, Math.max(0, map.shippedUnits / map.actualUnits * 100)) : 0;
  const stockSummary = released
    ? `<span class="trace-stat-label">Released stock</span><div class="trace-stock-values"><strong>${num(map.shippedUnits)} <small>sent</small></strong><span class="trace-stock-divider" aria-hidden="true">/</span><strong>${num(map.remainingUnits)} <small>available</small></strong></div><div class="trace-stock-track" role="img" aria-label="${num(map.shippedUnits)} of ${num(map.actualUnits)} units dispatched; ${num(map.remainingUnits)} units available"><span style="width:${dispatchedShare}%"></span></div><small>${num(dispatchedShare)}% dispatched · ${map.shipments.length} ${map.shipments.length === 1 ? 'shipment' : 'shipments'}</small>`
    : map.heldUnits
      ? `<span class="trace-stat-label">Quality hold</span><strong>${num(map.heldUnits)} <span class="trace-stat-unit">units</span></strong><small class="trace-hold-copy">Awaiting release · 0 available to dispatch</small>`
      : `<span class="trace-stat-label">Finished stock</span><strong class="trace-pending-copy">${map.planned ? 'Not produced' : 'In production'}</strong><small>Available after output and quality release</small>`;
  return `<div class="trace-workspace">
    <header class="trace-heading"><div><h1>${esc(productTitle)}${productVariant ? `<span class="trace-variant">${esc(productVariant)}</span>` : ''}</h1><p class="trace-batch-meta"><span class="id">${esc(map.batchId)}</span><span>${esc(batch.productSize ?? product.size)}</span>${map.productionSite ? `<span>${esc(map.productionSite)}${map.productionLine ? ` / ${esc(map.productionLine)}` : ""}</span>` : ""}${map.recipeVersion ? `<span>Recipe version ${map.recipeVersion}</span>` : ''}</p></div>
    <div class="trace-toolbar"><label for="map-batch">Production batch</label><select id="map-batch">${state.batches.map(row => `<option value="${esc(row.id)}" ${row.id === batch.id ? 'selected' : ''}>${esc(row.id)} · ${esc(row.productName ?? state.products.find(product => product.id === row.productId).name)}</option>`).join('')}</select><button class="secondary-button" data-action="export-map">${icon('download')}Export trace</button></div></header>
    <div class="trace-summary"><div><span class="trace-stat-label">Status</span><span class="status ${batch.status}">${esc(map.status)}</span><br>${lifecycle(batch.status)}</div><div><span class="trace-stat-label">Produced</span><strong>${map.unitYield === null ? '—' : num(map.actualUnits)} <span class="trace-stat-unit">${map.unitYield === null ? '' : 'units'}</span></strong><small>${num(map.plannedUnits)} planned${map.belowPlan === null ? ' · Output not recorded' : ` · ${num(map.belowPlan)} below plan`}</small></div><div><span class="trace-stat-label">Unit yield</span><strong>${map.unitYield === null ? '—' : `${num(map.unitYield * 100)}%`}</strong><small>Actual ÷ planned output</small></div><div class="trace-stock-summary">${stockSummary}</div></div>
    <section class="trace-panel" aria-label="Batch traceability"><div class="trace-panel-heading"><div><h2>Batch traceability</h2><p>${map.planned ? 'Planned requirements · lots not yet issued' : 'Recorded inputs and destinations'}</p></div><div class="trace-switch" role="group" aria-label="Trace view"><button type="button" data-map-display="map" aria-pressed="${display === 'map'}">${icon('map')}Map</button><button type="button" data-map-display="table" aria-pressed="${display === 'table'}">${icon('table')}Records</button></div></div><div class="trace-body ${display === 'map' ? '' : 'is-records'}">${display === 'map' ? flow : table}<section class="trace-inspector" aria-label="Selected record" aria-live="polite">${inspector}</section></div></section>
    <p class="trace-help">${display === 'map' ? 'Select a lot or destination to inspect its record. Use <kbd>↑</kbd> <kbd>↓</kbd> within a column and <kbd>←</kbd> <kbd>→</kbd> between columns. Connections show traceability, not relative quantities.' : 'These are the same batch and dispatch records shown in the map.'}</p></div>`;
}

/** Draw connections around native HTML buttons, so text never shrinks with an SVG viewBox. */
export function mountProductionMap(root) {
  const flow = root.querySelector('[data-trace-flow]');
  if (!flow) return () => {};
  const svg = flow.querySelector('.trace-connections');
  const batch = flow.querySelector('[data-map-node="batch"]');
  const leaves = [...flow.querySelectorAll('[data-trace-side]')];
  const columns = [...flow.querySelectorAll('.trace-column')].map(column => [...column.querySelectorAll('[data-map-node]')]).filter(nodes => nodes.length);
  const focused = leaves.some(node => node.getAttribute('aria-pressed') === 'true');
  const ns = 'http://www.w3.org/2000/svg';
  let frame = 0;
  const draw = () => {
    frame = 0;
    if (!flow.isConnected) return;
    const bounds = flow.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const centre = batch.getBoundingClientRect();
    const horizontal = getComputedStyle(flow).gridTemplateColumns.trim().split(/\s+/).length > 1;
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    const marks = leaves.map(node => {
      const box = node.getBoundingClientRect();
      const input = node.dataset.traceSide === 'input';
      const start = input ? box : centre;
      const end = input ? centre : box;
      const y1 = start.top + start.height / 2 - bounds.top;
      const y2 = end.top + end.height / 2 - bounds.top;
      let d, ports;
      if (horizontal) {
        const x1 = start.right - bounds.left, x2 = end.left - bounds.left, mid = (x1 + x2) / 2;
        d = `M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}`;
        ports = [[x1, y1], [x2, y2]];
      } else {
        const x1 = start.left - bounds.left, x2 = end.left - bounds.left;
        const rail = Math.min(x1, x2) - 18, corner = 7;
        d = `M${x1} ${y1} H${rail + corner} Q${rail} ${y1},${rail} ${y1 + corner} V${y2 - corner} Q${rail} ${y2},${rail + corner} ${y2} H${x2}`;
        ports = [[x1, y1], [x2, y2]];
      }
      // A chosen lot or destination highlights its own path and quietens the rest.
      const state = node.getAttribute('aria-pressed') === 'true' ? 'selected' : focused ? 'dim' : '';
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      if (state) path.classList.add(state);
      const circles = ports.map(([cx, cy]) => {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', 3);
        if (state) circle.classList.add(state);
        return circle;
      });
      return { state, elements: [path, ...circles] };
    });
    // Draw the selected connection last so it stays visible on a shared mobile rail.
    marks.sort((a, b) => Number(a.state === 'selected') - Number(b.state === 'selected'));
    svg.replaceChildren(...marks.flatMap(mark => mark.elements));
  };
  // Arrow keys move focus between records; Enter or Space still selects through the button.
  const move = event => {
    const current = event.target.closest('[data-map-node]');
    if (!current || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const column = columns.findIndex(nodes => nodes.includes(current));
    if (column < 0) return;
    const index = columns[column].indexOf(current);
    let next;
    if (event.key === 'ArrowDown') next = columns[column][index + 1];
    else if (event.key === 'ArrowUp') next = columns[column][index - 1];
    else if (event.key === 'Home') next = columns[column][0];
    else if (event.key === 'End') next = columns[column].at(-1);
    else {
      const target = columns[column + (event.key === 'ArrowRight' ? 1 : -1)];
      if (target) next = target[Math.min(index, target.length - 1)];
    }
    if (next) { event.preventDefault(); next.focus(); }
  };
  flow.addEventListener('keydown', move);
  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
  const observer = new ResizeObserver(schedule);
  observer.observe(flow);
  leaves.forEach(node => observer.observe(node));
  observer.observe(batch);
  schedule();
  return () => { observer.disconnect(); cancelAnimationFrame(frame); flow.removeEventListener('keydown', move); };
}
