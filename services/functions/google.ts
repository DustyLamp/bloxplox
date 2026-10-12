import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { dateSchema, type CalendarSource } from '../../packages/domain/src/index';
import { authenticate } from './auth';
import { ddb } from './store';
import { exchangeGoogle, googleConfig, googleFetch, googleScopes } from './google-config';
import { enqueueCalendar, googleToken, item, items, pk, removeSource, saveImported, stableId, table, type GoogleAccount, type GoogleSource } from './google-store';
const json = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const redirect = (platform: string, result: string) => ({ statusCode: 302, headers: { location: platform === 'native' ? `bloxplox://calendars?${result}` : `${process.env.PRODUCTION_ORIGIN}/calendars?${result}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, body: '' });
type GoogleList = { items?: { id: string; summary?: string; backgroundColor?: string; timeZone?: string; accessRole?: string; deleted?: boolean }[]; nextPageToken?: string };
async function updateCalendars(owner: string, account: GoogleAccount) {
  const config = await googleConfig(); if (!config) throw new Error('Google Calendar is not configured');
  const token = await googleToken(owner, account, config); let pageToken: string | undefined;
  const seen = new Set<string>();
  do {
    const response: GoogleList = await googleFetch(`https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&fields=nextPageToken,items(id,summary,backgroundColor,timeZone,accessRole,deleted)${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, token);
    for (const calendar of response.items ?? []) {
      if (calendar.deleted || calendar.accessRole === 'freeBusyReader') continue;
      const id = stableId('calendar', account.id, calendar.id), previous = await item<GoogleSource>(owner, `GCALSOURCE#${id}`); seen.add(id);
      const source: GoogleSource = { pk: pk(owner), sk: `GCALSOURCE#${id}`, id, accountId: account.id, calendarId: calendar.id, enabled: previous?.enabled ?? false };
      // Refresh display metadata without overwriting a running worker's locks/checkpoint.
      if (!previous) {
        try { await ddb.send(new PutCommand({ TableName: table(), Item: source, ConditionExpression: 'attribute_not_exists(pk)' })); }
        catch (error) { if ((error as Error).name !== 'ConditionalCheckFailedException') throw error; }
      }
      // Discovery changes metadata, never a selection made on another device.
      // The initial selection is applied only if the replicated record is absent,
      // including after a conditional-write conflict and retry.
      await saveImported(owner, id, 'calendarSource', { name: (calendar.summary || 'Calendar').slice(0, 120), color: /^#[0-9a-f]{6}$/i.test(calendar.backgroundColor || '') ? calendar.backgroundColor! : '#70b4ff', accountId: account.id, accountEmail: account.email, timezone: calendar.timeZone || 'UTC' }, false, { enabled: source.enabled });
    }
    pageToken = response.nextPageToken;
  } while (pageToken);
  for (const source of await items<GoogleSource>(owner, 'GCALSOURCE#')) if (source.accountId === account.id && !seen.has(source.id)) await removeSource(owner, source);
}
export async function handler(event: APIGatewayProxyEventV2) {
  let callbackPlatform = 'web';
  try {
    if (event.rawPath === '/calendars/google/notifications') {
      const channel = event.headers['x-goog-channel-id'], token = event.headers['x-goog-channel-token'];
      if (!channel || !token) return json(403, { error: 'Invalid channel' });
      const watch = (await ddb.send(new GetCommand({ TableName: table(), Key: { pk: `GOOGLEWATCH#${channel}`, sk: 'WATCH' } }))).Item;
      const supplied = Buffer.from(token), expected = Buffer.from(watch?.token ?? '');
      if (!watch || watch.expires <= Date.now() / 1000 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || watch.resourceId && watch.resourceId !== event.headers['x-goog-resource-id']) return json(403, { error: 'Invalid channel' });
      await enqueueCalendar(watch.owner, watch.sourceId); return json(200, {});
    }
    if (event.rawPath === '/calendars/google/callback') {
      const state = event.queryStringParameters?.state;
      if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) return json(400, { error: 'Invalid calendar connection' });
      const record = (await ddb.send(new DeleteCommand({ TableName: table(), Key: { pk: `GOOGLESTATE#${createHash('sha256').update(state).digest('hex')}`, sk: 'STATE' }, ConditionExpression: 'expires > :now', ExpressionAttributeValues: { ':now': Math.floor(Date.now() / 1000) }, ReturnValues: 'ALL_OLD' }))).Attributes;
      if (!record) return json(400, { error: 'Calendar connection expired' });
      callbackPlatform = record.platform;
      if (event.queryStringParameters?.error) return redirect(callbackPlatform, 'calendar=cancelled');
      const code = event.queryStringParameters?.code, config = await googleConfig();
      if (!code || !config) return redirect(callbackPlatform, 'calendar=failed');
      const tokens = await exchangeGoogle(config, { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: record.verifier });
      if (!tokens.scope?.includes('https://www.googleapis.com/auth/calendar.events.readonly') || !tokens.scope.includes('https://www.googleapis.com/auth/calendar.calendarlist.readonly')) return redirect(callbackPlatform, 'calendar=permissions');
      const identity = await googleFetch<{ sub: string; email: string; email_verified: boolean }>('https://openidconnect.googleapis.com/v1/userinfo', tokens.access_token);
      if (!identity.sub || !identity.email_verified) throw new Error('Google email was not verified');
      const id = stableId('google', identity.sub), previous = await item<GoogleAccount>(record.owner, `GCALACCOUNT#${id}`), refreshToken = tokens.refresh_token || previous?.refreshToken;
      if (!refreshToken) return redirect(callbackPlatform, 'calendar=reconnect');
      const account: GoogleAccount = { pk: pk(record.owner), sk: `GCALACCOUNT#${id}`, id, email: identity.email, refreshToken, accessToken: tokens.access_token, tokenExpires: Date.now() + tokens.expires_in * 1000 };
      await ddb.send(new PutCommand({ TableName: table(), Item: { ...account, integration: 'google-account', integrationKey: `${record.owner}:${id}` } }));
      await updateCalendars(record.owner, account);
      return redirect(callbackPlatform, 'calendar=connected');
    }
    const { subject: owner } = await authenticate(event), config = await googleConfig();
    const input = event.body ? JSON.parse(event.body) : {};
    if (event.rawPath === '/calendars/status') {
      const accounts = await items<GoogleAccount>(owner, 'GCALACCOUNT#'), sources = await items<GoogleSource>(owner, 'GCALSOURCE#');
      return json(200, { enabled: !!config, accounts: accounts.map(a => ({ id: a.id, email: a.email, needsReconnect: !!a.needsReconnect })), sources: sources.map(s => ({ id: s.id, accountId: s.accountId, enabled: s.enabled, lastSynced: s.lastSynced ?? null, error: s.error ?? null })) });
    }
    if (!config) return json(503, { error: 'Google Calendar connections are not open yet.' });
    if (event.rawPath === '/calendars/connect') {
      const { platform } = z.object({ platform: z.enum(['web', 'native']) }).strict().parse(input), state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
      await ddb.send(new PutCommand({ TableName: table(), Item: { pk: `GOOGLESTATE#${createHash('sha256').update(state).digest('hex')}`, sk: 'STATE', owner, platform, verifier, expires: Math.floor(Date.now() / 1000) + 600 } }));
      const parameters = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: googleScopes.join(' '), state, access_type: 'offline', prompt: 'consent select_account', code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
      return json(200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${parameters}` });
    }
    if (event.rawPath === '/calendars/select') {
      const { id, enabled, date } = z.object({ id: z.string(), enabled: z.boolean(), date: dateSchema }).strict().parse(input), source = await item<GoogleSource>(owner, `GCALSOURCE#${id}`);
      if (!source || !await item(owner, `GCALACCOUNT#${source.accountId}`)) return json(404, { error: 'Calendar not found' });
      await ddb.send(new UpdateCommand({ TableName: table(), Key: { pk: pk(owner), sk: source.sk }, UpdateExpression: 'SET enabled = :enabled, windowDate = :date', ExpressionAttributeValues: { ':enabled': enabled, ':date': date } }));
      await saveImported(owner, source.id, 'calendarSource', { enabled });
      if (enabled) await enqueueCalendar(owner, id);
      return json(200, {});
    }
    if (event.rawPath === '/calendars/refresh') {
      const { date, discover } = z.object({ date: dateSchema, discover: z.boolean().optional() }).strict().parse(input);
      if (discover) for (const account of await items<GoogleAccount>(owner, 'GCALACCOUNT#')) await updateCalendars(owner, account);
      for (const source of await items<GoogleSource>(owner, 'GCALSOURCE#')) if (source.enabled) {
        if (source.windowDate === date && source.lastSynced && Date.parse(source.lastSynced) > Date.now() - 60000) continue;
        await ddb.send(new UpdateCommand({ TableName: table(), Key: { pk: pk(owner), sk: source.sk }, UpdateExpression: 'SET windowDate = :date', ExpressionAttributeValues: { ':date': date } }));
        await enqueueCalendar(owner, source.id);
      }
      return json(202, {});
    }
    if (event.rawPath === '/calendars/disconnect') {
      const { accountId } = z.object({ accountId: z.string() }).strict().parse(input), account = await item<GoogleAccount>(owner, `GCALACCOUNT#${accountId}`);
      if (!account) return json(404, { error: 'Google account not found' });
      for (const source of await items<GoogleSource>(owner, 'GCALSOURCE#')) if (source.accountId === accountId) await removeSource(owner, source);
      // Revocation is best effort: local access is removed even if Google is unavailable.
      await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: account.refreshToken }), signal: AbortSignal.timeout(10000) }).catch(() => {});
      await ddb.send(new DeleteCommand({ TableName: table(), Key: { pk: pk(owner), sk: account.sk } }));
      return json(200, {});
    }
    return json(404, { error: 'Not found' });
  } catch (error) {
    if (event.rawPath === '/calendars/google/callback') return redirect(callbackPlatform, 'calendar=failed');
    if ((error as Error).message === 'Unauthorized') return json(401, { error: 'Sign in again' });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json(400, { error: 'Invalid calendar request' });
    console.error('google_calendar_request_failed', { requestId: event.requestContext.requestId, name: (error as Error).name });
    return json(503, { error: 'Google Calendar is unavailable. Try again.' });
  }
}
