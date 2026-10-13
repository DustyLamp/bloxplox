import { randomBytes, createHash } from 'node:crypto';
import { AdminGetUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DeleteCommand, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { JwtVerifier } from 'aws-jwt-verify';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { authenticate } from './auth';
import { AccountDeleted, assertAccountActive, deletionKey } from './account-state';
import { ddb } from './store';
import { appleClientSecret } from './apple-tokens';

const cognito = new CognitoIdentityProviderClient({});
let verifier: ReturnType<typeof JwtVerifier.create>;
const json = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const random = () => randomBytes(32).toString('base64url');
const stateKey = (state: string) => ({ pk: `APPLEDELETE#${createHash('sha256').update(state).digest('hex')}`, sk: 'STATE' });
const callbackUrl = () => `${process.env.API_URL}/account/apple/callback`;
const returnUrls = () => [`${process.env.PRODUCTION_ORIGIN}/settings`, `https://www.bloxplox.com/settings`, 'bloxplox://account-delete'];
const redirect = (record: Record<string, any>, outcome: string) => {
  if (!returnUrls().includes(record.returnTo)) return json(400, { error: 'Invalid return address.' });
  const url = new URL(record.returnTo); url.search = new URLSearchParams({ appleDelete: outcome, state: record.clientState }).toString();
  return { statusCode: 303, headers: { location: url.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, body: '' };
};
export async function handler(event: APIGatewayProxyEventV2) {
  let pending: Record<string, any> | undefined;
  try {
    if (event.requestContext.http.method !== 'POST') return json(404, {});
    if (event.rawPath === '/account/apple/prepare') {
      const user = await authenticate(event);
      if (!process.env.APPLE_CLIENT_ID) return json(200, { url: null });
      if (event.isBase64Encoded || !event.body || event.body.length > 1000) return json(400, { error: 'Invalid deletion request.' });
      let body: Record<string, unknown>;
      try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid deletion request.' }); }
      if (!body || body.confirmation !== 'DELETE' || typeof body.returnTo !== 'string' || !returnUrls().includes(body.returnTo) || typeof body.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.state)) return json(400, { error: 'Invalid deletion request.' });
      const current = await cognito.send(new AdminGetUserCommand({ UserPoolId: process.env.USER_POOL_ID!, Username: user.username }));
      const identities = JSON.parse(current.UserAttributes?.find(attribute => attribute.Name === 'identities')?.Value ?? '[]') as { providerName: string; userId: string }[];
      const apple = identities.find(identity => identity.providerName === 'SignInWithApple');
      if (!apple) return json(200, { url: null });
      const stored = await ddb.send(new GetCommand({ TableName: process.env.DATA_TABLE!, Key: { pk: `USER#${user.subject}`, sk: 'APPLEAUTH#revocation' }, ConsistentRead: true }));
      if (stored.Item?.appleUserId === apple.userId && stored.Item?.refreshToken) return json(200, { url: null });
      const state = random(), nonce = random();
      await ddb.send(new TransactWriteCommand({ TransactItems: [
        { ConditionCheck: { TableName: process.env.DATA_TABLE!, Key: deletionKey(user.subject), ConditionExpression: 'attribute_not_exists(pk)' } },
        { Put: { TableName: process.env.DATA_TABLE!, Item: { ...stateKey(state), owner: user.subject, appleUserId: apple.userId, nonce, clientState: body.state, returnTo: body.returnTo, expires: Math.floor(Date.now() / 1000) + 600 }, ConditionExpression: 'attribute_not_exists(pk)' } },
      ] }));
      const url = new URL('https://appleid.apple.com/auth/authorize');
      url.search = new URLSearchParams({ client_id: process.env.APPLE_CLIENT_ID!, redirect_uri: callbackUrl(), response_type: 'code', response_mode: 'form_post', scope: 'email', state, nonce }).toString();
      return json(200, { url: url.href });
    }
    if (event.rawPath !== '/account/apple/callback') return json(404, {});
    if (!event.body || event.body.length > 20000) return json(400, { error: 'Invalid Apple response.' });
    const body = new URLSearchParams(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
    const state = body.get('state') ?? '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return json(400, { error: 'Invalid Apple response.' });
    pending = (await ddb.send(new DeleteCommand({ TableName: process.env.DATA_TABLE!, Key: stateKey(state), ReturnValues: 'ALL_OLD' }))).Attributes;
    if (!pending || pending.expires <= Date.now() / 1000) return json(400, { error: 'This confirmation expired. Return to BloxPlox Settings and try again.' });
    if (body.has('error') || !body.get('code')) return redirect(pending, 'cancelled');
    await assertAccountActive(pending.owner);
    const result = await fetch('https://appleid.apple.com/auth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.APPLE_CLIENT_ID!, client_secret: await appleClientSecret(), code: body.get('code')!, grant_type: 'authorization_code', redirect_uri: callbackUrl() }), signal: AbortSignal.timeout(10000) });
    if (!result.ok) throw new Error('Apple confirmation failed');
    const tokens = await result.json() as { id_token?: string; refresh_token?: string };
    if (!tokens.id_token || !tokens.refresh_token) throw new Error('Incomplete Apple response');
    verifier ??= JwtVerifier.create({ issuer: 'https://appleid.apple.com', audience: process.env.APPLE_CLIENT_ID!, jwksUri: 'https://appleid.apple.com/auth/keys' });
    const claims = await verifier.verify(tokens.id_token);
    if (claims.sub !== pending.appleUserId || claims.nonce !== pending.nonce) throw new Error('Apple identity mismatch');
    await ddb.send(new TransactWriteCommand({ TransactItems: [
      { ConditionCheck: { TableName: process.env.DATA_TABLE!, Key: deletionKey(pending.owner), ConditionExpression: 'attribute_not_exists(pk)' } },
      { Put: { TableName: process.env.DATA_TABLE!, Item: { pk: `USER#${pending.owner}`, sk: 'APPLEAUTH#revocation', appleUserId: pending.appleUserId, refreshToken: tokens.refresh_token } } },
    ] }));
    // The authenticated client confirms deletion after checking its own state.
    // This callback never deletes an account based on a browser URL alone.
    return redirect(pending, 'ready');
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return json(401, { error: 'Sign in again.' });
    if (error instanceof AccountDeleted && !pending) return json(410, { error: 'This account was deleted.' });
    console.error('apple_deletion_confirmation_failed', { name: (error as Error).name });
    return pending ? redirect(pending, 'failed') : json(503, { error: 'Could not connect to Apple. Try again, or delete without Apple confirmation.' });
  }
}
