import { computeRequirementsState, type DataCache } from "schedule";
import type { Program, ProgramRequirement } from "schemas";

export function mergeProgramWithMinor(
  mainProgram: Program,
  minorProgram: Program,
  cache: DataCache,
): Program {
  // A. compute credits needed for minor
  const minorState = computeRequirementsState(minorProgram, [], cache, {});
  let minorCredits = 0;
  for (const req of minorState.remaining) {
    if (req.creditsNeeded) minorCredits += req.creditsNeeded;
  }

  // B. deep clone main program requirements
  const cloneNode = (node: ProgramRequirement): ProgramRequirement => {
    const cloned = { ...node };
    if (cloned.options) cloned.options = cloned.options.map(cloneNode);
    return cloned;
  };
  const mainReqs = mainProgram.requirements.map(cloneNode);

  // C. subtract minorCredits from electives (traverse backwards)
  let remainingToSubtract = minorCredits;

  const subtractFromOptions = (options: ProgramRequirement[]) => {
    for (let i = options.length - 1; i >= 0 && remainingToSubtract > 0; i--) {
      const opt = options[i];
      
      if (opt.options) {
         subtractFromOptions(opt.options);
      }

      if (
        remainingToSubtract > 0 &&
        (opt.type === "elective" ||
          opt.type === "free_elective" ||
          opt.type === "non_discipline_elective") &&
        opt.credits
      ) {
        const toTake = Math.min(opt.credits, remainingToSubtract);
        opt.credits -= toTake;
        remainingToSubtract -= toTake;
      }
    }
    // Remove options that dropped to 0 credits
    for (let i = options.length - 1; i >= 0; i--) {
      const opt = options[i];
      if (
        (opt.type === "elective" ||
          opt.type === "free_elective" ||
          opt.type === "non_discipline_elective") &&
        opt.credits === 0
      ) {
        options.splice(i, 1);
      }
    }
  };

  subtractFromOptions(mainReqs);

  // D. append minor requirements inside an 'and' block so they render nicely
  mainReqs.push({
    type: "and",
    title: minorProgram.title,
    options: minorProgram.requirements.map(cloneNode),
  });

  return {
    ...mainProgram,
    title: `${mainProgram.title} + ${minorProgram.title}`,
    requirements: mainReqs,
  };
}
