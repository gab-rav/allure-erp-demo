import { parseMoney, validDate } from "./finance.mjs";

/** RFC-style quoted CSV; no file or network access. Imported rows remain reviewable. */
export function parseCsv(text) {
  if (typeof text !== "string" || text.length > 120000)
    throw new Error("Paste a CSV under 120 KB.");
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw new Error("Unexpected quote in CSV.");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed && c.trim())
        throw new Error("Unexpected text after a quoted value.");
      if (!closed) cell += c;
    }
  }
  if (quoted) throw new Error("A CSV quote is not closed.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2 || rows.length > 301)
    throw new Error("Include a header and between 1 and 300 data rows.");
  const headers = rows.shift().map((h) => h.replace(/^\uFEFF/, "").trim());
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw new Error("CSV headers must be non-empty and unique.");
  return { headers, rows };
}
export function previewBankImport(state, accountId, csv, mapping) {
  const { headers, rows } = parseCsv(csv),
    f = state.finance;
  if (!f?.accounts.some((a) => a.id === accountId))
    throw new Error("Choose a bank account.");
  const fields = ["date", "reference", "amount", "party", "description"];
  for (const field of fields)
    if (!headers.includes(mapping[field]))
      throw new Error(`Map the ${field} column.`);
  if (new Set(fields.map((f) => mapping[f])).size !== fields.length)
    throw new Error("Map each bank field to a different column.");
  const seen = new Set();
  const account = f.accounts.find((a) => a.id === accountId);
  return rows.map((values, index) => {
    let data = null,
      error = "";
    let status = "new";
    try {
      if (values.length !== headers.length)
        throw new Error("Column count does not match the header.");
      const get = (field) => values[headers.indexOf(mapping[field])].trim();
      const signed = parseMoney(get("amount"), f.currency);
      if (!signed) throw new Error("A bank movement cannot be zero.");
      if (
        !validDate(get("date")) ||
        get("date") < account.openingDate ||
        get("date") > state.asOf
      )
        throw new Error(
          "Date must fall between the account opening date and the workspace date.",
        );
      if (
        ["reference", "party", "description"].some(
          (k) => !get(k) || get(k).length > 300,
        )
      )
        throw new Error(
          "Reference, party and description are required (up to 300 characters).",
        );
      data = {
        date: get("date"),
        reference: get("reference"),
        direction: signed > 0 ? "in" : "out",
        amountMinor: Math.abs(signed),
        party: get("party"),
        description: get("description"),
      };
      const identity = data.reference.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(identity))
        throw new Error("Repeated bank reference in this file.");
      seen.add(identity);
      const previous = f.transactions.find(
        (t) =>
          t.accountId === accountId &&
          t.reference.toLowerCase().replace(/\s+/g, " ") === identity,
      );
      if (previous) {
        if (
          !previous.source ||
          JSON.stringify(previous.source) !== JSON.stringify(data)
        )
          throw new Error("Conflicts with an existing bank reference.");
        status = "duplicate";
      } else if (
        f.closes.some((c) => !c.reopenedAt && data.date.slice(0, 7) <= c.month)
      )
        throw new Error("This movement falls in a closed period.");
    } catch (e) {
      status = "error";
      error = e.message;
    }
    return { row: index + 2, data, status, error };
  });
}
