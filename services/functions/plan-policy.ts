import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { editDocument, plans, type Document } from '../../packages/domain/src/index';
import { billingConfig } from './billing-config';
import { ddb } from './store';

export function activatingHabit(incoming: Document, current?: Document) {
  return incoming.kind === 'habit' && !incoming.deleted && incoming.data.active === true && (!current || current.deleted || !current.data.active);
}
export function limitHabit(incoming: Document, activeCount: number, plus: boolean): Document {
  if (plus || activeCount < plans.free.activeHabits) return incoming;
  // Retain every field and synchronize the extra habit as inactive. A permanent
  // HTTP rejection here would block unrelated offline writes behind this record.
  return editDocument(incoming, incoming.id, 'habit', { active: false }, 'server-plan');
}
export async function enforceHabitLimit(owner: string, incoming: Document, current?: Document): Promise<Document> {
  if (!activatingHabit(incoming, current) || !await billingConfig()) return incoming;
  const pk = `USER#${owner}`, table = process.env.DATA_TABLE!;
  const billing = (await ddb.send(new GetCommand({ TableName: table, Key: { pk, sk: 'BILLING' }, ConsistentRead: true }))).Item?.billing;
  if (billing?.plan === 'plus' && billing.currentPeriodEnd > Date.now() / 1000) return incoming;
  let key: Record<string, unknown> | undefined, count = 0;
  do {
    const page = await ddb.send(new QueryCommand({ TableName: table, KeyConditionExpression: 'pk = :pk AND begins_with(sk, :doc)', ExpressionAttributeValues: { ':pk': pk, ':doc': 'DOC#' }, ConsistentRead: true, ExclusiveStartKey: key, Limit: 100 }));
    count += (page.Items ?? []).filter(item => item.document?.kind === 'habit' && !item.document.deleted && item.document.data.active).length;
    key = page.LastEvaluatedKey;
  } while (key && count < plans.free.activeHabits);
  return limitHabit(incoming, count, false);
}
