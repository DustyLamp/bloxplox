import { sign } from 'node:crypto';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
const secrets = new SecretsManagerClient({});
let cached: { key: string; until: number } | undefined;
export async function appleClientSecret() {
  if (!cached || cached.until < Date.now()) {
    const result = await secrets.send(new GetSecretValueCommand({ SecretId: 'bloxplox/apple-signin' }));
    const key = JSON.parse(result.SecretString ?? '{}').privateKey;
    if (typeof key !== 'string' || !key.includes('BEGIN PRIVATE KEY')) throw new Error('Apple credentials unavailable');
    cached = { key, until: Date.now() + 300000 };
  }
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })}.${encode({ iss: process.env.APPLE_TEAM_ID, sub: process.env.APPLE_CLIENT_ID, aud: 'https://appleid.apple.com', iat: now, exp: now + 300 })}`;
  return `${input}.${sign('sha256', Buffer.from(input), { key: cached.key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
export async function revokeAppleToken(token: string) {
  const result = await fetch('https://appleid.apple.com/auth/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.APPLE_CLIENT_ID!, client_secret: await appleClientSecret(), token, token_type_hint: 'refresh_token' }), signal: AbortSignal.timeout(10000) });
  if (!result.ok) throw new Error('Apple revocation unavailable');
}
