import { createSampleCompany } from "./seed.mjs";
import { validateState, materialPlan, traceBatch, latestCheck, qualityReady, batchStatus, availableFinished, shippedToOrder, shippedFromBatch, requiredChecks, checkLabel } from "../src/manufacturing.mjs";
import { poBalance } from "../src/po-quantities.mjs";

import { workspaceTransition } from "../src/workspace.mjs";
import { productionMap } from "../src/production-map.mjs";
import { mapsView, mountProductionMap } from "./maps.mjs";
import { setupView, setupAction } from "./setup.mjs";
import { financeView, wireFinance, FINANCE_SCREENS } from "./finance.mjs";
import { costsView, plannerView, workView, wireDecisions } from "./decisions.mjs";
import { overviewView, assignmentFields } from "./overview.mjs";
import { purchaseOrdersView, poDialogs, poLineField, purchaseOrderAction } from "./purchase-orders.mjs";
import { workItems } from "../src/work-items.mjs";
import { lifecycle } from "./ui.mjs";
import { browserStorageFailure, saveStateAfterFailure, saveLabel as saveStateLabel, storageFailureMessage } from "./save-state.mjs";

const STORAGE = "allure-erp-manufacturing-sample-v7";
const root = document.querySelector("#app");
const staticSample = document.querySelector('meta[name="workspace-mode"]')?.content === "sample";
let state;
let revision = 0;
let initialNotice = "";
let initialSaveState = "saved";
try {
  if (staticSample) {
    const saved = localStorage.getItem(STORAGE);
    state = saved ? validateState(JSON.parse(saved)) : createSampleCompany();
  } else {
    const response = await fetch("/api/workspace");
    if (!response.ok) throw new Error("Local workspace could not be opened.");
    const snapshot = await response.json(); state = validateState(snapshot.state); revision = snapshot.revision;
  }
} catch (error) {
  if (staticSample) {
    state = createSampleCompany();
    // Blocked browser storage is not a damaged sample: say that changes cannot be kept.
    const storage = browserStorageFailure(error);
    if (storage) { initialSaveState = `storage-${storage}`; initialNotice = storageFailureMessage(initialSaveState, { atStartup: true }); }
    else initialNotice = "The saved sample could not be loaded. A fresh fictional workspace is ready.";
  }
  else { root.innerHTML = '<div class="boot boot-error" role="alert"><h1>The local workspace could not be opened.</h1><p>Start it with npm start, check the server output, then reload. Existing records have not been replaced.</p></div>'; throw error; }
}
const WORK_AREA_PREFERENCE = "allure-erp-work-area";
let workspaceArea = "operations";
try { if (localStorage.getItem(WORK_AREA_PREFERENCE) === "finance") workspaceArea = "finance"; } catch { /* Navigation works when browser storage is unavailable. */ }
let view = state.settings?.configured ? (workspaceArea === "finance" ? "finance" : "overview") : "setup";
let operationsView = "overview";
const financeUI = { screen: "overview", dialog: "" };
const decisionUI = { productId: "", version: "", volume: 1000, includeForecast: false, expanded: "", area: "", dialog: "" };
let overviewFilters = { site: null, status: "all", query: "" };
let selected = state.batches.find(row => row.id === "BATCH-103")?.id ?? state.batches[0]?.id;
let activeNode = "batch";
let mapDisplay = "map";
let poMode = "customer", receiptSelection = null, nextPoLine = 1;
let editingProduct = "";
let resetPending = false;
let saving = false;
let saveState = initialSaveState;
let navOpen = false;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (value) => new Intl.NumberFormat("en").format(value);
const product = (id) => state.products.find((p) => p.id === id);
const quantity = (value, unit) => `${num(unit === "g" ? value / 1000 : value)} ${unit === "g" ? "kg" : "pieces"}`;
const paths = {
  planner: '<path d="M4 3v18h17M8 14l4-5 4 3 5-7"/><path d="M17 5h4v4"/>',
  costs: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 10h1m5 0h2m-8 4h1m5 0h2m-8 4h1m5 0h2"/>',
  work: '<path d="m3 5 2 2 3-4M11 5h10M3 12h5m3 0h10M3 19h5m3 0h10"/>',
  finance: '<path d="M3 8h18M5 8v10m5-10v10m4-10v10m5-10v10M3 21h18M3 5l9-3 9 3v3H3V5Z"/>',
  orders: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  maps: '<rect x="1" y="3" width="6" height="6" rx="1"/><rect x="17" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M4 9v3h16V9m-8 3v3"/>',
  setup: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  production: '<path d="M3 21V9l6 3V7l6 3V3h6v18H3Z"/><path d="M7 16h2m4 0h2m3 0h1"/>',
  materials: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z"/><path d="m3 7 9 4 9-4m-9 4v10M7.5 5 17 9"/>',
  quality: '<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  dispatch: '<path d="M3 6h11v12H3V6Zm11 5h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  guide: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h9v9M6 9v9h9"/>',
  bank: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  reconcile: '<path d="M4 8h13l-3-3m3 3-3 3M20 16H7l3 3m-3-3 3-3"/>',
  forecast: '<path d="M4 20h16"/><path d="m5 15 4-4 3 3 6-7"/><path d="M15 7h3v3"/>',
  period: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4m6-4v4m-6 8 2 2 4-4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const badge = (batch) => `<span class="status ${batch.status === "quality_hold" && qualityReady(batch) ? "ready" : batch.status}">${esc(batchStatus(batch))}</span>`;
const navNames = { planner: "Demand planner", costs: "Product costs", work: "Work queue", overview: "Overview", maps: "Production maps", production: "Production", materials: "Materials & lots", quality: "Quality control", dispatch: "Dispatch", orders: "Purchase orders", finance: "Finance & Cash", setup: "Company setup", guide: "Workflow guide" };

const operationsPages = ["overview", "planner", "maps", "production", "materials", "quality", "dispatch", "orders"];
const financeIcons = { overview: "finance", documents: "orders", bank: "bank", reconcile: "reconcile", forecast: "forecast", close: "period", settings: "setup" };
// Navigation follows the work: today's exceptions, planning, production, then trace and shipment.
const navGroups = {
  operations: [["Today", ["overview", "work"]], ["Plan", ["planner", "costs"]], ["Make", ["production", "quality", "materials"]], ["Trace & ship", ["maps", "dispatch", "orders"]]],
  finance: [["Today", ["fin:overview", "work"]], ["Records", ["fin:documents", "fin:bank", "fin:reconcile"]], ["Plan", ["fin:forecast", "costs"]], ["Close", ["fin:close", "fin:settings"]]],
};
function workspaceNavigation() {
  const finance = workspaceArea === "finance";
  const held = state.batches.filter(b => b.status === "quality_hold").length;
  const items = workItems(state);
  const counts = {
    quality: held ? { n: held, tone: "caution", label: `${held} on hold` } : null,
    work: items.length ? { n: items.length, tone: items.some(i => i.priority === 1) ? "caution" : "", label: `${items.length} open` } : null,
  };
  const item = (entry) => {
    const fin = entry.startsWith("fin:"), id = fin ? entry.slice(4) : entry;
    const active = fin ? view === "finance" && financeUI.screen === id : view === id;
    const count = counts[id];
    return `<button class="nav-item ${active ? "active" : ""}" ${fin ? `data-fin-screen="${id}"` : `data-view="${id}"`} ${active ? 'aria-current="page"' : ""}>${icon(fin ? financeIcons[id] : id)}<span>${fin ? FINANCE_SCREENS[id] : navNames[id]}</span>${count ? `<span class="nav-count ${count.tone}"><span class="sr-only">, </span>${count.n}<span class="sr-only"> ${count.label}</span></span>` : ""}</button>`;
  };
  const groups = [...navGroups[finance ? "finance" : "operations"], ["Company", ["setup", "guide"]]];
  return `<div class="workspace-switcher" role="group" aria-label="Work area"><button data-workspace="operations" aria-pressed="${!finance}">Operations</button><button data-workspace="finance" aria-pressed="${finance}">Finance</button></div>
    <nav aria-label="${finance ? "Finance" : "Operations"} navigation">${groups.map(([title, entries]) => `<span class="nav-section">${title}</span>${entries.map(item).join("")}`).join("")}</nav>`;
}

function setNavOpen(open, { returnFocus = false } = {}) {
  navOpen = open;
  const sidebar = root.querySelector(".sidebar");
  const toggle = root.querySelector('[data-action="toggle-nav"]');
  if (!sidebar || !toggle) return;
  sidebar.dataset.navOpen = String(open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.innerHTML = `${icon(open ? "close" : "menu")}<span>${open ? "Close" : "Menu"}</span>`;
  if (returnFocus) toggle.focus({ preventScroll: true });
}

function saveLabel() { return saveStateLabel(saveState, { staticSample }); }
function showSaveState(next) {
  saveState = next;
  const el = root.querySelector(".save-state");
  if (el) {
    el.dataset.state = next; el.querySelector("span").textContent = saveLabel();
    if (next.startsWith("storage")) el.title = storageFailureMessage(next); else el.removeAttribute("title");
  }
  root.querySelector(".save-export")?.toggleAttribute("hidden", !next.startsWith("storage"));
}
function notify(message, error = false, duration = 7000) {
  // Native dialogs render above the page. Keep validation errors inside them.
  const dialog = document.querySelector("dialog[open]");
  if (error && dialog) {
    let inline = dialog.querySelector('[data-dialog-error]');
    if (!inline) { inline = document.createElement('p'); inline.dataset.dialogError = ''; inline.className = 'form-error'; inline.setAttribute('role', 'alert'); dialog.append(inline); }
    inline.textContent = message;
    inline.scrollIntoView({ block: 'nearest' });
  }
  const el = document.querySelector("#announcement");
  el.textContent = message;
  el.className = `toast${error ? " error" : ""}`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { el.className = ""; el.textContent = ""; }, duration);
}
async function apply(action, actor, message) {
  if (saving) return false;
  const previousSaveState = saveState;
  saving = true;
  root.setAttribute("aria-busy", "true");
  showSaveState("saving");
  try {
    if (staticSample) {
      const next = action.type === "load_sample" ? createSampleCompany() : workspaceTransition(state, action, { actor });
      localStorage.setItem(STORAGE, JSON.stringify(next)); state = next;
    } else {
      const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, action, actor }) });
      const snapshot = await response.json();
      if (!response.ok) throw Object.assign(new Error(snapshot.error ?? "The action could not be saved."), { status: response.status });
      state = validateState(snapshot.state); revision = snapshot.revision;
    }
    saveState = "saved"; render(); notify(message); return true;
  } catch (error) {
    // A rejected entry does not establish recovery from an earlier failed save.
    const next = saveStateAfterFailure(error, { staticSample, previousState: previousSaveState });
    showSaveState(next);
    if (browserStorageFailure(error)) notify(storageFailureMessage(next), true, 15000); else notify(error.message, true);
    return false;
  }
  finally { saving = false; root.removeAttribute("aria-busy"); }
}
function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let cleanupMap = () => {};
function render() {
  cleanupMap();
  if (view === "finance") workspaceArea = "finance";
  else if (operationsPages.includes(view)) { workspaceArea = "operations"; operationsView = view; }
  try { localStorage.setItem(WORK_AREA_PREFERENCE, workspaceArea); } catch { /* This preference is optional. */ }
  const area = workspaceArea === "finance" ? "Finance" : "Operations";
  const page = view === "finance" ? FINANCE_SCREENS[financeUI.screen] : navNames[view];
  root.innerHTML = `<aside class="sidebar" data-nav-open="${navOpen}">
    <div class="sidebar-head"><a class="brand" href="#" aria-label="Allure ERP production home"><img src="docs/assets/mark.svg" alt="" width="28" height="28"><span class="brand-text"><span class="brand-name">allure</span><span class="brand-erp">Manufacturing</span></span></a><button class="nav-toggle" data-action="toggle-nav" aria-expanded="${navOpen}" aria-controls="primary-nav">${icon(navOpen ? "close" : "menu")}<span>${navOpen ? "Close" : "Menu"}</span></button></div>
    <div class="sidebar-body" id="primary-nav">${workspaceNavigation()}
    <div class="sidebar-bottom"><button class="company-card" data-view="setup" title="${esc(state.company)} settings"><span class="company-avatar">${esc(state.company.split(/\s+/).slice(0,2).map(word => word[0]).join(''))}</span><span><strong>${esc(state.company)}</strong><small>Company settings</small></span>${icon('setup')}</button><div class="sidebar-meta"><span>${staticSample ? "Public alpha demo" : "Private preview"}</span><a href="${staticSample ? "https://github.com/gab-rav/allure-erp-demo" : "https://github.com/gab-rav/allure-erp"}" target="_blank" rel="noopener noreferrer">${staticSample ? "About demo" : "Source"} ↗</a></div></div></div>
  </aside>
  <div class="workspace"><header class="topbar"><div class="breadcrumb"><span>${area}</span><span aria-hidden="true">/</span><strong>${esc(page)}</strong></div><div class="topbar-right">${state.asOf ? `<span class="topbar-date">Workspace date <strong>${esc(state.asOf)}</strong></span>` : ""}<span class="save-state" data-state="${saveState}" ${saveState.startsWith("storage") ? `title="${esc(storageFailureMessage(saveState))}"` : ""}><i aria-hidden="true"></i><span>${saveLabel()}</span></span><button class="quiet save-export" data-action="export-workspace" ${saveState.startsWith("storage") ? "" : "hidden"}>Export workspace</button>${state.settings?.sample ? '<span class="demo-label">Fictional sample</span>' : ''}${state.settings?.sample ? `<button class="quiet ${resetPending ? "confirm" : ""}" data-action="reset">${resetPending ? "Confirm reset" : "Reset sample"}</button>` : ""}</div></header>
  <main id="main" tabindex="-1">${({ costs: () => costsView(state, decisionUI), planner: () => plannerView(state, decisionUI), work: () => workView(state, decisionUI), finance: () => financeView(state, financeUI), orders: () => purchaseOrdersView(state, poMode), overview: () => overviewView(state, overviewFilters), maps: () => mapsView(state, selected, activeNode, mapDisplay), setup: () => setupView(state, editingProduct), production: productionView, materials: materialsView, quality: qualityView, dispatch: dispatchView, guide: guideView })[view]()}</main>
  <footer>${state.settings?.sample ? "Fictional sample · " : ""}${staticSample ? "Changes stay in this browser · Use fictional data only" : "Saved on this computer · single-operator preview"} · ${esc(state.company)}</footer></div>
  <dialog id="plan-dialog"><form data-form="plan"><div class="dialog-title"><h2>Plan a production batch</h2><button type="button" class="quiet" data-action="close-dialog" aria-label="Close batch form">Close</button></div><p>Choose a product and planned output. Material requirements scale from its recipe.</p><label>Product<select name="productId">${state.products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.size)}</option>`).join("")}</select></label>${assignmentFields(state)}<label>Planned units<input name="units" type="number" min="1" max="1000000" step="1" value="1000" required></label><label>Planner<input name="actor" value="${state.settings?.sample ? "Sample production lead" : ""}" maxlength="500" required></label><button class="primary" type="submit">Create batch</button></form></dialog>${poDialogs(state, poMode, receiptSelection)}`;
  cleanupMap = view === "maps" ? mountProductionMap(root) : () => {};
  for (const strip of root.querySelectorAll('.sidebar nav')) {
    const active = strip.querySelector('[aria-pressed="true"], [aria-current="page"]');
    if (active && strip.scrollWidth > strip.clientWidth) {
      strip.scrollLeft += Math.max(0, active.getBoundingClientRect().right - strip.getBoundingClientRect().right);
    }
  }
  const chart = root.querySelector('.cash-chart');
  const latest = chart?.querySelectorAll('[data-has-movement="true"]');
  if (latest?.length) {
    const month = latest[latest.length - 1];
    chart.scrollLeft = Math.max(0, month.offsetLeft - chart.offsetLeft + month.offsetWidth - chart.clientWidth);
  }
}

function heading(title, subtitle, action = "") { return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
function productionView() {
  const held = state.batches.filter((b) => b.status === "quality_hold").reduce((n, b) => n + b.actualUnits, 0);
  const finished = state.batches.reduce((n, b) => n + availableFinished(state, b), 0);
  return `${heading("Production", "Plan the work. Follow every batch through to release.", '<button class="primary" data-action="plan">Plan batch</button>')}
    <div class="metric-strip"><div><span>Open batches</span><strong>${state.batches.filter((b) => b.status !== "released").length}<small>in the workflow</small></strong></div><div><span>Awaiting quality release</span><strong>${num(held)}<small>units held</small></strong></div><div><span>Released stock</span><strong>${num(finished)}<small>units available</small></strong></div><div><span>Material traceability</span><strong>${state.lots.length}<small>source lots tracked</small></strong></div></div>
    <div class="section-line"><h2>Production board</h2><span>Select a batch to inspect its record</span></div>
    <div class="batch-board">${state.batches.map((batch) => {
      const p = product(batch.productId);
      return `<button class="batch-card ${selected === batch.id ? "selected" : ""}" data-batch="${esc(batch.id)}" aria-pressed="${selected === batch.id}"><div class="batch-card-top"><span>${esc(batch.id)}</span>${badge(batch)}</div><h3>${esc(batch.productName ?? p.name)}</h3><span class="secondary">${esc(batch.productSize ?? p.size)} · ${esc(p.id)}</span><div class="batch-card-bottom"><strong>${num(batch.plannedUnits)} <span>planned units</span></strong><span>${batch.status === "planned" ? "Materials to issue" : batch.status === "in_progress" ? "Output not recorded" : `${num(batch.actualUnits)} recorded`}</span></div></button>`;
    }).join("")}</div>${batchDetail()}`;
}

function batchDetail() {
  const batch = state.batches.find((b) => b.id === selected) ?? state.batches[0];
  if (!batch) return `<div class="empty-state"><h2>No batches planned yet.</h2><p>Create a product in Company setup, then plan your first batch.</p><button class="secondary-button" data-view="setup">Open company setup</button></div>`;
  selected = batch.id;
  const p = product(batch.productId);
  const trace = traceBatch(state, batch.id);
  const assignment = [batch.productionSite, batch.productionLine].filter(Boolean).join(" / ") || "Production location unassigned";
  const phase = { planned: 0, in_progress: 1, quality_hold: 2, released: 3 }[batch.status];
  return `<section class="batch-detail" aria-label="Selected batch record"><div class="detail-title"><div><span class="secondary">Batch record</span><h2><span class="id">${esc(batch.id)}</span> <span>${esc(batch.productName ?? p.name)}</span></h2><p class="batch-assignment-label">${esc(assignment)}</p></div><button class="quiet" data-action="export-batch">Export record ↓</button></div>
    <ol class="stage-track" data-status="${batch.status}">${["Plan & materials", "Production", "Quality checks", "Release"].map((name, i) => `<li class="${i <= phase ? "reached" : ""} ${i === phase ? "current" : ""}"><span>${i < phase ? "✓" : i + 1}</span>${name}</li>`).join("")}</ol>
    <div class="detail-columns"><div class="record-main">${batch.status === "planned" ? plannedPanel(batch) : outputPanel(batch)}
      <div class="section-line compact"><h3>Material genealogy</h3><span>${trace.inputs.length ? "Source lots issued to this batch" : "Created when production starts"}</span></div>
      ${trace.inputs.length ? `<div class="input-lots">${trace.inputs.map((row) => `<div><span class="lot-node"></span><div><strong>${esc(row.material.name)}</strong><span>${esc(row.lotId)}</span></div><b>${quantity(row.quantity, row.material.unit)}</b></div>`).join("")}</div>` : '<p class="empty-note">Starting the batch checks material availability and records the exact lots issued. Quarantined and expired lots are excluded.</p>'}
      <details class="audit"><summary>Decision history <span>${trace.events.length} records</span></summary><ol>${trace.events.slice().reverse().map((event) => `<li><strong>${esc(event.detail)}</strong><span>${esc(event.actor)} · ${esc(event.at.slice(0, 16).replace("T", " "))} UTC</span></li>`).join("")}</ol></details>
      ${trace.shipments.length ? `<div class="shipment-note">${num(shippedFromBatch(state, batch.id))} units dispatched from this batch. <button class="text-button" data-view="dispatch">View dispatch records</button></div>` : ""}
    </div><div class="quality-panel">${qualityPanel(batch)}</div></div></section>`;
}

function plannedPanel(batch) {
  const plan = materialPlan(state, batch.productId, batch.plannedUnits, batch.recipeSnapshot);
  const shortage = plan.some((row) => row.shortfall > 0);
  return `<details class="batch-assignment-edit"><summary>Production assignment</summary><form data-form="assignment">${assignmentFields(state, batch)}<label>Recorded by<input name="actor" required maxlength="200" value="${state.settings?.sample ? "Sample production planner" : ""}"></label><button class="secondary-button">Save assignment</button></form><p class="help">Assignment is saved with the batch and cannot change once production starts.</p></details><h3>Material readiness</h3><table class="small-table"><thead><tr><th>Component</th><th>Required</th><th>Status</th></tr></thead><tbody>${plan.map((row) => `<tr><td>${esc(row.name)}</td><td>${quantity(row.required, row.unit)}</td><td><span class="status ${row.shortfall ? "quality_hold" : "released"}">${row.shortfall ? "Shortage" : "Available"}</span></td></tr>`).join("")}</tbody></table><form data-form="start"><label>Production operator<input name="actor" value="${state.settings?.sample ? "Sample production lead" : ""}" required maxlength="200"></label><button class="primary" ${shortage ? "disabled" : ""}>Issue materials & start batch</button></form>${shortage ? '<p class="help">Insufficient released materials. Receive and release material lots in Company setup, or plan a smaller batch.</p>' : '<p class="help">Lots are allocated by earliest expiry. Material issue is recorded once.</p>'}`;
}

function outputPanel(batch) {
  if (batch.status === "in_progress") return `<h3>Record production output</h3><p class="secondary">Materials have been issued. Record completed units and the production note before quality inspection.</p><form data-form="finish"><div class="form-grid"><label>Actual units<input type="number" name="units" min="1" max="${batch.plannedUnits}" value="${batch.plannedUnits}" step="1" required></label><label>Recorded by<input name="actor" value="${state.settings?.sample ? "Sample production lead" : ""}" required maxlength="500"></label></div><label>Production note<textarea name="note" required maxlength="500" placeholder="Record the output, losses or deviations."></textarea></label><button class="primary">Complete production</button></form>`;
  const yieldPct = Math.round(batch.actualUnits / batch.plannedUnits * 1000) / 10;
  return `<div class="yield-heading"><div><h3>Recorded output</h3><p>${esc(batch.productionNote)}</p></div><div class="yield-figure"><strong>${yieldPct}%</strong><span>unit yield</span></div></div><div class="yield-bar" role="img" aria-label="${yieldPct}% of planned units produced"><span style="width:${yieldPct}%"></span></div><div class="yield-labels"><span>${num(batch.actualUnits)} units produced</span><span>${num(batch.plannedUnits - batch.actualUnits)} below plan</span></div>`;
}

function qualityPanel(batch) {
  const ready = qualityReady(batch);
  const released = batch.status === "released";
  const actionable = batch.status === "quality_hold";
  const checks = requiredChecks(batch).map((key) => ({ key, check: latestCheck(batch, key) }));
  const failed = checks.filter(({ check }) => check?.result === "fail").length;
  const pending = checks.filter(({ check }) => !check).length;
  // Lead with the release decision state, so a blocked batch is obvious before the detail.
  const banner = released
    ? `<div class="state-banner positive"><strong>Released · ${num(availableFinished(state, batch))} units available for dispatch</strong><span>Released by ${esc(batch.releasedBy)}. Production and inspection entries are locked after release.</span></div>`
    : actionable && ready
      ? '<div class="state-banner positive"><strong>All required checks pass</strong><span>A separate release decision is required before stock becomes available.</span></div>'
      : actionable
        ? `<div class="state-banner critical"><strong>Release blocked</strong><span>${[failed && `${failed} ${failed === 1 ? "check" : "checks"} failed`, pending && `${pending} awaiting inspection`].filter(Boolean).join(" · ")}. Every required check must pass before finished stock becomes available.</span></div>`
        : '<div class="state-banner neutral"><strong>Not yet inspected</strong><span>Quality inspection starts after production output is recorded.</span></div>';
  return `<div class="quality-title">${icon("quality")}<h3>Quality release</h3></div>${banner}
    <div class="check-list">${checks.map(({ key, check }) => `<div class="check-row ${check?.result ?? "pending"}"><span class="check-symbol ${check?.result ?? "pending"}" aria-hidden="true">${check?.result === "pass" ? "✓" : check?.result === "fail" ? "!" : "○"}</span><div><strong>${esc(checkLabel(batch, key))}</strong><span>${check ? esc(check.note) : "Awaiting inspection"}</span></div><b class="result ${check?.result ?? "pending"}">${check?.result ?? "Pending"}</b></div>`).join("")}</div>
    ${actionable ? `<form data-form="check" class="inspection-form"><h4>Record an inspection or retest</h4><div class="form-grid"><label>Check<select name="key">${requiredChecks(batch).map((key) => `<option value="${esc(key)}" ${latestCheck(batch, key)?.result !== "pass" ? "selected" : ""}>${esc(checkLabel(batch, key))}</option>`).join("")}</select></label><label>Result<select name="result"><option value="pass">Pass</option><option value="fail">Fail</option></select></label></div><label>Evidence / retest note<textarea name="note" maxlength="500" required placeholder="Record what was checked and what changed."></textarea></label><label>Inspector<input name="actor" value="${state.settings?.sample ? "Sample quality inspector" : ""}" maxlength="500" required></label><button class="secondary-button">Save inspection</button></form>` : ""}
    ${actionable && ready ? `<form data-form="release" class="release-form"><h4>Release decision</h4><label>Release reviewer<input name="actor" value="${state.settings?.sample ? "Sample release reviewer" : ""}" maxlength="500" required></label><label>Release note<textarea name="note" maxlength="500" required placeholder="Confirm review of the batch record and quality results."></textarea></label><button class="primary">Release ${num(batch.actualUnits)} units</button></form>` : ""}
    <p class="help">Checks follow the product specification saved with this batch. Operator names are recorded labels; authentication is not yet implemented.</p>`;
}

function materialsView() {
  return `${heading("Materials & lots", "Know what is available, where it came from and where it goes.")}
    <div class="explanation"><strong>Quarantine is a real gate.</strong><span>Only released, unexpired lots can be issued to production. Available amounts below exclude material already issued.</span></div>
    <div class="table-wrap"><table><thead><tr><th>Material / lot</th><th>Supplier</th><th>Remaining</th><th>Incoming quality</th><th>Expiry</th><th>Used in batches</th></tr></thead><tbody>${state.lots.map((lot) => {
      const material = state.materials.find((m) => m.id === lot.materialId);
      const batches = state.batches.filter((b) => b.allocations.some((a) => a.lotId === lot.id));
      return `<tr data-material-lot="${esc(lot.id)}" tabindex="-1"><td><strong>${esc(material.name)}</strong><span class="cell-sub">${esc(lot.id)}</span></td><td>${esc(lot.supplier)}</td><td class="numeric">${quantity(lot.available, material.unit)}</td><td><span class="status ${lot.status === "released" ? "released" : "quality_hold"}">${lot.status === "released" ? "Released" : "Quarantine"}</span></td><td>${esc(lot.expires)}</td><td>${batches.map((b) => `<button class="text-button" data-open-batch="${esc(b.id)}">${esc(b.id)}</button>`).join(" ") || '<span class="secondary">Not issued</span>'}</td></tr>`;
    }).join("")}</tbody></table></div><div class="note-panel"><h2>Follow a lot forward. Trace a batch back.</h2><p>Open any linked batch to see the allocated input quantities, inspection history, release decision and shipments. This alpha demonstrates trace links; recall execution and authenticated audit storage are on the roadmap.</p></div>`;
}

function qualityView() {
  const held = state.batches.filter((b) => b.status === "quality_hold");
  if (!held.some((b) => b.id === selected) && held.length) selected = held[0].id;
  return `${heading("Quality control", "Review the evidence. Release with confidence.")}
    <div class="quality-queue">${held.length ? held.map((b) => `<button class="queue-item ${selected === b.id ? "selected" : ""}" data-batch="${esc(b.id)}"><span><strong>${esc(b.id)}</strong> ${esc(product(b.productId).name)}</span><span>${num(b.actualUnits)} units</span>${badge(b)}</button>`).join("") : '<div class="empty-state"><h2>No batches awaiting release</h2><p>Start a planned batch and record its output to see the next quality review.</p><button class="primary" data-view="production">View production</button></div>'}</div>${held.length ? batchDetail() : ""}`;
}

function dispatchView() {
  return `${heading("Dispatch", "Released batches, customer destinations and every movement in between.")}
    <div class="dispatch-grid">${state.orders.map((order) => {
      const p = product(order.productId); const shipped = shippedToOrder(state, order.id); const remaining = order.units - shipped;
      const batches = state.batches.filter((b) => b.productId === order.productId && availableFinished(state, b) > 0);
      return `<section class="order-card"><div class="batch-card-top"><span>${esc(order.id)}</span><span class="status ${remaining ? "planned" : "released"}">${remaining ? "Open" : "Dispatched"}</span></div><h2>${esc(p.name)} <span>${esc(p.size)}</span></h2><p class="secondary">${esc(order.customer)}</p><dl class="order-stats"><div><dt>Ordered</dt><dd>${num(order.units)}</dd></div><div><dt>Dispatched</dt><dd>${num(shipped)}</dd></div><div><dt>Invoiced</dt><dd>${num(order.invoicedUnits)}</dd></div></dl><div class="order-balance"><span>${num(remaining)} units still to dispatch</span><span>${num(poBalance(order.units, order.invoicedUnits))} uninvoiced</span></div>
      ${remaining && batches.length ? `<form data-form="dispatch" data-order="${esc(order.id)}"><label>Released batch<select name="batchId">${batches.map((b) => `<option value="${esc(b.id)}">${esc(b.id)} · ${num(availableFinished(state, b))} available</option>`).join("")}</select></label><div class="form-grid"><label>Units<input name="units" type="number" min="1" max="${remaining}" step="1" value="${Math.min(remaining, availableFinished(state, batches[0]))}" required></label><label>Recorded by<input name="actor" value="${state.settings?.sample ? "Sample warehouse lead" : ""}" maxlength="500" required></label></div><label>Dispatch reference<input name="reference" value="DISPATCH-${String(state.shipments.length + 1).padStart(3, "0")}" maxlength="500" required></label><label>Ship-to destination<input name="destination" value="${esc(order.destination)}" required maxlength="200"></label><button class="primary">Record dispatch</button></form>` : remaining ? '<div class="hold-note">No released stock available. Complete production and quality release first.</div>' : '<div class="release-ready">All ordered units have been dispatched.</div>'}</section>`;
    }).join("")}</div><div class="section-line"><h2>Dispatch history</h2><span>Every movement retains its batch link</span></div><div class="table-wrap"><table><thead><tr><th>Reference</th><th>Batch</th><th>Order</th><th>Units</th><th>Destination</th><th>Recorded by</th></tr></thead><tbody>${state.shipments.map((s) => `<tr><td>${esc(s.reference)}</td><td><button class="text-button" data-open-batch="${esc(s.batchId)}">${esc(s.batchId)}</button></td><td>${esc(s.orderId)}</td><td class="numeric">${num(s.units)}</td><td>${esc(s.destination ?? "Not recorded")}</td><td>${esc(s.actor)}</td></tr>`).join("")}</tbody></table></div>`;
}

function guideView() {
  if (!state.settings?.sample) return `${heading("A manufacturing workflow you can follow.", "Configure your company, then connect material lots to batches and customer dispatches.")}<div class="guide-map"><img src="docs/assets/manufacturing-flow.svg" alt="Plan, issue lots, record output, inspect, release and dispatch."></div><div class="note-panel"><h2>From setup to your first batch</h2><p>Use Company setup to define materials, products and required quality checks. Receive and release supplier lots. Plan production, record actual output, complete inspections and explicitly release finished stock. Create a customer order with its ship-to destination, then record dispatch against a released batch.</p><p>Production maps show the resulting input and destination links. Yield compares actual output with planned units. Use the map table or select a node to inspect the full record.</p><button class="secondary-button" data-view="setup">Open company setup</button></div>`;
  return `${heading("A manufacturing workflow you can follow.", "For small manufacturers coordinating materials, batch production, quality and finished stock.")}
    <div class="guide-map"><img src="docs/assets/manufacturing-flow.svg" alt="Plan a batch, check released materials, issue input lots, record production output, inspect quality, release finished stock, and dispatch. A failed check keeps the batch on hold."></div>
    <div class="tour-grid"><article><span class="tour-number">1</span><h2>Resolve a quality hold</h2><p>Open BATCH-101. Inspect the failed fill-weight result. Record a passing retest with a note, review the history, then release the batch.</p><button class="secondary-button" data-open-batch="BATCH-101">Open quality example</button></article><article><span class="tour-number">2</span><h2>Run a new batch</h2><p>Open BATCH-102. Check material readiness, issue the lots, record actual output, and complete its required quality checks.</p><button class="secondary-button" data-open-batch="BATCH-102">Open planned batch</button></article><article><span class="tour-number">3</span><h2>Trace a shipment</h2><p>Dispatch released units against an order. Follow the batch link back to its material lots, inspections and release reviewer.</p><button class="secondary-button" data-view="dispatch">Open dispatch</button></article></div>
    <div class="note-panel"><h2>What this alpha includes</h2><p>A configurable local manufacturing workspace with saved company settings, recipes, material receipts, batches, inspections, release, dispatch and production maps. The static build is a separate fictional browser sample. This first module runs for one operator on one computer. Shared access, authentication, accounting integration and advanced production controls remain to be built. The full internal ERP is being extracted in stages.</p><a href="${staticSample ? "https://github.com/gab-rav/allure-erp-demo#scope-and-limits" : "https://github.com/gab-rav/allure-erp/blob/main/docs/roadmap.md"}" target="_blank" rel="noopener noreferrer">${staticSample ? "Read demo scope and limits" : "Read the release roadmap"}</a></div>`;
}

root.addEventListener("click", async (event) => {
  const node = event.target.closest("[data-map-node]");
  if (node) {
    activeNode = node.dataset.mapNode; render();
    [...root.querySelectorAll("[data-map-node]")].find(item => item.dataset.mapNode === activeNode && item.getClientRects().length)?.focus({ preventScroll: true });
    return;
  }
  const button = event.target.closest("button, a.brand"); if (!button || saving) return;
  if (button.dataset.closeDialog) { document.getElementById(button.dataset.closeDialog)?.close(); return; }
  if (button.dataset.poMode) { poMode = button.dataset.poMode; render(); root.querySelector(`[data-po-mode="${poMode}"]`).focus({ preventScroll: true }); return; }
  if (button.dataset.receivePo) { receiptSelection = { poId: button.dataset.receivePo, lineId: button.dataset.poLine }; render(); document.getElementById("receipt-dialog").showModal(); return; }
  if (button.dataset.openLot) {
    view = "materials"; render(); const row = [...root.querySelectorAll('[data-material-lot]')].find(row => row.dataset.materialLot === button.dataset.openLot);
    row?.scrollIntoView({ block: "center" }); row?.focus({ preventScroll: true }); return;
  }
  if (button.dataset.workspace) {
    workspaceArea = button.dataset.workspace;
    view = workspaceArea === "finance" ? "finance" : operationsView;
    financeUI.dialog = "";
    render(); root.querySelector(`[data-workspace="${workspaceArea}"]`).focus({ preventScroll: true }); window.scrollTo(0, 0); return;
  }
  if (button.dataset.finScreen) { view = "finance"; workspaceArea = "finance"; navOpen = false; return; }
  if (button.matches("a.brand")) { event.preventDefault(); view = "overview"; navOpen = false; render(); window.scrollTo(0, 0); return; }
  if (button.dataset.view) { view = button.dataset.view; navOpen = false; render(); document.querySelector("#main").focus({ preventScroll: true }); window.scrollTo(0, 0); return; }
  if (button.dataset.mapDisplay) {
    mapDisplay = button.dataset.mapDisplay; render();
    root.querySelector(`[data-map-display="${mapDisplay}"]`)?.focus({ preventScroll: true }); return;
  }
  if (button.dataset.overviewStatus) {
    // Status tiles are shortcuts for the status filter; selecting the active tile clears it.
    overviewFilters.query = root.querySelector('[data-form="overview-search"] [name="query"]')?.value ?? overviewFilters.query;
    overviewFilters.status = overviewFilters.status === button.dataset.overviewStatus ? "all" : button.dataset.overviewStatus;
    render(); root.querySelector(`[data-overview-status="${button.dataset.overviewStatus}"]`)?.focus({ preventScroll: true }); return;
  }
  if (button.dataset.batch) { selected = button.dataset.batch; render(); return; }
  if (button.dataset.mapBatch) { selected = button.dataset.mapBatch; activeNode = "batch"; view = "maps"; render(); return; }
  if (button.dataset.openBatch) { selected = button.dataset.openBatch; view = "production"; render(); return; }
  switch (button.dataset.action) {
    case "toggle-nav": setNavOpen(!navOpen); break;
    case "new-po":
      if (!(poMode === "supplier" ? state.materials.length : state.products.length)) { view = "setup"; render(); notify("Add your materials and products before creating a PO."); }
      else { nextPoLine = 1; render(); document.getElementById("po-dialog").showModal(); } break;
    case "add-po-line":
      if (nextPoLine < 100) root.querySelector('.po-form-lines').insertAdjacentHTML('beforeend', poLineField(state, poMode, nextPoLine++)); break;
    case "remove-po-line":
      if (root.querySelectorAll('.po-form-line').length > 1) button.closest('.po-form-line').remove(); break;
    case "clear-overview": overviewFilters = { site: null, status: "all", query: "" }; render(); break;
    case "plan":
      if (!state.products.length) { view = "setup"; render(); notify("Create a product recipe before planning production."); }
      else document.querySelector("#plan-dialog").showModal(); break;
    case "close-dialog": document.querySelector("#plan-dialog").close(); break;
    case "export-batch": download(`${selected.toLowerCase()}-record.json`, { notice: "Local record export; not a certified or tamper-proof audit record.", ...traceBatch(state, selected) }); break;
    case "export-map": download(`${selected.toLowerCase()}-trace.json`, productionMap(state, selected)); break;
    case "export-workspace": download("manufacturing-workspace.json", { revision, state }); break;
    case "load-sample":
      if (await apply({ type: "load_sample" }, "Sample setup", "Fictional company loaded.")) { view = "overview"; selected = "BATCH-103"; activeNode = "batch"; render(); } break;
    case "reset":
      if (!resetPending) { resetPending = true; render(); notify("Select Confirm reset to restore the fictional company and discard sample changes."); }
      else if (await apply({ type: "load_sample" }, "Sample setup", "Fictional company restored.")) { selected = "BATCH-103"; resetPending = false; render(); }
      break;
  }
});
root.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !navOpen || document.querySelector("dialog[open]")) return;
  // Return focus only when it would otherwise sit inside the navigation being hidden.
  setNavOpen(false, { returnFocus: root.querySelector(".sidebar-body")?.contains(document.activeElement) });
});
root.addEventListener("change", event => {
  if (["overview-site", "overview-status"].includes(event.target.id)) {
    const id = event.target.id;
    overviewFilters.query = root.querySelector('[data-form="overview-search"] [name="query"]').value;
    if (id === "overview-site") overviewFilters.site = JSON.parse(event.target.value); else overviewFilters.status = event.target.value;
    render(); document.getElementById(id)?.focus({ preventScroll: true });
  }
  if (event.target.id === "map-batch") { selected = event.target.value; activeNode = "batch"; render(); document.querySelector("#map-batch")?.focus({ preventScroll: true }); }
  if (event.target.id === "edit-product") { editingProduct = event.target.value; render(); }
});
root.addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.target; const data = Object.fromEntries(new FormData(form));
  if (form.dataset.form === "overview-search") {
    overviewFilters.query = data.query; render(); root.querySelector('[data-form="overview-search"] [name="query"]').focus({ preventScroll: true }); return;
  }
  if (form.dataset.financeForm || form.dataset.decisionForm) return;
  const actor = data.actor; let action = ["purchase-order", "po-receipt"].includes(form.dataset.form) ? purchaseOrderAction(form, data) : setupAction(form, data); let message = "Saved to the workspace.";
  if (form.dataset.form === "plan") {
    let number = 101; while (state.batches.some((b) => b.id === `BATCH-${number}`)) number++;
    action = { type: "plan_batch", id: `BATCH-${number}`, productId: data.productId, units: Number(data.units), productionSite: data.productionSite, productionLine: data.productionLine };
    message = "Batch planned. Review materials before starting.";
  } else if (form.dataset.form === "assignment") {
    action = { type: "assign_batch", batchId: selected, productionSite: data.productionSite, productionLine: data.productionLine }; message = "Production assignment saved.";
  } else if (form.dataset.form === "start") {
    action = { type: "start_batch", batchId: selected }; message = "Material lots issued. Production started.";
  } else if (form.dataset.form === "finish") {
    action = { type: "finish_batch", batchId: selected, units: Number(data.units), note: data.note }; message = "Output recorded. Batch is held for quality inspection.";
  } else if (form.dataset.form === "check") {
    action = { type: "record_check", batchId: selected, key: data.key, result: data.result, note: data.note }; message = "Inspection saved. Previous results remain in the history.";
  } else if (form.dataset.form === "release") {
    action = { type: "release_batch", batchId: selected, note: data.note }; message = "Batch released. Finished stock is available for dispatch.";
  } else if (form.dataset.form === "dispatch") {
    action = { type: "dispatch", batchId: data.batchId, orderId: form.dataset.order, units: Number(data.units), reference: data.reference, destination: data.destination }; message = "Dispatch recorded with its batch and destination.";
  }
  if (action && await apply(action, actor, message) && action.type === "plan_batch") { selected = action.id; view = "production"; render(); }
});
wireDecisions(root, {
  getState: () => state, ui: decisionUI, render, apply, notify, download,
  planBatch: (productId, units) => {
    const form = root.querySelector('[data-form="plan"]');
    form.elements.productId.value = productId;
    form.elements.units.value = units;
    document.getElementById("plan-dialog").showModal();
  },
  navigate: (target, id) => {
    if (target === "batch") { selected = id; view = "production"; }
    else if (target === "supplier" || target === "customer") { view = "orders"; poMode = target; }
    else if (target === "invoice") {
      view = "finance";
      financeUI.screen = "documents";
      financeUI.document = id;
      financeUI.docAsOf = state.asOf;
      financeUI.kind = "";
    } else if (target === "reconcile") { view = "finance"; financeUI.screen = "reconcile"; }
    else view = target;
    render();
    document.querySelector("#main").focus({ preventScroll: true });
    if (target === "supplier" || target === "customer") {
      [...root.querySelectorAll('.po-card')].find(row => row.getAttribute('aria-label') === id)?.scrollIntoView({ block: "start" });
    } else window.scrollTo(0, 0);
  }
});
wireFinance(root, { getState: () => state, ui: financeUI, render, apply, notify, download, navigate: (poId, type) => { view = "orders"; poMode = type; render(); const row = [...root.querySelectorAll('.po-card')].find(row => row.getAttribute('aria-label') === poId); row?.scrollIntoView({ block: "start" }); } });
render();
if (initialNotice) notify(initialNotice, true, initialSaveState === "saved" ? 7000 : 15000);
