// Shared presentation fragments. They read batch status only; workflow rules stay in src/.
const STAGES = ["Plan", "Make", "Quality", "Release"];
const STAGE_INDEX = { planned: 0, in_progress: 1, quality_hold: 2, released: 3 };

/** Four-step batch lifecycle glyph: plan, make, quality, release. */
export function lifecycle(status, { decorative = false } = {}) {
  const at = STAGE_INDEX[status] ?? 0;
  const label = `Stage ${at + 1} of 4: ${STAGES[at]}`;
  const marks = STAGES.map((_, i) => `<i class="${i < at ? "done" : i === at ? "current" : ""}"></i>`).join("");
  return `<span class="lifecycle" data-status="${status}" ${decorative ? 'aria-hidden="true"' : `role="img" aria-label="${label}"`}>${marks}</span>`;
}
