/**
 * The school (university) registry.
 *
 * uoplan started as a University of Ottawa planner, so for a long time every
 * layer silently assumed one institution: one catalogue, one set of `.pb`
 * assets, one course-code shape, one credit system. Supporting a second school
 * (Carleton) means that assumption has to become an explicit, typed dimension
 * that the scrapers, the data client, the store, the router, and the worker all
 * agree on.
 *
 * This module is the single source of truth for it. It lives in `@uoplan/domain`
 * — the bottom of the package graph — so every other package can depend on it
 * without inverting the layering.
 *
 * Nothing here is allowed to import from a higher layer, and nothing here may
 * hold user-facing prose that needs translation beyond the school's own proper
 * names (which are not translated — "Carleton University" is "Carleton
 * University" in both locales, and uOttawa's French name is a fixed proper noun).
 */

/** Stable identifier for a supported school. Used in asset ids, paths, and state. */
export type SchoolId = "uottawa" | "carleton";

/** Every supported school id, in display order. uOttawa is first (it is the default). */
export const SCHOOL_IDS = ["uottawa", "carleton"] as const;

/** The school assumed when nothing else says otherwise (legacy URLs, old `?s=` links). */
export const DEFAULT_SCHOOL_ID: SchoolId = "uottawa";

/**
 * Wire values for the `school` field of `ShareableState`.
 *
 * `0` **must** stay uOttawa: proto3 scalars default to `0` when absent, so every
 * `?s=` link and `localStorage` blob written before this field existed decodes as
 * uOttawa without a `STATE_MAGIC` bump.
 */
export const SCHOOL_WIRE_IDS: Record<SchoolId, number> = {
  uottawa: 0,
  carleton: 1,
};

/** Reverse of {@link SCHOOL_WIRE_IDS}; unknown values fall back to the default school. */
export function schoolFromWireId(wire: number | undefined): SchoolId {
  for (const id of SCHOOL_IDS) {
    if (SCHOOL_WIRE_IDS[id] === wire) return id;
  }
  return DEFAULT_SCHOOL_ID;
}

/**
 * How a school counts credits.
 *
 * uOttawa courses are 3.0-credit units and a normal full-time term is 5 courses
 * (15 credits). Carleton courses are 0.5-credit units and a normal full-time
 * term is 5 courses (2.5 credits). Anywhere the app converts between "number of
 * courses" and "number of credits" — pool sizing, the first-year credit cap,
 * progress readouts — it has to go through this instead of a literal `3`.
 */
export type SchoolCreditConfig = {
  /** Credit value of a typical one-term course. */
  readonly typicalCourseCredits: number;
  /** Credits assumed when a course is missing from the catalogue. */
  readonly defaultCourseCredits: number;
  /** Credits in a normal full-time term (used for load warnings and defaults). */
  readonly fullTimeTermCredits: number;
  /** Credits above which a schedule is considered overloaded for one term. */
  readonly maxTermCredits: number;
  /**
   * Cap applied when the user asks to limit how many first-year (1000-level)
   * credits a generated schedule may contain.
   */
  readonly firstYearCreditCap: number;
  /** Decimal places to render credit values with (uOttawa: 0, Carleton: 1). */
  readonly creditFractionDigits: number;
};

/** Optional, school-specific capabilities. Absent capabilities must degrade gracefully. */
export type SchoolFeatures = {
  /** Registrar grade-distribution data (`grades.pb`). Carleton publishes none. */
  readonly grades: boolean;
  /** Course-evaluation feedback reports (`feedback.pb`). uOttawa-only (uoZone). */
  readonly feedback: boolean;
  /** The French Immersion stream and its FLS companion-course rules. uOttawa-only. */
  readonly frenchImmersion: boolean;
  /** A bilingual EN/FR catalogue (course titles and descriptions in both languages). */
  readonly bilingualCatalogue: boolean;
  /** A French important-dates asset (`important-dates.fr.pb`). */
  readonly importantDatesFr: boolean;
  /** Transcript PDF import (the parser is tied to one registrar's PDF layout). */
  readonly transcriptImport: boolean;
  /** uEnroll share-link import. uOttawa-only. */
  readonly uEnrollImport: boolean;
  /** Official saved registrar schedule-page import. uOttawa-only. */
  readonly officialScheduleImport: boolean;
  /** The `@uoplan/cli` PeopleSoft enrolment helper. uOttawa-only. */
  readonly enrolCli: boolean;
};

/** Everything the app needs to know about one school. */
export type School = {
  readonly id: SchoolId;
  /**
   * Leading URL path segment, without slashes. Empty for uOttawa so its existing
   * URLs (`/schedule`, `/explore/...`) keep working untouched.
   */
  readonly pathSlug: string;
  /** Router `basepath` — `"/"` for uOttawa, `"/carleton"` for Carleton. */
  readonly basePath: string;
  /** Directory / asset-id namespace (always non-empty, unlike {@link pathSlug}). */
  readonly assetNamespace: string;
  /** Full institution name, English. */
  readonly name: string;
  /** Full institution name, French. */
  readonly nameFr: string;
  /** Compact label for chips, toggles and tight headers. */
  readonly shortName: string;
  /**
   * Grammatically correct EN form with article for embedding in prose.
   * e.g. "the University of Ottawa", "Carleton University".
   */
  readonly nameWithArticleEn: string;
  /**
   * Grammatically correct FR form with article for embedding in prose.
   * e.g. "l'Université d'Ottawa", "l'Université Carleton".
   */
  readonly nameWithArticleFr: string;
  /** Link-text label shown beside the important-dates source link, e.g. "uottawa.ca". */
  readonly sourceLabel: string;
  /** URL to the school's French Immersion diploma requirements, or `null` if unsupported. */
  readonly frenchImmersionDiplomaUrl: string | null;
  /** URL where students can request an unofficial transcript, or `null` if unsupported. */
  readonly transcriptRequestUrl: string | null;
  /** Accent colour (Mantine-compatible hex) used to tint school-specific chrome. */
  readonly accentColor: string;
  /** IANA timezone all of this school's meeting times are expressed in. */
  readonly timeZone: string;
  readonly credits: SchoolCreditConfig;
  readonly features: SchoolFeatures;
  /** Public course-catalogue deep link for a course code, or `null` if unavailable. */
  readonly courseCatalogueUrl: (courseCode: string) => string | null;
  /**
   * Absolutise a scraped program key into a public catalogue URL. Keys that are
   * already absolute are returned untouched.
   */
  readonly programCatalogueUrl: (programKey: string) => string;
  /** The registrar page the important-dates data is scraped from. */
  readonly importantDatesUrl: string;
  /** Oldest academic year (first calendar year) the catalogue scraper attempts. */
  readonly oldestCatalogueYear: number;
};

function stripLeadingSlashes(value: string): string {
  return value.replace(/^\/+/, "");
}

function absoluteOr(key: string, fallback: string): string {
  return /^https?:\/\//.test(key) ? key : fallback;
}

const UOTTAWA: School = {
  id: "uottawa",
  pathSlug: "",
  basePath: "/",
  assetNamespace: "uottawa",
  name: "University of Ottawa",
  nameFr: "Université d'Ottawa",
  shortName: "uOttawa",
  nameWithArticleEn: "the University of Ottawa",
  nameWithArticleFr: "l'Université d'Ottawa",
  sourceLabel: "uottawa.ca",
  frenchImmersionDiplomaUrl:
    "https://www.uottawa.ca/study/immersion/french/about/diploma-requirements",
  transcriptRequestUrl:
    "https://www.uocampus.uottawa.ca/psp/csprpr9www/EMPLOYEE/SA/c/SA_LEARNER_SERVICES.SSS_TSRQST_UNOFF.GBL?languageCd=ENG",
  accentColor: "#8f001a",
  timeZone: "America/Toronto",
  credits: {
    typicalCourseCredits: 3,
    defaultCourseCredits: 3,
    fullTimeTermCredits: 15,
    maxTermCredits: 18,
    firstYearCreditCap: 18,
    creditFractionDigits: 0,
  },
  features: {
    grades: true,
    feedback: true,
    frenchImmersion: true,
    bilingualCatalogue: true,
    importantDatesFr: true,
    transcriptImport: true,
    uEnrollImport: true,
    officialScheduleImport: true,
    enrolCli: true,
  },
  courseCatalogueUrl: (courseCode) =>
    `https://catalogue.uottawa.ca/search/?P=${encodeURIComponent(courseCode)}`,
  programCatalogueUrl: (programKey) =>
    absoluteOr(programKey, `https://catalogue.uottawa.ca/en/${stripLeadingSlashes(programKey)}`),
  importantDatesUrl: "https://www.uottawa.ca/study/important-academic-dates-deadlines",
  oldestCatalogueYear: 2017,
};

const CARLETON: School = {
  id: "carleton",
  pathSlug: "carleton",
  basePath: "/carleton",
  assetNamespace: "carleton",
  name: "Carleton University",
  nameFr: "Université Carleton",
  shortName: "Carleton",
  nameWithArticleEn: "Carleton University",
  nameWithArticleFr: "l'Université Carleton",
  sourceLabel: "carleton.ca",
  frenchImmersionDiplomaUrl: null,
  transcriptRequestUrl: null,
  accentColor: "#c8102e",
  timeZone: "America/Toronto",
  credits: {
    // Carleton counts in half-credit units: a one-term course is 0.5 credits and
    // a full-time year is 5.0, so a single term is 2.5.
    typicalCourseCredits: 0.5,
    defaultCourseCredits: 0.5,
    fullTimeTermCredits: 2.5,
    maxTermCredits: 3,
    firstYearCreditCap: 3,
    creditFractionDigits: 1,
  },
  features: {
    grades: false,
    feedback: false,
    frenchImmersion: false,
    bilingualCatalogue: false,
    importantDatesFr: false,
    transcriptImport: false,
    uEnrollImport: false,
    officialScheduleImport: false,
    enrolCli: false,
  },
  courseCatalogueUrl: (courseCode) =>
    `https://calendar.carleton.ca/search/?P=${encodeURIComponent(courseCode)}`,
  programCatalogueUrl: (programKey) =>
    absoluteOr(programKey, `https://calendar.carleton.ca/${stripLeadingSlashes(programKey)}`),
  importantDatesUrl: "https://calendar.carleton.ca/academicyear/",
  // Carleton's CourseLeaf archives only go back to 2012-13; 2011 and earlier
  // live on a legacy hand-rolled site (www3.carleton.ca) with unrelated markup.
  // 2012–present is 15 years of coverage, comfortably more than uOttawa's.
  oldestCatalogueYear: 2012,
};

/** Every supported school, keyed by id. */
export const SCHOOLS: Record<SchoolId, School> = {
  uottawa: UOTTAWA,
  carleton: CARLETON,
};

/** Every supported school, in display order. */
export const SCHOOL_LIST: readonly School[] = SCHOOL_IDS.map((id) => SCHOOLS[id]);

/** Narrow an arbitrary string to a {@link SchoolId}. */
export function isSchoolId(value: unknown): value is SchoolId {
  return typeof value === "string" && (SCHOOL_IDS as readonly string[]).includes(value);
}

/** Look up a school, falling back to the default for unknown ids. */
export function getSchool(id: string | null | undefined): School {
  return isSchoolId(id) ? SCHOOLS[id] : SCHOOLS[DEFAULT_SCHOOL_ID];
}

/**
 * Resolve the school from a URL pathname.
 *
 * Only a leading segment that exactly matches a school's non-empty `pathSlug`
 * counts, so `/schedule` and `/explore/course/CSI%202110` stay uOttawa while
 * `/carleton/schedule` is Carleton.
 */
export function schoolFromPathname(pathname: string): SchoolId {
  const first = pathname.replace(/^\/+/, "").split("/", 1)[0]?.toLowerCase() ?? "";
  for (const id of SCHOOL_IDS) {
    const slug = SCHOOLS[id].pathSlug;
    if (slug !== "" && slug === first) return id;
  }
  return DEFAULT_SCHOOL_ID;
}

/** Prefix an app-relative path (`/schedule`) with a school's base path. */
export function withSchoolPath(schoolId: SchoolId, path: string): string {
  const slug = SCHOOLS[schoolId].pathSlug;
  if (slug === "") return path;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return suffix === "/" ? `/${slug}` : `/${slug}${suffix}`;
}

/** Strip a school's base path back off, yielding the school-neutral app path. */
export function withoutSchoolPath(schoolId: SchoolId, path: string): string {
  const slug = SCHOOLS[schoolId].pathSlug;
  if (slug === "") return path;
  const prefix = `/${slug}`;
  if (path === prefix) return "/";
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
}

/**
 * Namespace a bare `.pb` asset id (`catalogue.pb`) for a school
 * (`uottawa/catalogue.pb`). Both schools are namespaced — the assets are served
 * from content-hashed URLs via the generated manifest, so no public URL depends
 * on the old flat layout.
 */
export function schoolAssetId(schoolId: SchoolId, assetId: string): string {
  return `${SCHOOLS[schoolId].assetNamespace}/${assetId}`;
}
