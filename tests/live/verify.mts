/** Explicit live smoke test. Creates two temporary users and deletes only their records. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { fromIni } from '@aws-sdk/credential-providers';
import { AuthenticationDetails, CognitoUser, CognitoUserPool } from 'amazon-cognito-identity-js';
import { chromium, expect, type Page } from '@playwright/test';
import { editDocument, mergeDocuments, sameContent, type Document } from '../../packages/domain/src/index';

const region = 'eu-north-1', profile = process.env.AWS_PROFILE || 'bloxplox';
const credentials = fromIni({ profile });
const cfn = new CloudFormationClient({ region, credentials });
const stack = (await cfn.send(new DescribeStacksCommand({ StackName: 'bloxplox-production' }))).Stacks![0];
assert(stack.StackId!.includes(':807550663091:'), 'Refusing to test a different AWS account');
const output = Object.fromEntries(stack.Outputs!.map(o => [o.OutputKey!, o.OutputValue!]));
const origin = process.env.BLOXPLOX_TEST_ORIGIN || 'https://bloxplox.com';
assert(['https://bloxplox.com', output.DefaultUrl].includes(origin), 'Unexpected test destination');
const cognito = new CognitoIdentityProviderClient({ region, credentials });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region, credentials }));
const users: { username: string; email: string; password: string; subject: string; token: string }[] = [];
const sockets: WebSocket[] = [];
const checks: string[] = [];
const record = (message: string) => { checks.push(message); console.log(`PASS ${message}`); };
const prefix = `qa-${Date.now()}-${randomBytes(4).toString('hex')}`;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
await mkdir('test-results/live', { recursive: true });

async function createUser(suffix: string) {
  const email = `${prefix}-${suffix}@example.invalid`, password = `${randomBytes(24).toString('base64url')}aA7!`;
  const result = await cognito.send(new AdminCreateUserCommand({ UserPoolId: output.UserPoolId, Username: email, MessageAction: 'SUPPRESS', UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }] }));
  const user = { username: result.User!.Username!, email, password, subject: result.User!.Attributes!.find(a => a.Name === 'sub')!.Value!, token: '' };
  users.push(user);
  await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: output.UserPoolId, Username: user.username, Password: password, Permanent: true }));
  const pool = new CognitoUserPool({ UserPoolId: output.UserPoolId, ClientId: output.UserPoolClientId });
  user.token = await new Promise<string>((resolve, reject) => new CognitoUser({ Username: email, Pool: pool }).authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), { onSuccess: session => resolve(session.getAccessToken().getJwtToken()), onFailure: reject }));
  return user;
}
async function request(token: string, path: string, body: unknown, expected = 200) {
  const response = await fetch(`${output.ApiUrl}/sync/${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, expected, `${path} response status`);
  return response.json();
}
async function push(token: string, doc: Document, assumed: Document | null = null) {
  return request(token, 'push', { changes: [{ newDocumentState: doc, assumedMasterState: assumed }] });
}
async function all(token: string, limit = 7) {
  let checkpoint = { sequence: 0 }; const docs = new Map<string, Document>();
  for (let i = 0; i < 100; i++) {
    const page = await request(token, 'pull', { checkpoint, limit });
    assert(page.checkpoint.sequence >= checkpoint.sequence);
    page.documents.forEach((doc: Document) => docs.set(doc.id, doc));
    checkpoint = page.checkpoint;
    if (page.documents.length < limit) return { docs, checkpoint };
  }
  throw new Error('Pull pagination did not finish');
}
async function socket(token: string) {
  const { ticket } = await request(token, 'ticket', {});
  const ws = new WebSocket(`${output.WebSocketUrl}?ticket=${encodeURIComponent(ticket)}`); sockets.push(ws);
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('WebSocket did not open')), 15000); ws.onopen = () => { clearTimeout(timer); resolve(); }; ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket connection failed')); }; });
  return { ws, ticket };
}
async function signIn(page: Page, user: typeof users[number]) {
  await page.goto(`${origin}/blocks`);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add a block', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Synced', { exact: true })).toBeVisible({ timeout: 30000 });
}
async function addBlock(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add a block', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function menu(page: Page, name: string) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('button', { name, exact: true }).click();
}
try {
  const a = await createUser('a'), b = await createUser('b');
  record('Cognito SRP authentication for two independent verified accounts');
  await request('', 'pull', { limit: 1 }, 401);
  await request(a.token, 'pull', { limit: 1, owner: b.subject }, 400);
  const initial = editDocument(undefined, `${prefix}-shared-id`, 'category', { name: 'Owner A', color: '#b48aff' }, 'qa-a');
  assert.deepEqual((await push(a.token, initial)).conflicts, []);
  assert.equal((await all(b.token)).docs.size, 0);
  const other = editDocument(undefined, initial.id, 'category', { name: 'Owner B', color: '#ff9b57' }, 'qa-b');
  await push(b.token, other);
  assert.equal((await all(a.token)).docs.get(initial.id)!.data.name, 'Owner A');
  assert.equal((await all(b.token)).docs.get(initial.id)!.data.name, 'Owner B');
  await request(a.token, 'push', { changes: [{ newDocumentState: { ...initial, owner: b.subject } }] }, 400);
  record('HTTP rejects unauthenticated/owner-injection requests and isolates identical record IDs by account');

  const rename = editDocument(initial, initial.id, 'category', { name: 'Renamed' }, 'device-a');
  const recolor = editDocument(initial, initial.id, 'category', { color: '#55e0a0' }, 'device-b');
  const concurrent = await Promise.all([push(a.token, rename, initial), push(a.token, recolor, initial)]);
  assert.equal(concurrent.filter(r => r.conflicts.length).length, 1);
  const loserIndex = concurrent.findIndex(r => r.conflicts.length), master = concurrent[loserIndex].conflicts[0];
  const merged = mergeDocuments(master, [rename, recolor][loserIndex]);
  await push(a.token, merged, master);
  const saved = (await all(a.token)).docs.get(initial.id)!;
  assert.equal(saved.data.name, 'Renamed'); assert.equal(saved.data.color, '#55e0a0');
  const beforeRetry = (await all(a.token)).checkpoint.sequence;
  await push(a.token, saved);
  assert.equal((await all(a.token)).checkpoint.sequence, beforeRetry);
  record('Concurrent conditional writes return conflicts; independent fields merge; duplicate retry is idempotent');

  const records = Array.from({ length: 23 }, (_, i) => editDocument(undefined, `${prefix}-${i}`, 'category', { name: `Pagination ${i}`, color: '#b48aff' }, 'qa'));
  for (let i = 0; i < records.length; i += 5) await request(a.token, 'push', { changes: records.slice(i, i + 5).map(newDocumentState => ({ newDocumentState })) });
  const deleted = editDocument(records[0], records[0].id, 'category', {}, 'qa', true);
  await push(a.token, deleted, records[0]);
  const pulled = await all(a.token, 3);
  assert.equal(pulled.docs.size, 24); assert.equal(pulled.docs.get(deleted.id)!.deleted, true);
  assert(sameContent(pulled.docs.get(initial.id)!, saved));
  record('Small-page checkpoint catch-up includes every unique record, latest revisions and tombstones');

  const streamA = await socket(a.token), streamB = await socket(b.token);
  const messagesA: string[] = [], messagesB: string[] = [];
  streamA.ws.onmessage = event => messagesA.push(JSON.parse(String(event.data)).type);
  streamB.ws.onmessage = event => messagesB.push(JSON.parse(String(event.data)).type);
  streamA.ws.send('{"type":"ping"}');
  await expect.poll(() => messagesA.includes('pong'), { timeout: 10000 }).toBe(true);
  // Let earlier stream batches drain before checking owner-specific notifications.
  await new Promise(resolve => setTimeout(resolve, 2500)); messagesA.length = 0; messagesB.length = 0;
  await push(a.token, editDocument(saved, saved.id, 'category', { name: 'Notification' }, 'qa'), saved);
  await expect.poll(() => messagesA.includes('changed'), { timeout: 10000 }).toBe(true);
  assert(!messagesB.includes('changed'), 'Other account received change notification');
  const replay = new WebSocket(`${output.WebSocketUrl}?ticket=${streamA.ticket}`); sockets.push(replay);
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Ticket replay did not reject')), 10000); replay.onopen = () => { clearTimeout(timer); reject(new Error('Used ticket was accepted')); }; replay.onerror = () => { clearTimeout(timer); resolve(); }; });
  record('Streams sends only owner notifications, heartbeat responds, and a WebSocket ticket cannot be replayed');

  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    // Optional: verify the real hostname/TLS while a recursive resolver's old
    // negative cache expires. Use only an address observed from authoritative DNS.
    args: process.env.BLOXPLOX_TEST_IP ? [`--host-resolver-rules=MAP bloxplox.com ${process.env.BLOXPLOX_TEST_IP}`] : [],
  });
  const first = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Zurich' });
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles' });
  const isolated = await browser.newContext();
  const pageA = await first.newPage(), pageB = await second.newPage(), pageC = await isolated.newPage();
  const errors: string[] = [];
  for (const page of [pageA, pageB, pageC]) page.on('pageerror', error => errors.push(error.message));
  let connections = 0;
  await pageB.addInitScript(() => {
    const Native = window.WebSocket;
    const sockets: WebSocket[] = [];
    Object.assign(window, { __testSockets: sockets });
    window.WebSocket = class extends Native { constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); sockets.push(this); } };
  });
  pageB.on('websocket', () => { connections++; });
  await signIn(pageA, a); await signIn(pageB, a); await signIn(pageC, b);
  await pageA.evaluate(async () => { await navigator.serviceWorker.ready; });
  await pageA.reload(); await expect(pageA.getByRole('button', { name: 'Add a block', exact: true })).toBeVisible();
  await expect.poll(() => pageA.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await addBlock(pageA, 'QA focus');
  await expect(pageB.getByRole('button', { name: '08:00 QA focus 30m', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(pageC.getByText('QA focus', { exact: true })).toHaveCount(0);
  record('Independent desktop/mobile browser databases synchronize through AWS; third account sees none of the private blocks');

  await first.setOffline(true); await second.setOffline(true);
  await expect(pageA.getByText('Offline · saved on this device', { exact: true })).toBeVisible();
  await pageA.getByRole('button', { name: '08:00 QA focus 30m', exact: true }).click();
  await pageA.getByLabel('Name', { exact: true }).fill('QA renamed offline');
  await pageA.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(pageA.getByRole('dialog')).toHaveCount(0);
  await pageB.getByRole('button', { name: '08:00 QA focus 30m', exact: true }).click();
  await pageB.getByText('Settings', { exact: true }).click();
  await pageB.getByLabel('Notes', { exact: true }).fill('A note from the other device');
  await pageB.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(pageB.getByRole('dialog')).toHaveCount(0);
  await pageA.reload();
  await expect(pageA.getByRole('button', { name: '08:00 QA renamed offline 30m', exact: true })).toBeVisible({ timeout: 20000 });
  await first.setOffline(false); await second.setOffline(false);
  await expect(pageB.getByRole('button', { name: '08:00 QA renamed offline 30m', exact: true })).toBeVisible({ timeout: 30000 });
  for (const page of [pageA, pageB]) {
    await expect(page.getByText('Synced', { exact: true })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: '08:00 QA renamed offline 30m', exact: true }).click();
    await page.getByText('Settings', { exact: true }).click();
    await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('A note from the other device');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }
  record('Offline shell reload preserves edits; concurrent name/note edits on disconnected devices both survive reconnection');

  const beforeReconnect = connections;
  await pageB.evaluate(() => { (window as unknown as { __testSockets: WebSocket[] }).__testSockets.forEach(ws => ws.close()); });
  await expect.poll(() => connections, { timeout: 15000 }).toBeGreaterThan(beforeReconnect);
  await pageA.getByRole('button', { name: '08:00 QA renamed offline 30m', exact: true }).click();
  await pageA.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(pageB.getByRole('img', { name: 'Completed', exact: true })).toBeVisible({ timeout: 15000 });
  record('Forced socket reconnect obtains a new ticket and continues live completion synchronization');

  await pageA.getByRole('button', { name: 'Things', exact: true }).click();
  await pageA.getByLabel('New thing', { exact: true }).fill('QA one-off');
  await pageA.getByRole('button', { name: 'Add thing', exact: true }).click();
  await pageA.getByRole('button', { name: 'Edit QA one-off', exact: true }).click();
  await pageA.getByRole('button', { name: 'Schedule thing', exact: true }).click();
  await pageA.getByLabel('Block', { exact: true }).selectOption({ label: 'QA renamed offline · 08:00' });
  await pageA.getByRole('button', { name: 'Add to block', exact: true }).click();
  await pageB.getByRole('button', { name: '08:00 QA renamed offline 30m', exact: true }).click();
  await expect(pageB.getByRole('checkbox', { name: 'Complete QA one-off', exact: true })).toBeVisible({ timeout: 15000 });
  await first.setOffline(true); await second.setOffline(true);
  await pageA.getByRole('button', { name: 'Edit QA one-off', exact: true }).click();
  await pageA.getByLabel('Name', { exact: true }).fill('QA renamed thing');
  await pageA.getByLabel('Notes', { exact: true }).fill('One task, across sessions and devices');
  await pageA.getByRole('button', { name: 'Save', exact: true }).click();
  await pageB.getByRole('checkbox', { name: 'Complete QA one-off', exact: true }).check();
  await expect(pageB.getByRole('checkbox', { name: 'Complete QA one-off', exact: true })).toBeEnabled();
  await pageA.reload(); await expect(pageA.getByRole('button', { name: 'Edit QA renamed thing', exact: true })).toBeVisible();
  await first.setOffline(false); await second.setOffline(false);
  await expect(pageA.getByRole('button', { name: 'Done 1', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(pageB.getByRole('checkbox', { name: 'Complete QA renamed thing', exact: true })).toBeChecked({ timeout: 30000 });
  await pageA.getByRole('button', { name: 'Done 1', exact: true }).click();
  await pageA.getByRole('button', { name: 'Edit QA renamed thing', exact: true }).click();
  await expect(pageA.getByLabel('Notes', { exact: true })).toHaveValue('One task, across sessions and devices');
  await pageA.getByRole('button', { name: 'Close', exact: true }).click();
  await pageC.getByRole('button', { name: 'Things', exact: true }).click();
  await expect(pageC.getByRole('button', { name: /Edit QA/ })).toHaveCount(0);
  record('Things link to a real session; offline edits and completion merge across devices, reload safely and remain account-isolated');

  await pageA.screenshot({ path: 'test-results/live/things-desktop.png', fullPage: true });
  await pageB.screenshot({ path: 'test-results/live/things-in-block-mobile.png', fullPage: true });
  await pageB.getByRole('button', { name: 'Close', exact: true }).click();
  await pageB.getByRole('button', { name: 'Things', exact: true }).click();
  await pageB.getByRole('button', { name: 'Done 1', exact: true }).click();
  await pageB.screenshot({ path: 'test-results/live/things-mobile.png', fullPage: true });
  await pageA.getByRole('button', { name: 'Blocks', exact: true }).click();
  await pageB.getByRole('button', { name: 'Blocks', exact: true }).click();

  await pageA.screenshot({ path: 'test-results/live/desktop.png', fullPage: true });
  await pageB.screenshot({ path: 'test-results/live/mobile.png', fullPage: true });
  await menu(pageA, 'Settings');
  await pageA.getByRole('button', { name: 'Sign out', exact: true }).click();
  await pageA.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(pageA, b);
  await expect(pageA.getByText('QA renamed offline', { exact: true })).toHaveCount(0);
  await pageA.getByRole('button', { name: 'Things', exact: true }).click();
  await expect(pageA.getByRole('button', { name: /Edit QA/ })).toHaveCount(0);
  assert.deepEqual(errors, [], 'Browser runtime errors');
  record('Signing out and switching accounts isolates local data; no browser runtime errors');
} catch (error) {
  if (browser) {
    let index = 0;
    for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({ path: `test-results/live/failure-${index++}.png`, fullPage: true }).catch(() => {});
    }
  }
  throw error;
} finally {
  for (const socket of sockets) socket.close();
  await browser?.close();
  for (const user of users) {
    let key: Record<string, unknown> | undefined;
    do {
      const page = await ddb.send(new QueryCommand({ TableName: output.DataTableName, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': `USER#${user.subject}` }, ExclusiveStartKey: key, ConsistentRead: true }));
      for (let i = 0; i < (page.Items?.length ?? 0); i += 25) {
        let pending = page.Items!.slice(i, i + 25).map(item => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } }));
        while (pending.length) { const result = await ddb.send(new BatchWriteCommand({ RequestItems: { [output.DataTableName]: pending } })); pending = (result.UnprocessedItems?.[output.DataTableName] ?? []) as typeof pending; }
      }
      key = page.LastEvaluatedKey;
    } while (key);
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: output.UserPoolId, Username: user.username }));
  }
  await writeFile('test-results/live/checks.json', JSON.stringify({ checkedAt: new Date().toISOString(), origin, checks, temporaryUsersRemoved: users.length }, null, 2));
  console.log(`Removed ${users.length} temporary test accounts and their application partitions.`);
}
