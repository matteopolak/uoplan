# Requirements Steps: Assign and Constrain

Two wizard steps handle requirements in uoplan — **Assign** (step 4) and **Constrain** (step 5). They were previously merged into a single "Requirements" step.

## What they do

**Assign** — maps each completed course to the requirement it satisfies. Only courses in `completedCourses` appear in the dropdowns. The "Next" button is disabled until every completed course has been assigned to a requirement (`unassignedCompletedCourses.length === 0`).

**Constrain** — optionally restricts which courses the schedule generator picks for each remaining requirement. Any eligible course (not just completed ones) can be selected. This step is optional; leaving all requirements empty lets the generator pick freely.

## State

| Field | Slice | Purpose |
|-------|-------|---------|
| `selectedPerRequirement` | `selection.ts` | Completed course assignments. Consumed by `requirementCompute.ts` to determine which requirements are satisfied. |
| `constrainedPerRequirement` | `selection.ts` | User course constraints for schedule generation. Consumed by `generateSchedulesAction.ts`. |

Both are reset to `{}` when `setProgram` is called.

## Constraint semantics

For each requirement in `constrainedPerRequirement`:

- **Empty (no entry or `[]`)** — generator picks any eligible course for the pool.
- **≤ courses needed** — every constrained course is pinned (always appears in schedules); remaining slots filled from the full eligible pool.
- **> courses needed** — the pool is restricted to only the constrained courses; no other courses are considered.

"Courses needed" = `ceil(creditsNeeded / 3)`.

## How the Assign step works

`AssignStep` renders `RequirementNode` with `completedOnly={true}`. This filters `candidateCourses` to only include entries whose code is in `completedCourses` or `unassignedCompletedSet`. The assignment writes to `selectedPerRequirement` via `setSelectedForRequirement`.

The "unassigned" banner (`Alert`) is driven by `unassignedCompletedCourses` — a computed value in the store (`requirementCompute.ts`) listing completed courses not yet assigned to any requirement.

## How the Constrain step works

`ConstrainStep` renders `RequirementNode` normally (not `completedOnly`), but passes `constrainedPerRequirement` as the `selectedPerRequirement` prop and `setConstrainedForRequirement` as the `onSelect` callback. The node renders identically; it just writes to a different state field.

Course filters (level, language, elective level buckets, closed sections) are shown here because they affect the candidate pool for each node's dropdown.

## How to change constraint logic

The per-requirement constraint logic lives in `apps/web/src/lib/generateSchedulesAction.ts`. Search for `constrainedPerRequirement` to find the relevant section.

The key loop:

```typescript
for (const [reqId, constrainedCodes] of Object.entries(constrainedPerRequirement)) {
  const req = remainingRequirements.find((r) => r.requirementId === reqId);
  const coursesNeeded = Math.ceil((req?.creditsNeeded ?? 3) / 3);
  const constrainedSchedulable = constrainedCodes.filter(/* schedulable + not completed + prereq eligible */);

  if (constrainedSchedulable.length > 0 && constrainedSchedulable.length <= coursesNeeded) {
    // Pin all provided courses
    globalPinned.push(...constrainedSchedulable);
  }
}
```

For the over-constrained case (more courses than needed), the pool narrowing happens in the `allPools.map()` block — if `constrainedSchedulable.length > coursesNeeded`, `pool.candidateCourses` is replaced with only the constrained courses.

## URL encoding

Both `selectedPerRequirement` and `constrainedPerRequirement` are encoded in the share URL. The binary format is described in `docs/state-encoding.md`. The constrained selections were added in VERSION 7.
