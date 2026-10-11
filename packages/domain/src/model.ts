import { z } from 'zod';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Enter a valid date');
const id = z.string().min(1).max(180).regex(/^[a-zA-Z0-9:_-]+$/);
const name = z.string().trim().min(1).max(120);
const minute = z.number().int().min(0).max(1425).multipleOf(15);
export const timingSchema = z.object({
  date: dateSchema.nullable(), start: minute, duration: z.number().int().min(15).max(1440).multipleOf(15),
}).strict().refine(t => t.start + t.duration <= 1440, 'A block must end by midnight');
const timezoneSchema = z.string().max(100).refine(tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } });
export const recurrenceSchema = z.object({
  startDate: dateSchema, endDate: dateSchema.nullable(),
  repeat: z.enum(['once', 'daily', 'weekly', 'interval', 'monthly']),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  interval: z.number().int().min(1).max(365), monthDay: z.number().int().min(1).max(31),
  timezone: timezoneSchema,
}).strict().refine(r => !r.endDate || r.endDate >= r.startDate, 'End date precedes start date')
  .refine(r => r.repeat !== 'weekly' || r.weekdays.length > 0, 'Select a weekday');
export const completionSchema = z.object({
  status: z.enum(['none', 'done', 'missed', 'skip']), value: z.number().min(0).max(1e9),
}).strict();
export const categorySchema = z.object({ name, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict();
export const blockSchema = z.object({
  name, timing: timingSchema, categories: z.array(id).max(12), activities: z.array(name).max(20),
  habitId: id.nullable(), resultDate: dateSchema, ruleId: id.nullable(), occurrenceDate: dateSchema.nullable(),
  order: z.number().finite(), notes: z.string().max(2000), backlogDate: dateSchema.nullable(),
}).strict();
export const habitSchema = z.object({
  name, description: z.string().max(500), type: z.enum(['binary', 'value']),
  target: z.number().min(0).max(1e9), unit: z.string().max(40), active: z.boolean(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7), startDate: dateSchema,
  reminder: z.string().regex(/^(\d{2}:\d{2})?$/), categories: z.array(id).max(12),
}).strict();
export const ruleSchema = z.object({
  name, habitId: id.nullable(), categories: z.array(id).max(12), seriesId: id, effectiveFrom: dateSchema,
  recurrence: recurrenceSchema, start: minute, duration: z.number().int().min(15).max(1440).multipleOf(15),
  conflict: z.enum(['push', 'free']),
}).strict().refine(r => r.start + r.duration <= 1440, 'A block must end by midnight');
export const resultSchema = z.object({ subjectId: id, date: dateSchema, completion: completionSchema }).strict();
export const settingsSchema = z.object({
  layout: z.enum(['grid', 'list']), timezone: timezoneSchema,
  dayStart: z.number().int().min(0).max(1380).multipleOf(15), autoBacklog: z.boolean(),
}).strict();

export type Category = z.infer<typeof categorySchema> & { id: string };
export type Block = z.infer<typeof blockSchema> & { id: string };
export type Habit = z.infer<typeof habitSchema> & { id: string };
export type Rule = z.infer<typeof ruleSchema> & { id: string };
export type Result = z.infer<typeof resultSchema> & { id: string };
export type Settings = z.infer<typeof settingsSchema>;
export type Completion = z.infer<typeof completionSchema>;
export type Recurrence = z.infer<typeof recurrenceSchema>;
export type Kind = 'category' | 'block' | 'habit' | 'rule' | 'result' | 'settings';
export type DataByKind = {
  category: Omit<Category, 'id'>; block: Omit<Block, 'id'>; habit: Omit<Habit, 'id'>;
  rule: Omit<Rule, 'id'>; result: Omit<Result, 'id'>; settings: Settings;
};
export type Stamp = { counter: number; actor: string };
export type Document = {
  id: string; kind: Kind; data: Record<string, unknown>; clocks: Record<string, Stamp>;
  deleted: boolean; revision: string;
};
const schemas = { category: categorySchema, block: blockSchema, habit: habitSchema, rule: ruleSchema, result: resultSchema, settings: settingsSchema };
export const documentSchema = z.object({
  id, kind: z.enum(['category', 'block', 'habit', 'rule', 'result', 'settings']),
  data: z.record(z.string(), z.unknown()),
  clocks: z.record(z.string().regex(/^[a-zA-Z]+$/), z.object({ counter: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1000), actor: id }).strict()),
  deleted: z.boolean(), revision: id,
}).strict().superRefine((doc, ctx) => {
  const parsed = schemas[doc.kind].safeParse(doc.data);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: ['data', ...issue.path] });
  for (const field of [...Object.keys(doc.data), 'deleted']) if (!doc.clocks[field]) ctx.addIssue({ code: 'custom', message: `Missing clock for ${field}` });
  if (Object.keys(doc.clocks).some(key => !['deleted', ...Object.keys(doc.data)].includes(key))) ctx.addIssue({ code: 'custom', message: 'Unknown field clock' });
});

export const emptyCompletion: Completion = { status: 'none', value: 0 };
export function entities<K extends Kind>(docs: Document[], kind: K): (DataByKind[K] & { id: string })[] {
  return docs.filter(doc => doc.kind === kind && !doc.deleted).map(doc => ({ ...doc.data, id: doc.id }) as DataByKind[K] & { id: string });
}
export function defaultSettings(): Settings {
  return { layout: 'grid', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, dayStart: 480, autoBacklog: false };
}
