import { entities, type Block, type Document, type Thing } from './model';

export function thingsInBlock(docs: Document[], block: Pick<Block, 'thingIds'>): Thing[] {
  const all = entities(docs, 'thing');
  return [...new Set(block.thingIds ?? [])].flatMap(id => all.find(t => t.id === id) ?? []);
}

export function thingBlockDuration(things: Thing[]): number {
  return Math.min(1440, Math.max(15, Math.ceil(things.reduce((sum, thing) => sum + (thing.estimate ?? 15), 0) / 15) * 15));
}

// Sessions reference a task; they never copy its completion or reset it each day.
export function thingSessions(docs: Document[], thingId: string): Block[] {
  return entities(docs, 'block').filter(block => block.thingIds?.includes(thingId))
    .sort((a, b) => (a.timing.date ?? '9999').localeCompare(b.timing.date ?? '9999') || a.timing.start - b.timing.start);
}
