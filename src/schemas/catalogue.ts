import { z } from 'zod';

export type CoursePrereqNode = {
  type: 'course' | 'or_group' | 'and_group' | 'non_course';
  code?: string;
  text?: string;
  credits?: number;
  disciplines?: string[];
  children?: CoursePrereqNode[];
};

export const CoursePrereqNodeSchema: z.ZodType<CoursePrereqNode> = z.lazy(() =>
  z.object({
    type: z.enum(['course', 'or_group', 'and_group', 'non_course']),
    code: z.string().optional(),
    text: z.string().optional(),
    credits: z.number().optional(),
    disciplines: z.array(z.string()).optional(),
    children: z.array(CoursePrereqNodeSchema).optional(),
  }),
);

export const CourseSchema = z.object({
  code: z.string(),
  title: z.string(),
  credits: z.number(),
  description: z.string(),
  component: z.string().optional(),
  // Normalized prerequisite sentence from the catalogue page, if any.
  prereqText: z.string().optional(),
  // Parsed prerequisite tree, mirroring the scraper's CoursePrereqNode.
  prerequisites: CoursePrereqNodeSchema.optional(),
});
export type Course = z.infer<typeof CourseSchema>;

export const RequirementTypeSchema = z.enum([
  'course',
  'elective',
  'group',
  'pick',
  'options_group',
  'discipline_elective',
  'free_elective',
  'non_discipline_elective',
  'faculty_elective',
  'section',
  'and',
  'or_group',
  'or_course',
]);

export const DisciplineLevelSchema = z.object({
  discipline: z.string(),
  levels: z.array(z.number()).optional(),
});

export const ProgramRequirementBaseSchema = z.object({
  type: RequirementTypeSchema,
  title: z.string().optional(),
  code: z.string().optional(),
  credits: z.number().optional(),
  disciplineLevels: z.array(DisciplineLevelSchema).optional(),
  excluded_disciplines: z.array(z.string()).optional(),
  faculty: z.string().optional(),
  // Row was visually indented in the source table; used to group options.
  indented: z.boolean().optional(),
});

type ProgramRequirementType = z.infer<typeof ProgramRequirementBaseSchema> & {
  options?: ProgramRequirementType[];
};

export const ProgramRequirementSchema: z.ZodType<ProgramRequirementType> =
  ProgramRequirementBaseSchema.extend({
    options: z.lazy(() => z.array(ProgramRequirementSchema)).optional(),
  });
export type ProgramRequirement = ProgramRequirementType;

export const ProgramSchema = z.object({
  title: z.string(),
  url: z.string(),
  requirements: z.array(ProgramRequirementSchema),
});
export type Program = z.infer<typeof ProgramSchema>;

export const CatalogueSchema = z.object({
  courses: z.array(CourseSchema),
  programs: z.array(ProgramSchema),
});
export type Catalogue = z.infer<typeof CatalogueSchema>;
