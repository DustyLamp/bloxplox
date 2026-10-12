import { expect, it } from 'vitest';
import { blankBlock } from './actions';
import { editDocument, entities, splitThings, type Document } from './index';
it('splits references into separate sessions without copying task completion and retries safely', () => {
  const date = '2026-10-12', source = { ...blankBlock(date, 480), name: 'Admin', thingIds: ['a', 'b'] };
  const { id: sourceId, ...sourceData } = source;
  let docs: Document[] = [editDocument(undefined, sourceId, 'block', sourceData, 'test')];
  for (const id of ['a', 'b']) docs.push(editDocument(undefined, id, 'thing', { name: id, notes: '', categories: [], estimate: 25, dueDate: null, completedOn: id === 'b' ? date : null, order: 0 }, 'test'));
  const result = splitThings(docs, source, ['a', 'b'], date, 510, 'operation');
  expect(result.map(b => [b.name, b.timing.start, b.thingIds])).toEqual([['a', 510, ['a']], ['b', 540, ['b']], ['Admin', 480, []]]);
  docs = docs.filter(d => d.kind !== 'block').concat(result.map(b => { const { id, ...data } = b; return editDocument(undefined, id, 'block', data, 'test'); }));
  expect(entities(docs, 'thing').find(t => t.id === 'b')?.completedOn).toBe(date);
  const retried = splitThings(docs, source, ['a', 'b'], date, 510, 'operation');
  expect(retried.filter(b => b.id.startsWith('split:'))).toEqual([]);
  expect(() => splitThings(docs, source, ['a', 'b'], date, 1425, 'other')).toThrow('midnight');
});
