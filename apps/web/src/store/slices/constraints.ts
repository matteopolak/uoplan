import { StateCreator } from "zustand";
import type { AppStore } from "../types";
import { clearEnrollmentsCache } from "./schedules";

export interface ConstraintsSlice {
  setGenerationMinStartMinutes: AppStore["setGenerationMinStartMinutes"];
  setGenerationMaxEndMinutes: AppStore["setGenerationMaxEndMinutes"];
  setGenerationAllowedDays: AppStore["setGenerationAllowedDays"];
  setGenerationMinProfessorRating: AppStore["setGenerationMinProfessorRating"];
  setIncludeClosedComponents: AppStore["setIncludeClosedComponents"];
  setGenerationLimitFirstYearCredits: AppStore["setGenerationLimitFirstYearCredits"];
  setGenerationCompressedSchedule: AppStore["setGenerationCompressedSchedule"];
}

export const createConstraintsSlice: StateCreator<
  AppStore,
  [],
  [],
  ConstraintsSlice
> = (set) => ({
  setIncludeClosedComponents: (value) => {
    clearEnrollmentsCache();
    set({ includeClosedComponents: value });
  },

  setGenerationMinStartMinutes: (minutes) =>
    set({ generationMinStartMinutes: minutes }),
    
  setGenerationMaxEndMinutes: (minutes) =>
    set({ generationMaxEndMinutes: minutes }),
    
  setGenerationAllowedDays: (days) => set({ generationAllowedDays: days }),
  
  setGenerationMinProfessorRating: (rating) =>
    set({
      generationMinProfessorRating: rating == null ? null : Number(rating),
    }),
    
  setGenerationLimitFirstYearCredits: (v) =>
    set({ generationLimitFirstYearCredits: v }),
    
  setGenerationCompressedSchedule: (v) =>
    set({ generationCompressedSchedule: v }),
});
