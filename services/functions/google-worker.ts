import { randomBytes, randomUUID } from 'node:crypto';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Context, SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { canonical, dateSchema, localDate, shiftDate, type CalendarEvent, type Document } from '../../packages/domain/src/index';
import { ddb } from './store';
import { assertAccountActive } from './account-state';
import { googleConfig, googleFetch, type GoogleConfig } from './google-config';
import { enqueueCalendar, googleToken, item, items, pk, saveImported, stableId, table, type GoogleAccount, type GoogleSource } from './google-store';
interface RemoteEvent { id: string; status?: string; summary?: string; description?: string; location?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; recurringEventId?: string; transparency?: string; htmlLink?: string }
const plain = (value = '') => value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
export function importedEvent(event: RemoteEvent, sourceId: string): Omit<CalendarEvent, 'id'> | undefined {
  const start = event.start?.dateTime ?? event.start?.date, end = event.end?.dateTime ?? event.end?.date;
  if (event.status === 'cancelled' || !event.id || !start || !end) return;
  return { sourceId, externalId: event.id, name: plain(event.summary).slice(0, 120) || 'Calendar event', notes: plain(event.description).slice(0, 2000), location: plain(event.location).slice(0, 500), start, end, allDay: !!event.start?.date, busy: event.transparency !== 'transparent', seriesId: event.recurringEventId ?? null, htmlUrl: event.htmlLink?.startsWith('https://www.google.com/calendar/') || event.htmlLink?.startsWith('https://calendar.google.com/') ? event.htmlLink.slice(0, 2000) : '' };
}
async function watch(owner: string, source: GoogleSource, token: string) {
  if (source.watchExpires && source.watchExpires > Date.now() + 86400000) return;
  const id = randomUUID(), secret = randomBytes(32).toString('base64url'), expires = Math.floor(Date.now() / 1000) + 7 * 86400;
  await ddb.send(new PutCommand({ TableName: table(), Item: { pk: `GOOGLEWATCH#${id}`, sk: 'WATCH', owner, sourceId: source.id, token: secret, expires } }));
  const response = await googleFetch<{ resourceId: string; expiration: string }>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.calendarId)}/events/watch`, token, { method: 'POST', body: JSON.stringify({ id, type: 'web_hook', address: `${process.env.API_URL}/calendars/google/notifications`, token: secret, params: { ttl: '604800' } }) });
  await ddb.send(new UpdateCommand({ TableName: table(), Key: { pk: `GOOGLEWATCH#${id}`, sk: 'WATCH' }, UpdateExpression: 'SET resourceId = :id, expires = :expires', ExpressionAttributeValues: { ':id': response.resourceId, ':expires': Math.floor(Number(response.expiration) / 1000) } }));
  await ddb.send(new UpdateCommand({ TableName: table(), Key: { pk: pk(owner), sk: source.sk }, UpdateExpression: 'SET watchId = :id, watchResource = :resource, watchExpires = :expires', ExpressionAttributeValues: { ':id': id, ':resource': response.resourceId, ':expires': Number(response.expiration) } }));
  if (source.watchId && source.watchResource) await googleFetch('https://www.googleapis.com/calendar/v3/channels/stop', token, { method: 'POST', body: JSON.stringify({ id: source.watchId, resourceId: source.watchResource }) }).catch(() => {});
}
async function synchronize(owner: string, sourceId: string, config: GoogleConfig, remaining: () => number) {
  await assertAccountActive(owner);
  const source = await item<GoogleSource>(owner, `GCALSOURCE#${sourceId}`); if (!source?.enabled) return;
  const account = await item<GoogleAccount>(owner, `GCALACCOUNT#${source.accountId}`); if (!account) return;
  const lock = randomUUID();
  await ddb.send(new UpdateCommand({ TableName: table(), Key: { pk: pk(owner), sk: source.sk }, UpdateExpression: 'SET lockUntil = :until, lockOwner = :lock', ConditionExpression: 'attribute_not_exists(lockUntil) OR lockUntil < :now', ExpressionAttributeValues: { ':until': Date.now() + 180000, ':now': Date.now(), ':lock': lock } }));
  try {
    const token = await googleToken(owner, account, config), date = dateSchema.safeParse(source.windowDate).success ? source.windowDate! : localDate('UTC'), from = shiftDate(date, -31), to = shiftDate(date, 184);
    const entries: RemoteEvent[] = []; let pageToken: string | undefined;
    // Complete bounded snapshots expand recurring exceptions correctly. The date
    // window follows the viewed schedule; earlier imported history is retained.
    do {
      const parameters = new URLSearchParams({ singleEvents: 'true', showDeleted: 'false', maxResults: '2500', fields: 'nextPageToken,items(id,status,summary,description,location,start,end,recurringEventId,transparency,htmlLink)', timeMin: `${from}T00:00:00Z`, timeMax: `${to}T23:59:59Z` }); if (pageToken) parameters.set('pageToken', pageToken);
      const page: { items?: RemoteEvent[]; nextPageToken?: string } = await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.calendarId)}/events?${parameters}`, token);
      entries.push(...page.items ?? []); pageToken = page.nextPageToken;
      if (entries.length > 15000) throw new Error('Calendar window contains too many events');
    } while (pageToken);
    if (!(await item<GoogleSource>(owner, source.sk))?.enabled || !await item(owner, account.sk)) return;
    const existing = await items<{ document: Document }>(owner, 'DOC#event:');
    const previous = new Map(existing.map(row => [row.document.id, row.document]));
    const seen = new Set<string>();
    for (const entry of entries) {
      const data = importedEvent(entry, source.id); if (!data) continue;
      const id = stableId('event', source.id, entry.id); seen.add(id);
      const old = previous.get(id); if (old && !old.deleted && canonical(old.data) === canonical(data)) continue;
      // Long first imports continue in another job. Already-applied documents
      // are skipped on the next complete snapshot; partial imports never prune.
      if (remaining() < 20000) { await enqueueCalendar(owner, sourceId); return; }
      await saveImported(owner, id, 'calendarEvent', data);
    }
    // Only a complete successful snapshot may remove events. Network errors and
    // partial pages leave the previous offline copy intact.
    for (const { document } of existing) {
      const event = document.data as unknown as CalendarEvent;
      if (document.deleted || event.sourceId !== source.id || seen.has(document.id)) continue;
      if (remaining() < 20000) { await enqueueCalendar(owner, sourceId); return; }
      // Google bounds are exclusive event-end/event-start instants. All-day
      // events near the edge use the calendar's timezone, so preserve those
      // ambiguous edge dates until a later interior snapshot can decide.
      const inside = event.allDay ? event.end > from && event.start < to : Date.parse(event.end) > Date.parse(`${from}T00:00:00Z`) && Date.parse(event.start) < Date.parse(`${to}T23:59:59Z`);
      if (inside) await saveImported(owner, document.id, 'calendarEvent', {}, true);
    }
    let watchError = '';
    try { await watch(owner, source, token); } catch { watchError = 'Live calendar notifications are unavailable. Reopen or refresh to catch up.'; }
    await ddb.send(new UpdateCommand({ TableName: table(), Key: { pk: pk(owner), sk: source.sk }, UpdateExpression: 'SET lastSynced = :now, #error = :error', ExpressionAttributeNames: { '#error': 'error' }, ExpressionAttributeValues: { ':now': new Date().toISOString(), ':error': watchError } }));
  } catch (error) {
    if ((error as Error).name === 'GoogleAuthorizationError') await ddb.send(new UpdateCommand({ TableName: table(), Key: { pk: pk(owner), sk: account.sk }, UpdateExpression: 'SET needsReconnect = :yes', ConditionExpression: 'attribute_exists(pk)', ExpressionAttributeValues: { ':yes': true } }));
    await ddb.send(new UpdateCommand({ TableName: table(), Key: { pk: pk(owner), sk: source.sk }, UpdateExpression: 'SET #error = :error', ExpressionAttributeNames: { '#error': 'error' }, ExpressionAttributeValues: { ':error': (error as Error).name === 'GoogleAuthorizationError' ? 'Reconnect this Google account.' : 'Calendar refresh failed. Your saved copy is available.' } }));
    throw error;
  } finally {
    await ddb.send(new UpdateCommand({ TableName: table(), Key: { pk: pk(owner), sk: source.sk }, UpdateExpression: 'REMOVE lockUntil, lockOwner', ConditionExpression: 'lockOwner = :lock', ExpressionAttributeValues: { ':lock': lock } }));
  }
}
async function daily() {
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(new QueryCommand({ TableName: table(), IndexName: 'by-integration', KeyConditionExpression: 'integration = :integration', ExpressionAttributeValues: { ':integration': 'google-account' }, ExclusiveStartKey: cursor }));
    for (const account of page.Items ?? []) { const owner = account.pk.slice(5); for (const source of await items<GoogleSource>(owner, 'GCALSOURCE#')) if (source.accountId === account.sk.slice(12) && source.enabled) await enqueueCalendar(owner, source.id); }
    cursor = page.LastEvaluatedKey;
  } while (cursor);
}
export async function handler(event: SQSEvent | { daily: true }, context?: Context): Promise<SQSBatchResponse | void> {
  const config = await googleConfig(); if (!config) return 'Records' in event ? { batchItemFailures: [] } : undefined;
  if (!('Records' in event)) return daily();
  const failures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) try { const { owner, sourceId } = JSON.parse(record.body); if (typeof owner !== 'string' || typeof sourceId !== 'string') throw new Error('Invalid job'); await synchronize(owner, sourceId, config, () => context?.getRemainingTimeInMillis() ?? Infinity); }
  catch (error) { if ((error as Error).name === 'AccountDeleted') continue; console.error('google_calendar_sync_failed', { name: (error as Error).name }); failures.push({ itemIdentifier: record.messageId }); }
  return { batchItemFailures: failures };
}
