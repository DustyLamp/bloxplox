import { createHash } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { editDocument, sameContent, documentSchema, type DataByKind, type Kind } from '../../packages/domain/src/index';
import { ddb, getDocument, pushDocument } from './store';
import { exchangeGoogle, type GoogleConfig } from './google-config';
export const table = () => process.env.DATA_TABLE!;
export const pk = (owner: string) => `USER#${owner}`;
export const stableId = (prefix: string, ...parts: string[]) => `${prefix}:${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 48)}`;
export interface GoogleAccount { pk: string; sk: string; id: string; email: string; refreshToken: string; accessToken: string; tokenExpires: number; needsReconnect?: boolean }
export interface GoogleSource { pk: string; sk: string; id: string; accountId: string; calendarId: string; enabled: boolean; windowDate?: string; lastSynced?: string; error?: string; watchExpires?: number; watchId?: string; watchResource?: string; lockUntil?: number }
export async function item<T>(owner: string, sk: string) { return (await ddb.send(new GetCommand({ TableName: table(), Key: { pk: pk(owner), sk }, ConsistentRead: true }))).Item as T | undefined; }
export async function items<T>(owner: string, prefix: string) {
  const result: T[] = []; let cursor: Record<string, unknown> | undefined;
  do { const page = await ddb.send(new QueryCommand({ TableName: table(), KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)', ExpressionAttributeValues: { ':pk': pk(owner), ':prefix': prefix }, ConsistentRead: true, ExclusiveStartKey: cursor })); result.push(...page.Items as T[] ?? []); cursor = page.LastEvaluatedKey; } while (cursor);
  return result;
}
export async function saveImported<K extends Kind>(owner: string, id: string, kind: K, data: Partial<DataByKind[K]>, deleted = false) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const old = await getDocument(owner, id), next = editDocument(old, id, kind, data, 'google-import', deleted);
    documentSchema.parse(next);
    if (old && sameContent(old, next)) return;
    if (!await pushDocument(owner, { newDocumentState: next, assumedMasterState: old })) return;
  }
  throw new Error('Calendar write contention');
}
export async function googleToken(owner: string, account: GoogleAccount, config: GoogleConfig) {
  if (account.tokenExpires > Date.now() + 60000) return account.accessToken;
  const tokens = await exchangeGoogle(config, { grant_type: 'refresh_token', refresh_token: account.refreshToken });
  await ddb.send(new UpdateCommand({ TableName: table(), Key: { pk: pk(owner), sk: account.sk }, UpdateExpression: 'SET accessToken = :token, tokenExpires = :expires REMOVE needsReconnect', ConditionExpression: 'attribute_exists(pk)', ExpressionAttributeValues: { ':token': tokens.access_token, ':expires': Date.now() + tokens.expires_in * 1000 } }));
  return tokens.access_token;
}
const queue = new SQSClient({});
export async function enqueueCalendar(owner: string, sourceId: string) { await queue.send(new SendMessageCommand({ QueueUrl: process.env.CALENDAR_QUEUE_URL!, MessageBody: JSON.stringify({ owner, sourceId }) })); }
export async function removeSource(owner: string, source: GoogleSource) {
  await ddb.send(new UpdateCommand({ TableName: table(), Key: { pk: pk(owner), sk: source.sk }, UpdateExpression: 'SET enabled = :disabled', ExpressionAttributeValues: { ':disabled': false } }));
  await saveImported(owner, source.id, 'calendarSource', { enabled: false });
}
