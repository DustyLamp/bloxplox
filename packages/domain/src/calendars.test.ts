import { expect, it } from 'vitest';
import { blankBlock } from './actions';
import { calendarDay, calendarPreferenceId, calendarWindows, completionStats, documentSchema, editDocument, mergeCalendarEvent, type CalendarEvent, type Document } from './index';
const source = editDocument(undefined, 'source', 'calendarSource', { name: 'Work', color: '#70b4ff', accountId: 'account', accountEmail: 'demo@example.com', timezone: 'Europe/Zurich', enabled: true }, 'server');
const event = (id: string, start: string, end: string, allDay = false) => editDocument(undefined, id, 'calendarEvent', { sourceId: 'source', externalId: id, name: id, start, end, allDay, busy: true, notes: '', location: '', htmlUrl: '', seriesId: null }, 'server');
const block = { ...blankBlock('2026-10-12', 540), name: 'Admin', timing: { date: '2026-10-12', start: 540, duration: 60 }, thingIds: ['task'] };
const blockRecord = () => { const {id,...data} = block; return editDocument(undefined, id, 'block', data, 'test'); };
it('partitions exact-minute overlaps and leaves adjacent sessions and all-day events separate', () => {
  const docs = [source, blockRecord(), event('call', '2026-10-12T09:17:00+02:00', '2026-10-12T09:47:00+02:00'), event('other', '2026-10-12T09:47:00+02:00', '2026-10-12T10:00:00+02:00'), event('holiday', '2026-10-12', '2026-10-13', true)];
  docs.forEach(d => documentSchema.parse(d));
  expect(calendarWindows(docs, '2026-10-12', 'Europe/Zurich', 540, 600).map(w => [w.start,w.duration,w.items.length])).toEqual([[540,17,1],[557,30,2],[587,13,2]]);
  expect(calendarDay(docs, '2026-10-13', 'Europe/Zurich')).toEqual([]);
  expect(completionStats(docs, '2026-10-12').total).toBe(1);
});
it('hides across devices, merges only in BloxPlox and restores the source event on unmerge/deletion', () => {
  const imported = event('call', '2026-10-12T08:50:00+02:00', '2026-10-12T09:20:00+02:00'), docs: Document[] = [source, blockRecord(), imported];
  const slot = calendarDay(docs, '2026-10-12', 'Europe/Zurich')[0], merged = mergeCalendarEvent(block, slot, '2026-10-12');
  expect(merged.timing).toEqual({ date: '2026-10-12', start: 525, duration: 75 }); expect(merged.thingIds).toEqual(['task']);
  const mergedDocs = [source, imported, editDocument(docs[1], block.id, 'block', { calendarEventIds: merged.calendarEventIds }, 'phone')];
  expect(calendarDay(mergedDocs, '2026-10-12', 'Europe/Zurich')).toEqual([]);
  expect(calendarDay(mergedDocs.map(d => d.kind === 'block' ? { ...d, deleted: true } : d), '2026-10-12', 'Europe/Zurich')).toHaveLength(1);
  docs.push(editDocument(undefined, calendarPreferenceId('call'), 'calendarPreference', {eventId:'call',hidden:true}, 'phone'));
  expect(calendarDay(docs, '2026-10-12', 'Europe/Zurich')).toEqual([]);
  expect(calendarDay(docs, '2026-10-12', 'Europe/Zurich', true)).toHaveLength(1);
  expect(imported.data.start).toBe('2026-10-12T08:50:00+02:00');
});
it('clips overnight events, respects the schedule timezone and handles repeated DST hours', () => {
  const docs = [source, event('night', '2026-10-12T23:30:00+02:00', '2026-10-13T01:00:00+02:00')];
  expect(calendarDay(docs, '2026-10-12', 'Europe/Zurich')[0]).toMatchObject({start:1410,duration:30});
  expect(calendarDay(docs, '2026-10-13', 'Europe/Zurich')[0]).toMatchObject({start:0,duration:60});
  expect(calendarDay(docs, '2026-10-13', 'America/New_York')).toEqual([]);
  expect(calendarDay([source,event('fall','2026-10-25T02:30:00+02:00','2026-10-25T02:30:00+01:00')],'2026-10-25','Europe/Zurich')[0]).toMatchObject({start:150,duration:60});
  expect(calendarDay([source,event('spring','2026-03-29T01:30:00+01:00','2026-03-29T03:30:00+02:00')],'2026-03-29','Europe/Zurich')[0]).toMatchObject({start:90,duration:120});
});
