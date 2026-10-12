import { localDate } from './calendar';
import { dayBlocks } from './schedule';
import { entities, type Block, type CalendarEvent, type Document } from './model';
export interface CalendarSlot { event: CalendarEvent; start: number; duration: number; color: string; sourceName: string }
export function calendarDay(docs: Document[], date: string, timezone: string, includeHidden = false): CalendarSlot[] {
  const sources = entities(docs, 'calendarSource').filter(c => c.enabled), hidden = new Set(entities(docs, 'calendarPreference').filter(p => p.hidden).map(p => p.eventId));
  const merged = new Set(entities(docs, 'block').flatMap(b => b.calendarEventIds ?? []));
  const minute = (instant: string) => { const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant)); return Number(parts.find(p => p.type === 'hour')!.value) * 60 + Number(parts.find(p => p.type === 'minute')!.value); };
  return entities(docs, 'calendarEvent').flatMap(event => {
    const source = sources.find(c => c.id === event.sourceId); if (!source || !includeHidden && (hidden.has(event.id) || merged.has(event.id))) return [];
    if (event.allDay) return event.start <= date && event.end > date ? [{ event, start: 0, duration: 1440, color: source.color, sourceName: source.name }] : [];
    const from = localDate(timezone, new Date(event.start)), to = localDate(timezone, new Date(event.end));
    if (from > date || to < date || to === date && minute(event.end) === 0) return [];
    const start = from < date ? 0 : minute(event.start), end = to > date ? 1440 : minute(event.end);
    // A repeated DST hour can have equal wall times despite positive elapsed time.
    const duration = end > start ? end - start : Math.max(1, Math.min(1440 - start, (Date.parse(event.end) - Date.parse(event.start)) / 60000));
    return [{ event, start, duration, color: source.color, sourceName: source.name }];
  }).sort((a, b) => a.start - b.start || a.event.id.localeCompare(b.event.id));
}
export type ScheduleItem = { id: string; start: number; duration: number; block?: Block; calendar?: CalendarSlot };
export interface ScheduleWindow { start: number; duration: number; items: ScheduleItem[] }
/** Exact minute boundaries partition overlapping sessions into shared time windows. */
export function calendarWindows(docs: Document[], date: string, timezone: string, from: number, to: number, blocks = dayBlocks(docs, date)): ScheduleWindow[] {
  const items: ScheduleItem[] = [
    ...blocks.filter(b => b.timing.start < 1440).map(block => ({ id: block.id, block, start: block.timing.start, duration: Math.min(block.timing.duration, 1440 - block.timing.start) })),
    ...calendarDay(docs, date, timezone).filter(c => !c.event.allDay).map(calendar => ({ id: calendar.event.id, calendar, start: calendar.start, duration: calendar.duration })),
  ];
  const boundaries = [...new Set([from, to, ...items.flatMap(i => [Math.max(from, i.start), Math.min(to, i.start + i.duration)]).filter(n => n >= from && n <= to)])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => ({ start, duration: boundaries[index + 1] - start, items: items.filter(i => i.start < boundaries[index + 1] && i.start + i.duration > start).sort((a, b) => a.id.localeCompare(b.id)) }));
}
export function mergeCalendarEvent(block: Block, slot: CalendarSlot, date: string): Block {
  if (slot.event.allDay) throw new Error('Choose a timed calendar event to merge.');
  const start = Math.floor(Math.min(block.timing.start, slot.start) / 15) * 15;
  const end = Math.min(1440, Math.ceil(Math.max(block.timing.start + block.timing.duration, slot.start + slot.duration) / 15) * 15);
  return { ...block, name: block.name === slot.event.name ? block.name : `${block.name} + ${slot.event.name}`.slice(0, 120), timing: { date, start, duration: end - start },
    activities: [...new Set([...block.activities, slot.event.name])].slice(0, 20), calendarEventIds: [...new Set([...(block.calendarEventIds ?? []), slot.event.id])] };
}
export const calendarPreferenceId = (eventId: string) => `visibility:${eventId}`;

export interface CalendarStatus { enabled: boolean; accounts: { id: string; email: string; needsReconnect: boolean }[]; sources: { id: string; accountId: string; enabled: boolean; lastSynced: string | null; error: string | null }[] }
