# State Encoding

URL sharing and localStorage persistence both use a compact binary format to encode the full app state. This avoids long query strings while keeping URLs self-contained.

## How it works

`src/lib/stateEncode.ts` serialises the relevant app state to a `Uint8Array`, base64-encodes it, and attaches it as the `?s=` query parameter. On load the same bytes are decoded back into app state.

LocalStorage (`uoplan-state`) stores the same base64 blob so the previous session is restored automatically.

### Binary format (VERSION 5)

| Field | Type | Notes |
|-------|------|-------|
| version | U8 | Must equal 5 |
| termId length | U8 | 0 = absent |
| termId | ASCII bytes | e.g. `"202509"` |
| firstYear | U16 | 0 = null/current |
| programIndex | U16 | Index into `indices.json` programs; `0xFFFF` = no program |
| completedCount | U16 | |
| completedCourses | U16 × count | Index into `indices.json` courses |
| levelBuckets | U8 count + U8 × count | 0=undergrad, 1=grad |
| languageBuckets | U8 count + U8 × count | 0=en, 1=fr, 2=other |
| electiveLevelBuckets | U8 count + U16 × count | e.g. 1000, 2000 |
| coursesThisSemester | U8 | |
| selectedScheduleIndex | U16 | |
| generationSeed | U32 | |
| includeClosedComponents | U8 | 0 or 1 |
| optionSelections | U16 count + (U16 reqIndex, U16 optionIndex) × count | |
| courseSelections | U16 count + (U16 reqIndex, U16 selCount, U16 × selCount) × count | |
| studentPrograms | U8 count + (U8 len, ASCII bytes) × count | Discipline codes |

All multi-byte integers are **little-endian**.

## Program slugs

Programs are identified by a **slug** rather than the full URL, so indices remain stable across years:

```
https://catalogue.uottawa.ca/en/undergrad/bsc-cs/              → undergrad/bsc-cs
https://catalogue.uottawa.ca/archive/2024-2025/en/undergrad/bsc-cs/ → undergrad/bsc-cs
```

The helper `urlToSlug(url)` in `stateEncode.ts` performs this conversion. Programmes scraped via `scripts/scraper.ts` have a `slug` field pre-computed; for old catalogue files without the field, the slug is derived on the fly.

`public/data/indices.json` stores slugs (not full URLs) in its `programs` array.

## Peeking term & year early

`peekTermAndYear(bytes)` reads only the header of the binary (version + termId + firstYear) without needing the catalogue or indices. `loadData` in `appStore.ts` calls this before fetching schedules and the year catalogue so the right data files are loaded upfront.

## How to change it

- **Add a new field**: bump `VERSION`, add to `EncodeInput` and `DecodedState`, encode/decode it in `encodeState`/`decodeState`, and update `getEncodedStateBase64` + `getShareUrl` in `appStore.ts`. If the field is needed before catalogue load, also update `peekTermAndYear`.
- **Change the program index format**: update `encodeState` (uses `programSlug()`), `decodeState` (uses slug lookup), and regenerate `indices.json` via `pnpm scrape:catalogue`.
- **Regenerate indices.json**: run `pnpm scrape:catalogue` — [`apps/scrapers/src/scraper.ts`](../apps/scrapers/src/scraper.ts) calls `generateIndices()` after the scrape. It **merges** with any existing `indices.json`: existing entries keep their order and indices; for each `catalogue.YYYY.json` present under `public/data` (academic years ascending), course codes and program slugs not already seen are **appended** in file order within each year (so encoded URLs and localStorage stay stable as catalogues grow). Years without a file are skipped.

## Dependencies

- `src/schemas/indices.ts` — Zod schema for `indices.json`
- `src/schemas/catalogue.ts` — `Program` type (optional `slug` field)
- `src/store/appStore.ts` — calls `encodeState`/`decodeState`, `peekTermAndYear`
- `src/hooks/usePersistState.ts` — debounce-saves encoded state to localStorage
