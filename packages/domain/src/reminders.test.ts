import { expect, it } from 'vitest';
import { reminderInstant } from './reminders';
const resolve = (date: string, time: string, zone: string) => new Date(reminderInstant(date, time, zone)).toISOString();
it('keeps reminder wall times across offsets and local midnight', () => {
  expect(resolve('2026-10-12', '09:30', 'Europe/Zurich')).toBe('2026-10-12T07:30:00.000Z');
  expect(resolve('2026-01-01', '00:15', 'Pacific/Auckland')).toBe('2025-12-31T11:15:00.000Z');
});
it('moves nonexistent times forward and rings once at the first repeated time', () => {
  expect(resolve('2026-03-29', '02:30', 'Europe/Zurich')).toBe('2026-03-29T01:30:00.000Z');
  expect(resolve('2026-10-25', '02:30', 'Europe/Zurich')).toBe('2026-10-25T00:30:00.000Z');
  expect(resolve('2026-10-04', '02:15', 'Australia/Lord_Howe')).toBe('2026-10-03T15:45:00.000Z');
});
