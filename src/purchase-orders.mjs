const ensure = (value, message) => { if (!value) throw new Error(message); };
const name = (value, field) => { ensure(typeof value === "string" && value.trim() && value.length <= 200, `${field} is required (maximum 200 characters).`); return value.trim(); };
const positive = value => Number.isSafeInteger(value) && value > 0;
const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const dueDate = value => { if (value == null || value === "") return null; ensure(validDate(value), "Enter a valid due date."); return value; };

/** Optional fields keep existing workspaces readable without changing their records. */
export function validatePurchasing(state) {
  const supplierOrders = state.supplierOrders ?? [];
  ensure(Array.isArray(supplierOrders), "Supplier POs must be a list.");
  ensure(new Set(supplierOrders.map(row => row.id)).size === supplierOrders.length, "Supplier PO references must be unique.");
  for (const order of state.orders) {
    if (order.poReference != null) name(order.poReference, "Customer PO reference");
    if (order.dueDate != null) dueDate(order.dueDate);
  }
  const customerGroups = new Map();
  for (const order of state.orders) {
    const key = (order.poReference ?? order.id).toLowerCase();
    const first = customerGroups.get(key);
    if (first) {
      ensure(first.poReference && order.poReference && first.poReference === order.poReference,
        "This customer PO reference already exists.");
      ensure(first.customer === order.customer && first.destination === order.destination && (first.dueDate ?? null) === (order.dueDate ?? null),
        "Customer PO lines must share the same customer, destination and due date.");
    } else customerGroups.set(key, order);
  }
  for (const po of supplierOrders) {
    name(po.id, "Supplier PO reference"); name(po.supplier, "Supplier"); dueDate(po.dueDate);
    ensure(Array.isArray(po.lines) && po.lines.length > 0, "A supplier PO needs at least one line.");
    ensure(new Set(po.lines.map(line => line.id)).size === po.lines.length, "Supplier PO line IDs must be unique.");
    for (const line of po.lines) {
      name(line.id, "PO line reference");
      ensure(state.materials.some(row => row.id === line.materialId), "PO material not found.");
      ensure(positive(line.quantity), "PO quantity must be a positive whole number in the material's base unit.");
      const received = state.lots.filter(lot => lot.purchaseOrderId === po.id && lot.purchaseOrderLineId === line.id).reduce((sum, lot) => sum + lot.receivedQuantity, 0);
      ensure(received <= line.quantity, "Receipt exceeds the outstanding supplier PO quantity.");
    }
  }
  for (const lot of state.lots) {
    if (lot.purchaseOrderId == null && lot.purchaseOrderLineId == null) continue;
    const po = supplierOrders.find(row => row.id === lot.purchaseOrderId);
    const line = po?.lines.find(row => row.id === lot.purchaseOrderLineId);
    ensure(line && line.materialId === lot.materialId && po.supplier === lot.supplier, "Receipt must match its supplier PO, line and material.");
    ensure(positive(lot.receivedQuantity) && lot.available <= lot.receivedQuantity, "PO receipt quantity is invalid.");
  }
}

export function createPurchaseOrder(state, action, actor, at) {
  const reference = name(action.id, "PO reference");
  ensure(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(reference), "Use up to 40 letters, numbers, dots, dashes or underscores for PO references.");
  const due = dueDate(action.dueDate);
  ensure(Array.isArray(action.lines) && action.lines.length > 0 && action.lines.length <= 100, "Add between 1 and 100 PO lines.");
  if (action.type === "create_customer_po") {
    ensure(!state.orders.some(row => (row.poReference ?? row.id).toLowerCase() === reference.toLowerCase()), "This customer PO reference already exists.");
    const customer = name(action.customer, "Customer"), destination = name(action.destination, "Ship-to destination");
    const lines = action.lines.map((line, index) => {
      ensure(state.products.some(row => row.id === line.productId), "PO product not found.");
      ensure(positive(line.units), "Ordered units must be a positive whole number.");
      const id = `${reference}-L${index + 1}`;
      ensure(!state.orders.some(row => row.id.toLowerCase() === id.toLowerCase()), "This order line reference already exists.");
      return { id, poReference: reference, customer, destination, productId: line.productId, units: line.units, invoicedUnits: 0, dueDate: due, createdAt: at, createdBy: actor };
    });
    state.orders.push(...lines);
  } else {
    state.supplierOrders ??= [];
    ensure(!state.supplierOrders.some(row => row.id.toLowerCase() === reference.toLowerCase()), "This supplier PO reference already exists.");
    const supplier = name(action.supplier, "Supplier");
    const lines = action.lines.map((line, index) => {
      ensure(state.materials.some(row => row.id === line.materialId), "PO material not found.");
      ensure(positive(line.quantity), "PO quantity must be a positive whole number in the material's base unit.");
      return { id: `L${index + 1}`, materialId: line.materialId, quantity: line.quantity };
    });
    state.supplierOrders.push({ id: reference, supplier, dueDate: due, lines, createdAt: at, createdBy: actor });
  }
}

export function supplierPoRows(state) {
  return (state.supplierOrders ?? []).map(po => {
    const lines = po.lines.map(line => {
      const material = state.materials.find(row => row.id === line.materialId);
      const receipts = state.lots.filter(lot => lot.purchaseOrderId === po.id && lot.purchaseOrderLineId === line.id);
      const received = receipts.reduce((sum, lot) => sum + lot.receivedQuantity, 0);
      return { ...line, name: material.name, unit: material.unit, received, outstanding: line.quantity - received, quarantine: receipts.filter(lot => lot.status === "quarantine").reduce((sum, lot) => sum + lot.available, 0), receipts };
    });
    const complete = lines.every(line => line.outstanding === 0);
    return { ...po, lines, complete, overdue: !complete && Boolean(po.dueDate && po.dueDate < state.asOf) };
  });
}

export function customerPoRows(state) {
  const groups = new Map();
  for (const order of state.orders) {
    const reference = order.poReference ?? order.id;
    const po = groups.get(reference) ?? { id: reference, customer: order.customer, destination: order.destination, dueDate: order.dueDate ?? null, lines: [] };
    const shipments = state.shipments.filter(row => row.orderId === order.id);
    const dispatched = shipments.reduce((sum, row) => sum + row.units, 0);
    po.lines.push({ ...order, name: state.products.find(row => row.id === order.productId).name, dispatched, outstanding: order.units - dispatched, shipments });
    groups.set(reference, po);
  }
  return [...groups.values()].map(po => {
    const complete = po.lines.every(line => line.outstanding === 0);
    return { ...po, complete, overdue: !complete && Boolean(po.dueDate && po.dueDate < state.asOf) };
  });
}
