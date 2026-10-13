import { QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import type { DynamoDBStreamEvent, DynamoDBBatchResponse } from 'aws-lambda';
import { ddb } from './store';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
const queue = new SQSClient({});

export async function handler(event: DynamoDBStreamEvent): Promise<DynamoDBBatchResponse> {
  const api = new ApiGatewayManagementApiClient({ endpoint: process.env.WEBSOCKET_MANAGEMENT_URL! });
  const failures: { itemIdentifier: string }[] = [];
  const owners = new Map<string, string[]>();
  for (const record of event.Records) {
    const pk = record.dynamodb?.Keys?.pk?.S, sk = record.dynamodb?.Keys?.sk?.S;
    if (record.eventName === 'INSERT' && pk?.startsWith('DELETED#') && sk === 'ACCOUNT') {
      try { await queue.send(new SendMessageCommand({ QueueUrl: process.env.DELETION_QUEUE_URL!, MessageBody: JSON.stringify({ subject: pk.slice(8) }), DelaySeconds: 180 })); }
      catch { failures.push({ itemIdentifier: record.dynamodb!.SequenceNumber! }); }
      continue;
    }
    if (record.eventName !== 'INSERT' || !pk?.startsWith('USER#') || !sk?.startsWith('CHANGE#')) continue;
    const owner = pk.slice(5);
    owners.set(owner, [...(owners.get(owner) ?? []), record.dynamodb!.SequenceNumber!]);
  }
  for (const [owner, sequences] of owners) {
    try {
      let cursor: Record<string, unknown> | undefined;
      do {
        const page = await ddb.send(new QueryCommand({ TableName: process.env.CONNECTION_TABLE!, IndexName: 'by-user',
          KeyConditionExpression: 'userId = :owner', ExpressionAttributeValues: { ':owner': owner }, ExclusiveStartKey: cursor }));
        for (const connection of page.Items ?? []) {
          if (!connection.connectionId.startsWith('ws:') || connection.expires <= Date.now() / 1000) continue;
          try { await api.send(new PostToConnectionCommand({ ConnectionId: connection.connectionId.slice(3), Data: new TextEncoder().encode('{"type":"changed"}') })); }
          catch (error) {
            if (error instanceof Error && error.name === 'GoneException') await ddb.send(new DeleteCommand({ TableName: process.env.CONNECTION_TABLE!, Key: { connectionId: connection.connectionId } }));
            else throw error;
          }
        }
        cursor = page.LastEvaluatedKey;
      } while (cursor);
    } catch { failures.push(...sequences.map(itemIdentifier => ({ itemIdentifier }))); }
  }
  return { batchItemFailures: failures };
}
