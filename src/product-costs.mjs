import { CURRENCIES, validDate } from "./finance.mjs";
const ensure = (ok, message) => {
  if (!ok) throw new Error(message);
};
const text = (value, title) => {
  ensure(
    typeof value === "string" && value.trim() && value.length <= 300,
    `${title} is required (up to 300 characters).`,
  );
  return value.trim();
};
const whole = (n, title, zero = true) =>
  ensure(
    Number.isSafeInteger(n) && n >= (zero ? 0 : 1) && n <= 1e12,
    `${title} must be a bounded whole number.`,
  );
const date = (value, asOf) =>
  ensure(
    validDate(value) && value <= asOf,
    "Use a valid effective date on or before the workspace date.",
  );
const version = (p) => p.version ?? 1;
const recipeKey = (rows) =>
  JSON.stringify(
    rows
      .map(({ materialId, perUnit }) => ({ materialId, perUnit }))
      .sort((a, b) => a.materialId.localeCompare(b.materialId)),
  );
const recipeEqual = (a, b) => recipeKey(a) === recipeKey(b);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
function plus([a, b], [c, d]) {
  const n = a * d + c * b,
    den = b * d,
    g = gcd(n, den);
  return [n / g, den / g];
}
function rounded([n, d], units = 1) {
  const v = (n * BigInt(units) * 2n + d) / (d * 2n);
  ensure(v <= 1000000000000n, "Cost estimate is too large.");
  return Number(v);
}
export function latestCostSheet(state, productId) {
  return (
    state.costing?.sheets
      .filter((s) => s.productId === productId)
      .sort(
        (a, b) =>
          b.effectiveDate.localeCompare(a.effectiveDate) ||
          b.sequence - a.sequence,
      )[0] ?? null
  );
}
export function latestQuote(state, materialId, asOf = state.asOf) {
  return (
    state.costing?.quotes
      .filter((q) => q.materialId === materialId && q.effectiveDate <= asOf)
      .sort(
        (a, b) =>
          b.effectiveDate.localeCompare(a.effectiveDate) ||
          b.sequence - a.sequence,
      )[0] ?? null
  );
}
export function costSheetStale(state, sheet) {
  const p = state.products.find((p) => p.id === sheet?.productId);
  return Boolean(
    p &&
      (version(p) !== sheet.recipeVersion ||
        !recipeEqual(p.recipe, sheet.recipe)),
  );
}

export function validateCosting(state) {
  const c = state.costing;
  if (!c) return;
  ensure(
    Object.hasOwn(CURRENCIES, c.currency),
    "Choose a supported costing currency.",
  );
  ensure(
    !state.finance || c.currency === state.finance.currency,
    "Costing and finance must use the same workspace currency.",
  );
  for (const name of ["quotes", "sheets"]) {
    ensure(Array.isArray(c[name]), `Cost ${name} must be a list.`);
    ensure(
      new Set(c[name].map((r) => r.id)).size === c[name].length,
      "Cost record IDs must be unique.",
    );
  }
  for (const [i, q] of c.quotes.entries()) {
    ensure(
      q.id === `QUOTE-${i + 1}` && q.sequence === i + 1,
      "Invalid quote sequence.",
    );
    ensure(
      state.materials.some((m) => m.id === q.materialId),
      "Quote material not found.",
    );
    whole(q.amountMinor, "Quote amount");
    whole(q.basisQuantity, "Quote basis", false);
    date(q.effectiveDate, state.asOf);
    text(q.evidence, "Quote source");
    text(q.actor, "Quote reviewer");
    ensure(Number.isFinite(Date.parse(q.at)), "Invalid quote time.");
  }
  for (const [i, s] of c.sheets.entries()) {
    ensure(
      s.id === `COST-${i + 1}` && s.sequence === i + 1,
      "Invalid cost sheet sequence.",
    );
    ensure(
      state.products.some((p) => p.id === s.productId),
      "Cost product not found.",
    );
    whole(s.recipeVersion, "Recipe version", false);
    text(s.productName, "Product name");
    date(s.effectiveDate, state.asOf);
    text(s.actor, "Cost reviewer");
    ensure(Number.isFinite(Date.parse(s.at)), "Invalid cost time.");
    text(s.note, "Cost review note");
    ensure(
      typeof s.overheadsReviewed === "boolean",
      "Confirm whether non-material costs have been reviewed.",
    );
    ensure(
      Array.isArray(s.recipe) &&
        s.recipe.length &&
        new Set(s.recipe.map((r) => r.materialId)).size === s.recipe.length,
      "Cost recipe must contain unique inputs.",
    );
    for (const r of s.recipe) {
      ensure(
        state.materials.some((m) => m.id === r.materialId),
        "Cost material not found.",
      );
      whole(r.perUnit, "Cost recipe quantity", false);
      if (r.quoteId !== null) {
        const q = c.quotes.find((q) => q.id === r.quoteId);
        ensure(
          q &&
            q.materialId === r.materialId &&
            q.effectiveDate <= s.effectiveDate,
          "Cost quote must match its material and effective date.",
        );
      }
    }
    ensure(
      Array.isArray(s.extras) && s.extras.length <= 30,
      "Use up to 30 additional cost lines.",
    );
    ensure(
      new Set(s.extras.map((e) => e.label.toLowerCase())).size ===
        s.extras.length,
      "Additional cost names must be unique.",
    );
    for (const e of s.extras) {
      text(e.label, "Cost name");
      if (e.amountMinor !== null) {
        whole(e.amountMinor, "Additional cost");
        text(e.evidence, "Cost evidence");
      }
    }
    if (s.sellingMinor !== null) {
      whole(s.sellingMinor, "Selling price");
      text(s.sellingEvidence, "Selling price source");
    }
    estimateCost(state, s, 1);
  }
}

export function applyCostAction(state, action, context) {
  state.costing ??= {
    currency: action.currency ?? state.finance?.currency ?? "USD",
    quotes: [],
    sheets: [],
  };
  const c = state.costing;
  ensure(
    !action.currency || action.currency === c.currency,
    "Cost currency is fixed. No currency conversion is performed.",
  );
  date(action.effectiveDate, state.asOf);
  if (action.type === "cost_quote") {
    c.quotes.push({
      id: `QUOTE-${c.quotes.length + 1}`,
      sequence: c.quotes.length + 1,
      materialId: action.materialId,
      amountMinor: action.amountMinor,
      basisQuantity: action.basisQuantity,
      effectiveDate: action.effectiveDate,
      evidence: text(action.evidence, "Quote source"),
      ...context,
    });
  } else if (action.type === "cost_sheet") {
    const p = state.products.find((p) => p.id === action.productId);
    ensure(p, "Choose a product.");
    c.sheets.push({
      id: `COST-${c.sheets.length + 1}`,
      sequence: c.sheets.length + 1,
      productId: p.id,
      productName: p.name,
      recipeVersion: version(p),
      effectiveDate: action.effectiveDate,
      recipe: p.recipe.map((r) => ({
        ...r,
        quoteId:
          latestQuote(state, r.materialId, action.effectiveDate)?.id ?? null,
      })),
      extras: (action.extras ?? []).map((e) => ({
        label: text(e.label, "Cost name"),
        amountMinor: e.amountMinor,
        evidence: e.amountMinor === null ? "" : text(e.evidence, "Cost source"),
      })),
      overheadsReviewed: action.overheadsReviewed,
      sellingMinor: action.sellingMinor ?? null,
      sellingEvidence:
        action.sellingMinor == null
          ? ""
          : text(action.sellingEvidence, "Selling price source"),
      note: text(action.note, "Review note"),
      ...context,
    });
  } else throw new Error("Unknown costing action.");
  validateCosting(state);
}

/** Retains fractional minor units until the requested volume is totalled. */
export function estimateCost(state, sheet, units = 1) {
  whole(units, "Estimate units", false);
  let total = [0n, 1n];
  const lines = sheet.recipe.map((r) => {
    const q = state.costing.quotes.find((q) => q.id === r.quoteId),
      material = state.materials.find((m) => m.id === r.materialId);
    const rate = q
      ? [BigInt(q.amountMinor) * BigInt(r.perUnit), BigInt(q.basisQuantity)]
      : null;
    if (rate) total = plus(total, rate);
    return {
      label: material.name,
      materialId: material.id,
      unit: material.unit,
      perUnit: r.perUnit,
      quote: q ?? null,
      amountMinor: rate ? rounded(rate, units) : null,
    };
  });
  for (const e of sheet.extras) {
    if (e.amountMinor !== null)
      total = plus(total, [BigInt(e.amountMinor), 1n]);
    lines.push({
      ...e,
      amountMinor:
        e.amountMinor === null
          ? null
          : rounded([BigInt(e.amountMinor), 1n], units),
    });
  }
  const missing = lines
    .filter((l) => l.amountMinor === null)
    .map((l) => l.label);
  if (!sheet.overheadsReviewed) missing.push("Review non-material costs");
  const knownMinor = rounded(total, units),
    totalMinor = missing.length ? null : knownMinor;
  const salesMinor =
    sheet.sellingMinor === null
      ? null
      : rounded([BigInt(sheet.sellingMinor), 1n], units);
  const marginMinor =
    totalMinor === null || salesMinor === null ? null : salesMinor - totalMinor;
  return {
    units,
    lines,
    missing,
    knownMinor,
    totalMinor,
    salesMinor,
    marginMinor,
    marginPercent:
      marginMinor === null || !salesMinor
        ? null
        : (marginMinor / salesMinor) * 100,
  };
}
