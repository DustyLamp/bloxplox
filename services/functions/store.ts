import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { sameContent, type Document } from '../../packages/domain/src/index';
import { enforceHabitLimit } from './plan-policy';

export interface Checkpoint { sequence: number }
export interface PushRow { newDocumentState: Document; assumedMasterState?: Document | null }
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const table = () => process.env.DATA_TABLE!;
const ownerKey = (owner: string) => `USER#${owner}`;
const changeKey = (sequence: number) => `CHANGE#${String(sequence).padStart(16, '0')}`;
export async function getDocument(owner: string, id: string): Promise<Document | undefined> {
  return (await ddb.send(new GetCommand({ TableName: table(), Key: { pk: ownerKey(owner), sk: `DOC#${id}` }, ConsistentRead: true }))).Item?.document;
}

/** Sequence and document are committed together: no clock skew or index-lag holes. */
export async function pushDocument(owner: string, row: PushRow): Promise<Document | null> {
  const pk = ownerKey(owner), proposed = row.newDocumentState;
  for (let attempt = 0; attempt < 12; attempt++) {
    const current = await getDocument(owner, proposed.id);
    if (current && sameContent(current, proposed)) return null;
    if (current && (current.kind !== proposed.kind || current.revision !== row.assumedMasterState?.revision)) return current;
    if (!current && row.assumedMasterState) throw new Error('Missing master record');
    const meta = (await ddb.send(new GetCommand({ TableName: table(), Key: { pk, sk: 'SEQUENCE' }, ConsistentRead: true }))).Item;
    const previous = Number(meta?.sequence ?? 0), sequence = previous + 1;
    // The sequence condition below also serializes the count used for Free's
    // active-habit limit, including concurrent activations from different devices.
    const incoming = await enforceHabitLimit(owner, proposed, current);
    try {
      await ddb.send(new TransactWriteCommand({ TransactItems: [
        { Put: { TableName: table(), Item: { pk, sk: 'SEQUENCE', sequence },
          ConditionExpression: meta ? '#seq = :previous' : 'attribute_not_exists(pk)',
          ...(meta ? { ExpressionAttributeNames: { '#seq': 'sequence' }, ExpressionAttributeValues: { ':previous': previous } } : {}) } },
        { Put: { TableName: table(), Item: { pk, sk: `DOC#${incoming.id}`, document: incoming, revision: incoming.revision },
          ConditionExpression: current ? 'revision = :revision' : 'attribute_not_exists(pk)',
          ...(current ? { ExpressionAttributeValues: { ':revision': current.revision } } : {}) } },
        { Put: { TableName: table(), Item: { pk, sk: changeKey(sequence), sequence, document: incoming }, ConditionExpression: 'attribute_not_exists(pk)' } },
      ] }));
      return sameContent(proposed, incoming) ? null : incoming;
    } catch (error) {
      if (!(error instanceof Error) || !['TransactionCanceledException', 'TransactionConflictException'].includes(error.name)) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(200, 5 * 2 ** attempt) * Math.random()));
    }
  }
  throw new Error('Write contention; retry');
}

export async function pullDocuments(owner: string, checkpoint: Checkpoint | undefined, limit: number) {
  let sequence = checkpoint?.sequence ?? 0;
  const documents = new Map<string, Document>();
  while (documents.size < limit) {
    const page = await ddb.send(new QueryCommand({
      TableName: table(), ConsistentRead: true, KeyConditionExpression: 'pk = :pk AND sk BETWEEN :after AND :last',
      ExpressionAttributeValues: { ':pk': ownerKey(owner), ':after': changeKey(sequence + 1), ':last': 'CHANGE#9999999999999999' },
      Limit: limit - documents.size,
    }));
    for (const row of page.Items ?? []) { documents.set(row.document.id, row.document); sequence = row.sequence; }
    if (!page.LastEvaluatedKey) break;
  }
  return { documents: [...documents.values()], checkpoint: { sequence } };
}
