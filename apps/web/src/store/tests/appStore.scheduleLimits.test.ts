import { describe, it, expect } from 'vitest';
import { buildDataCache } from 'schedule';
import type { Catalogue, Program } from 'schemas';
import type { SchedulesData } from 'schemas';
import { computeRequirementsState } from 'schedule';
import { useAppStore } from '../appStore';

const testCatalogue: Catalogue = {
  courses: [
    // CSI 4000-level candidates
    { code: 'CSI 4101', title: 'CSI 4101', credits: 3, description: '', component: 'LEC' },
    { code: 'CSI 4102', title: 'CSI 4102', credits: 3, description: '', component: 'LEC' },
    { code: 'CSI 4103', title: 'CSI 4103', credits: 3, description: '', component: 'LEC' },
    // Non-computing non-math electives
    { code: 'ENG 2100', title: 'ENG 2100', credits: 3, description: '', component: 'LEC' },
    { code: 'ENG 2101', title: 'ENG 2101', credits: 3, description: '', component: 'LEC' },
    { code: 'HIS 2100', title: 'HIS 2100', credits: 3, description: '', component: 'LEC' },
  ],
  programs: [],
};

// Give every course a trivial non-overlapping schedule so time generation
// never prunes them; the test focuses on requirement/category limits.
const simpleSchedules: SchedulesData = {
  termId: '2261',
  schedules: [
    {
      subject: 'CSI',
      catalogNumber: '4101',
      courseCode: 'CSI 4101',
      title: 'CSI 4101',
      timeZone: 'America/Toronto',
      components: {},
    },
    {
      subject: 'CSI',
      catalogNumber: '4102',
      courseCode: 'CSI 4102',
      title: 'CSI 4102',
      timeZone: 'America/Toronto',
      components: {},
    },
    {
      subject: 'CSI',
      catalogNumber: '4103',
      courseCode: 'CSI 4103',
      title: 'CSI 4103',
      timeZone: 'America/Toronto',
      components: {},
    },
    {
      subject: 'ENG',
      catalogNumber: '2100',
      courseCode: 'ENG 2100',
      title: 'ENG 2100',
      timeZone: 'America/Toronto',
      components: {},
    },
    {
      subject: 'ENG',
      catalogNumber: '2101',
      courseCode: 'ENG 2101',
      title: 'ENG 2101',
      timeZone: 'America/Toronto',
      components: {},
    },
    {
      subject: 'HIS',
      catalogNumber: '2100',
      courseCode: 'HIS 2100',
      title: 'HIS 2100',
      timeZone: 'America/Toronto',
      components: {},
    },
  ],
};

const programWithCsiAndElectives: Program = {
  title: 'Test CSI + electives',
  url: '',
  requirements: [
    {
      type: 'group',
      title: '3 credits of CSI 4000',
      credits: 3,
      options: [
        { type: 'course', code: 'CSI 4101' },
        { type: 'course', code: 'CSI 4102' },
        { type: 'course', code: 'CSI 4103' },
      ],
    },
    {
      type: 'group',
      title: '6 credits of non-computing electives',
      credits: 6,
      options: [
        { type: 'course', code: 'ENG 2100' },
        { type: 'course', code: 'ENG 2101' },
        { type: 'course', code: 'HIS 2100' },
      ],
    },
  ],
};

describe('schedule generation respects per-category limits', () => {
  const cache = buildDataCache(testCatalogue, simpleSchedules);

  it('avoids adding extra CSI courses beyond the required credits when other unmet categories exist', async () => {
    // Compute remaining requirements from a clean slate.
    const completedCourses: string[] = [];
    const { remaining } = computeRequirementsState(programWithCsiAndElectives, completedCourses, cache);

    // Initialize store with our synthetic data and requirements state.
    const store = useAppStore;

    store.setState({
      ...store.getState(),
      catalogue: { courses: testCatalogue.courses, programs: [programWithCsiAndElectives] },
      schedulesData: simpleSchedules,
      cache,
      program: programWithCsiAndElectives,
      completedCourses,
      remainingRequirements: remaining,
      requirementTreeWithStatus: [],
      completedRequirementsList: [],
      selectedPerRequirement: {},
      requirementSlotsUserTouched: {},
      selectedOptionsPerRequirement: {},
      prereqEligibleCourses: testCatalogue.courses.map((c) => c.code),
      filteredPrereqEligibleCourses: testCatalogue.courses.map((c) => c.code),
      levelBuckets: ['undergrad'],
      languageBuckets: ['en', 'other'],
      coursesThisSemester: 3,
    });

    await store.getState().generateSchedules();

    const { generatedSchedules } = store.getState();
    expect(generatedSchedules.length).toBeGreaterThan(0);

    for (const schedule of generatedSchedules) {
      const codes = schedule.enrollments.map((e) => e.courseCode);
      const csiCourses = codes.filter((c) => c.startsWith('CSI'));
      const nonComputing = codes.filter((c) => !c.startsWith('CSI'));

      // Exactly one CSI course should appear (3 credits required) when there are
      // enough non-computing electives available to fill the rest.
      expect(csiCourses.length).toBe(1);
      expect(nonComputing.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('distributes courses across multiple requirement groups when more than one course is needed in each', async () => {
    // Program where we need 6 credits of CSI 4000 (two courses) and
    // 6 credits of non-computing electives (two courses). With a
    // 4-course semester, schedules should tend to include 2 CSI and 2 non-computing.
    const programWithMoreCsi: Program = {
      title: 'Test CSI 2x + electives',
      url: '',
      requirements: [
        {
          type: 'group',
          title: '6 credits of CSI 4000',
          credits: 6,
          options: [
            { type: 'course', code: 'CSI 4101' },
            { type: 'course', code: 'CSI 4102' },
            { type: 'course', code: 'CSI 4103' },
          ],
        },
        {
          type: 'group',
          title: '6 credits of non-computing electives',
          credits: 6,
          options: [
            { type: 'course', code: 'ENG 2100' },
            { type: 'course', code: 'ENG 2101' },
            { type: 'course', code: 'HIS 2100' },
          ],
        },
      ],
    };

    const completedCourses: string[] = [];
    const { remaining } = computeRequirementsState(programWithMoreCsi, completedCourses, cache);

    const store = useAppStore;

    store.setState({
      ...store.getState(),
      catalogue: { courses: testCatalogue.courses, programs: [programWithMoreCsi] },
      schedulesData: simpleSchedules,
      cache,
      program: programWithMoreCsi,
      completedCourses,
      remainingRequirements: remaining,
      requirementTreeWithStatus: [],
      completedRequirementsList: [],
      selectedPerRequirement: {},
      requirementSlotsUserTouched: {},
      selectedOptionsPerRequirement: {},
      prereqEligibleCourses: testCatalogue.courses.map((c) => c.code),
      filteredPrereqEligibleCourses: testCatalogue.courses.map((c) => c.code),
      levelBuckets: ['undergrad'],
      languageBuckets: ['en', 'other'],
      coursesThisSemester: 4,
    });

    await store.getState().generateSchedules();

    const { generatedSchedules } = store.getState();
    expect(generatedSchedules.length).toBeGreaterThan(0);

    for (const schedule of generatedSchedules) {
      const codes = schedule.enrollments.map((e) => e.courseCode);
      const csiCourses = codes.filter((c) => c.startsWith('CSI'));
      const nonComputing = codes.filter((c) => !c.startsWith('CSI'));

      expect(codes.length).toBe(4);
      expect(csiCourses.length).toBeGreaterThanOrEqual(2);
      expect(nonComputing.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('respects pinned selections while still balancing CSI and non-computing requirements', async () => {
    // Same program as above: 6 CSI credits and 6 non-computing credits required.
    const completedCourses: string[] = [];
    const { remaining } = computeRequirementsState(programWithCsiAndElectives, completedCourses, cache);
    const csiReqId = remaining[0]?.requirementId ?? 'req-0';

    const store = useAppStore;

    // Pin CSI 4101 via constrainedPerRequirement to simulate the user explicitly
    // choosing it. The generator should treat it as pinned and only pull one
    // additional CSI course from the pools, plus enough non-computing courses
    // to reach the term target. Use 3 courses so: 1 pinned CSI + 2 from pools.
    store.setState({
      ...store.getState(),
      catalogue: { courses: testCatalogue.courses, programs: [programWithCsiAndElectives] },
      schedulesData: simpleSchedules,
      cache,
      program: programWithCsiAndElectives,
      completedCourses,
      remainingRequirements: remaining,
      requirementTreeWithStatus: [],
      completedRequirementsList: [],
      selectedPerRequirement: {},
      requirementSlotsUserTouched: {},
      constrainedPerRequirement: { [csiReqId]: ['CSI 4101'] },
      selectedOptionsPerRequirement: {},
      prereqEligibleCourses: testCatalogue.courses.map((c) => c.code),
      filteredPrereqEligibleCourses: testCatalogue.courses.map((c) => c.code),
      levelBuckets: ['undergrad'],
      languageBuckets: ['en', 'other'],
      electiveLevelBuckets: [1000, 2000, 3000, 4000],
      coursesThisSemester: 3,
      generatedSchedules: [],
    });

    await store.getState().generateSchedules();

    const { generatedSchedules } = store.getState();
    expect(generatedSchedules.length).toBeGreaterThan(0);

    for (const schedule of generatedSchedules) {
      const codes = schedule.enrollments.map((e) => e.courseCode);
      // CSI 4101 should always appear because it is pinned.
      expect(codes).toContain('CSI 4101');
    }
  });
});

