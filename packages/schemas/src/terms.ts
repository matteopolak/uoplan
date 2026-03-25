import { z } from 'zod';

export const TermSchema = z.object({
  termId: z.string(),
  name: z.string(),
});
export type Term = z.infer<typeof TermSchema>;

export const TermsDataSchema = z.object({
  generatedAt: z.string().optional(),
  terms: z.array(TermSchema),
});
export type TermsData = z.infer<typeof TermsDataSchema>;

