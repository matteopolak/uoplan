import type {
  RemainingRequirement,
  RequirementWithStatus,
  CompletedRequirementItem,
} from "schedule";

export interface RecomputedState {
  remainingRequirements: RemainingRequirement[];
  requirementTreeWithStatus: RequirementWithStatus[];
  completedRequirementsList: CompletedRequirementItem[];
  selectedPerRequirement: Record<string, string[]>;
  selectedOptionsPerRequirement: Record<string, number>;
  prereqEligibleCourses: string[];
  filteredPrereqEligibleCourses: string[];
  unassignedCompletedCourses: string[];
}

export interface ReqAutoMeta {
  id: string;
  type: string;
  creditsNeeded: number;
  candidates: Set<string>;
}
