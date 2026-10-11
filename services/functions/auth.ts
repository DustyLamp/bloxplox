import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

let verifier: ReturnType<typeof CognitoJwtVerifier.create>;
export async function authenticate(event: APIGatewayProxyEventV2) {
  verifier ??= CognitoJwtVerifier.create({ userPoolId: process.env.USER_POOL_ID!, clientId: process.env.USER_POOL_CLIENT_ID!, tokenUse: 'access' });
  const header = event.headers.authorization ?? event.headers.Authorization ?? '';
  if (!header.startsWith('Bearer ')) throw new Error('Unauthorized');
  try {
    const claims = await verifier.verify(header.slice(7));
    return { subject: claims.sub, expires: claims.exp };
  } catch { throw new Error('Unauthorized'); }
}
