import { z } from 'zod';

export const DayOfWeekSchema = z.enum(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

export const MeetingTimeSchema = z.object({
  day: DayOfWeekSchema,
  startMinutes: z.number(),
  endMinutes: z.number(),
});
export type MeetingTime = z.infer<typeof MeetingTimeSchema>;

export const ComponentSectionSchema = z.object({
  section: z.string(),
  sectionCode: z.string().nullable(),
  component: z.string().nullable(),
  session: z.string().nullable(),
  times: z.array(MeetingTimeSchema),
  instructors: z.array(z.string()),
  meetingDates: z.array(z.string()).nullable(),
  status: z.string().nullable(),
});
export type ComponentSection = z.infer<typeof ComponentSectionSchema>;

export const CourseScheduleSchema = z.object({
  subject: z.string(),
  catalogNumber: z.string(),
  courseCode: z.string(),
  title: z.string().nullable(),
  timeZone: z.string(),
  components: z.record(z.string(), z.array(ComponentSectionSchema)),
});
export type CourseSchedule = z.infer<typeof CourseScheduleSchema>;

export const SchedulesDataSchema = z.object({
  termId: z.string(),
  generatedAt: z.string().optional(),
  totalCourses: z.number().optional(),
  totalWithSchedules: z.number().optional(),
  schedules: z.array(CourseScheduleSchema),
});
export type SchedulesData = z.infer<typeof SchedulesDataSchema>;
