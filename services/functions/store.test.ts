import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ items: new Map<string, any>() }));
vi.mock('./billing-config', () => ({ billingConfig: async () => ({}) }));
vi.mock('@aws-sdk/lib-dynamodb', async importOriginal => {
  const actual = await importOriginal<any>();
  const send = async (command:any) => {
    const p = command.input, key = (value:any) => `${value.pk}|${value.sk}`;
    if (command.constructor.name === 'GetCommand') return { Item: state.items.get(key(p.Key)) };
    if (command.constructor.name === 'QueryCommand') return { Items: [...state.items.values()].filter(i => i.pk === p.ExpressionAttributeValues[':pk'] && i.sk.startsWith('DOC#')) };
    if (command.constructor.name === 'TransactWriteCommand') {
      for (const {Put:put} of p.TransactItems) {
        const existing = state.items.get(key(put.Item));
        const valid = put.ConditionExpression === 'attribute_not_exists(pk)' ? !existing
          : put.ConditionExpression === '#seq = :previous' ? existing?.sequence === put.ExpressionAttributeValues[':previous'] : existing?.revision === put.ExpressionAttributeValues[':revision'];
        if (!valid) { const e = new Error('Retry'); e.name='TransactionCanceledException'; throw e; }
      }
      for (const {Put:put} of p.TransactItems) state.items.set(key(put.Item),put.Item);
      return {};
    }
    throw new Error('Unexpected command');
  };
  return { ...actual, DynamoDBDocumentClient: { from: () => ({ send }) } };
});
import { editDocument } from '../../packages/domain/src/index';
import { getDocument, pushDocument } from './store';
const makeHabit = (id:string) => editDocument(undefined,id,'habit',{name:id,description:'',type:'binary',target:1,unit:'',active:true,weekdays:[1],startDate:'2026-10-12',reminder:'',categories:[]},'phone');
beforeEach(()=>{state.items.clear();process.env.DATA_TABLE='test';});
it('serializes concurrent offline activations at the fifth habit without blocking sync or losing either record', async () => {
  for(let i=0;i<4;i++) await pushDocument('a',{newDocumentState:makeHabit(`habit-${i}`)});
  const rows=[makeHabit('fifth'),makeHabit('sixth')];
  const results=await Promise.all(rows.map(newDocumentState=>pushDocument('a',{newDocumentState})));
  expect(results.filter(Boolean)).toHaveLength(1);
  const stored=await Promise.all(rows.map(r=>getDocument('a',r.id)));
  expect(stored.filter(r=>r?.data.active)).toHaveLength(1);
  expect(stored.every(r=>r&&!r.deleted)).toBe(true);
  const limited=stored.find(r=>!r?.data.active)!;
  expect(await pushDocument('a',{newDocumentState:limited,assumedMasterState:limited})).toBeNull();
  expect(await getDocument('b',limited.id)).toBeUndefined();
});
