import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { assertAccountActive } from './account-state';

let verifier: ReturnType<typeof CognitoJwtVerifier.create>;
export async function authenticate(event: APIGatewayProxyEventV2, allowDeleted = false) {
  verifier ??= CognitoJwtVerifier.create({ userPoolId: process.env.USER_POOL_ID!, clientId: process.env.USER_POOL_CLIENT_ID!, tokenUse: 'access' });
  const header = event.headers.authorization ?? event.headers.Authorization ?? '';
  if (!header.startsWith('Bearer ')) throw new Error('Unauthorized');
  const claims = await verifier.verify(header.slice(7)).catch(() => { throw new Error('Unauthorized'); });
  if (!allowDeleted) await assertAccountActive(claims.sub);
  return { subject: claims.sub, expires: claims.exp, username: claims.username };
}
