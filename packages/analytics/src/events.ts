/**
 * Cross-platform analytics event taxonomy. A single source of truth for event
 * names + their property shapes so the web (posthog-js) and native
 * (posthog-react-native) adapters stay consistent.
 *
 * Privacy contract: properties carry only catalog/derived identifiers
 * (course codes, program ids, counts, durations) — never personal data and
 * never raw free-text user input (e.g. transcript contents, search queries).
 */

/** The locale codes the apps support. */
export type AnalyticsLocale = "en" | "fr-CA";

export type GenerationMode = "basic" | "advanced";

export type CompletedCoursesSource = "manual" | "transcript" | "uenroll";

export type ScheduleExportTarget = "ics" | "calendar";

/**
 * Maps every analytics event name to the (optional) properties captured with
 * it. Use `Record<string, never>` for events that carry no properties.
 */
export interface AnalyticsEventMap {
  // --- Planner flow -------------------------------------------------------
  term_selected: { termId: string; termName?: string };
  program_selected: { programId: string; level?: string };
  completed_courses_updated: { count: number; source?: CompletedCoursesSource };
  requirements_viewed: {
    programId?: string;
    /** Completed courses the auto-assign pass placed into requirements on the user's behalf. */
    autoAssignedCount?: number;
    /** Completed courses still needing manual assignment when proceeding to schedule. */
    unassignedCount?: number;
  };
  preferences_updated: { field: string };
  // Fired when the user resets the whole personalization wizard (clears term,
  // program, completed courses, requirement choices, and transcript state).
  personalization_reset: Record<string, never>;
  // Reorder/toggle/break-config edits to the optimization-priorities list.
  // `kind` is an OptimizationKind; `position` is its index after the change.
  optimization_priority_changed: { kind: string; enabled?: boolean; position?: number };
  // Fired when the user opens the generation-error details modal from the toast.
  // `kind` is the structured GenerationMessageDescriptor kind.
  generation_error_details_opened: { kind: string };

  // --- Schedule generation ------------------------------------------------
  // `programId`/`completedCount`/`requirementCount` are optional, non-PII
  // segmentation dimensions (catalog program id + counts) so funnels and
  // drop-off can be broken down by program and academic load.
  // `optimizations` is the ordered list of enabled optimization-priority kinds
  // (single source of truth = packages/core optimizationPriorities) so funnels
  // can break generation outcomes down by which optimizations users picked.
  schedule_generate_started: {
    termId?: string;
    termName?: string;
    mode?: GenerationMode;
    programId?: string;
    completedCount?: number;
    requirementCount?: number;
    optimizations?: string[];
  };
  schedule_generated: {
    resultCount: number;
    durationMs?: number;
    hasConflicts?: boolean;
    relaxationsApplied?: boolean;
    termId?: string;
    termName?: string;
    programId?: string;
    completedCount?: number;
    requirementCount?: number;
    optimizations?: string[];
  };
  schedule_generate_empty: {
    termId?: string;
    termName?: string;
    reason?: string;
    programId?: string;
    completedCount?: number;
    requirementCount?: number;
    optimizations?: string[];
  };
  schedule_generate_failed: {
    termId?: string;
    termName?: string;
    reason?: string;
    programId?: string;
    completedCount?: number;
    requirementCount?: number;
    optimizations?: string[];
  };

  // --- Schedule interaction ----------------------------------------------
  schedule_viewed: { index?: number; total?: number };
  schedule_swapped_course: { courseCode?: string };
  schedule_pinned: { courseCode?: string; pinned: boolean };
  schedule_exported: { target: ScheduleExportTarget };
  schedule_shared: { method?: string };

  // --- Basket -------------------------------------------------------------
  basket_course_added: { courseCode?: string };
  basket_course_removed: { courseCode?: string };
  basket_opened: Record<string, never>;

  // --- Explore ------------------------------------------------------------
  explore_search: { hasQuery: boolean; resultCount?: number };
  explore_course_viewed: { courseCode?: string };
  explore_program_viewed: { programId?: string };
  explore_filter_applied: { filter: string };

  // --- Compare ------------------------------------------------------------
  // Side-by-side comparison of explore resources (courses first). `kind` is a
  // CompareKind; `id` is the catalog id (e.g. course code); `count` is the
  // current tray size; `ids` is the compared set (catalog ids, non-PII).
  compare_added: { kind: string; id?: string; count?: number };
  compare_removed: { kind: string; id?: string; count?: number };
  compare_cleared: { kind?: string; count?: number };
  compare_opened: { kind: string; count?: number };
  compare_viewed: { kind: string; count?: number; ids?: string[] };

  // --- Trends -------------------------------------------------------------
  trends_viewed: Record<string, never>;
  trends_course_viewed: { courseCode?: string };
  trends_discipline_viewed: { discipline?: string };

  // --- Graph --------------------------------------------------------------
  graph_viewed: Record<string, never>;
  graph_node_selected: { courseCode?: string };

  // --- Imports ------------------------------------------------------------
  transcript_upload_started: Record<string, never>;
  transcript_imported: {
    ok: boolean;
    courseCount?: number;
    programMatched?: boolean;
    termMatched?: boolean;
    minorMatched?: boolean;
  };
  uenroll_imported: { ok: boolean; courseCount?: number };
  uozone_schedule_imported: { ok: boolean; courseCount?: number; skippedCount?: number };

  // --- Misc ---------------------------------------------------------------
  notification_subscribed: Record<string, never>;
  notification_unsubscribed: Record<string, never>;
  donation_cta_clicked: { location?: string };
  home_banner_cta_clicked: { banner: string };
  home_banner_dismissed: { banner: string };
  locale_changed: { locale: AnalyticsLocale };
  school_changed: { school: string };
  onboarding_completed: Record<string, never>;
  analytics_opted_out: Record<string, never>;
  analytics_opted_in: Record<string, never>;
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

export type AnalyticsEventProps<E extends AnalyticsEventName> = AnalyticsEventMap[E];
