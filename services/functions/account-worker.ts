import { BatchWriteCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { Context, SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { ddb } from './store';
import { deletionKey } from './account-state';
import { revokeAppleToken } from './apple-tokens';

const cognito = new CognitoIdentityProviderClient({}), queue = new SQSClient({});
type Job = { subject: string; phase?: 'revoke' | 'external' | 'connections' | 'records'; cursor?: Record<string, unknown> };
async function removeRows(table: string, rows: Record<string, any>[], key: (row: Record<string, any>) => Record<string, any>) {
  for (let start = 0; start < rows.length; start += 25) {
    let requests = rows.slice(start, start + 25).map(row => ({ DeleteRequest: { Key: key(row) } }));
    for (let attempt = 0; requests.length; attempt++) {
      if (attempt === 8) throw new Error('Deletion throttled');
      const result = await ddb.send(new BatchWriteCommand({ RequestItems: { [table]: requests } }));
      requests = result.UnprocessedItems?.[table] as typeof requests ?? [];
      if (requests.length) await new Promise(resolve => setTimeout(resolve, Math.min(2000, 50 * 2 ** attempt)));
    }
  }
}
async function clean(job: Job, remaining: () => number) {
  const table = process.env.DATA_TABLE!, connections = process.env.CONNECTION_TABLE!, Key = deletionKey(job.subject);
  const marker = (await ddb.send(new GetCommand({ TableName: table, Key, ConsistentRead: true }))).Item;
  if (!marker || marker.state === 'complete') return;
  // Every API invocation is <=29s and calendar work <=120s. Let any request
  // admitted before the marker finish before sweeping, including GSI lag.
  if (Date.now() - marker.requestedAt < 180000) {
    await queue.send(new SendMessageCommand({ QueueUrl: process.env.DELETION_QUEUE_URL!, MessageBody: JSON.stringify(job), DelaySeconds: Math.ceil((180000 - (Date.now() - marker.requestedAt)) / 1000) })); return;
  }
  const continueLater = async (phase: Job['phase'], cursor?: Job['cursor']) => queue.send(new SendMessageCommand({ QueueUrl: process.env.DELETION_QUEUE_URL!, MessageBody: JSON.stringify({ subject: job.subject, phase, cursor }) }));
  if (!job.phase || job.phase === 'revoke') {
    const apple = (await ddb.send(new GetCommand({ TableName: table, Key: { pk: `USER#${job.subject}`, sk: 'APPLEAUTH#revocation' }, ConsistentRead: true }))).Item;
    if (apple?.refreshToken) await revokeAppleToken(apple.refreshToken);
    let cursor = job.phase === 'revoke' ? job.cursor : undefined;
    do {
      if (remaining() < 25000) { await continueLater('revoke', cursor); return; }
      const page = await ddb.send(new QueryCommand({ TableName: table, ConsistentRead: true, KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)', ExpressionAttributeValues: { ':pk': `USER#${job.subject}`, ':prefix': 'GCALACCOUNT#' }, Limit: 1, ExclusiveStartKey: cursor }));
      for (const account of page.Items ?? []) {
        // Google returns 400 for an already-revoked token. Network/5xx failures
        // retry the job; tokens are not discarded until revocation completes.
        const response = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: account.refreshToken }), signal: AbortSignal.timeout(10000) });
        if (!response.ok && response.status !== 400) throw new Error('Google revocation unavailable');
      }
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    try { await cognito.send(new AdminDeleteUserCommand({ UserPoolId: process.env.USER_POOL_ID!, Username: marker.username })); }
    catch (error) { if ((error as Error).name !== 'UserNotFoundException') throw error; }
  }
  // Rare, paginated account cleanup also covers legacy watch/state records
  // created before an owner index existed. Project only keys, never other data.
  for (const phase of ['external', 'connections', 'records'] as const) {
    if (job.phase && ['external', 'connections', 'records'].indexOf(phase) < ['external', 'connections', 'records'].indexOf(job.phase)) continue;
    let cursor = job.phase === phase ? job.cursor : undefined;
    do {
      if (remaining() < 15000) { await continueLater(phase, cursor); return; }
      const page = phase === 'records'
        ? await ddb.send(new QueryCommand({ TableName: table, ConsistentRead: true, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': `USER#${job.subject}` }, ProjectionExpression: 'pk, sk', Limit: 100, ExclusiveStartKey: cursor }))
        : await ddb.send(new ScanCommand({ TableName: phase === 'external' ? table : connections, ConsistentRead: true, FilterExpression: phase === 'external' ? '#owner = :owner AND (begins_with(pk, :watch) OR begins_with(pk, :oauth) OR begins_with(pk, :apple))' : 'userId = :owner', ...(phase === 'external' ? { ExpressionAttributeNames: { '#owner': 'owner' } } : {}), ExpressionAttributeValues: { ':owner': job.subject, ...(phase === 'external' ? { ':watch': 'GOOGLEWATCH#', ':oauth': 'GOOGLESTATE#', ':apple': 'APPLEDELETE#' } : {}) }, ProjectionExpression: phase === 'external' ? 'pk, sk' : 'connectionId', ExclusiveStartKey: cursor }));
      await removeRows(phase === 'connections' ? connections : table, page.Items ?? [], row => phase === 'connections' ? { connectionId: row.connectionId } : { pk: row.pk, sk: row.sk });
      cursor = page.LastEvaluatedKey;
    } while (cursor);
  }
  // Retain only the random account ID and deletion receipt for backup restore
  // safety. No email, username, Google IDs, tokens or planner data remain.
  await ddb.send(new UpdateCommand({ TableName: table, Key, UpdateExpression: 'SET #state = :complete, completedAt = :now REMOVE username', ExpressionAttributeNames: { '#state': 'state' }, ExpressionAttributeValues: { ':complete': 'complete', ':now': Date.now() } }));
}
export async function handler(event: SQSEvent, context?: Context): Promise<SQSBatchResponse> {
  const failures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) try {
    const job: Job = JSON.parse(record.body);
    if (!/^[a-f0-9-]{36}$/.test(job.subject) || job.phase && !['revoke', 'external', 'connections', 'records'].includes(job.phase)) throw new Error('Invalid deletion job');
    await clean(job, () => context?.getRemainingTimeInMillis() ?? Infinity);
  } catch (error) { console.error('account_deletion_failed', { name: (error as Error).name }); failures.push({ itemIdentifier: record.messageId }); }
  return { batchItemFailures: failures };
}
