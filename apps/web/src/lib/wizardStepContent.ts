/**
 * Single source of truth for wizard onboarding copy (Help modal + Driver.js tour).
 */

export type WizardContentStep = {
  /** Short title for tour popover + modal */
  title: string;
  /** Why this step exists */
  purpose: string;
  /** Concrete actions for the user */
  whatToDo: string;
};

export const WIZARD_STEP_CONTENT: Record<number, WizardContentStep> = {
  0: {
    title: "Term",
    purpose:
      "Schedule data and section offerings are tied to a specific academic term. Choosing the right term ensures the planner uses courses that are actually offered when you plan to study.",
    whatToDo:
      "Select the term you are planning for from the list. You must have a term selected before you can generate schedules.",
  },
  1: {
    title: "Program",
    purpose:
      "Your program and starting year determine which degree requirements apply. Discipline lists help evaluate program-specific prerequisites.",
    whatToDo:
      "Set your first year of study, then search and select your program. Optionally upload an unofficial transcript PDF to auto-detect year, program, and completed courses — processing stays entirely on your device.",
  },
  2: {
    title: "Completed courses",
    purpose:
      "The planner subtracts what you have already done from your requirements and uses this list when assigning courses to requirement slots.",
    whatToDo:
      "Add every course you have completed or are currently taking, using course codes. You can refine this list after a transcript upload from the Program step.",
  },
  3: {
    title: "Program options",
    purpose:
      "Some programs include branches, majors, or option groups. This step records which path you are following so the correct requirement subtree is used.",
    whatToDo:
      "Work through each choice in order. Pick one option where required; use the back control inside a drilldown if you need to change a branch.",
  },
  4: {
    title: "Assign completed courses",
    purpose:
      "Each completed course must sit under a requirement it satisfies. Unassigned courses block schedule generation until they are placed.",
    whatToDo:
      "Assign every completed course to the requirement node it fulfills. Continue until the planner reports that all courses are assigned.",
  },
  5: {
    title: "Courses and filters",
    purpose:
      "You choose concrete courses (and optional section filters) for this term from each remaining requirement pool. Global filters narrow searchable and suggested courses.",
    whatToDo:
      "Expand each requirement, pick courses for this semester, and adjust section filters if needed. Use the course filters at the top for level, language, electives, and closed sections.",
  },
  6: {
    title: "Generate schedules",
    purpose:
      "The solver builds conflict-free timetables from your selections using your preferences for load, times, and days.",
    whatToDo:
      "Set how many courses you want this term, earliest start and latest end times, allowed days, and optional minimum professor rating. Adjust first-year credit cap or compressed schedule if shown, then click Generate Schedules.",
  },
};

export const SHARE_STEP_CONTENT: WizardContentStep = {
  title: "Share",
  purpose:
    "A shareable link encodes your term, program, completed courses, and planner selections so you can revisit or send your plan to someone else.",
  whatToDo:
    "Click Share in the header to copy the URL to your clipboard. After you generate timetables, you can also share from the calendar view.",
};

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
    `<p class="${TOUR_DESC_LABEL_CLASS}">What this step is for</p>` +
    `<p class="${TOUR_DESC_PURPOSE_CLASS}">${escapeHtml(purpose)}</p>` +
    `<p class="${TOUR_DESC_LABEL_CLASS} ${TOUR_DESC_LABEL_SECOND_CLASS}">What you should do</p>` +
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
export const WIZARD_TOUR_SELECTOR: Record<number, string> = {
  0: '[data-tour="term-select"]',
  1: '[data-tour="program-step"]',
  2: '[data-tour="completed-courses"]',
  3: '[data-tour="options"]',
  4: '[data-tour="assign-requirements"]',
  5: '[data-tour="constrain-schedule"]',
  6: '[data-tour="generate-step"]',
};
