import type { ProgramRequirement } from 'schemas';
import { getCourseCredits, normalizeCourseCode } from '../utils/courseUtils';
import type { RequirementContext } from './context';
import type { ProcessOptions, ProcessResult, RequirementWithStatus } from './types';
import { resolveDisciplineElective, resolveElectiveCandidates } from './utils';

export function processRequirement(
  ctx: RequirementContext,
  req: ProgramRequirement,
  path: string,
  opts: ProcessOptions = {}
): { result: ProcessResult; node: RequirementWithStatus } {
  const dryRun = opts.dryRun ?? false;
  const forceRequirementId = opts.forceRequirementId ?? false;
  const reqId = ctx.reqId(path);
  const requirementId = forceRequirementId || !dryRun ? reqId : undefined;

  switch (req.type) {
    case 'section': {
      return {
        result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
        node: { ...ctx.toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
      };
    }

    case 'course':
    case 'or_course': {
      const code = req.code ? normalizeCourseCode(req.code) : null;
      if (!code) {
        return {
          result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
          node: { ...ctx.toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
        };
      }
      const taken = ctx.takeFromPool([code], dryRun);
      if (taken) {
        return {
          result: {
            satisfied: true,
            creditsUsed: getCourseCredits(taken.norm, ctx.cache),
            coursesUsed: [taken.displayCode],
          },
          node: {
            ...ctx.toStatusBase(req),
            complete: true,
            satisfiedBy: [taken.displayCode],
            options: [],
          },
        };
      }
      const course = ctx.cache.getCourse(code);
      const displayCode = course?.code ?? code;
      if (!dryRun) {
        ctx.remaining.push({
          requirementId: requirementId!,
          type: req.type,
          title: req.title,
          candidateCourses: [displayCode],
          creditsNeeded: req.credits ?? course?.credits ?? 3,
          satisfiedBy: [],
        });
      }
      return {
        result: { satisfied: false, creditsUsed: 0, coursesUsed: [] },
        node: {
          ...ctx.toStatusBase(req),
          complete: false,
          satisfiedBy: [],
          requirementId,
          candidateCourses: [displayCode],
          creditsNeeded: req.credits ?? course?.credits ?? 3,
          options: [],
        },
      };
    }

    case 'and': {
      if (!req.options?.length) {
        return {
          result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
          node: { ...ctx.toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
        };
      }
      let totalCredits = 0;
      const allCoursesUsed: string[] = [];
      let allSatisfied = true;
      const childNodes: RequirementWithStatus[] = [];
      for (let i = 0; i < req.options.length; i++) {
        const { result: r, node } = processRequirement(ctx, req.options[i], `${path}-${i}`, { ...opts, forceRequirementId: true });
        totalCredits += r.creditsUsed;
        allCoursesUsed.push(...r.coursesUsed);
        if (!r.satisfied) allSatisfied = false;
        childNodes.push(node);
      }
      return {
        result: {
          satisfied: allSatisfied,
          creditsUsed: totalCredits,
          coursesUsed: allCoursesUsed,
        },
        node: {
          ...ctx.toStatusBase(req),
          complete: allSatisfied,
          satisfiedBy: allCoursesUsed,
          options: childNodes,
        },
      };
    }

    case 'or_group': {
      if (!req.options?.length) {
        return {
          result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
          node: { ...ctx.toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
        };
      }
      const selectedIdx = !dryRun ? ctx.selectedOptionsPerRequirement[reqId] : undefined;

      const allCandidates: string[] = [];
      const orChildNodes: RequirementWithStatus[] = [];
      for (let i = 0; i < req.options.length; i++) {
        const opt = req.options[i];
        const childDryRun = selectedIdx === undefined ? true : i !== selectedIdx ? true : dryRun;
        const { node } = processRequirement(ctx, opt, `${path}-${i}`, {
          ...opts,
          dryRun: childDryRun,
          forceRequirementId: true,
        });
        orChildNodes.push(node);
        if (opt.type === 'course' && opt.code) {
          allCandidates.push(ctx.cache.getCourse(opt.code)?.code ?? opt.code);
        } else if (opt.type === 'discipline_elective' && opt.disciplineLevels?.length) {
          allCandidates.push(
            ...resolveDisciplineElective(ctx.cache, opt.disciplineLevels[0].discipline, opt.disciplineLevels[0].levels)
          );
        }
      }

      if (allCandidates.length > 0) {
        if (!dryRun && selectedIdx === undefined) {
          ctx.remaining.push({
            requirementId: reqId,
            type: 'or_group',
            title: req.title,
            candidateCourses: [...new Set(allCandidates)],
            creditsNeeded: req.credits,
            satisfiedBy: [],
          });
        }
        return {
          result: { satisfied: false, creditsUsed: 0, coursesUsed: [] },
          node: {
            ...ctx.toStatusBase(req),
            complete: false,
            satisfiedBy: [],
            satisfiedOptionIndex: undefined,
            requirementId: reqId,
            candidateCourses: [...new Set(allCandidates)],
            creditsNeeded: req.credits,
            options: orChildNodes,
          },
        };
      }
      return {
        result: { satisfied: false, creditsUsed: 0, coursesUsed: [] },
        node: {
          ...ctx.toStatusBase(req),
          complete: false,
          satisfiedBy: [],
          options: orChildNodes,
        },
      };
    }

    case 'group': {
      const creditsNeeded = req.credits ?? 0;
      const options = req.options ?? [];
      const courseCodes = options.flatMap((o) =>
        o.type === 'course' && o.code ? [ctx.cache.getCourse(o.code)?.code ?? o.code] : []
      );
      const electiveOptions = options.filter(
        (o) => o.type === 'discipline_elective' || o.type === 'elective' || o.type === 'faculty_elective' || o.type === 'free_elective' || o.type === 'non_discipline_elective'
      );
      const electiveCandidates = electiveOptions.flatMap((o) =>
        resolveElectiveCandidates(ctx.cache, o, creditsNeeded)
      );
      const allCandidates = [...new Set([...courseCodes, ...electiveCandidates])];

      const coursesUsed: string[] = [];
      const remainingCredits = creditsNeeded;

      if (!dryRun && requirementId) {
        ctx.remaining.push({
          requirementId,
          type: 'group',
          title: req.title,
          candidateCourses: allCandidates,
          creditsNeeded: remainingCredits,
          pickedCount: Math.ceil(remainingCredits / 3),
          satisfiedBy: coursesUsed,
        });
      }
      const childNodes = req.options?.map((o, i) => processRequirement(ctx, o, `${path}-${i}`, { dryRun: true }).node) ?? [];
      return {
        result: { satisfied: false, creditsUsed: 0, coursesUsed },
        node: {
          ...ctx.toStatusBase(req),
          complete: false,
          satisfiedBy: coursesUsed,
          requirementId,
          candidateCourses: allCandidates,
          creditsNeeded: remainingCredits,
          pickedCount: Math.ceil(remainingCredits / 3),
          options: childNodes,
        },
      };
    }

    case 'options_group': {
      if (!req.options?.length) {
        return {
          result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
          node: { ...ctx.toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
        };
      }
      const selectedIdx = requirementId != null ? ctx.selectedOptionsPerRequirement[requirementId] : undefined;

      const optNodes: RequirementWithStatus[] = [];
      for (let i = 0; i < req.options.length; i++) {
        const childDryRun = selectedIdx === undefined ? true : i !== selectedIdx ? true : dryRun;
        const { node } = processRequirement(ctx, req.options[i], `${path}-${i}`, {
          ...opts,
          dryRun: childDryRun,
        });
        optNodes.push(node);
      }

      return {
        result: { satisfied: false, creditsUsed: 0, coursesUsed: [] },
        node: {
          ...ctx.toStatusBase(req),
          complete: false,
          satisfiedBy: [],
          requirementId,
          options: optNodes,
        },
      };
    }

    case 'pick': {
      const creditsNeeded = req.credits ?? 3;
      const options = req.options ?? [];
      const allCandidates = options.flatMap((o) => {
        if (o.type === 'course' && o.code) return [ctx.cache.getCourse(o.code)?.code ?? o.code];
        if (o.type === 'discipline_elective' && o.disciplineLevels?.length) {
          return resolveDisciplineElective(ctx.cache, o.disciplineLevels[0].discipline, o.disciplineLevels[0].levels);
        }
        return [];
      });
      const unique = [...new Set(allCandidates)];

      const coursesUsed: string[] = [];
      const remaining = creditsNeeded;

      if (!dryRun && requirementId) {
        ctx.remaining.push({
          requirementId,
          type: 'pick',
          title: req.title,
          candidateCourses: unique,
          creditsNeeded: remaining,
          satisfiedBy: coursesUsed,
        });
      }
      const childNodes = options.map((o, i) => processRequirement(ctx, o, `${path}-${i}`, { dryRun: true }).node);
      return {
        result: { satisfied: false, creditsUsed: 0, coursesUsed },
        node: {
          ...ctx.toStatusBase(req),
          complete: false,
          satisfiedBy: coursesUsed,
          requirementId,
          candidateCourses: unique,
          creditsNeeded: remaining,
          options: childNodes,
        },
      };
    }

    case 'elective':
    case 'discipline_elective':
    case 'faculty_elective':
    case 'free_elective':
    case 'non_discipline_elective': {
      const creditsNeeded = req.credits ?? 3;
      const candidates = resolveElectiveCandidates(ctx.cache, req, creditsNeeded);

      const coursesUsed: string[] = [];
      const remaining = creditsNeeded;

      if (!dryRun && requirementId) {
        ctx.remaining.push({
          requirementId,
          type: req.type,
          title: req.title,
          candidateCourses: candidates,
          creditsNeeded: remaining,
          satisfiedBy: coursesUsed,
        });
      }
      return {
        result: { satisfied: false, creditsUsed: 0, coursesUsed },
        node: {
          ...ctx.toStatusBase(req),
          complete: false,
          satisfiedBy: coursesUsed,
          requirementId,
          candidateCourses: candidates,
          creditsNeeded: remaining,
          options: [],
        },
      };
    }

    default:
      return {
        result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
        node: { ...ctx.toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
      };
  }
}
