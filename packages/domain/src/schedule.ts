import { entities, emptyCompletion, type Block, type Document, type Habit, type Completion, type Rule } from './model';
import { matchesRecurrence, weekday, shiftDate } from './calendar';

export const occurrenceId = (ruleId: string, date: string) => `occ:${ruleId}:${date}`;
export const resultId = (subject: string, date: string) => `result:${subject}:${date}`;
export const blockResultId = (block: Block) => resultId(block.habitId ?? block.id, block.resultDate);
export function getCompletion(docs: Document[], key: string): Completion {
  return entities(docs, 'result').find(r => r.id === key)?.completion ?? emptyCompletion;
}
export function swipeStatus(status: Completion['status'], direction: 'right' | 'left'): Completion['status'] {
  const target = direction === 'right' ? 'done' : 'missed';
  return status === target ? 'none' : target;
}
export function completionWithStatus(current: Completion, status: Completion['status']): Completion {
  return { status, value: status === 'none' ? 0 : current.value };
}
export function instantiate(rule: Rule, date: string): Block {
  return { id: occurrenceId(rule.seriesId, date), name: rule.name, timing: { date, start: rule.start, duration: rule.duration },
    categories: rule.categories, activities: [], habitId: rule.habitId, resultDate: date,
    ruleId: rule.id, occurrenceDate: date, order: 0, notes: '', backlogDate: null };
}
export function dayBlocks(docs: Document[], date: string): Block[] {
  let blocks = normalizeSchedule(entities(docs, 'block').filter(b => b.timing.date === date));
  const ids = new Set(docs.filter(d => d.kind === 'block').map(d => d.id));
  const habits = entities(docs, 'habit');
  for (const rule of entities(docs, 'rule').sort((a, b) => a.id.localeCompare(b.id))) {
    if (date < rule.effectiveFrom) continue;
    if (rule.habitId && !habits.some(h => h.id === rule.habitId && h.active)) continue;
    if (matchesRecurrence(rule.recurrence, date) && !ids.has(occurrenceId(rule.seriesId, date))) {
      const generated = instantiate(rule, date);
      blocks = projectInsertion(blocks, generated, rule.conflict);
    }
  }
  // Resolve overlapping concurrent placements deterministically. Persisted intentions
  // stay intact; the same records produce the same usable schedule on every device.
  return normalizeSchedule(blocks);
}
export function normalizeSchedule(blocks: Block[]): Block[] {
  let end = 0;
  return blocks.slice().sort((a, b) => a.timing.start - b.timing.start || a.id.localeCompare(b.id)).map(b => {
    const start = Math.max(end, b.timing.start);
    end = start + b.timing.duration;
    return { ...b, timing: { ...b.timing, start } };
  });
}
export function nextSpace(blocks: Block[], start: number, duration: number): number {
  let next = start;
  for (const block of blocks.slice().sort((a, b) => a.timing.start - b.timing.start)) {
    if (block.timing.start + block.timing.duration <= next) continue;
    if (next + duration <= block.timing.start) break;
    next = block.timing.start + block.timing.duration;
  }
  return next;
}
function projectInsertion(blocks: Block[], block: Block, policy: 'push' | 'free'): Block[] {
  const other = blocks.filter(b => b.id !== block.id).map(b => ({ ...b, timing: { ...b.timing } }));
  const added = { ...block, timing: { ...block.timing } };
  if (policy === 'free') added.timing.start = nextSpace(other, added.timing.start, added.timing.duration);
  let end = added.timing.start + added.timing.duration;
  for (const item of other.sort((a, b) => a.timing.start - b.timing.start || a.id.localeCompare(b.id))) {
    if (item.timing.start + item.timing.duration <= added.timing.start) continue;
    item.timing.start = Math.max(end, item.timing.start);
    end = item.timing.start + item.timing.duration;
  }
  return [...other, added].sort((a, b) => a.timing.start - b.timing.start);
}
export function insertBlock(blocks: Block[], block: Block, policy: 'push' | 'free' = 'push'): Block[] | null {
  const proposed = projectInsertion(blocks, block, policy);
  return proposed.some(b => b.timing.start + b.timing.duration > 1440) ? null : proposed;
}
export function dueHabits(docs: Document[], date: string): Habit[] {
  const blocks = dayBlocks(docs, date);
  return entities(docs, 'habit').filter(h => h.startDate <= date && (h.active && (h.weekdays.includes(weekday(date)) || blocks.some(b => b.habitId === h.id)) || getCompletion(docs, resultId(h.id, date)).status !== 'none'));
}
export function completionStats(docs: Document[], date: string) {
  const keys = new Set(dayBlocks(docs, date).filter(b => b.timing.start < 1440).map(blockResultId));
  for (const habit of dueHabits(docs, date)) keys.add(resultId(habit.id, date));
  const values = [...keys].map(key => getCompletion(docs, key));
  const included = values.filter(v => v.status !== 'skip');
  return { total: included.length, done: included.filter(v => v.status === 'done').length, skipped: values.length - included.length };
}
export function categoryMinutes(docs: Document[], from: string, to: string): Record<string, number> {
  const totals: Record<string, number> = {};
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    for (const block of dayBlocks(docs, date)) {
      if (block.timing.start + block.timing.duration > 1440 || getCompletion(docs, blockResultId(block)).status !== 'done') continue;
      for (const category of block.categories) totals[category] = (totals[category] ?? 0) + block.timing.duration / Math.max(1, block.categories.length);
    }
  }
  return totals;
}
