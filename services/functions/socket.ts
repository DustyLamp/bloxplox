import { createHash } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { ddb } from './store';
import { assertAccountActive } from './account-state';

export async function handler(event: APIGatewayProxyWebsocketEventV2 & { queryStringParameters?: Record<string, string> }) {
  const { connectionId, routeKey, domainName, stage } = event.requestContext;
  const TableName = process.env.CONNECTION_TABLE!, key = { connectionId: `ws:${connectionId}` };
  const now = Math.floor(Date.now() / 1000);
  try {
    if (routeKey === '$disconnect') { await ddb.send(new DeleteCommand({ TableName, Key: key })); return { statusCode: 200 }; }
    if (routeKey === '$connect') {
      const ticket = event.queryStringParameters?.ticket;
      if (!ticket || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) return { statusCode: 401 };
      const consumed = await ddb.send(new DeleteCommand({ TableName,
        Key: { connectionId: `ticket:${createHash('sha256').update(ticket).digest('hex')}` }, ReturnValues: 'ALL_OLD',
        ConditionExpression: 'expires > :now AND authExpires > :now', ExpressionAttributeValues: { ':now': now },
      }));
      if (!consumed.Attributes) return { statusCode: 401 };
      await assertAccountActive(consumed.Attributes.userId);
      await ddb.send(new PutCommand({ TableName, Item: { ...key, userId: consumed.Attributes.userId, expires: consumed.Attributes.authExpires } }));
      return { statusCode: 200 };
    }
    const connection = (await ddb.send(new GetCommand({ TableName, Key: key, ConsistentRead: true }))).Item;
    const api = new ApiGatewayManagementApiClient({ endpoint: `https://${domainName}/${stage}` });
    if (!connection || connection.expires <= now) {
      await api.send(new DeleteConnectionCommand({ ConnectionId: connectionId }));
      return { statusCode: 401 };
    }
    try { await assertAccountActive(connection.userId); } catch { await api.send(new DeleteConnectionCommand({ ConnectionId: connectionId })); return { statusCode: 401 }; }
    await api.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: new TextEncoder().encode('{"type":"pong"}') }));
    return { statusCode: 200 };
  } catch (error) {
    if (error instanceof Error && ['ConditionalCheckFailedException', 'AccountDeleted'].includes(error.name)) return { statusCode: 401 };
    console.error('socket_request_failed', { requestId: event.requestContext.requestId, name: error instanceof Error ? error.name : 'Error' });
    return { statusCode: 500 };
  }
}
