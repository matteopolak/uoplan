## Multi-year catalogue scraping

Student program requirements are based on the academic year they first enrolled, not the current year. This document describes how catalogue data is scraped and loaded per year.

### How it works

**Scraper (`scripts/scraper.ts`)** produces one JSON file per academic year:

- `public/data/catalogue.{year}.json` — full catalogue (courses + programs) for that year, where `year` is the first calendar year of the academic year range (e.g. `2021` = 2021–2022)
- `public/data/catalogue.json` — manifest listing all available years: `{ "years": [2024, 2023, ..., 2017] }`

The current academic year is detected dynamically via `getCurrentAcademicYear()` (September = new academic year). Archive years are only scraped if their file does not yet exist; the current year is always re-scraped.

**Archive URLs** follow the pattern `https://catalogue.uottawa.ca/archive/{year}-{year+1}/en/...`. The current year uses the root `https://catalogue.uottawa.ca/en/...`. The HTML structure is identical across years.

**App store (`src/store/appStore.ts`)** on startup:
1. Fetches `catalogue.json` to get `availableYears`
2. Fetches `catalogue.{latestYear}.json` as the main catalogue (used for course lookups and schedule generation)
3. Stores `availableYears` in state

When the user selects their first year via `setFirstYear(year)`, the store fetches `catalogue.{year}.json` and stores its `programs` as `yearCataloguePrograms`. The program selection is cleared since requirements differ between years.

**`ProgramStep` (`src/components/ProgramStep.tsx`)** shows a "First year of study" select built from `availableYears`. The program dropdown uses `yearCataloguePrograms ?? programmes` (falls back to current year if no year selected).

### How to change it

- **Add an older year**: lower `OLDEST_YEAR` in `scripts/scraper.ts`. Run `pnpm scrape` — the new year file will be created and the manifest updated.
- **Current year detection**: `getCurrentAcademicYear()` uses `new Date()`. No changes needed year-over-year.
- **Oldest supported year**: the `OLDEST_YEAR = 2017` constant in `scripts/scraper.ts`.

### Configuration

| Constant | File | Purpose |
|----------|------|---------|
| `OLDEST_YEAR` | `scripts/scraper.ts` | Earliest year to scrape |
| `getCurrentAcademicYear()` | `scripts/scraper.ts` | Detects current academic year from system date |

### Dependencies

- `cheerio` — HTML parsing
- `p-limit` — concurrency control (10 parallel fetches)
- `zod` — schema validation for scraped output
- `src/store/appStore.ts` — loads and caches year-specific programme lists
