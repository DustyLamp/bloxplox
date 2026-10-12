import { beforeEach, expect, it, vi } from 'vitest';
import { editDocument, type Document } from '../../packages/domain/src/index';
const state = vi.hoisted(() => ({ document: undefined as Document | undefined, concurrent: undefined as Document | undefined, attempts: [] as Document[] }));
vi.mock('./store', () => ({ ddb: {}, getDocument: async () => state.document, pushDocument: async (_owner: string, change: { newDocumentState: Document }) => {
  state.attempts.push(change.newDocumentState);
  if (state.concurrent) { state.document = state.concurrent; state.concurrent = undefined; return state.document; }
  state.document = change.newDocumentState;
  return null;
} }));
import { saveImported } from './google-store';
const metadata = { name: 'Calendar', color: '#70b4ff', accountId: 'google', accountEmail: 'calendar@example.invalid', timezone: 'Europe/Zurich' };
beforeEach(() => { state.document = undefined; state.concurrent = undefined; state.attempts = []; });
it('preserves a concurrent calendar selection when discovery retries its first metadata write', async () => {
  state.concurrent = editDocument(undefined, 'calendar', 'calendarSource', { ...metadata, enabled: true }, 'selection');
  await saveImported('owner', 'calendar', 'calendarSource', { ...metadata, name: 'Renamed calendar' }, false, { enabled: false });
  expect(state.attempts).toHaveLength(2);
  expect(state.document?.data).toMatchObject({ enabled: true, name: 'Renamed calendar' });
});
it('keeps a disabled calendar disabled when refreshing its metadata', async () => {
  state.document = editDocument(undefined, 'calendar', 'calendarSource', { ...metadata, enabled: false }, 'selection');
  await saveImported('owner', 'calendar', 'calendarSource', { ...metadata, name: 'Updated' }, false, { enabled: true });
  expect(state.document?.data).toMatchObject({ enabled: false, name: 'Updated' });
});
