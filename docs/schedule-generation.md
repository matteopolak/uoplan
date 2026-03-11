## Schedule generation and requirement integration

This document summarizes how schedule generation works and how it now respects per-category (per-requirement) credit limits.

---

### High-level pipeline

- **Data cache**
  - `buildDataCache` (in `src/lib/dataCache.ts`) loads:
    - `catalogue.json` (courses + program requirements).
    - `schedules.json` (per-course offerings).
  - Provides helpers like `getCourse`, `getSchedule`, `getAllCourses`.

- **Requirements evaluation**
  - `computeRequirementsState` (in `src/lib/requirements.ts`) walks the program requirement DSL for a given set of `completedCourses`.
  - It returns:
    - `remainingRequirements: RemainingRequirement[]` – open requirement “slots” with:
      - `requirementId`
      - `candidateCourses`
      - `creditsNeeded`
      - `pickedCount` (for some groups)
      - `satisfiedBy` (completed courses already allocated).
    - `requirementTreeWithStatus: RequirementWithStatus[]` – the full requirement tree annotated with completion status.
  - For completed courses, each requirement node (`group`, `pick`, elective types, etc.) stops allocating from the pool once its `creditsNeeded` has been met.

- **User selections per requirement**
  - `RequirementsStep` (in `src/components/RequirementsStep.tsx`) renders the requirement tree and:
    - Shows a `MultiSelect` for nodes that expose a `requirementId` and `candidateCourses`.
    - Stores selections in `selectedPerRequirement[requirementId]`.
    - Displays guidance such as:
      - How many credits are still needed for that requirement.
      - A warning when the user selects more credits than the requirement needs.

- **Schedule generation orchestration**
  - `generateSchedules` in `src/store/appStore.ts` orchestrates:
    - **Pinned courses**:
      - Flatten `selectedPerRequirement` and dedupe.
      - Filter to courses that have schedules and are not honours-project components.
      - If the number of selected schedulable courses is **at most** the term target, these are forced into every schedule and count toward `coursesThisSemester`.
      - If the number of selected schedulable courses **exceeds** the term target, selections are treated as the **initial candidate pool** (not all are forced into every schedule); schedules are generated from subsets of the selected courses, and only if none exist do we expand the pool with additional remaining-requirement candidates.
    - **Requirement pools**:
      - Convert each `RemainingRequirement` into a simple internal `RequirementPool`:
        - `requirementId`
        - `type`
        - `label`
        - `candidateCourses` (deduped)
        - `creditsNeeded` (remaining credits for that requirement)
        - `minCourses` (e.g., 1 for plain `course` slots).
      - Adjust each pool’s `creditsNeeded` to account for pinned courses that already satisfy that requirement.
      - Decide how many courses to pull from each pool for this term using the pool’s `creditsNeeded`, the average credits of its candidates, and the remaining course slots for the semester.
    - **Per-pool candidate arrays and sampling**:
      - For each active pool, build a candidate array by filtering `candidateCourses` by:
        - Having a schedule (`cache.getSchedule`),
        - Passing prerequisite checks,
        - Matching current filters (level, language).
      - Randomly shuffle each pool’s candidate list.
      - For each pool, randomly pick up to its allocated number of courses, skipping duplicates and pinned codes. This directly implements the “each requirement has an array of options, pick from each” model.
    - **Global elective top-up**:
      - If per-pool sampling produces fewer courses than the term target, build a global elective pool from catalogue courses that:
        - Have schedules,
        - Are prereq-eligible and pass filters,
        - Are not pinned, already chosen, or honours/research,
        - And, optionally, still help reduce remaining credits when added.
      - Randomly select additional electives from this pool until the target course count is reached or no more suitable courses exist.
    - **Time-based schedule generation**:
      - Calls `generateSchedules`/`generateSchedulesWithPinned` in `src/lib/scheduleGenerator.ts`.
      - These functions know only about:
        - Course codes.
        - Section times.
        - `targetCount` (number of courses per schedule).

---

### Respecting per-category credit limits

Schedule generation itself remains purely time-based; per-category limits are enforced when building the pinned and optional pools.

#### 1. `helpsRequirements` includes pinned selections

- **Location**: `generateSchedules` in `src/store/appStore.ts`.
- **Behavior**:
  - Previously, `helpsRequirements(code)` evaluated a course only against `completedCourses`.
  - It now uses a baseline that includes **both** completed and pinned courses:
    - `baseForRequirementEval = [...completedCourses, ...pinned]`.
    - `before` = `computeRequirementsState(program, baseForRequirementEval, cache).remaining`.
    - `after` = `computeRequirementsState(program, [...baseForRequirementEval, code], cache).remaining`.
    - A course is considered helpful only if the sum of all `creditsNeeded` across remaining requirements decreases.
- **Effect**:
  - Once a requirement is fully covered by pinned courses, additional candidates from that requirement usually no longer reduce the global remaining credits.
  - Those extra candidates are therefore excluded from the optional pool, preventing them from being added just because they would have been helpful in isolation.

#### 2. Capping optional candidates per requirement

- **Location**: optional-pool construction in `generateSchedules` (`src/store/appStore.ts`).
- **Behavior**:
  - Before iterating `remainingRequirements`, the store precomputes:
    - For each `RemainingRequirement` with a `requirementId`, `creditsNeeded`, and `candidateCourses`:
      - `pinnedCreditsForReq` = sum of credits of pinned courses that are also in `candidateCourses`.
      - `remainingCreditsForReq` = `max(0, creditsNeeded - pinnedCreditsForReq)`.
    - These are stored in `remainingCreditsByRequirementId`.
  - While populating `optionalPool` from each requirement’s `candidateCourses`:
    - If `remainingCreditsByRequirementId[requirementId] <= 0`, candidates from that requirement are skipped.
    - When a course is accepted into `optionalPool`, its credits are subtracted from the corresponding entry in `remainingCreditsByRequirementId`.
- **Effect**:
  - Each requirement contributes at most enough optional candidates (by credit total) to satisfy its remaining need **after** pinned courses have been considered.
  - Requirements that are already effectively covered by pinned courses stop feeding candidates into the optional pool.

Together with the updated `helpsRequirements`, this ensures that:

- A requirement such as “3 credits of CSI 4000-level” does not keep adding multiple CSI courses to the optional pool once either:
  - A pinned CSI course already covers it, or
  - Enough optional CSI candidates have been earmarked to satisfy its remaining credits.
- Other unmet requirements (e.g., “6 credits of non-computing non-math electives”) are prioritized when building the pool of additional courses.

---

### What the generator guarantees (and what it does not)

- **Guaranteed**:
  - Each schedule contains exactly `coursesThisSemester` non-honours-project courses.
  - No time conflicts between chosen sections.
  - Pinned courses appear in every generated schedule.
  - Optional courses that enter schedules come from a pool that:
    - Considers per-requirement remaining credits.
    - Treats already-pinned coverage as satisfying parts of requirements.

- **Not guaranteed**:
  - A single course is not strictly “bound” to a specific requirement when it can satisfy multiple; the requirements engine resolves that mapping when courses are later treated as completed.
  - If there are not enough eligible courses to fill all unmet requirement categories, the generator may still include “extra” courses from already-satisfied categories to reach `coursesThisSemester`.
  - User over-selection in `RequirementsStep` (pinning more courses than needed for a requirement) is respected as intent; the generator will keep those pinned courses, even if that leads to more category coverage than strictly required.

---

### UI guidance for over-selection

- **Location**: `RequirementsStep` in `src/components/RequirementsStep.tsx`.
- **Behavior**:
  - For requirement nodes with `creditsNeeded > 0`, the UI computes:
    - `selectedCredits` for the currently selected candidate courses.
  - If `selectedCredits` exceeds `creditsNeeded`, the helper text:
    - Switches to a warning message.
    - Uses a more prominent color to indicate that extra courses may not count toward that requirement.
- **Effect**:
  - Users still have the flexibility to deliberately over-select (and thus pin) courses.
  - The UI communicates that such over-selection goes beyond what the requirement strictly needs, aligning user expectations with the generator’s behavior.

