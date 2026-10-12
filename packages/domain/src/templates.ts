import { type Block, type DataByKind, type DayTemplate } from './model';
import { insertBlock } from './schedule';
export function captureTemplate(name: string, blocks: Block[]): DataByKind['template'] {
  return { name, blocks: blocks.map(b => ({ name: b.name, start: b.timing.start, duration: b.timing.duration, categories: b.categories, activities: b.activities, notes: b.notes })) };
}
export function applyTemplate(template: DayTemplate, date: string, existing: Block[], applicationId: string): Block[] {
  let schedule = existing;
  for (const [index, b] of template.blocks.entries()) {
    const block: Block = { id: `template:${applicationId}:${index}`, name: b.name, timing: { date, start: b.start, duration: b.duration }, categories: b.categories, activities: b.activities, notes: b.notes,
      thingIds: [], habitId: null, ruleId: null, occurrenceDate: null, resultDate: date, backlogDate: null, order: index };
    const next = insertBlock(schedule, block, 'free');
    if (!next) throw new Error('This template does not fit before midnight. Choose another day or shorten the existing blocks.');
    schedule = next;
  }
  return schedule;
}
