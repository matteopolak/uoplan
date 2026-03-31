import { driver } from 'driver.js';
import type { DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import './styles/driver-dark.css';
import {
  formatTourDescriptionHtml,
  getShareStepContent,
  getWizardStepContent,
  WIZARD_TOUR_SELECTOR,
} from './lib/wizardStepContent';
import { WizardStep } from './lib/wizardSteps';
import { tr } from './i18n';

const TOUR_DONE_KEY = 'uoplan-tour-done';

function querySelectorOrBody(selector: string): Element {
  return document.querySelector(selector) ?? document.body;
}

/**
 * Runs the onboarding tour. Syncs the wizard step with tour progress so each
 * highlighted element is visible. Pass the same visible indices as the sidebar
 * ({@link buildVisibleStepIndices}).
 */
export function runTour(
  setWizardStep: (index: number) => void,
  visibleStepIndices: readonly number[],
): void {
  const wizardStepContent = getWizardStepContent();
  const descriptionHtmlList: string[] = [];
  const steps: DriveStep[] = [];

  for (const wizardIdx of visibleStepIndices) {
    const selector = WIZARD_TOUR_SELECTOR[wizardIdx as WizardStep];
    const content = wizardStepContent[wizardIdx as WizardStep];
    if (!selector || !content) continue;

    descriptionHtmlList.push(
      formatTourDescriptionHtml(content.purpose, content.whatToDo),
    );
    steps.push({
      element: () => querySelectorOrBody(selector),
      popover: {
        title: content.title,
        description: ' ',
      },
    });
  }

  const share = getShareStepContent();
  descriptionHtmlList.push(
    formatTourDescriptionHtml(share.purpose, share.whatToDo),
  );
  steps.push({
    element: () => querySelectorOrBody('[data-tour="share"]'),
    popover: {
      title: share.title,
      description: ' ',
    },
  });

  if (steps.length === 0) return;

  const firstWizard = visibleStepIndices[0];
  if (firstWizard !== undefined) {
    setWizardStep(firstWizard);
  }

  const driverObj = driver({
    showProgress: true,
    progressText: tr("tour.progress"),
    nextBtnText: tr("tour.next"),
    prevBtnText: tr("tour.back"),
    doneBtnText: tr("tour.done"),
    overlayColor: '#141517',
    overlayOpacity: 0.85,
    steps,
    onPopoverRender: (popover, { state }) => {
      const i = state.activeIndex ?? 0;
      const html = descriptionHtmlList[i];
      if (html) {
        popover.description.innerHTML = html;
      }
    },
    onNextClick: (_element, _step, { driver: d }) => {
      const state = d.getState();
      const currentIndex = state.activeIndex ?? 0;
      const nextTourIndex = currentIndex + 1;
      if (nextTourIndex >= steps.length) {
        d.moveNext();
        return;
      }
      const targetWizard =
        nextTourIndex < visibleStepIndices.length
          ? visibleStepIndices[nextTourIndex]!
          : WizardStep.Generate;
      setWizardStep(targetWizard);
      setTimeout(() => {
        d.moveNext();
        d.refresh();
      }, 250);
    },
    onPrevClick: (_element, _step, { driver: d }) => {
      const state = d.getState();
      const currentIndex = state.activeIndex ?? 0;
      const prevTourIndex = currentIndex - 1;
      if (prevTourIndex < 0) return;
      const targetWizard =
        prevTourIndex < visibleStepIndices.length
          ? visibleStepIndices[prevTourIndex]!
          : WizardStep.Generate;
      setWizardStep(targetWizard);
      setTimeout(() => {
        d.movePrevious();
        d.refresh();
      }, 250);
    },
    onDestroyed: () => {
      localStorage.setItem(TOUR_DONE_KEY, '1');
    },
  });

  driverObj.drive();
}

export { TOUR_DONE_KEY };
