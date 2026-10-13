import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { authenticate } from './auth';
import { deletionKey } from './account-state';
import { ddb } from './store';

const response = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
export async function handler(event: APIGatewayProxyEventV2) {
  try {
    const user = await authenticate(event, true);
    if (event.requestContext.http.method !== 'POST' || event.rawPath !== '/account/delete') return response(404, {});
    if (event.isBase64Encoded || !event.body || event.body.length > 100 || JSON.parse(event.body).confirmation !== 'DELETE') return response(400, { error: 'Confirm account deletion.' });
    // The durable marker is also the outbox. Streams queues the cleanup even
    // if this request is interrupted immediately after the write succeeds.
    try {
      await ddb.send(new PutCommand({ TableName: process.env.DATA_TABLE!, Item: { ...deletionKey(user.subject), username: user.username, requestedAt: Date.now(), state: 'pending' }, ConditionExpression: 'attribute_not_exists(pk)' }));
    } catch (error) { if ((error as Error).name !== 'ConditionalCheckFailedException') throw error; }
    return response(202, { deleted: true });
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return response(401, { error: 'Sign in again' });
    if (error instanceof SyntaxError) return response(400, { error: 'Confirm account deletion.' });
    console.error('account_deletion_request_failed', { name: (error as Error).name });
    return response(503, { error: 'Could not delete your account. Try again.' });
  }
}
