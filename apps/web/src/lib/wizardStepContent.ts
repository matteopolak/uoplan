/**
 * Single source of truth for wizard onboarding copy (Help modal + Driver.js tour).
 */
import { WizardStep } from "./wizardSteps";
import { tr } from "../i18n";

export type WizardContentStep = {
  /** Short title for tour popover + modal */
  title: string;
  /** Why this step exists */
  purpose: string;
  /** Concrete actions for the user */
  whatToDo: string;
};

export function getWizardStepContent(): Record<WizardStep, WizardContentStep> {
  return {
    [WizardStep.Term]: {
      title: tr("wizardContent.term.title"),
      purpose: tr("wizardContent.term.purpose"),
      whatToDo: tr("wizardContent.term.whatToDo"),
    },
    [WizardStep.Mode]: {
      title: tr("wizardContent.mode.title"),
      purpose: tr("wizardContent.mode.purpose"),
      whatToDo: tr("wizardContent.mode.whatToDo"),
    },
    [WizardStep.Program]: {
      title: tr("wizardContent.program.title"),
      purpose: tr("wizardContent.program.purpose"),
      whatToDo: tr("wizardContent.program.whatToDo"),
    },
    [WizardStep.Completed]: {
      title: tr("wizardContent.completed.title"),
      purpose: tr("wizardContent.completed.purpose"),
      whatToDo: tr("wizardContent.completed.whatToDo"),
    },
    [WizardStep.Options]: {
      title: tr("wizardContent.options.title"),
      purpose: tr("wizardContent.options.purpose"),
      whatToDo: tr("wizardContent.options.whatToDo"),
    },
    [WizardStep.Assign]: {
      title: tr("wizardContent.assign.title"),
      purpose: tr("wizardContent.assign.purpose"),
      whatToDo: tr("wizardContent.assign.whatToDo"),
    },
    [WizardStep.Generate]: {
      title: tr("wizardContent.generate.title"),
      purpose: tr("wizardContent.generate.purpose"),
      whatToDo: tr("wizardContent.generate.whatToDo"),
    },
  };
}

export function getShareStepContent(): WizardContentStep {
  return {
    title: tr("wizardContent.share.title"),
    purpose: tr("wizardContent.share.purpose"),
    whatToDo: tr("wizardContent.share.whatToDo"),
  };
}

/** CSS classes for structured tour description blocks (see driver-dark.css). */
export const TOUR_DESC_PURPOSE_CLASS = "driver-tour-desc__purpose";
export const TOUR_DESC_ACTION_CLASS = "driver-tour-desc__action";
export const TOUR_DESC_LABEL_CLASS = "driver-tour-desc__label";
export const TOUR_DESC_LABEL_SECOND_CLASS = "driver-tour-desc__label--second";

/**
 * HTML body for Driver.js popover description (two labeled blocks).
 */
export function formatTourDescriptionHtml(purpose: string, whatToDo: string): string {
  return (
    `<p class="${TOUR_DESC_LABEL_CLASS}">${tr("wizardContent.tour.whatFor")}</p>` +
    `<p class="${TOUR_DESC_PURPOSE_CLASS}">${escapeHtml(purpose)}</p>` +
    `<p class="${TOUR_DESC_LABEL_CLASS} ${TOUR_DESC_LABEL_SECOND_CLASS}">${tr("wizardContent.tour.whatToDo")}</p>` +
    `<p class="${TOUR_DESC_ACTION_CLASS}">${escapeHtml(whatToDo)}</p>`
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `data-tour` selector per wizard step index (main panel highlight). */
export const WIZARD_TOUR_SELECTOR: Record<WizardStep, string> = {
  [WizardStep.Term]: '[data-tour="term-select"]',
  [WizardStep.Mode]: '[data-tour="mode-select"]',
  [WizardStep.Program]: '[data-tour="program-step"]',
  [WizardStep.Completed]: '[data-tour="completed-courses"]',
  [WizardStep.Options]: '[data-tour="options"]',
  [WizardStep.Assign]: '[data-tour="assign-requirements"]',
  [WizardStep.Generate]: '[data-tour="generate-step"]',
};
