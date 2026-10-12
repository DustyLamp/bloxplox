/** Resolve a local reminder: first occurrence during a fold, forward through a gap. */
export function reminderInstant(date: string, time: string, timezone: string): number {
  const desired = Date.parse(`${date}T${time}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const local = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant)), get = (type: string) => parts.find(p => p.type === type)!.value;
    return Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`);
  };
  const offsets = new Set([-36, 0, 36].map(hours => { const sample = desired + hours * 3600000; return local(sample) - sample; }));
  const candidates = [...offsets].map(offset => desired - offset).sort((a, b) => a - b);
  const exact = candidates.find(candidate => local(candidate) === desired);
  if (exact !== undefined) return exact;
  const after = candidates.filter(candidate => local(candidate) > desired).sort((a, b) => local(a) - local(b));
  if (after.length) return after[0];
  throw new Error('Could not resolve reminder time');
}
