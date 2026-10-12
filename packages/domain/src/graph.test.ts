import { describe, expect, it } from 'vitest';
import { editDocument, entities, focusedGraph, graphPositions, mergeDocuments, prerequisiteError, prerequisites, thingGraph, type Document } from './index';
const thing = (id: string, done = false) => editDocument(undefined, id, 'thing', { name: id, notes: '', categories: [], estimate: null, dueDate: null, completedOn: done ? '2026-10-12' : null, order: 0 }, 'a');
const link = (id: string, thingId: string, prerequisiteId: string) => editDocument(undefined, id, 'prerequisite', { thingId, prerequisiteId }, 'a');
describe('Things prerequisites', () => {
  it('supports roots, multiple prerequisites and shared ancestors, laid out left to right', () => {
    const graph = thingGraph([thing('a'), thing('b'), thing('c'), thing('d'), link('1','b','a'), link('2','c','a'), link('3','d','b'), link('4','d','c')]);
    expect(prerequisites(graph, 'a')).toEqual([]);
    expect(prerequisites(graph, 'd').map(t => t.id)).toEqual(['b','c']);
    expect(prerequisites(graph, 'd', true).map(t => t.id)).toEqual(['a','b','c']);
    const positions = graphPositions(graph);
    for (const l of graph.links) expect(positions.get(l.prerequisiteId)!.x).toBeLessThan(positions.get(l.thingId)!.x);
    expect(focusedGraph(graph, 'c').things.map(t => t.id)).toEqual(['a','c']);
    expect(prerequisiteError(graph, 'a', 'd')).toContain('circular');
    expect(prerequisiteError(graph, 'a', 'a')).toContain('itself');
    expect(prerequisiteError(graph, 'b', 'a')).toContain('Already');
  });
  it('converges after independently valid offline edits create a cycle', () => {
    const docs = [thing('a'), thing('b'), thing('c'), link('1','b','a'), link('2','c','b'), link('3','a','c')];
    const left = thingGraph(docs), right = thingGraph([...docs].reverse());
    expect(left.links).toEqual(right.links); expect(left.conflicts.map(l => l.id)).toEqual(['3']);
    expect(prerequisites(left, 'c', true)).toHaveLength(2);
    expect(left.links).toHaveLength(2);
  });
  it('ignores deleted/missing things and duplicate links without deleting tasks', () => {
    const a = thing('a');
    const docs = [a, thing('b'), link('1','b','a'), link('2','b','a'), link('3','b','missing')];
    expect(thingGraph(docs).links).toHaveLength(1);
    const removed = editDocument(docs[2], '1', 'prerequisite', {}, 'a', true);
    expect(entities([...docs.slice(0,2), removed], 'thing')).toHaveLength(2);
    expect(thingGraph([editDocument(a, 'a', 'thing', {}, 'a', true), ...docs.slice(1)]).links).toHaveLength(0);
  });
  it('shares completion and preserves independent task edits with relationship changes', () => {
    const a = thing('a'), b = thing('b'), done = editDocument(a,'a','thing',{ completedOn: '2026-10-12' },'phone');
    const renamed = editDocument(a,'a','thing',{ name: 'Renamed' },'desktop');
    const docs: Document[] = [mergeDocuments(done,renamed), b, link('1','b','a')];
    expect(prerequisites(thingGraph(docs),'b')[0]).toMatchObject({name:'Renamed',completedOn:'2026-10-12'});
  });
});
