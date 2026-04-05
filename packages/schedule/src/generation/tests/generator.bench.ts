import { describe, bench } from 'vitest';
import { generateSchedules } from '../generator';
import { buildDataCache } from '../../dataCache';
import type { Catalogue, SchedulesData, CourseSchedule, Course } from 'schemas';

describe('scheduleGenerator benchmarks', () => {
    bench('dummy bench', async () => {
        const dummyCourses: Course[] = Array.from({ length: 10 }, (_, i) => ({
            code: `DUMM${1000 + i}`,
            title: 'Dummy Course',
            credits: 3,
            description: 'Dummy',
        }));

        const dummySchedules: CourseSchedule[] = Array.from({ length: 10 }, (_, i) => ({
            subject: 'DUMM',
            catalogNumber: `${1000 + i}`,
            courseCode: `DUMM${1000 + i}`,
            title: 'Dummy Course',
            timeZone: 'EST',
            components: {
                LEC: [
                    {
                        section: 'A',
                        status: 'Open',
                        sectionCode: 'A00',
                        component: 'LEC',
                        session: 'Regular',
                        times: [
                            { day: 'Mo', startMinutes: 600 + i * 10, endMinutes: 650 + i * 10, virtual: false }
                        ],
                        instructors: [],
                        meetingDates: []
                    }
                ]
            }
        }));

        const catalogue: Catalogue = {
            programs: [],
            courses: dummyCourses
        };

        const schedulesData: SchedulesData = {
            termId: 'Fall 2024',
            schedules: dummySchedules
        };

        const cache = buildDataCache(catalogue, schedulesData);
        
        await generateSchedules(dummyCourses.map(c => c.code), 5, cache);
    });

    bench('hang test: 20 optional courses, pick 5, many conflicts', async () => {
        // Create 20 courses that all share exactly the same time slot (so none can be combined)
        const dummyCourses: Course[] = Array.from({ length: 20 }, (_, i) => ({
            code: `CONF${1000 + i}`,
            title: 'Conflicting Course',
            credits: 3,
            description: 'Conflicts with everything',
        }));

        const dummySchedules: CourseSchedule[] = Array.from({ length: 20 }, (_, i) => ({
            subject: 'CONF',
            catalogNumber: `${1000 + i}`,
            courseCode: `CONF${1000 + i}`,
            title: 'Conflicting Course',
            timeZone: 'EST',
            components: {
                LEC: [
                    {
                        section: 'A',
                        status: 'Open',
                        sectionCode: 'A00',
                        component: 'LEC',
                        session: 'Regular',
                        times: [
                            { day: 'Mo', startMinutes: 600, endMinutes: 700, virtual: false } // All at the exact same time
                        ],
                        instructors: [],
                        meetingDates: []
                    }
                ]
            }
        }));

        const catalogue: Catalogue = {
            programs: [],
            courses: dummyCourses
        };

        const schedulesData: SchedulesData = {
            termId: 'Fall 2024',
            schedules: dummySchedules
        };

        const cache = buildDataCache(catalogue, schedulesData);
        
        // This used to hang because it would generate 15,504 combinations
        // and check each one. Now it should finish in less than a millisecond
        // because the moment it picks two courses, it realizes they conflict
        // and prunes the entire branch of remaining combinations.
        await generateSchedules(dummyCourses.map(c => c.code), 5, cache);
    });
});
