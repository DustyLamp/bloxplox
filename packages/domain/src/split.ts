import { blankBlock } from './actions';
import { canonical } from './conflicts';
import { dayBlocks, insertBlock } from './schedule';
import { dateSchema, entities, type Block, type Document } from './model';
import { thingBlockDuration } from './things';
/** Move checklist references into independently scheduled sessions. Stable IDs make retries safe. */
export function splitThings(docs: Document[], source: Block, selected: string[], date: string, start: number, operationId: string): Block[] {
  dateSchema.parse(date);
  if (!Number.isInteger(start) || start < 0 || start > 1425 || start % 15) throw new Error('Choose a time in fifteen-minute steps.');
  if (docs.find(d => d.id === source.id)?.deleted) throw new Error('This block was deleted on another device.');
  const things = entities(docs, 'thing').filter(t => selected.includes(t.id) && source.thingIds?.includes(t.id)).sort((a, b) => (source.thingIds?.indexOf(a.id) ?? 0) - (source.thingIds?.indexOf(b.id) ?? 0));
  if (!things.length) throw new Error('Select at least one thing.');
  let schedule = dayBlocks(docs, date);
  const before = schedule;
  for (const [index, thing] of things.entries()) {
    const block = { ...blankBlock(date, start), id: `split:${operationId}:${index}`, order: source.order, name: thing.name, thingIds: [thing.id], categories: thing.categories.length ? thing.categories : source.categories, timing: { date, start, duration: thingBlockDuration([thing]) } };
    const next = insertBlock(schedule, block, 'free');
    if (!next) throw new Error('These things would extend past midnight. Choose another day or an earlier time.');
    schedule = next; const placed = schedule.find(b => b.id === block.id)!; start = placed.timing.start + placed.timing.duration;
  }
  const updates = schedule.filter(b => b.id !== source.id && canonical(b) !== canonical(before.find(old => old.id === b.id)));
  // Remove references last, after the destination sessions are durably saved.
  const current = entities(docs, 'block').find(b => b.id === source.id) ?? source;
  updates.push({ ...current, thingIds: current.thingIds?.filter(id => !things.some(t => t.id === id)) });
  return updates;
}
