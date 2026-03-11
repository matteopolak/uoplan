import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './styles/driver-dark.css';

const TOUR_STEPS = [
  {
    element: () => document.querySelector('[data-tour="term-select"]') as HTMLElement,
    popover: {
      title: 'Select your term',
      description:
        'Choose the academic term. This determines which course sections are available for schedule generation.',
    },
  },
  {
    element: () => document.querySelector('[data-tour="transcript-upload"]') as HTMLElement,
    popover: {
      title: 'Upload transcript or pick program',
      description:
        'Upload your unofficial transcript (PDF) to auto-fill completed courses and detect your program, or search and select your program manually below.',
    },
  },
  {
    element: () => document.querySelector('[data-tour="completed-courses"]') as HTMLElement,
    popover: {
      title: 'Completed courses',
      description:
        'Add courses you have already completed or are currently taking. You can also add more after uploading a transcript in the previous step.',
    },
  },
  {
    element: () => document.querySelector('[data-tour="requirements"]') as HTMLElement,
    popover: {
      title: 'Fill in requirements',
      description:
        'Select which courses you want this semester for each requirement. Assign your completed courses to the right requirement slots.',
    },
  },
  {
    element: () => document.querySelector('[data-tour="generate-schedules"]') as HTMLElement,
    popover: {
      title: 'Generate schedules',
      description:
        'Set how many courses you want, preferred times and days, then click to generate conflict-free schedule options.',
    },
  },
  {
    element: () => document.querySelector('[data-tour="share"]') as HTMLElement,
    popover: {
      title: 'Share your timetable',
      description:
        'Use Share to copy a link with your program, completed courses, and selections. After generating, you can share your full timetable from the calendar view.',
    },
  },
];

const WIZARD_STEP_COUNT = 5;

/**
 * Runs the first-time user tour. Syncs the wizard step with tour progress so
 * each highlighted element is visible. Call when the wizard view is mounted.
 */
export function runTour(setWizardStep: (index: number) => void): void {
  const driverObj = driver({
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    overlayColor: '#141517',
    overlayOpacity: 0.85,
    steps: TOUR_STEPS,
    onNextClick: (_element, _step, { driver: d }) => {
      const state = d.getState();
      const currentIndex = state.activeIndex ?? 0;
      const nextIndex = currentIndex + 1;
      setWizardStep(Math.min(nextIndex, WIZARD_STEP_COUNT - 1));
      setTimeout(() => {
        d.moveNext();
        d.refresh();
      }, 250);
    },
    onPrevClick: (_element, _step, { driver: d }) => {
      const state = d.getState();
      const currentIndex = state.activeIndex ?? 0;
      setWizardStep(Math.max(0, currentIndex - 1));
      setTimeout(() => {
        d.movePrevious();
        d.refresh();
      }, 250);
    },
    onDestroyed: () => {
      localStorage.setItem('uoplan-tour-done', '1');
    },
  });

  driverObj.drive();
}
