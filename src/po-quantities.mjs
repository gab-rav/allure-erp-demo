// Adapted from Allure's internal operations application. Types removed for portable use.
// See docs/provenance.md. Copyright 2026 Gabriel Ravindran. Apache-2.0.

/** Signed accounting balance; excess invoicing stays visible. */
export function poBalance(orderedQuantity, invoicedQuantity) {
  const difference = orderedQuantity - invoicedQuantity;
  return Math.abs(difference) < 1e-8 ? 0 : Number(difference.toFixed(8));
}

/** Excess on one product cannot conceal another product's shortfall. */
export function summarizePoQuantities(lines) {
  const orderedQuantity = lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0);
  const invoicedQuantity = lines.reduce((sum, line) => sum + line.invoicedQuantity, 0);
  const fulfilmentQuantity = lines.reduce((sum, line) => sum + Math.min(line.invoicedQuantity, line.quantity ?? 0), 0);
  const remainingQuantity = poBalance(orderedQuantity, invoicedQuantity);
  const outstandingQuantity = Math.max(0, poBalance(orderedQuantity, fulfilmentQuantity));
  return {
    orderedQuantity, invoicedQuantity, fulfilmentQuantity, remainingQuantity,
    remainingPercent: orderedQuantity ? remainingQuantity / orderedQuantity * 100 : 100,
    outstandingQuantity,
    outstandingPercent: orderedQuantity ? outstandingQuantity / orderedQuantity * 100 : 100,
    fillPercent: orderedQuantity ? invoicedQuantity / orderedQuantity * 100 : 0,
  };
}
