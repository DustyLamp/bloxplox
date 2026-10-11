import { randomBytes, createHash } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { documentSchema } from '../../packages/domain/src/index';
import { authenticate } from './auth';
import { ddb, pullDocuments, pushDocument } from './store';

const pushSchema = z.object({ changes: z.array(z.object({ newDocumentState: documentSchema, assumedMasterState: documentSchema.nullish() }).strict()).max(25) }).strict();
const pullSchema = z.object({ checkpoint: z.object({ sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1000) }).optional(), limit: z.number().int().min(1).max(100) }).strict();
const response = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
export async function handler(event: APIGatewayProxyEventV2) {
  try {
    const user = await authenticate(event);
    if (event.requestContext.http.method !== 'POST') return response(405, { error: 'Method not allowed' });
    if (event.rawPath === '/sync/ticket') {
      const ticket = randomBytes(32).toString('base64url');
      await ddb.send(new PutCommand({ TableName: process.env.CONNECTION_TABLE!, Item: {
        connectionId: `ticket:${createHash('sha256').update(ticket).digest('hex')}`, userId: user.subject,
        expires: Math.floor(Date.now() / 1000) + 60, authExpires: user.expires,
      } }));
      return response(200, { ticket });
    }
    if (!event.body || event.body.length > 500_000 || event.isBase64Encoded) return response(400, { error: 'Invalid request body' });
    const input = JSON.parse(event.body);
    if (event.rawPath === '/sync/pull') {
      const { checkpoint, limit } = pullSchema.parse(input);
      return response(200, await pullDocuments(user.subject, checkpoint, limit));
    }
    if (event.rawPath === '/sync/push') {
      const { changes } = pushSchema.parse(input);
      if (new Set(changes.map(r => r.newDocumentState.id)).size !== changes.length) return response(400, { error: 'Duplicate document' });
      const conflicts = [];
      for (const row of changes) {
        if (JSON.stringify(row.newDocumentState).length > 32_000) return response(400, { error: 'Record too large' });
        if (row.assumedMasterState && row.assumedMasterState.id !== row.newDocumentState.id) return response(400, { error: 'Mismatched record' });
        const conflict = await pushDocument(user.subject, row);
        if (conflict) conflicts.push(conflict);
      }
      return response(200, { conflicts });
    }
    return response(404, { error: 'Not found' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return response(401, { error: 'Sign in again' });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return response(400, { error: 'Invalid data' });
    console.error('sync_request_failed', { requestId: event.requestContext.requestId, name: error instanceof Error ? error.name : 'Error' });
    return response(503, { error: 'Sync unavailable. Your changes remain on this device.' });
  }
}
