import { beforeEach, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
const fixture = vi.hoisted(() => ({ items: new Map<string, any>(), identities: [] as any[], claims: {} as any, unauthorized: false, calls: [] as any[] }));
vi.mock('./auth', () => ({ authenticate: async () => { if (fixture.unauthorized) throw new Error('Unauthorized'); return { subject: 'owner', username: 'trusted-user' }; } }));
vi.mock('./apple-tokens', () => ({ appleClientSecret: async () => 'client-secret-fixture' }));
vi.mock('aws-jwt-verify', () => ({ JwtVerifier: { create: () => ({ verify: async () => fixture.claims }) } }));
vi.mock('@aws-sdk/client-cognito-identity-provider', async original => ({ ...await original<any>(), CognitoIdentityProviderClient: class { async send(command: any) { fixture.calls.push(command.input); return { UserAttributes: [{ Name: 'identities', Value: JSON.stringify(fixture.identities) }] }; } } }));
vi.mock('./store', () => ({ ddb: { async send(command: any) {
  const input = command.input, key = (row: any) => `${row.pk}|${row.sk}`;
  if (command.constructor.name === 'GetCommand') return { Item: fixture.items.get(key(input.Key)) };
  if (command.constructor.name === 'DeleteCommand') { const Attributes = fixture.items.get(key(input.Key)); fixture.items.delete(key(input.Key)); return { Attributes }; }
  if (command.constructor.name === 'TransactWriteCommand') {
    for (const part of input.TransactItems) if (part.ConditionCheck && fixture.items.has(key(part.ConditionCheck.Key))) throw new Error('Deleted account');
    for (const part of input.TransactItems) if (part.Put) fixture.items.set(key(part.Put.Item), part.Put.Item);
    return {};
  }
  throw new Error(command.constructor.name);
} } }));
import { handler } from './apple-deletion';
const event = (path: string, body: string) => ({ rawPath: path, body, headers: {}, requestContext: { http: { method: 'POST' } } } as APIGatewayProxyEventV2);
const prepare = (patch = {}) => handler(event('/account/apple/prepare', JSON.stringify({ confirmation: 'DELETE', state: 'c'.repeat(43), returnTo: 'https://bloxplox.com/settings', ...patch })));
const start = async () => { const result = await prepare(); const url = new URL(JSON.parse(result.body).url); const pending = [...fixture.items.values()].find(row => row.sk === 'STATE'); return { url, pending }; };
const callback = (state: string, patch = {}) => handler(event('/account/apple/callback', new URLSearchParams({ state, code: 'code-fixture', ...patch }).toString()));
beforeEach(() => {
  fixture.items.clear(); fixture.calls = []; fixture.identities = [{ providerName: 'SignInWithApple', userId: 'apple-user' }]; fixture.claims = {}; fixture.unauthorized = false;
  process.env.APPLE_CLIENT_ID = 'com.bloxplox.signin'; process.env.API_URL = 'https://api.bloxplox.com'; process.env.PRODUCTION_ORIGIN = 'https://bloxplox.com'; process.env.USER_POOL_ID = 'pool';
  vi.unstubAllGlobals();
});
it('uses the authenticated account and trusted provider identity; rejects invalid returns and absent confirmation', async () => {
  expect((await prepare({ returnTo: 'https://attacker.invalid/settings' })).statusCode).toBe(400);
  expect((await prepare({ confirmation: 'no' })).statusCode).toBe(400);
  expect((await handler(event('/account/apple/prepare', 'null'))).statusCode).toBe(400);
  fixture.unauthorized = true; expect((await prepare()).statusCode).toBe(401); fixture.unauthorized = false;
  const { url, pending } = await start();
  expect(fixture.calls).toEqual([{ UserPoolId: 'pool', Username: 'trusted-user' }]);
  expect(pending).toMatchObject({ owner: 'owner', appleUserId: 'apple-user' });
  expect(url.searchParams.get('redirect_uri')).toBe('https://api.bloxplox.com/account/apple/callback');
  expect(url.searchParams.get('nonce')).toBe(pending.nonce);
  expect(pending.pk).not.toContain(url.searchParams.get('state'));
});
it('leaves non-Apple accounts unchanged and reuses securely captured tokens', async () => {
  fixture.identities = []; expect(JSON.parse((await prepare()).body)).toEqual({ url: null });
  fixture.identities = [{ providerName: 'SignInWithApple', userId: 'apple-user' }];
  fixture.items.set('USER#owner|APPLEAUTH#revocation', { appleUserId: 'apple-user', refreshToken: 'fixture' });
  expect(JSON.parse((await prepare()).body)).toEqual({ url: null });
});
it('captures a token only after subject and nonce verification, consumes state once, and never deletes from a callback', async () => {
  const { url, pending } = await start(); fixture.claims = { sub: 'apple-user', nonce: pending.nonce };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ id_token: 'id-fixture', refresh_token: 'refresh-fixture' }) })));
  const response = await callback(url.searchParams.get('state')!);
  expect(response.statusCode).toBe(303); expect(response.headers).toMatchObject({ location: `https://bloxplox.com/settings?appleDelete=ready&state=${'c'.repeat(43)}` });
  expect(fixture.items.get('USER#owner|APPLEAUTH#revocation')).toMatchObject({ appleUserId: 'apple-user', refreshToken: 'refresh-fixture' });
  expect([...fixture.items.keys()]).toEqual(['USER#owner|APPLEAUTH#revocation']);
  expect((await callback(url.searchParams.get('state')!)).statusCode).toBe(400);
});
it('rejects another Apple account, wrong nonce, expiry and deletion races; cancellation needs no token exchange', async () => {
  const fetch_ = vi.fn(async () => ({ ok: true, json: async () => ({ id_token: 'id-fixture', refresh_token: 'refresh-fixture' }) })); vi.stubGlobal('fetch', fetch_);
  for (const reason of ['subject', 'nonce', 'expired', 'deleted', 'cancelled']) {
    fixture.items.clear(); const { url, pending } = await start(); fixture.claims = { sub: reason === 'subject' ? 'other-user' : 'apple-user', nonce: reason === 'nonce' ? 'wrong' : pending.nonce };
    if (reason === 'expired') pending.expires = 0;
    if (reason === 'deleted') fixture.items.set('DELETED#owner|ACCOUNT', {});
    fetch_.mockClear();
    const response = await callback(url.searchParams.get('state')!, reason === 'cancelled' ? { error: 'access_denied' } : {});
    expect(fixture.items.has('USER#owner|APPLEAUTH#revocation')).toBe(false);
    if (reason === 'expired') expect(response.statusCode).toBe(400);
    else expect(response.headers).toMatchObject({ location: expect.stringContaining(reason === 'cancelled' ? 'appleDelete=cancelled' : 'appleDelete=failed') });
    if (['expired', 'cancelled'].includes(reason)) expect(fetch_).not.toHaveBeenCalled();
  }
});
