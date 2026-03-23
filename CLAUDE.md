# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start Vite dev server
pnpm build            # Production build
pnpm test             # Run tests once (vitest)
pnpm test:watch       # Watch mode
pnpm scrape:catalogue # Scrape course/program data
pnpm scrape:schedules # Scrape schedule data
```

Always use `pnpm`, never `npm`.

## Architecture

**uoplan** is a course planner for University of Ottawa students. It's a single-page React app with a 5-step wizard (term → program → completed courses → requirements → schedule preferences), followed by a calendar view showing generated conflict-free timetables.

### Tech Stack

React 19 + TypeScript, Zustand (state), Mantine (UI), FullCalendar, Vite + Vitest, Zod (schemas), Framer Motion, pdfjs-dist (transcript parsing).

### Data Flow

```
JSON data files (catalogue, schedules, terms)
  → Zod schemas (src/schemas/)
  → DataCache (src/lib/dataCache.ts) — normalized in-memory index
  → Zustand store (src/store/appStore.ts) — all app state + computed state
  → React components (src/components/)
```

### Key Directories

- **`src/store/`** — Zustand store (`appStore.ts` is ~1700 lines and is the core of the app). Also contains `requirementCompute.ts` (requirement tree logic) and `scheduleHelpers.ts` (course pool building).
- **`src/lib/`** — Pure business logic: schedule generation (backtracking algorithm), requirement parsing, course/schedule filtering, transcript PDF parsing, iCal export, URL state encoding.
- **`src/schemas/`** — Zod type definitions for all data shapes: `catalogue.ts` (Course/Program), `schedules.ts` (enrollment sections), `terms.ts`, `indices.ts`.
- **`src/components/`** — One component per wizard step, plus `CalendarPage.tsx` (shown after generation), `CalendarView.tsx` (FullCalendar wrapper), `CourseBlock.tsx`, `ScheduleCard.tsx`, `RequirementNode.tsx` (recursive requirement tree).

### Zustand Store Shape

The store (`appStore.ts`) holds:
- **Data loading**: `catalogue`, `indices`, `schedulesData`, `cache` (DataCache), `loading`/`error`
- **User selections**: `selectedTermId`, `program`, `completedCourses`, `selectedPerRequirement`, `coursesThisSemester`
- **Schedule constraints**: `generationMinStartMinutes`, `generationMaxEndMinutes`, `generationAllowedDays`, `generationMinProfessorRating`, `generationLimitFirstYearCredits`, `generationCompressedSchedule`, `includeClosedComponents`
- **Generated results**: `generatedSchedules`, `selectedScheduleIndex`, `swapHistory`, `schedulePoolMaps`
- **Computed state** (derived): `remainingRequirements`, `requirementTreeWithStatus`, `levelBuckets`, `languageBuckets`

Key actions: `loadData()`, `setProgram()`, `setCompletedCourses()`, `setSelectedForRequirement()`, `generateSchedules()`, `swapCourseInSchedule()`, `getShareUrl()`.

### Schedule Generation

`src/lib/scheduleGenerator.ts` uses a backtracking algorithm to find conflict-free schedules given selected courses and constraints. `scheduleHelpers.ts` builds course pools used for post-generation swapping.

### URL Sharing

`src/lib/stateEncode.ts` encodes the full app state to base64 for shareable URLs. `appStore.ts` calls `getShareUrl()` / `loadEncodedState()`.
