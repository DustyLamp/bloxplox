import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
const state = vi.hoisted(() => ({ values: new Map<string, any>(), queued: [] as any[], saved: [] as any[], enabled: true, calls: [] as string[] }));
const key = (owner: string, sk: string) => JSON.stringify({ pk: `USER#${owner}`, sk });
vi.mock('./store', () => ({ ddb: { send: async (command: any) => { const input = command.input, key = JSON.stringify(input.Key ?? { pk: input.Item.pk, sk: input.Item.sk }), current = state.values.get(key); if (command.constructor.name === 'GetCommand') return { Item: current }; if (command.constructor.name === 'PutCommand') { state.values.set(key,input.Item); return {}; } if (command.constructor.name === 'DeleteCommand') { if (input.ConditionExpression && (!current || current.expires <= input.ExpressionAttributeValues[':now'])) throw new Error('Expired state'); state.values.delete(key); return { Attributes: current }; } return {}; } } }));
vi.mock('./auth', () => ({ authenticate: async (event: any) => { if (!event.headers.authorization) throw new Error('Unauthorized'); return {subject:event.headers.authorization}; } }));
vi.mock('./google-config', () => ({ googleConfig: async () => state.enabled ? { clientId:'fixture.apps.googleusercontent.com',clientSecret:'secret',redirectUri:'https://api.example.com/calendars/google/callback' } : null, googleScopes: ['openid','email','https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly'],
  exchangeGoogle: async () => ({access_token:'access',refresh_token:'refresh',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly'}),
  googleFetch: async (url: string) => { state.calls.push(url); if (url.includes('userinfo')) return {sub:'google-sub',email:'google@example.com',email_verified:true}; return {items:[]}; }
}));
vi.mock('./google-store', () => ({ table: () => 'test', pk: (owner: string) => `USER#${owner}`, stableId: (...parts: string[]) => parts.join(':'), googleToken: async () => 'access', item: async (owner: string, sk: string) => state.values.get(JSON.stringify({pk:`USER#${owner}`,sk})), items: async (owner: string, prefix: string) => [...state.values.values()].filter(v => v.pk === `USER#${owner}` && v.sk.startsWith(prefix)), enqueueCalendar: async (owner: string, id: string) => { state.queued.push({owner,id}); }, saveImported: async (...args: any[]) => { state.saved.push(args); }, removeSource: async () => {} }));
import { handler } from './google';
const event = (path: string, owner = 'a', body = {}): APIGatewayProxyEventV2 => ({rawPath:`/calendars/${path}`,body:JSON.stringify(body),headers:owner?{authorization:owner}:{},requestContext:{requestId:'test'}} as unknown as APIGatewayProxyEventV2);
beforeEach(() => { state.values.clear(); state.saved=[]; state.queued=[]; state.calls=[]; state.enabled=true; process.env.PRODUCTION_ORIGIN='https://bloxplox.com'; });
it('isolates connections by authenticated account and never returns OAuth credentials to clients', async () => {
  state.values.set(key('a','GCALACCOUNT#google'),{pk:'USER#a',sk:'GCALACCOUNT#google',id:'google',email:'google@example.com',accessToken:'private-access',refreshToken:'private-refresh'});
  state.values.set(key('a','GCALSOURCE#calendar'),{pk:'USER#a',sk:'GCALSOURCE#calendar',id:'calendar',accountId:'google',enabled:true});
  expect((await handler(event('status',''))).statusCode).toBe(401);
  const status = await handler(event('status')); expect(status.body).not.toContain('private-'); expect(JSON.parse(status.body).accounts).toHaveLength(1);
  expect(JSON.parse((await handler(event('status','b'))).body).accounts).toEqual([]);
  expect((await handler(event('select','b',{id:'calendar',enabled:true,date:'2026-10-12'}))).statusCode).toBe(404);
  expect((await handler(event('disconnect','b',{accountId:'google'}))).statusCode).toBe(404); expect(state.queued).toEqual([]);
});
it('binds one-use callback state and PKCE to the signed-in BloxPlox account, including mobile redirects', async () => {
  const response = await handler(event('connect','owner',{platform:'native'})), url = new URL(JSON.parse(response.body).url), oauthState = url.searchParams.get('state')!;
  expect(url.hostname).toBe('accounts.google.com'); expect(url.searchParams.get('scope')).not.toContain('calendar.events ');
  const stored = state.values.get(JSON.stringify({pk:`GOOGLESTATE#${createHash('sha256').update(oauthState).digest('hex')}`,sk:'STATE'}));
  expect(stored.owner).toBe('owner'); expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(stored.verifier).digest('base64url'));
  const callback = {...event('google/callback',''),queryStringParameters:{state:oauthState,code:'code'}};
  const complete = await handler(callback); expect(complete.headers).toMatchObject({location:'bloxplox://calendars?calendar=connected'});
  expect(state.values.get(key('owner','GCALACCOUNT#google:google-sub')).refreshToken).toBe('refresh');
  expect((await handler(callback)).headers).toMatchObject({location:'https://bloxplox.com/calendars?calendar=failed'});
  expect(state.calls.filter(c => c.includes('userinfo'))).toHaveLength(1);
});
it('accepts Google watch messages only with the current unpredictable channel secret and resource', async () => {
  state.values.set(JSON.stringify({pk:'GOOGLEWATCH#channel',sk:'WATCH'}),{owner:'a',sourceId:'calendar',token:'secret-token',resourceId:'resource',expires:Date.now()/1000+3600});
  const notification = {...event('google/notifications',''),headers:{'x-goog-channel-id':'channel','x-goog-channel-token':'wrong','x-goog-resource-id':'resource'}};
  expect((await handler(notification)).statusCode).toBe(403);
  notification.headers['x-goog-channel-token']='secret-token'; notification.headers['x-goog-resource-id']='other'; expect((await handler(notification)).statusCode).toBe(403);
  notification.headers['x-goog-resource-id']='resource'; expect((await handler(notification)).statusCode).toBe(200); expect(state.queued).toEqual([{owner:'a',id:'calendar'}]);
});
it('keeps existing calendar data usable while setup is unavailable', async () => {
  state.enabled=false; expect(JSON.parse((await handler(event('status'))).body).enabled).toBe(false); expect((await handler(event('connect','a',{platform:'web'}))).statusCode).toBe(503);
});
