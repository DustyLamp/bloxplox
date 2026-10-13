import { beforeEach, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2, Context, SQSEvent } from 'aws-lambda';
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const state = vi.hoisted(() => ({ items: new Map<string, any>(), connections: new Map<string, any>(), queued: [] as any[], cognito: [] as any[], unauthorized: false, throttle: false, appleFailure: false, appleRevoked: [] as string[] }));
vi.mock('./apple-tokens', () => ({ revokeAppleToken: async (token: string) => { if (state.appleFailure) throw new Error('Apple unavailable'); state.appleRevoked.push(token); } }));
vi.mock('./auth', () => ({ authenticate: async () => { if (state.unauthorized) throw new Error('Unauthorized'); return { subject: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', username: 'native-qa' }; } }));
vi.mock('@aws-sdk/client-cognito-identity-provider', async original => ({ ...await original<any>(), CognitoIdentityProviderClient: class { async send(command: any) { state.cognito.push(command.input); return {}; } } }));
vi.mock('@aws-sdk/client-sqs', async original => ({ ...await original<any>(), SQSClient: class { async send(command: any) { state.queued.push(command.input); return {}; } } }));
vi.mock('./store', () => ({ ddb: { async send(command: any) {
  const p = command.input, key = (row: any) => `${row.pk}|${row.sk}`;
  switch (command.constructor.name) {
    case 'GetCommand': return { Item: state.items.get(key(p.Key)) };
    case 'PutCommand': if (state.items.has(key(p.Item))) { const error = new Error(); error.name = 'ConditionalCheckFailedException'; throw error; } state.items.set(key(p.Item), p.Item); return {};
    case 'QueryCommand': return { Items: [...state.items.values()].filter(row => row.pk === p.ExpressionAttributeValues[':pk'] && (!p.ExpressionAttributeValues[':prefix'] || row.sk.startsWith(p.ExpressionAttributeValues[':prefix']))) };
    case 'ScanCommand': return { Items: [...(p.TableName === 'connections' ? state.connections : state.items).values()].filter(row => p.TableName === 'connections' ? row.userId === p.ExpressionAttributeValues[':owner'] : row.owner === p.ExpressionAttributeValues[':owner'] && (row.pk.startsWith('GOOGLEWATCH#') || row.pk.startsWith('GOOGLESTATE#') || row.pk.startsWith('APPLEDELETE#'))) };
    case 'BatchWriteCommand': if (state.throttle) { state.throttle = false; return { UnprocessedItems: p.RequestItems }; } for (const [table, requests] of Object.entries(p.RequestItems) as [string, any[]][]) for (const request of requests) { if (table === 'connections') state.connections.delete(request.DeleteRequest.Key.connectionId); else state.items.delete(key(request.DeleteRequest.Key)); } return {};
    case 'UpdateCommand': { const row = state.items.get(key(p.Key)); row.state = 'complete'; row.completedAt = p.ExpressionAttributeValues[':now']; delete row.username; return {}; }
    default: throw new Error(`Unexpected ${command.constructor.name}`);
  }
} } }));
import { handler as request } from './account';
import { handler as worker } from './account-worker';
const event = (body: unknown = { confirmation: 'DELETE' }) => ({ rawPath: '/account/delete', body: JSON.stringify(body), requestContext: { http: { method: 'POST' } } } as APIGatewayProxyEventV2);
const job = (extra = {}) => ({ Records: [{ messageId: 'cleanup', body: JSON.stringify({ subject: owner, ...extra }) }] } as SQSEvent);
beforeEach(() => { state.items.clear(); state.connections.clear(); state.queued = []; state.cognito = []; state.unauthorized = false; state.throttle = false; state.appleFailure = false; state.appleRevoked = []; process.env.DATA_TABLE = 'data'; process.env.CONNECTION_TABLE = 'connections'; process.env.DELETION_QUEUE_URL = 'queue'; process.env.USER_POOL_ID = 'pool'; vi.unstubAllGlobals(); });
it('requires confirmation and authenticates ownership; duplicate requests preserve the durable job', async () => {
  expect((await request(event(null))).statusCode).toBe(400); expect((await request(event({ confirmation: 'no' }))).statusCode).toBe(400); expect(state.items.size).toBe(0);
  state.unauthorized = true; expect((await request(event())).statusCode).toBe(401); state.unauthorized = false;
  expect((await request(event({ confirmation: 'DELETE', subject: 'victim' }))).statusCode).toBe(202);
  const marker = state.items.get(`DELETED#${owner}|ACCOUNT`); expect(marker.username).toBe('native-qa');
  expect((await request(event())).statusCode).toBe(202); expect(state.items.size).toBe(1); expect(state.items.get(`DELETED#${owner}|ACCOUNT`)).toBe(marker);
});
it('waits for admitted work, then revokes tokens and deletes all owned records without touching other accounts', async () => {
  await request(event()); await worker(job()); expect(state.queued[0].DelaySeconds).toBeGreaterThan(170); expect(state.cognito).toEqual([]);
  state.items.get(`DELETED#${owner}|ACCOUNT`).requestedAt -= 180001;
  for (let i = 0; i < 55; i++) state.items.set(`USER#${owner}|DOC#${i}`, { pk: `USER#${owner}`, sk: `DOC#${i}` });
  state.items.set(`USER#${owner}|GCALACCOUNT#google`, { pk: `USER#${owner}`, sk: 'GCALACCOUNT#google', refreshToken: 'token-fixture' });
  for (const pk of ['GOOGLEWATCH#own', 'GOOGLESTATE#own', 'APPLEDELETE#own']) state.items.set(`${pk}|META`, { pk, sk: 'META', owner });
  state.items.set('USER#other|DOC#other', { pk: 'USER#other', sk: 'DOC#other' });
  state.items.set('GOOGLEWATCH#other|META', { pk: 'GOOGLEWATCH#other', sk: 'META', owner: 'other' });
  state.connections.set('own', { connectionId: 'own', userId: owner }); state.connections.set('other', { connectionId: 'other', userId: 'other' });
  const revoke = vi.fn(async () => ({ ok: true, status: 200 })); vi.stubGlobal('fetch', revoke); state.throttle = true;
  expect(await worker(job())).toEqual({ batchItemFailures: [] }); expect(revoke).toHaveBeenCalledOnce();
  expect(state.cognito).toEqual([{ UserPoolId: 'pool', Username: 'native-qa' }]);
  expect([...state.items.keys()].sort()).toEqual([`DELETED#${owner}|ACCOUNT`, 'GOOGLEWATCH#other|META', 'USER#other|DOC#other']);
  expect([...state.connections.keys()]).toEqual(['other']); expect(state.items.get(`DELETED#${owner}|ACCOUNT`)).toMatchObject({ state: 'complete' }); expect(state.items.get(`DELETED#${owner}|ACCOUNT`).username).toBeUndefined();
  await worker(job()); expect(revoke).toHaveBeenCalledOnce(); expect(state.cognito).toHaveLength(1);
});
it('keeps failed revocation retryable and checkpoints long sweeps', async () => {
  await request(event()); state.items.get(`DELETED#${owner}|ACCOUNT`).requestedAt -= 180001;
  state.items.set(`USER#${owner}|GCALACCOUNT#google`, { pk: `USER#${owner}`, sk: 'GCALACCOUNT#google', refreshToken: 'fixture' });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
  expect(await worker(job())).toEqual({ batchItemFailures: [{ itemIdentifier: 'cleanup' }] }); expect(state.cognito).toEqual([]);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400 })));
  expect(await worker(job(), { getRemainingTimeInMillis: vi.fn().mockReturnValueOnce(30000).mockReturnValue(14000) } as unknown as Context)).toEqual({ batchItemFailures: [] });
  expect(JSON.parse(state.queued[0].MessageBody)).toEqual({ subject: owner, phase: 'external' });
  await worker(job({ phase: 'external' })); expect(state.items.size).toBe(1); expect(state.cognito).toHaveLength(1);
});

it('retains Apple tokens and account records until revocation succeeds', async () => {
  await request(event()); state.items.get(`DELETED#${owner}|ACCOUNT`).requestedAt -= 180001;
  state.items.set(`USER#${owner}|APPLEAUTH#revocation`, { pk: `USER#${owner}`, sk: 'APPLEAUTH#revocation', refreshToken: 'apple-fixture' });
  state.appleFailure = true;
  expect(await worker(job())).toEqual({ batchItemFailures: [{ itemIdentifier: 'cleanup' }] });
  expect(state.items.size).toBe(2); expect(state.cognito).toEqual([]);
  state.appleFailure = false;
  expect(await worker(job())).toEqual({ batchItemFailures: [] });
  expect(state.appleRevoked).toEqual(['apple-fixture']); expect(state.items.size).toBe(1);
});
