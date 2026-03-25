import { z } from 'zod';

export const IndicesSchema = z.object({
  courses: z.array(z.string()),
  programs: z.array(z.string()),
});
export type Indices = z.infer<typeof IndicesSchema>;
