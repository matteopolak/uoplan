# Store Architecture

## What it is
The application uses Zustand for state management, combined with the slice pattern to break down a very large monolithic store into manageable pieces. The `appStore.ts` acts as the root orchestrator, merging all slices together.

## How it works
The store is defined by `AppState` and `AppActions` in `src/store/types.ts`.
It is divided into multiple slices under `src/store/slices/`:
- **`data.ts`**: Handles fetching, caching, and storing catalogues, schedules, indices, terms, and professor ratings. 
- **`selection.ts`**: Manages user selections such as the chosen program, completed courses, and selected options for requirements. Also handles filtering logic via recomputations.
- **`constraints.ts`**: Maintains user preferences for schedule generation (allowed days, start/end times, limit first year credits, minimum professor ratings, closed components, etc.).
- **`schedules.ts`**: Manages the generated schedules list, the selected schedule index, schedule pool mapping, and swap history.
- **`url.ts`**: Handles encoding and decoding the application state to and from base64 URLs or localStorage.

`appStore.ts` merges these slices together and provides common reset actions across all slices. Pure business logic is intentionally kept outside of slices (e.g. `src/store/requirementCompute.ts` or `src/lib/generateSchedulesAction.ts`) and is only called by the slices.

## How to change it
1. Update `AppState` or `AppActions` in `src/store/types.ts` to add the new state/action definitions.
2. Find the relevant slice in `src/store/slices/` (e.g. `selection.ts` if it relates to a user's chosen courses) and add the state defaults and action implementation there.
3. Update `src/store/appStore.ts` with the default state values.
4. If the new state needs to be serialized to the URL or localStorage, update the encoding logic in `src/lib/stateEncode.ts`, `src/store/slices/url.ts`, and `src/store/appStore.ts` `loadEncodedState()`.

## Configuration
The only constant is `LOCAL_STORAGE_KEY` which defines where the app persists its state in the browser.

## Dependencies
- `zustand` — the state management library.
- Various domain logic files in `src/lib/` such as `scheduleGenerator.ts`, `dataCache.ts`, and `stateEncode.ts`.
