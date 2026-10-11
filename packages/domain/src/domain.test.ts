import { describe, expect, it } from 'vitest';
import { blockResultId, categoryMinutes, completionStats, dayBlocks, documentSchema, editDocument, getCompletion, insertBlock, localDate, matchesRecurrence, mergeDocuments, occurrenceId, resultId, sameContent, shiftDate, swipeStatus, type Block, type Document, type Recurrence, type Rule } from './index';

const recurrence: Recurrence = { startDate: '2026-01-31', endDate: null, repeat: 'monthly', weekdays: [0, 2, 4], interval: 2, monthDay: 31, timezone: 'Europe/Zurich' };
const block = (id: string, start = 480, duration = 60): Block => ({ id, name: id, timing: { date: '2026-10-11', start, duration }, categories: ['work'], activities: [], habitId: null, resultDate: '2026-10-11', ruleId: null, occurrenceDate: null, order: 0, notes: '', backlogDate: null });
const doc = (b: Block) => { const { id, ...data } = b; return editDocument(undefined, id, 'block', data, 'test'); };
describe('calendar recurrence', () => {
  it('clamps month end, including leap years, without drifting the next month', () => {
    expect(matchesRecurrence(recurrence, '2026-02-28')).toBe(true);
    expect(matchesRecurrence(recurrence, '2026-03-31')).toBe(true);
    expect(matchesRecurrence(recurrence, '2026-03-28')).toBe(false);
    expect(matchesRecurrence(recurrence, '2028-02-29')).toBe(true);
  });
  it('uses calendar days over both daylight-saving transitions', () => {
    const r = { ...recurrence, repeat: 'interval' as const, startDate: '2026-03-28', interval: 2 };
    expect(matchesRecurrence(r, '2026-03-30')).toBe(true);
    expect(shiftDate('2026-03-29', 1)).toBe('2026-03-30');
    expect(shiftDate('2026-10-25', 1)).toBe('2026-10-26');
    expect(localDate('Europe/Zurich', new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30');
    expect(localDate('America/Los_Angeles', new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-29');
  });
  it('honours weekdays, inclusive end dates and once', () => {
    expect(matchesRecurrence({ ...recurrence, repeat: 'weekly' }, '2026-10-12')).toBe(true);
    expect(matchesRecurrence({ ...recurrence, repeat: 'weekly' }, '2026-10-13')).toBe(false);
    const r = { ...recurrence, repeat: 'daily' as const, endDate: '2026-02-01' };
    expect(matchesRecurrence(r, '2026-02-01')).toBe(true);
    expect(matchesRecurrence(r, '2026-02-02')).toBe(false);
    expect(matchesRecurrence({ ...r, repeat: 'once' }, '2026-01-31')).toBe(true);
    expect(matchesRecurrence({ ...r, repeat: 'once' }, '2026-02-01')).toBe(false);
  });
});
describe('stable occurrences and shared completion', () => {
  const rule: Rule = { id: 'rule-1', name: 'Read', habitId: 'habit-1', categories: ['reading'], recurrence: { ...recurrence, repeat: 'daily' }, start: 600, duration: 30, conflict: 'push' };
  const { id: ruleId, ...ruleData } = rule;
  const base = [editDocument(undefined, ruleId, 'rule', ruleData, 'test'), editDocument(undefined, 'habit-1', 'habit', { name: 'Read', description: '', type: 'binary', target: 1, unit: '', active: true, weekdays: [0,1,2,3,4,5,6], startDate: '2026-01-01', reminder: '', categories: ['reading'] }, 'test')];
  it('does not write when projecting and never generates a moved or deleted occurrence twice', () => {
    const before = JSON.stringify(base), occurrence = dayBlocks(base, '2026-10-11')[0];
    expect(occurrence.id).toBe(occurrenceId(ruleId, '2026-10-11'));
    expect(JSON.stringify(base)).toBe(before);
    const moved = { ...occurrence, timing: { ...occurrence.timing, date: '2026-10-12' } };
    const docs = [...base, doc(moved)];
    expect(dayBlocks(docs, '2026-10-11')).toHaveLength(0);
    expect(dayBlocks(docs, '2026-10-12').filter(b => b.id === occurrence.id)).toHaveLength(1);
    docs[2] = editDocument(docs[2], occurrence.id, 'block', {}, 'test', true);
    expect(dayBlocks(docs, '2026-10-11')).toHaveLength(0);
    expect(dayBlocks(docs, '2026-10-12').some(b => b.id === occurrence.id)).toBe(false);
  });
  it('counts the linked block and habit once and shares clearing and skipping', () => {
    const result = editDocument(undefined, resultId('habit-1', '2026-10-11'), 'result', { subjectId: 'habit-1', date: '2026-10-11', completion: { status: 'done', value: 0 } }, 'test');
    const docs = [...base, result];
    expect(completionStats(docs, '2026-10-11')).toEqual({ total: 1, done: 1, skipped: 0 });
    expect(getCompletion(docs, blockResultId(dayBlocks(docs, '2026-10-11')[0])).status).toBe('done');
    docs[2] = editDocument(result, result.id, 'result', { completion: { status: 'skip', value: 0 } }, 'test');
    expect(completionStats(docs, '2026-10-11')).toEqual({ total: 0, done: 0, skipped: 1 });
  });
  it('uses the full swipe transition matrix', () => {
    for (const [current, right, left] of [['none', 'done', 'missed'], ['done', 'none', 'missed'], ['missed', 'done', 'none'], ['skip', 'done', 'missed']] as const) {
      expect(swipeStatus(current, 'right')).toBe(right); expect(swipeStatus(current, 'left')).toBe(left);
    }
  });
});
describe('schedule placement', () => {
  it('keeps unrelated gaps while pushing overlaps, rejecting midnight overflow', () => {
    const schedule = [block('a', 480), block('b', 600), block('c', 900)];
    const inserted = insertBlock(schedule, block('new', 570), 'push')!;
    expect(inserted.map(b => [b.id, b.timing.start])).toEqual([['a',480], ['new',570], ['b',630], ['c',900]]);
    expect(insertBlock(schedule, block('late', 1430), 'push')).toBeNull();
    expect(insertBlock(schedule, block('new', 500), 'free')!.find(b => b.id === 'new')!.timing.start).toBe(540);
  });
  it('produces the same conflict layout regardless of arrival order', () => {
    const records = [doc(block('b')), doc(block('a'))];
    expect(dayBlocks(records, '2026-10-11')).toEqual(dayBlocks(records.reverse(), '2026-10-11'));
    expect(dayBlocks(records, '2026-10-11').map(b => b.timing.start)).toEqual([480, 540]);
  });
});
describe('concurrent edits', () => {
  it('retains independent edits and converges on same-field conflicts', () => {
    const initial = doc(block('block'));
    const a = editDocument(initial, initial.id, 'block', { name: 'New name' }, 'a');
    const b = editDocument(initial, initial.id, 'block', { notes: 'New note' }, 'b');
    const merged = mergeDocuments(a, b);
    expect(merged.data.name).toBe('New name'); expect(merged.data.notes).toBe('New note');
    expect(sameContent(merged, mergeDocuments(b, a))).toBe(true);
    const c = editDocument(initial, initial.id, 'block', { name: 'Concurrent name' }, 'c');
    expect(mergeDocuments(a, c).data.name).toBe('Concurrent name');
    expect(sameContent(mergeDocuments(a, c), mergeDocuments(c, a))).toBe(true);
  });
  it('keeps timing atomic, preserves tombstones and supports explicit restore', () => {
    const original = doc(block('block'));
    const deleted = editDocument(original, original.id, 'block', {}, 'a', true);
    const edited = editDocument(original, original.id, 'block', { name: 'Offline edit', timing: { date: '2026-10-12', start: 800, duration: 45 } }, 'b');
    const merged = mergeDocuments(deleted, edited);
    expect(merged.deleted).toBe(true);
    expect(merged.data.timing).toEqual({ date: '2026-10-12', start: 800, duration: 45 });
    expect(editDocument(merged, merged.id, 'block', {}, 'a', false).deleted).toBe(false);
  });
});
describe('validation and reporting', () => {
  it('rejects malformed dates, invalid placement, unknown fields and missing clocks', () => {
    const original = doc(block('block'));
    expect(documentSchema.safeParse(original).success).toBe(true);
    expect(documentSchema.safeParse({ ...original, owner: 'someone-else' }).success).toBe(false);
    expect(documentSchema.safeParse({ ...original, clocks: {} }).success).toBe(false);
    expect(documentSchema.safeParse({ ...original, data: { ...original.data, timing: { date: '2026-02-31', start: 1430, duration: 60 } } }).success).toBe(false);
  });
  it('derives category hours from actual completed blocks and divides shared time', () => {
    const b = { ...block('block'), categories: ['reading', 'work'] };
    const docs = [doc(b), editDocument(undefined, blockResultId(b), 'result', { subjectId: b.id, date: b.resultDate, completion: { status: 'done', value: 0 } }, 'test')];
    expect(categoryMinutes(docs, '2026-10-01', '2026-10-31')).toEqual({ reading: 30, work: 30 });
  });
});
