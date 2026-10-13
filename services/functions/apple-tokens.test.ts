import { generateKeyPairSync, verify } from 'node:crypto';
import { expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ key: '', reads: 0 }));
vi.mock('@aws-sdk/client-secrets-manager', async original => ({ ...await original<any>(), SecretsManagerClient: class { async send() { fixture.reads++; return { SecretString: JSON.stringify({ privateKey: fixture.key }) }; } } }));
import { appleClientSecret, revokeAppleToken } from './apple-tokens';
it('signs short-lived Apple client secrets and retains retryable failures', async () => {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }); fixture.key = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env.APPLE_CLIENT_ID = 'com.bloxplox.signin'; process.env.APPLE_TEAM_ID = 'team-fixture'; process.env.APPLE_KEY_ID = 'key-fixture';
  const jwt = await appleClientSecret(), [header, payload, signature] = jwt.split('.');
  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'key-fixture' });
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()); expect(claims).toMatchObject({ iss: 'team-fixture', sub: 'com.bloxplox.signin', aud: 'https://appleid.apple.com' }); expect(claims.exp - claims.iat).toBe(300);
  expect(verify('sha256', Buffer.from(`${header}.${payload}`), { key: keys.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
  const fetch_ = vi.fn(async () => ({ ok: false, status: 503 })); vi.stubGlobal('fetch', fetch_);
  await expect(revokeAppleToken('refresh-fixture')).rejects.toThrow('revocation unavailable');
  fetch_.mockResolvedValue({ ok: true, status: 200 }); await revokeAppleToken('refresh-fixture');
  const call = fetch_.mock.calls[0] as unknown as [string, RequestInit]; expect(call[0]).toBe('https://appleid.apple.com/auth/revoke'); expect(new URLSearchParams(call[1].body as URLSearchParams).get('token')).toBe('refresh-fixture'); expect(fixture.reads).toBe(1);
  vi.unstubAllGlobals();
});
