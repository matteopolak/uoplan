/**
 * Wizard uses fixed indices into {@link STEPS}.
 * Options (3) and Assign (4) are omitted from the flow when the user has nothing to do.
 */
export enum WizardStep {
  Term = 0,
  Program = 1,
  Completed = 2,
  Options = 3,
  Assign = 4,
  Generate = 5,
}

export const ALL_WIZARD_STEP_INDICES = [
  WizardStep.Term,
  WizardStep.Program,
  WizardStep.Completed,
  WizardStep.Options,
  WizardStep.Assign,
  WizardStep.Generate,
] as const;

/** Interactive steps only (omits Options / Assign when N/A). */
export function buildVisibleStepIndices(
  needsOptions: boolean,
  needsAssign: boolean,
): number[] {
  const out: number[] = [WizardStep.Term, WizardStep.Program, WizardStep.Completed];
  if (needsOptions) out.push(WizardStep.Options);
  if (needsAssign) out.push(WizardStep.Assign);
  out.push(WizardStep.Generate);
  return out;
}

export function getNextStep(
  current: number,
  needsOptions: boolean,
  needsAssign: boolean,
): number {
  const visible = buildVisibleStepIndices(needsOptions, needsAssign);
  const i = visible.indexOf(current);
  if (i !== -1) return visible[Math.min(i + 1, visible.length - 1)];
  const next = visible.find((s) => s > current);
  return next ?? current;
}

export function getPrevStep(
  current: number,
  needsOptions: boolean,
  needsAssign: boolean,
): number {
  const visible = buildVisibleStepIndices(needsOptions, needsAssign);
  const i = visible.indexOf(current);
  if (i !== -1) return visible[Math.max(i - 1, 0)];
  const prev = [...visible].reverse().find((s) => s < current);
  return prev ?? current;
}

/** If `active` points at a skipped step, move to the nearest visible step (forwards first). */
export function normalizeActiveStep(
  active: number,
  needsOptions: boolean,
  needsAssign: boolean,
): number {
  const visible = buildVisibleStepIndices(needsOptions, needsAssign);
  if (visible.includes(active)) return active;
  const forward = visible.find((s) => s >= active);
  if (forward != null) return forward;
  const backward = [...visible].reverse().find((s) => s <= active);
  return backward ?? visible[0];
}

/**
 * Sidebar row index for "furthest progress": steps with a lower display index stay
 * checked when revisiting earlier rows. If {@link furthestActual} is not visible
 * (optional step dropped), uses the row of the next visible step after it.
 */
export function furthestReachedDisplayIndex(
  visible: readonly number[],
  furthestActual: number,
): number {
  const i = visible.indexOf(furthestActual);
  if (i !== -1) return i;
  const next = visible.find((a) => a > furthestActual);
  if (next !== undefined) return visible.indexOf(next);
  return Math.max(0, visible.length - 1);
}

/** True when this step is not part of the interactive flow (sidebar still shows it as skipped). */
export function isWizardStepSkipped(
  actualIdx: number,
  needsOptions: boolean,
  needsAssign: boolean,
): boolean {
  if (actualIdx === WizardStep.Options) return !needsOptions;
  if (actualIdx === WizardStep.Assign) return !needsAssign;
  return false;
}

/** First interactive step index strictly after `actualIdx` (next row in the real flow). */
export function firstInteractiveStepAfter(
  actualIdx: number,
  needsOptions: boolean,
  needsAssign: boolean,
): number | undefined {
  const nav = buildVisibleStepIndices(needsOptions, needsAssign);
  return nav.find((s) => s > actualIdx);
}

/** Skipped optional row may show a grey check once the user has moved past that slot. */
export function skippedWizardStepIsPassed(
  actualIdx: number,
  furthestActual: number,
  needsOptions: boolean,
  needsAssign: boolean,
): boolean {
  if (!isWizardStepSkipped(actualIdx, needsOptions, needsAssign)) return false;
  const next = firstInteractiveStepAfter(actualIdx, needsOptions, needsAssign);
  if (next === undefined) return false;
  return furthestActual >= next;
}
