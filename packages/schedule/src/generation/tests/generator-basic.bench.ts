import { describe, bench } from 'vitest';
import { generateSchedulesWithPinned } from '../generator';
import { buildDataCache } from '../../dataCache';
import type { DataCache } from '../../dataCache';
import { buildPrereqContext, canTakeCourse } from '../../prerequisites';
import type { Catalogue, SchedulesData, DayOfWeek } from 'schemas';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const rootDir = resolve(__dirname, '../../../../../');
const dataDir = join(rootDir, 'apps/web/public/data');
const catalogueStr = readFileSync(join(dataDir, 'catalogue.2025.json'), 'utf-8');
const schedulesStr = readFileSync(join(dataDir, 'schedules.2261.json'), 'utf-8');

const catalogue = JSON.parse(catalogueStr) as Catalogue;
const schedulesData = JSON.parse(schedulesStr) as SchedulesData;

const cache: DataCache = buildDataCache(catalogue, schedulesData);

const completedCourses = ['ITI 1120'];
const prereqCtx = buildPrereqContext(completedCourses, cache, []);

let optionalPool: string[] = [];

for (const course of cache.getAllCourses()) {
    const code = course.code;
    if (!code.match(/^[A-Z]{3,4} ?1\d{3}$/i)) continue;
    if (completedCourses.includes(code)) continue;
    if (code === 'ADM 1100') continue;
    if (course.prerequisites) {
        if (!canTakeCourse(code, cache, prereqCtx)) continue;
    } else if (course.prereqText) {
        continue;
    }
    const sched = cache.getSchedule(code);
    if (!sched) continue;
    optionalPool.push(code);
}

optionalPool = optionalPool.sort();
console.log('Setup complete, pool size:', optionalPool.length);

describe('basic mode generator benchmarks with real data', () => {
    bench('basic mode: ADM 1100 pinned + 4 electives (target=5) w/ compressed constraints', () => {
        const constraints = {
            minStartMinutes: 480,
            maxEndMinutes: 1320,
            allowedDays: ['Mo', 'Tu', 'We', 'Th', 'Fr'] as DayOfWeek[],
            compressedSchedule: true,
            maxFirstYearCredits: 12 // restrict it to prune paths early
        };
        
        generateSchedulesWithPinned(
            ['ADM 1100'],
            optionalPool,
            5,
            cache,
            constraints
        );
    });
});
