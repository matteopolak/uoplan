import { StateCreator } from "zustand";
import type { AppStore } from "../types";
import { type Course, type Program, CatalogueSchema } from 'schemas'
import { SchedulesDataSchema } from 'schemas'
import { buildDataCache, normalizeCourseCode, withExtraCourses, isOptCourse } from "schedule";
import { IndicesSchema } from 'schemas'
import { TermsDataSchema } from 'schemas'
import { buildProfessorRatingsMap } from "schedule";
import { parseStateFromUrl, peekTermAndYear, peekTermAndYearFromBase64, decodeState, decodeStateFromBase64, urlToSlug } from "schedule";
import { recomputeStateForProgram } from "../requirementCompute";
import { LOCAL_STORAGE_KEY } from "../constants";

/** Build a DataCache and inject fake entries for any OPT transfer credit codes in completedCourses. */
function buildCacheWithOpt(catalogue: any, schedulesData: any, completedCourses: string[]) {
  const base = buildDataCache(catalogue, schedulesData);
  const optCodes = completedCourses.map(normalizeCourseCode).filter(isOptCourse);
  if (optCodes.length === 0) return base;
  return withExtraCourses(base, optCodes.map((code): Course => ({ code, title: code, credits: 3, description: '' })));
}

function getMergedCatalogue(
  catalogue: { courses: unknown[]; programs: Program[] } | null,
  yearCatalogueCourses: Course[] | null,
  completedCourses: string[],
): { courses: unknown[]; programs: Program[] } | null {
  if (!catalogue) return null;
  if (!yearCatalogueCourses) return catalogue;

  const completedSet = new Set(completedCourses.map(normalizeCourseCode));
  const yearMap = new Map(
    yearCatalogueCourses.map((c) => [normalizeCourseCode(c.code), c]),
  );

  const merged = new Map<string, Course>();
  for (const course of yearCatalogueCourses) {
    merged.set(normalizeCourseCode(course.code), course);
  }

  for (const course of catalogue.courses as Course[]) {
    const key = normalizeCourseCode(course.code);
    if (completedSet.has(key) && yearMap.has(key)) {
      continue;
    }
    merged.set(key, course);
  }

  return { ...catalogue, courses: Array.from(merged.values()) };
}

export interface DataSlice {
  loadData: AppStore["loadData"];
  setSelectedTermId: AppStore["setSelectedTermId"];
  setFirstYear: AppStore["setFirstYear"];
}

export const createDataSlice: StateCreator<
  AppStore,
  [],
  [],
  DataSlice
> = (set, get) => ({
  setSelectedTermId: async (termId: string) => {
    set({ loading: true, error: null });
    try {
      const { catalogue, yearCatalogueCourses, completedCourses } = get();
      if (!catalogue) throw new Error("Catalogue not loaded");

      const schedulesRes = await fetch(`/data/schedules.${termId}.json`);
      if (!schedulesRes.ok) throw new Error("Failed to load schedules data");
      const schedulesData = await schedulesRes.json();

      const parsedSchedules = SchedulesDataSchema.parse(schedulesData);
      const effectiveCatalogue = getMergedCatalogue(catalogue, yearCatalogueCourses, completedCourses);
      const cache = buildCacheWithOpt((effectiveCatalogue ?? catalogue) as any, parsedSchedules, completedCourses);

      const s = get();
      const full = recomputeStateForProgram(
        s.program,
        s.completedCourses,
        cache,
        s.selectedPerRequirement,
        s.selectedOptionsPerRequirement,
        s.levelBuckets,
        s.languageBuckets,
        s.includeClosedComponents,
        s.studentPrograms,
        s.requirementSlotsUserTouched,
      );

      set({
        selectedTermId: termId,
        schedulesData: parsedSchedules,
        cache,
        generatedSchedules: [],
        generationError: null,
        generationErrorDetails: null,
        selectedScheduleIndex: 0,
        ...full,
        loading: false,
        error: null,
      });

    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load data",
      });
    }
  },

  setFirstYear: async (year) => {
    const { catalogue } = get();
    set({ firstYear: year, yearCatalogueLoading: true });
    try {
      if (year === null) {
        set({ yearCataloguePrograms: null, yearCatalogueCourses: null, yearCatalogueLoading: false });
        const { schedulesData, completedCourses: cc } = get();
        if (catalogue && schedulesData) {
          const cache = buildCacheWithOpt(catalogue as any, schedulesData as any, cc);
          set({ cache });
        }
      } else {
        const res = await fetch(`/data/catalogue.${year}.json`);
        if (!res.ok) throw new Error(`Failed to load catalogue.${year}.json`);
        const json = await res.json();
        const parsed = CatalogueSchema.parse(json);
        set({ yearCataloguePrograms: parsed.programs, yearCatalogueCourses: parsed.courses, yearCatalogueLoading: false });
        const { schedulesData, completedCourses } = get();
        const effectiveCatalogue = getMergedCatalogue(catalogue, parsed.courses, completedCourses);
        if (effectiveCatalogue && schedulesData) {
          const cache = buildCacheWithOpt(effectiveCatalogue as any, schedulesData as any, completedCourses);
          set({ cache });
        }
      }
    } catch (err) {
      set({ yearCatalogueLoading: false });
      console.error("Failed to load year catalogue:", err);
    }
    get().setProgram(null);
  },

  loadData: async () => {
    set({ loading: true, error: null });
    try {
      const [manifestRes, termsRes, indicesRes, rmpRes] = await Promise.all([
        fetch("/data/catalogue.json"),
        fetch("/data/terms.json"),
        fetch("/data/indices.json").catch(() => null),
        fetch("/data/ratemyprofessors.json").catch(() => null),
      ]);
      if (!manifestRes.ok || !termsRes.ok)
        throw new Error("Failed to load data");

      const manifestJson = await manifestRes.json();
      const availableYears: number[] = Array.isArray(manifestJson.years) ? manifestJson.years : [];
      const latestYear = availableYears[0];
      if (!latestYear) throw new Error("Catalogue manifest has no years");

      const catalogueRes = await fetch(`/data/catalogue.${latestYear}.json`);
      if (!catalogueRes.ok) throw new Error(`Failed to load catalogue.${latestYear}.json`);
      const catalogue = await catalogueRes.json();
      const termsJson = await termsRes.json();

      const parsedCatalogue = CatalogueSchema.parse(catalogue);
      const parsedTerms = TermsDataSchema.parse(termsJson);

      let professorRatings = null;
      if (rmpRes?.ok) {
        try {
          const rmpJson = await rmpRes.json();
          professorRatings = buildProfessorRatingsMap(rmpJson);
        } catch {
          professorRatings = null;
        }
      }

      let indices = null;
      if (indicesRes?.ok) {
        const indicesJson = await indicesRes.json();
        indices = IndicesSchema.parse(indicesJson);
      } else {
        indices = {
          courses: (parsedCatalogue.courses as Array<{ code: string }>).map(
            (c) => c.code,
          ),
          programs: parsedCatalogue.programs.map((p) => urlToSlug(p.url)),
        };
      }

      let peekedTermId: string | null = null;
      let peekedFirstYear: number | null = null;
      if (typeof window !== "undefined") {
        const urlBytes = parseStateFromUrl(window.location.search);
        if (urlBytes && urlBytes.length > 0) {
          const peeked = peekTermAndYear(urlBytes);
          if (peeked) { peekedTermId = peeked.termId; peekedFirstYear = peeked.firstYear; }
        } else {
          try {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) {
              const peeked = peekTermAndYearFromBase64(stored);
              if (peeked) { peekedTermId = peeked.termId; peekedFirstYear = peeked.firstYear; }
            }
          } catch {
            // ignore
          }
        }
      }

      const initialTermId = peekedTermId ?? parsedTerms.terms[0]?.termId ?? null;
      if (!initialTermId) throw new Error("No terms available");
      const initialFirstYear = peekedFirstYear;

      let yearCataloguePrograms = null;
      let yearCatalogueCourses = null;
      if (initialFirstYear !== null) {
        try {
          const yearRes = await fetch(`/data/catalogue.${initialFirstYear}.json`);
          if (yearRes.ok) {
            const yearJson = await yearRes.json();
            const parsedYear = CatalogueSchema.parse(yearJson);
            yearCataloguePrograms = parsedYear.programs;
            yearCatalogueCourses = parsedYear.courses;
          }
        } catch {
          // ignore
        }
      }

      const schedulesRes = await fetch(`/data/schedules.${initialTermId}.json`);
      if (!schedulesRes.ok) throw new Error("Failed to load schedules data");
      const schedulesData = await schedulesRes.json();
      const parsedSchedules = SchedulesDataSchema.parse(schedulesData);
      const effectiveCatalogue = getMergedCatalogue(parsedCatalogue, yearCatalogueCourses, []);
      const cache = buildDataCache((effectiveCatalogue ?? parsedCatalogue) as any, parsedSchedules);

      set({
        catalogue: parsedCatalogue,
        indices,
        schedulesData: parsedSchedules,
        cache,
        professorRatings,
        terms: parsedTerms.terms,
        selectedTermId: initialTermId,
        firstYear: initialFirstYear,
        yearCataloguePrograms,
        yearCatalogueCourses,
        availableYears,
        loading: false,
        error: null,
      });

      if (indices && typeof window !== "undefined") {
        const catalogueLike = parsedCatalogue as any;
        const urlBytes = parseStateFromUrl(window.location.search);
        if (urlBytes && urlBytes.length > 0) {
          const decoded = decodeState(urlBytes, catalogueLike, indices);
          if ("error" in decoded) {
            set({ error: decoded.error });
          } else {
            get().loadEncodedState(decoded as any);
            const u = new URL(window.location.href);
            u.searchParams.delete("s");
            u.searchParams.delete("t");
            u.searchParams.delete("f");
            window.history.replaceState({}, "", u.toString());
          }
        } else {
          const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (stored) {
            const decoded = decodeStateFromBase64(
              stored,
              catalogueLike,
              indices,
            );
            if (!("error" in decoded)) get().loadEncodedState(decoded as any);
          }
        }
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load data",
      });
    }
  },
});
