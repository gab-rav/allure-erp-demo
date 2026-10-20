// Invented price observations and unconfirmed demand, separate from recorded finance.
import { workspaceTransition } from "../src/workspace.mjs";
export function addSamplePlanning(input) {
  let state = input;
  const context = {
    actor: "Elena Brooks · Finance",
    at: "2026-09-30T18:30:00.000Z",
  };
  const run = (action) => {
    state = workspaceTransition(state, action, context);
  };
  for (const [materialId, amountMinor, basisQuantity] of [
    ["BULK-SHAM", 380, 1000],
    ["BULK-WASH", 360, 1000],
    ["BULK-COND", 520, 1000],
    ["BOTTLE-500", 7800, 100],
    ["BOTTLE-250", 4200, 100],
    ["LABEL-SHAM", 8500, 1000],
    ["LABEL-WASH", 7000, 1000],
  ])
    run({
      type: "cost_quote",
      materialId,
      amountMinor,
      basisQuantity,
      currency: "USD",
      effectiveDate: "2026-09-01",
      evidence: `Fictional supplier price review · ${materialId} · September 2026`,
    });
  const sheet = (productId, sellingMinor, fill, effectiveDate) =>
    run({
      type: "cost_sheet",
      productId,
      effectiveDate,
      overheadsReviewed: true,
      sellingMinor,
      sellingEvidence: "Fictional wholesale price list · September 2026",
      extras: [
        {
          label: "Filling & packing",
          amountMinor: fill,
          evidence: "Illustrative conversion rate per finished unit",
        },
        {
          label: "Allocated operating overhead",
          amountMinor: 12,
          evidence: "Illustrative per-unit overhead assumption",
        },
      ],
      note: "Sample estimate from quoted inputs; excludes tax. This is not a measured batch cost.",
    });
  sheet("SHAM-MOIST-500", 750, 40, "2026-09-15");
  sheet("WASH-TEA-250", 450, 28, "2026-09-15");
  sheet("COND-COCO-500", 850, 48, "2026-09-15");
  run({
    type: "cost_quote",
    materialId: "BULK-SHAM",
    amountMinor: 420,
    basisQuantity: 1000,
    effectiveDate: "2026-09-25",
    evidence: "Fictional revised shampoo bulk quotation · 25 September 2026",
  });
  sheet("SHAM-MOIST-500", 750, 40, "2026-09-30");
  run({
    type: "planning_assumption",
    productId: "WASH-TEA-250",
    units: 480,
    date: "2026-10-15",
    customer: "Autumn retail scenario",
    note: "Unconfirmed autumn replenishment, additional to current orders. Include only when comparing the planning scenario.",
  });
  run({
    type: "work_review",
    key: "quality:BATCH-101",
    owner: "Aisha Patel · Quality",
    note: "Review the held shampoo before planning replacement production. The release decision remains with the quality record.",
  });
  return state;
}
