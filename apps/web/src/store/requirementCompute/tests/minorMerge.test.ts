import { describe, expect, it, vi } from 'vitest';
import type { Program, ProgramRequirement } from 'schemas';
import type { DataCache } from 'schedule';
import { mergeProgramWithMinor } from '../minorMerge';

// Mock schedule's computeRequirementsState so we don't have to build a complex cache
vi.mock('schedule', async (importOriginal) => {
  const actual = await importOriginal<typeof import('schedule')>();
  return {
    ...actual,
    computeRequirementsState: (program: Program) => {
      // Mock logic: just sum up any "credits" field found in the requirements
      // to determine how many credits this minor needs
      let minorCredits = 0;
      for (const req of program.requirements) {
        if (req.credits) minorCredits += req.credits;
      }
      return {
        remaining: [{ creditsNeeded: minorCredits }],
        tree: [],
        completedList: []
      };
    }
  };
});

describe('minorMerge', () => {
  const mockCache = {} as DataCache;

  const createProgram = (_id: string, title: string, requirements: ProgramRequirement[]): Program => ({
    title,
    url: '',
    requirements
  });

  it('merges minor into main program and subtracts credits from electives', () => {
    const mainReqs: ProgramRequirement[] = [
      { type: 'course', code: 'CSI 2110' },
      { type: 'free_elective', credits: 15 }
    ];
    const mainProgram = createProgram('main', 'Computer Science', mainReqs);

    const minorReqs: ProgramRequirement[] = [
      { type: 'course', code: 'MAT 1341', credits: 6 } // Needs 6 credits based on mock
    ];
    const minorProgram = createProgram('minor', 'Mathematics Minor', minorReqs);

    const merged = mergeProgramWithMinor(mainProgram, minorProgram, mockCache);

    expect(merged.title).toBe('Computer Science + Mathematics Minor');
    expect(merged.requirements.length).toBe(3); // course, reduced elective, and wrapped minor
    
    // Check original course is untouched
    expect(merged.requirements[0].code).toBe('CSI 2110');
    
    // Check elective credits are reduced (15 - 6 = 9)
    expect(merged.requirements[1].type).toBe('free_elective');
    expect(merged.requirements[1].credits).toBe(9);

    // Check minor requirements are appended in an 'and' block
    expect(merged.requirements[2].type).toBe('and');
    expect(merged.requirements[2].title).toBe('Mathematics Minor');
    expect(merged.requirements[2].options?.[0].code).toBe('MAT 1341');
  });

  it('removes elective nodes entirely if credits drop to zero', () => {
    const mainReqs: ProgramRequirement[] = [
      { type: 'free_elective', credits: 6 }
    ];
    const mainProgram = createProgram('main', 'Arts', mainReqs);

    const minorReqs: ProgramRequirement[] = [
      { type: 'course', code: 'MUS 1000', credits: 6 } // 6 credits
    ];
    const minorProgram = createProgram('minor', 'Music Minor', minorReqs);

    const merged = mergeProgramWithMinor(mainProgram, minorProgram, mockCache);

    // The free elective should be removed, leaving only the appended minor block
    expect(merged.requirements.length).toBe(1);
    expect(merged.requirements[0].type).toBe('and');
    expect(merged.requirements[0].title).toBe('Music Minor');
  });

  it('subtracts from electives traversing backwards', () => {
    const mainReqs: ProgramRequirement[] = [
      { type: 'elective', credits: 6, code: 'ELEC 1' },
      { type: 'free_elective', credits: 6, code: 'ELEC 2' }
    ];
    const mainProgram = createProgram('main', 'Science', mainReqs);

    const minorReqs: ProgramRequirement[] = [
      { type: 'course', code: 'BIO 1100', credits: 9 } // 9 credits
    ];
    const minorProgram = createProgram('minor', 'Biology Minor', minorReqs);

    const merged = mergeProgramWithMinor(mainProgram, minorProgram, mockCache);

    // Requires 9 credits to subtract.
    // Traversing backwards: 
    // ELEC 2 has 6 credits. 9 - 6 = 3. ELEC 2 removed.
    // ELEC 1 has 6 credits. 6 - 3 = 3. ELEC 1 reduced to 3.
    expect(merged.requirements.length).toBe(2); // ELEC 1 and the minor block
    
    expect(merged.requirements[0].code).toBe('ELEC 1');
    expect(merged.requirements[0].credits).toBe(3);
  });

  it('handles nested options and traverses them properly', () => {
    const mainReqs: ProgramRequirement[] = [
      { 
        type: 'and',
        options: [
          { type: 'elective', credits: 3, code: 'NESTED ELEC' }
        ]
      },
      { type: 'non_discipline_elective', credits: 3 }
    ];
    const mainProgram = createProgram('main', 'Engineering', mainReqs);

    const minorReqs: ProgramRequirement[] = [
      { type: 'course', code: 'ADM 1100', credits: 6 }
    ];
    const minorProgram = createProgram('minor', 'Business Minor', minorReqs);

    const merged = mergeProgramWithMinor(mainProgram, minorProgram, mockCache);

    // Needs 6 credits.
    // Backwards traversal:
    // 1. non_discipline_elective (3 credits) -> removed, 3 needed
    // 2. and block -> recurses into options
    // 3. nested elective (3 credits) -> removed, 0 needed.
    
    // Result: The outer 'and' block still exists, but its options are empty.
    // The top-level array has the 'and' block and the appended minor block.
    expect(merged.requirements.length).toBe(2);
    expect(merged.requirements[0].type).toBe('and');
    expect(merged.requirements[0].options?.length).toBe(0);
    expect(merged.requirements[1].type).toBe('and');
    expect(merged.requirements[1].title).toBe('Business Minor');
  });

  it('deep clones the program so original is unmodified', () => {
    const mainReqs: ProgramRequirement[] = [
      { type: 'free_elective', credits: 6 }
    ];
    const mainProgram = createProgram('main', 'Arts', mainReqs);
    const minorReqs: ProgramRequirement[] = [
      { type: 'course', code: 'MUS 1000', credits: 3 }
    ];
    const minorProgram = createProgram('minor', 'Music Minor', minorReqs);

    mergeProgramWithMinor(mainProgram, minorProgram, mockCache);

    // Main program should be completely untouched
    expect(mainProgram.title).toBe('Arts');
    expect(mainProgram.requirements[0].credits).toBe(6);
  });
});
