# Multi-school support

uoplan started as a University-of-Ottawa-only planner. It now serves **uOttawa**
and **Carleton University** from the same deployment, and is built so a third
school is mostly a matter of filling in a registry entry and writing scrapers.

This document covers the school registry, the four seams a school flows through
(URL, data assets, state encoding, scrapers), how features are gated, and how
data reaches production.

---

## 1. The school registry

`packages/domain/src/school.ts` is the **single source of truth**. Everything
school-dependent reads from it; nothing else hardcodes an institution.

```ts
export type SchoolId = "uottawa" | "carleton";

SCHOOLS[school] = {
  id, pathSlug, assetNamespace, displayName, …
  credits,            // SchoolCreditConfig — course/full-year credit magnitudes
  features,           // SchoolFeatures — capability flags
  courseCatalogueUrl(courseCode),
  programCatalogueUrl(programKey),
};
```

A guardrail enforces this. `pnpm check:arch` runs `checkSchoolPurity()`, which
scans the shared packages (`domain`, `data`, `state-codec`, `navigation`, `app`,
`ui`) for the literals `uottawa.ca`, `carleton.ca` and institution names, and
**fails the build** if it finds them anywhere except `packages/domain/src/school.ts`
and `apps/scraper/src/schools/`. If you are tempted to write an institution name
into shared code, add a registry field instead.

### Feature flags

`SchoolFeatures` states _why_ a surface is hidden, rather than testing the school
id at the call site. Adding a third school then means filling in a table, not
hunting for `=== "uottawa"` checks.

| Flag                     | uOttawa | Carleton | Gates                                                                                                                      |
| ------------------------ | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `grades`                 | ✅      | ❌       | Grade averages, the Trends section, the explore spotlight gallery, the `prefer_easier` ranking goal, the Difficulty filter |
| `feedback`               | ✅      | ❌       | uoZone course-evaluation surfaces, the `prefer_sentiment` goal, the Feedback filter                                        |
| `frenchImmersion`        | ✅      | ❌       | The French Immersion stream and FLS companion rules                                                                        |
| `bilingualCatalogue`     | ✅      | ❌       | The Language filter (Carleton's calendar is English-only)                                                                  |
| `importantDatesFr`       | ✅      | ❌       | The French important-dates asset                                                                                           |
| `transcriptImport`       | ✅      | ❌       | Transcript PDF import (parser is tied to one registrar's layout)                                                           |
| `uEnrollImport`          | ✅      | ❌       | uEnroll share-link import                                                                                                  |
| `officialScheduleImport` | ✅      | ❌       | Official saved registrar schedule-page import                                                                              |
| `enrolCli`               | ✅      | ❌       | The `@uoplan/cli` PeopleSoft enrolment helper                                                                              |

Read them with `useSchoolFeature("grades")` in React, or
`getSchool(id).features.grades` elsewhere.

Carleton has **no registrar grade data** — Carleton does not publish grade
distributions — so `grades` is off and professor pages show RateMyProfessors
ratings only.

---

## 2. URLs

uOttawa is served **unprefixed**; every other school gets a path prefix:

| School   | `pathSlug`   | Home         | Explore             |
| -------- | ------------ | ------------ | ------------------- |
| uOttawa  | `""`         | `/`          | `/explore`          |
| Carleton | `"carleton"` | `/carleton/` | `/carleton/explore` |

This is deliberate: **every uOttawa URL that existed before Carleton still
resolves, byte-identically.** Share links already in the wild keep working.

Routing is TanStack Router's `basepath`, set from the active school at router
construction. For uOttawa `pathSlug` is `""`, so `basepath` is `undefined` and
the router behaves exactly as it did before.

> **Gotcha.** `router.basepath` is public, but `router.history.push/replace` is
> raw browser history and does **not** prepend it (unlike `router.navigate`).
> `WebNavigationProvider` therefore applies `withBasepath()` itself.

### Resolving the active school

`apps/web/src/lib/activeSchool.ts` resolves the school **once per page load** and
freezes it. The data client, the store, the router basepath and the WASM engine's
warmed catalogue are all bound to one school at construction, so switching does a
**full page navigation** (`switchSchool()`), not a re-render.

Precedence — implemented as the pure, tested `resolveActiveSchool(pathname, remembered)`:

1. **An explicit path prefix wins.** `/carleton/schedule?s=…` opens as Carleton
   even if the visitor last used uOttawa.
2. **Only the bare root (`/`) consults the remembered choice.** `schoolFromPathname`
   returns uOttawa for _every_ unprefixed path, so the prefix alone cannot tell
   "the user asked for uOttawa" apart from "the user didn't say". Path depth can.
3. Otherwise, uOttawa.

Rule 2 matters more than it looks. uOttawa is the unprefixed school, so **every
link predating Carleton — including every `/schedule?s=…` share link already in
circulation — is an unprefixed deep link.** If the remembered choice could
override those, a single visit to Carleton would permanently hijack them all.

`getActiveSchool()` is **self-initializing**:

```ts
export function getActiveSchool(): SchoolId {
  return activeSchool ?? initializeActiveSchool();
}
```

ES module initialisation is hoisted, so a module-scope consumer (`dataClient.ts`
builds its asset namespace at module scope) can evaluate _before_ `main.tsx`
reaches `initializeActiveSchool()`. Returning a silent uOttawa default there
bound the entire data client to the wrong school on `/carleton/*` pages — a bug
whose only visible symptom was one large fetch going to the wrong namespace.
Diagnose that class of bug by checking response **body sizes**, not request URLs:
Vite's eager `?url` glob requests every asset path, so the URLs all look right.

---

## 3. Data assets

Each school's runtime `.pb` assets live in their own namespace:

```
apps/web/src/assets/data/uottawa/*.pb     →  /data/uottawa/…
apps/web/src/assets/data/carleton/*.pb    →  /data/carleton/…
```

`withAssetNamespace(transport, namespace)` wraps the data transport so asset ids
resolve into the active school's directory. uOttawa's `.pb` bytes are unchanged
from before the split.

Assets a school doesn't publish are simply **absent** — Carleton ships no
`grades.pb`, `feedback.pb`, or `important-dates.fr.pb`. Loaders treat those as
optional; the corresponding feature flag is what the UI actually gates on.

---

## 4. State encoding (`?s=` share links)

`state.proto` gained a `school` field. The compatibility trick:

- uOttawa's wire id is **`0`**, and proto3 omits zero-valued scalars.
- So encoding `school: "uottawa"` produces bytes **identical** to omitting the
  field entirely.
- `STATE_MAGIC` was therefore deliberately **not** bumped, and every pre-existing
  uOttawa `?s=` link decodes exactly as before.

Similarly, `stateStorageKey("uottawa")` returns the original unsuffixed
`"uoplan-state"`, so returning users keep their saved state.

The Worker's share route (`apps/worker/src/share.ts`) peeks at the school in the
blob via `peekSchoolFromBase64` and redirects to the correctly-prefixed path.

`switchSchool()` intentionally **drops `?s=`** — a state blob is indexed against
one school's `indices.pb` and would decode to nonsense under another.

---

## 5. Term ids

The two schools use different registrar formats, distinguishable by length, so
one decoder (`decodeTermMeta`) serves both and callers need no school context:

| School   | System     | Format                             | Example                |
| -------- | ---------- | ---------------------------------- | ---------------------- |
| uOttawa  | PeopleSoft | `2` + `YY` + session digit (1/5/9) | `2179` → Fall 2017     |
| Carleton | Banner     | `YYYY` + term code (10/20/30)      | `202710` → Winter 2027 |

Banner codes map onto the same `TermSeason` values and synthesize the equivalent
session digit, so labels, sorting (`sortKey`) and analytics work unchanged.

---

## 6. Scrapers

Per-school scrapers live in `apps/scraper/src/schools/{uottawa,carleton}/`. Every
CLI takes `--school`:

```bash
pnpm --filter scraper scrape:catalogue       -- --school=carleton
pnpm --filter scraper scrape:schedules       -- --school=carleton
pnpm --filter scraper scrape:disciplines     -- --school=carleton
pnpm --filter scraper scrape:important-dates -- --school=carleton
pnpm --filter scraper scrape:ratemyprofessors -- --school=carleton
pnpm --filter scraper build:professors       -- --school=carleton
pnpm --filter scraper check:terms            -- --school=carleton
```

Source JSON is namespaced to match: `apps/scraper/data/{school}/`.

### Carleton sources

| Data              | Source                                                                        |
| ----------------- | ----------------------------------------------------------------------------- |
| Courses, programs | CourseLeaf calendar — `calendar.carleton.ca`                                  |
| Schedules, terms  | Banner — `central.carleton.ca/prod/bwysched.p_*`                              |
| Professor ratings | RateMyProfessors school **1420** (GraphQL node `U2Nob29sLTE0MjA=`, POST-only) |
| Professors        | Derived from Banner instructor entries, matched to RMP by name                |

### Parallelism

Both Carleton scrapers are heavily parallelized; the serial versions took ~40
minutes, the current ones ~2.

- **Banner** binds a search to the client's cookie jar, so each worker needs its
  **own session** (`parseTerms(await client.fetchSelectTerm()).sessionId`). A
  pool of 12 was verified to produce zero per-subject mismatches across repeated
  trials. Banner does intermittently return an empty result set under load, and
  empty is _also_ a legitimate answer, hence retry-once-then-believe.
- **CourseLeaf** is static and CDN-backed with no session state, so a **single
  client with a semaphore** suffices. (The original implementation chained every
  request through one queue, so a worker pool alone would have parallelized
  nothing.)

Both use positional/keyed result buckets so JSON output stays deterministic
regardless of completion order.

### Carleton parsing notes

Subject codes live in link **text**, not hrefs: `Computer Science ( COMP )`, and
some pages group several codes — `Architecture ( ARCS, ARCC, ARCN, ARCH, ARCU )`.
Only 6 of 114 entries are hyperlinked, so the index is parsed from the
parenthesised text in `#textcontainer`. `/undergrad/courses/{CODE}/` works for
essentially every code (uppercase required); the grouped Architecture codes 404
individually but arrive via the shared ARCH page.

---

## 7. Data pipeline and CI

Scraped JSON is too large for `main`, so it lives on the dedicated **`data`
branch**, namespaced per school:

```
data branch:  apps/scraper/data/{uottawa,carleton}/…
```

### Scheduled scrapes

| Workflow                    | Schedule  | Scope                                          |
| --------------------------- | --------- | ---------------------------------------------- |
| `daily-scrape.yml`          | 05:00 UTC | uOttawa. Fans out one runner per term (hours). |
| `daily-scrape-carleton.yml` | 05:30 UTC | Carleton. A single job (~2 min).               |

Both share the `data-branch-scrape` **concurrency group** with
`cancel-in-progress: false`, so they queue instead of racing to push to `data`.
Carleton doesn't need the per-term fan-out — runner startup would cost more than
it saves.

Archived Carleton calendar years are immutable, so the scraper skips any year
whose JSON already exists and only re-scrapes the live year. A manual dispatch
with `force` re-walks every year.

`check-new-terms.yml` remains uOttawa-only on purpose: it exists because the
uOttawa scrape takes hours and is expensive to run speculatively. Carleton's
daily job syncs terms itself in about two minutes.

### Guard: `scripts/check-scraped-data.ts`

Both workflows run this before pushing. A scraper that silently returns nothing —
an upstream layout change, an expired session, a rate-limit page rendered as
HTML — otherwise looks like a _successful_ run and cheerfully overwrites good
data with an empty file. The script asserts the shape and rough magnitude of each
dataset (course/program counts, term coverage, scheduled-course counts, and that
every feature-flagged asset a school claims is actually present). Thresholds are
deliberately loose: it catches "the scrape broke", not normal term-to-term drift.

### Build

`pnpm generate` → `build:data-proto` →

1. `scripts/fetch-data.ts` shallow-clones the `data` branch and hydrates
   **every** school namespace it finds. It also accepts the legacy flat layout
   (no school directory) and maps it onto the default school, so the branch
   migration didn't have to be atomic with the code deploy.
   Env: `FORCE_DATA_FETCH=1`, `DATA_BRANCH`, `DATA_FETCH_REMOTE`, `DATA_SCHOOLS`.
2. `scripts/build-data-proto.ts` runs the (single-school) proto build once per
   school that has data on disk. Schools without local data are skipped rather
   than failing, so a contributor who only hydrated uOttawa still gets a working
   build.

### SEO output

Both are school-aware and gate on feature flags:

- `generate-sitemap.ts` emits per-school URLs — uOttawa unprefixed, Carleton
  under `/carleton/…`.
- `prerender-seo-html.ts` writes prerendered HTML per school with correctly
  prefixed canonical URLs, and **skips** pages a school can't populate (all
  `trends` surfaces and `/vs/uo-grades` are built entirely from grade
  distributions, so Carleton gets none of them).

Cloudflare needs no per-school configuration: `not_found_handling:
"single-page-application"` already falls `/carleton/*` back to the SPA, and the
Worker-first routes (`/api/share/*`, `/api/og-image/*`) are school-neutral paths
that read the school out of the state blob.

---

## 8. Adding a third school

1. Add an entry to `SCHOOLS` in `packages/domain/src/school.ts` — id, `pathSlug`,
   `assetNamespace`, display names, credit config, feature flags, link builders.
   Assign it the next `SCHOOL_WIRE_IDS` value (**never** renumber existing ones;
   that would break existing share links).
2. Write scrapers under `apps/scraper/src/schools/<school>/` and dispatch to them
   from the shared CLIs.
3. Add a scheduled workflow modelled on `daily-scrape-carleton.yml`, in the
   `data-branch-scrape` concurrency group.
4. Everything else — routing, asset namespacing, the sitemap, prerendering, the
   proto build, feature gating — picks the school up from `SCHOOL_IDS`
   automatically.

---

## Related docs

- [state-encoding.md](./state-encoding.md) — the `school` field and wire compatibility
- [multi-year-catalogue.md](./multi-year-catalogue.md) — per-year catalogue scraping
- [schedule-generation.md](./schedule-generation.md) — school-aware credit config in the engine
- [modularization.md](./modularization.md) — package layering, including `checkSchoolPurity`
- [deployment.md](./deployment.md) — Cloudflare Workers Builds
