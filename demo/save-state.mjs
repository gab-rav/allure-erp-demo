// Save-state wording for the location bar. Pure: it reads an error, never storage or the DOM.

/** "full" when the browser refused a write for quota, "blocked" when storage access is denied, otherwise null. */
export function browserStorageFailure(error) {
  if (!error || typeof error !== "object") return null;
  if (["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"].includes(error.name) || error.code === 22 || error.code === 1014) return "full";
  if (error.name === "SecurityError" || error.code === 18) return "blocked";
  return null;
}

/**
 * The save state after a failed action. Validation leaves the previous save status intact;
 * only an accepted write establishes that a previous failure has recovered.
 */
export function saveStateAfterFailure(error, { staticSample = false, previousState = "saved" } = {}) {
  const storage = browserStorageFailure(error);
  if (storage) return `storage-${storage}`;
  if (error?.status === 409) return "conflict";
  if (error?.status >= 500) return "error";
  if (!staticSample && !error?.status) return "error";
  return ["storage-full", "storage-blocked", "conflict", "error"].includes(previousState) ? previousState : "saved";
}

export function saveLabel(state, { staticSample = false } = {}) {
  return {
    saving: "Saving…",
    error: "Not saved · check the server",
    conflict: "Newer version saved · reload",
    "storage-full": "Not saved · browser storage is full",
    "storage-blocked": "Not saved · browser storage is blocked",
  }[state] ?? (staticSample ? "Saved in this browser" : "Saved locally");
}

/** What to tell the person, and what they can do, when the browser refused to store a change. */
export function storageFailureMessage(state, { atStartup = false } = {}) {
  const copy = "Export workspace downloads a copy of the records accepted so far.";
  if (state === "storage-full") return `${atStartup ? "Browser storage for this page is full, so changes cannot be saved." : "This change was not saved: browser storage for this page is full."} Free site data for this page in your browser settings, then try again. ${copy}`;
  return `${atStartup ? "This browser is blocking site storage, so changes cannot be saved." : "This change was not saved: this browser is blocking site storage, for example in a private window or with site data turned off."} Allow site data for this page, then ${atStartup ? "reload" : "try again"}. ${copy}`;
}
