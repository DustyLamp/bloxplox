import { entities, type Document, type Prerequisite, type Thing } from './model';

export type ThingGraph = { things: Thing[]; links: Prerequisite[]; conflicts: Prerequisite[] };

/** Edges point from prerequisite (left) to the thing it enables (right). */
export function reaches(links: Prerequisite[], from: string, to: string): boolean {
  const pending = [from], seen = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const link of links) outgoing.set(link.prerequisiteId, [...(outgoing.get(link.prerequisiteId) ?? []), link.thingId]);
  while (pending.length) {
    const id = pending.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id); pending.push(...(outgoing.get(id) ?? []));
  }
  return false;
}

/** Concurrent offline edits can collectively close a cycle. Every device derives
 * the same acyclic graph; retained conflicting links are visible and removable.
 * Never silently delete another device's work or strand replication on a rejection.
 */
export function thingGraph(docs: Document[]): ThingGraph {
  const things = entities(docs, 'thing'), ids = new Set(things.map(t => t.id));
  const links: Prerequisite[] = [], conflicts: Prerequisite[] = [], pairs = new Set<string>();
  for (const link of entities(docs, 'prerequisite').sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    if (!ids.has(link.thingId) || !ids.has(link.prerequisiteId)) continue;
    const pair = JSON.stringify([link.thingId, link.prerequisiteId]);
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    if (reaches(links, link.thingId, link.prerequisiteId)) conflicts.push(link);
    else links.push(link);
  }
  return { things, links, conflicts };
}

export function prerequisiteError(graph: ThingGraph, thingId: string, prerequisiteId: string): string | null {
  if (!graph.things.some(t => t.id === thingId) || !graph.things.some(t => t.id === prerequisiteId)) return 'That thing no longer exists.';
  if (thingId === prerequisiteId) return 'A thing cannot require itself.';
  if (graph.links.some(l => l.thingId === thingId && l.prerequisiteId === prerequisiteId)) return 'Already a prerequisite.';
  if (reaches(graph.links, thingId, prerequisiteId)) return 'That would create a circular prerequisite.';
  return null;
}

export function prerequisites(graph: ThingGraph, thingId: string, transitive = false): Thing[] {
  const ids = new Set<string>(), pending = [thingId];
  while (pending.length) {
    const current = pending.pop()!;
    for (const link of graph.links.filter(l => l.thingId === current)) {
      if (ids.has(link.prerequisiteId)) continue;
      ids.add(link.prerequisiteId);
      if (transitive) pending.push(link.prerequisiteId);
    }
  }
  return graph.things.filter(t => ids.has(t.id)).sort((a, b) => Number(!!a.completedOn) - Number(!!b.completedOn) || a.name.localeCompare(b.name));
}

export function focusedGraph(graph: ThingGraph, thingId?: string): ThingGraph {
  if (!thingId) return graph;
  const ids = new Set([thingId, ...prerequisites(graph, thingId, true).map(t => t.id)]);
  return { things: graph.things.filter(t => ids.has(t.id)), links: graph.links.filter(l => ids.has(l.thingId) && ids.has(l.prerequisiteId)), conflicts: graph.conflicts.filter(l => ids.has(l.thingId)) };
}

/** Runtime-independent, deterministic left-to-right layout for web and native. */
export function graphPositions(graph: ThingGraph): Map<string, { x: number; y: number }> {
  const levels = new Map<string, number>(), incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const t of graph.things) incoming.set(t.id, 0);
  for (const l of graph.links) { incoming.set(l.thingId, (incoming.get(l.thingId) ?? 0) + 1); outgoing.set(l.prerequisiteId, [...(outgoing.get(l.prerequisiteId) ?? []), l.thingId]); }
  const queue = graph.things.filter(t => !incoming.get(t.id)).map(t => t.id).sort();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i], level = levels.get(id) ?? 0; levels.set(id, level);
    for (const next of outgoing.get(id) ?? []) {
      levels.set(next, Math.max(levels.get(next) ?? 0, level + 1));
      incoming.set(next, incoming.get(next)! - 1); if (!incoming.get(next)) queue.push(next);
    }
  }
  const rows = new Map<number, number>(), positions = new Map<string, { x: number; y: number }>();
  for (const t of [...graph.things].sort((a, b) => a.id < b.id ? -1 : 1)) {
    const level = levels.get(t.id) ?? 0, row = rows.get(level) ?? 0;
    positions.set(t.id, { x: level * 270, y: row * 112 }); rows.set(level, row + 1);
  }
  return positions;
}
