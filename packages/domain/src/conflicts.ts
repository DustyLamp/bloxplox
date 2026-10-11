import type { Document, Kind, DataByKind, Stamp } from './model';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const sameContent = (a: Document, b: Document) => a.id === b.id && a.kind === b.kind &&
  a.deleted === b.deleted && canonical(a.data) === canonical(b.data) && canonical(a.clocks) === canonical(b.clocks);
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => key !== 'id' && canonical(value) !== canonical((before as Record<string, unknown>)[key]))) as Partial<T>;
}
const compare = (a: Stamp, b: Stamp) => a.counter - b.counter || (a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0);

/** A field is an atomic value: timing and completion cannot be split by a merge. */
export function mergeDocuments(master: Document, local: Document): Document {
  if (master.id !== local.id || master.kind !== local.kind) throw new Error('Cannot merge different records');
  const next: Document = { ...master, data: { ...master.data }, clocks: { ...master.clocks } };
  for (const [key, stamp] of Object.entries(local.clocks)) {
    const other = master.clocks[key];
    if (!other || compare(stamp, other) > 0) {
      next.clocks[key] = stamp;
      if (key === 'deleted') next.deleted = local.deleted;
      else next.data[key] = local.data[key];
    }
  }
  if (!sameContent(next, master)) next.revision = crypto.randomUUID();
  return next;
}

export function editDocument<K extends Kind>(
  previous: Document | undefined, id: string, kind: K, changes: Partial<DataByKind[K]>, actor: string,
  deleted = previous?.deleted ?? false,
): Document {
  if (previous && previous.kind !== kind) throw new Error('A record cannot change type');
  const data = { ...previous?.data, ...changes };
  const clocks = { ...previous?.clocks };
  const counter = Math.max(0, ...Object.values(clocks).map(s => s.counter)) + 1;
  for (const key of Object.keys(changes)) {
    if (!previous || canonical(previous.data[key]) !== canonical(data[key])) clocks[key] = { counter, actor };
  }
  if (!previous || deleted !== previous.deleted) clocks.deleted = { counter, actor };
  return { id, kind, data, clocks, deleted, revision: crypto.randomUUID() };
}
