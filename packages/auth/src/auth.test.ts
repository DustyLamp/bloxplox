import { beforeEach, expect, it, vi } from 'vitest';
import { AuthService } from './index';
const config = { region: 'eu-north-1', userPoolId: 'eu-north-1_test', userPoolClientId: 'client', apiUrl: '', websocketUrl: '', publicSignup: true, authDomain: 'https://bloxplox.auth.eu-north-1.amazoncognito.com', socialProviders: ['Google' as const] };
let store: Map<string, string>, auth: AuthService;
beforeEach(() => { store = new Map(); auth = new AuthService(config, { isOnline: () => true, signedOut() {}, storage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); }, removeItem: key => { store.delete(key); }, clear: () => store.clear() } }); vi.unstubAllGlobals(); });
const jwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
const start = async () => { const url = new URL(await auth.socialSignIn('Google', 'https://bloxplox.com/auth/callback')); const state = url.searchParams.get('state')!; return { url, state, pending: JSON.parse(store.get(`bloxplox-oauth:${state}`)!) }; };
const tokens = (nonce: string) => ({ id_token: jwt({ nonce, sub: 'stable-sub', email: 'demo@example.com', 'cognito:username': 'local-user', aud: 'client', iss: 'https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_test', token_use: 'id', exp: Date.now() / 1000 + 3600, iat: Date.now() / 1000 }), access_token: jwt({ exp: Date.now() / 1000 + 3600, iat: Date.now() / 1000 }), refresh_token: 'fixture' });
it('uses PKCE, one-use state and nonce; keeps the original account ID for subsequent sessions', async () => {
  const { url, state, pending } = await start();
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).not.toBe(pending.verifier);
  const fetch_ = vi.fn(async () => ({ ok: true, json: async () => tokens(pending.nonce) })); vi.stubGlobal('fetch', fetch_);
  const callback = `https://bloxplox.com/auth/callback?code=code&state=${state}`;
  await auth.finishSocialSignIn(callback);
  expect(fetch_.mock.calls[0]?.length).toBe(2);
  expect(await auth.identity()).toEqual({ subject: 'stable-sub', email: 'demo@example.com' });
  await expect(auth.finishSocialSignIn(callback)).rejects.toThrow('expired');
});
it('rejects cross-origin callbacks, unsolicited callbacks, expiry, cancellation and mismatched nonce', async () => {
  const fetch_ = vi.fn(async () => ({ ok: true, json: async () => tokens('wrong') })); vi.stubGlobal('fetch', fetch_);
  await expect(auth.finishSocialSignIn('https://bloxplox.com/auth/callback?code=x')).rejects.toThrow('expired');
  let flow = await start(); await expect(auth.finishSocialSignIn(`https://attacker.invalid/auth/callback?code=x&state=${flow.state}`)).rejects.toThrow('expired');
  flow = await start(); store.set(`bloxplox-oauth:${flow.state}`, JSON.stringify({ ...flow.pending, expires: 0 })); await expect(auth.finishSocialSignIn(`https://bloxplox.com/auth/callback?code=x&state=${flow.state}`)).rejects.toThrow('expired');
  flow = await start(); await expect(auth.finishSocialSignIn(`https://bloxplox.com/auth/callback?error=denied&state=${flow.state}`)).rejects.toThrow('cancelled');
  expect(fetch_).not.toHaveBeenCalled();
  flow = await start(); await expect(auth.finishSocialSignIn(`https://bloxplox.com/auth/callback?code=x&state=${flow.state}`)).rejects.toThrow('Invalid sign-in');
  expect(auth.pool?.getCurrentUser()).toBeNull();
});
it('opens only the current cached account offline without waiting on token refresh', async () => {
  const flow = await start(); vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => tokens(flow.pending.nonce) })));
  await auth.finishSocialSignIn(`https://bloxplox.com/auth/callback?code=x&state=${flow.state}`);
  await auth.identity(); auth.runtime.isOnline = () => false;
  const session = vi.spyOn(auth, 'session').mockRejectedValue(new Error('Network unavailable'));
  expect(await auth.identity()).toEqual({subject:'stable-sub',email:'demo@example.com'}); expect(session).not.toHaveBeenCalled();
  auth.signOut(); expect(await auth.identity()).toBeNull();
});
it('does not show a previous account cache after an interrupted account switch', async () => {
  const flow = await start(); vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => tokens(flow.pending.nonce) })));
  await auth.finishSocialSignIn(`https://bloxplox.com/auth/callback?code=x&state=${flow.state}`);
  await auth.identity();
  store.set('CognitoIdentityServiceProvider.client.local-user.idToken', jwt({ sub: 'different-sub' }));
  auth.runtime.isOnline = () => false;
  vi.spyOn(auth, 'session').mockRejectedValue(new Error('Network unavailable'));
  expect(await auth.identity()).toBeNull();
});
it('uses native callbacks, cleans up cancellation and replaces abandoned PKCE attempts', async () => {
  const first = await start();
  const url = new URL(await auth.socialSignIn('Google', 'bloxplox://auth'));
  expect(store.has(`bloxplox-oauth:${first.state}`)).toBe(false);
  const state = url.searchParams.get('state')!, pending = JSON.parse(store.get(`bloxplox-oauth:${state}`)!);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => tokens(pending.nonce) })));
  await auth.finishSocialSignIn(`bloxplox://auth?code=native-code&state=${state}`);
  expect(await auth.identity()).toEqual({ subject: 'stable-sub', email: 'demo@example.com' });
  const cancelled = await auth.socialSignIn('Google', 'bloxplox://auth');
  auth.cancelSocialSignIn(cancelled);
  expect([...store.keys()].filter(key => key.startsWith('bloxplox-oauth'))).toEqual([]);
});
