export interface RemainingRequirement {
  requirementId: string;
  type: string;
  title?: string;
  candidateCourses: string[];
  creditsNeeded?: number;
  pickedCount?: number;
  /** Completed courses allocated to this requirement (each course used at most once at same "and" level) */
  satisfiedBy: string[];
}

/** Mirror of a program requirement node with completion status for UI. */
export interface RequirementWithStatus {
  type: string;
  title?: string;
  code?: string;
  credits?: number;
  disciplineLevels?: { discipline: string; levels?: number[] }[];
  excluded_disciplines?: string[];
  faculty?: string;
  options?: RequirementWithStatus[];
  complete: boolean;
  satisfiedBy: string[];
  satisfiedOptionIndex?: number;
  requirementId?: string;
  candidateCourses?: string[];
  creditsNeeded?: number;
  pickedCount?: number;
}

export interface CompletedRequirementItem {
  title: string;
  satisfiedBy: string[];
}

export type ProcessResult = { satisfied: boolean; creditsUsed: number; coursesUsed: string[] };

export type ProcessOptions = {
  /** When true, do not mutate the shared completion pool, but still build a status node. */
  dryRun?: boolean;
  /**
   * When true, assign a requirementId even in dry-run mode.
   * This is used to give option branches in OR groups their own selectable slots in the UI
   * without emitting additional RemainingRequirement entries.
   */
  forceRequirementId?: boolean;
};

export interface RequirementsState {
  remaining: RemainingRequirement[];
  tree: RequirementWithStatus[];
  completedList: CompletedRequirementItem[];
}
