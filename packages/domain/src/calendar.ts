import type { Recurrence } from './model';

export function localDate(timezone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000);
export const weekday = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
export const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function matchesRecurrence(rule: Recurrence, date: string): boolean {
  if (date < rule.startDate || rule.endDate && date > rule.endDate) return false;
  const delta = dayNumber(date) - dayNumber(rule.startDate);
  switch (rule.repeat) {
    case 'once': return delta === 0;
    case 'daily': return true;
    case 'weekly': return rule.weekdays.includes(weekday(date));
    case 'interval': return delta % rule.interval === 0;
    case 'monthly': {
      const value = new Date(`${date}T12:00:00Z`);
      const last = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
      return value.getUTCDate() === Math.min(rule.monthDay, last);
    }
  }
}
export const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const parseTime = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
export const formatDuration = (value: number) => value >= 60 ? `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ''}` : `${value}m`;
export const formatDate = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
