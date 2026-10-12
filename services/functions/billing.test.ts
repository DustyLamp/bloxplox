import { beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const state = vi.hoisted(() => ({ items: new Map<string, any>(), subscriptions: [] as any[], sessions: [] as any[], config: true, creates: 0, portals: [] as any[], subscriptionReads: 0 }));
vi.mock('./store', () => ({ ddb: { send: async (command: any) => {
  const p = command.input, key = JSON.stringify(p.Key ?? { pk:p.Item.pk, sk:p.Item.sk }), current = state.items.get(key);
  if (command.constructor.name === 'GetCommand') return { Item: current };
  const conflict = () => { const e = new Error('Conflict'); e.name = 'ConditionalCheckFailedException'; throw e; };
  if (p.ConditionExpression === 'attribute_not_exists(pk)' && current) conflict();
  if (p.ConditionExpression?.includes('expires <') && current && current.expires >= p.ExpressionAttributeValues[':now']) conflict();
  if (p.ConditionExpression === '#version = :version' && current?.version !== p.ExpressionAttributeValues[':version']) conflict();
  if (command.constructor.name === 'DeleteCommand') { if (current?.nonce !== p.ExpressionAttributeValues[':nonce']) conflict(); state.items.delete(key); }
  else state.items.set(key,p.Item);
  return {};
} } }));
vi.mock('./auth', () => ({ authenticate: async (event: any) => { if (!event.headers.authorization) throw new Error('Unauthorized'); return { subject: event.headers.authorization.replace('Bearer ',''), expires:Date.now()/1000+3600 }; } }));
vi.mock('./billing-config', async () => {
  const { default: Stripe } = await import('stripe');
  return { billingConfig: async () => state.config ? ({ secretKey:'sk_test_fixture', webhookSecret:'whsec_fixture', monthlyPriceId:'price_month', annualPriceId:'price_year', currency:'usd', automaticTax:false, portalConfigurationId:'bpc_fixture' }) : null,
    stripeClient: () => ({ webhooks: new Stripe('sk_test_fixture').webhooks,
      customers: { create: async ({metadata}:any) => ({id:`cus_${metadata.bloxploxSubject}`}), retrieve: async (id:string) => ({id,metadata:{bloxploxSubject:id.replace('cus_','')}}) },
      subscriptions: { list: ({customer}:any) => ({async *[Symbol.asyncIterator]() { state.subscriptionReads++; for (const s of state.subscriptions.filter(s => s.customer === customer)) yield s; }}) },
      checkout: { sessions: { list: async ({customer}:any) => ({data:state.sessions.filter(s => s.customer === customer && s.status === 'open')}), create: async (input:any) => { state.creates++; const session = {...input,id:`cs_${state.creates}`,status:'open',url:'https://checkout.stripe.com/c/pay/fixture'}; state.sessions.push(session); return session; }, expire: async (id:string) => { state.sessions.find(s => s.id === id).status = 'expired'; } } },
      billingPortal: { sessions: { create: async (input:any) => {state.portals.push(input); return {url:'https://billing.stripe.com/p/session/fixture'};} } },
    }),
  };
});
import { handler } from './billing';
const event = (path: string, owner = 'a', body:unknown = {}): APIGatewayProxyEventV2 => ({ rawPath:`/billing/${path}`, body:JSON.stringify(body), headers:owner ? {authorization:`Bearer ${owner}`} : {}, requestContext:{http:{method:'POST'},requestId:'test'} } as APIGatewayProxyEventV2);
const stored = (owner:string) => state.items.get(JSON.stringify({pk:`USER#${owner}`,sk:'BILLING'}));
const subscription = (owner:string, status = 'active') => ({ id:'sub_a',customer:`cus_${owner}`,created:100,status,cancel_at_period_end:true,items:{data:[{price:{id:'price_year'},current_period_end:Math.floor(Date.now()/1000)+86400}]} });
beforeEach(() => { state.items.clear(); state.subscriptions=[]; state.sessions=[]; state.creates=0; state.portals=[]; state.subscriptionReads=0; state.config=true; process.env.DATA_TABLE='test'; process.env.PRODUCTION_ORIGIN='https://bloxplox.com'; });
describe('Billing API', () => {
  it('requires authentication and keeps payment access disabled before configuration', async () => {
    expect((await handler(event('status',''))).statusCode).toBe(401);
    state.config=false;
    expect(JSON.parse((await handler(event('status'))).body)).toMatchObject({checkoutEnabled:false,plan:'free'});
    expect((await handler(event('checkout','a',{interval:'year'}))).statusCode).toBe(503);
  });
  it('takes price and account identity only from server configuration and authentication', async () => {
    expect((await handler(event('checkout','a',{interval:'year',subject:'b',price:'free'}))).statusCode).toBe(400);
    expect((await handler(event('checkout','a',{interval:'year'}))).statusCode).toBe(200);
    expect(state.sessions[0]).toMatchObject({customer:'cus_a',line_items:[{price:'price_year',quantity:1}],client_reference_id:'a',success_url:'https://bloxplox.com/pricing?checkout=success'});
    expect(stored('b')).toBeUndefined();
    expect((await handler(event('portal','b',{customer:'cus_a'}))).statusCode).toBe(409);
  });
  it('reuses an open checkout after retries and routes existing Plus accounts to billing management', async () => {
    await handler(event('checkout','a',{interval:'year'}));
    await handler(event('checkout','a',{interval:'year'}));
    expect(state.creates).toBe(1);
    state.subscriptions=[subscription('a')];
    expect(JSON.parse((await handler(event('checkout','a',{interval:'month'}))).body).url).toContain('billing.stripe.com');
    expect(state.creates).toBe(1); expect(state.portals[0].customer).toBe('cus_a');
  });
  it('expires the previous checkout before changing the selected interval', async () => {
    await handler(event('checkout','a',{interval:'year'})); await handler(event('checkout','a',{interval:'month'}));
    expect(state.sessions.filter(s => s.status === 'open')).toHaveLength(1);
    expect(state.sessions.find(s => s.status === 'open').line_items[0].price).toBe('price_month');
  });
  it('serializes simultaneous checkouts from different devices', async () => {
    const results = await Promise.all([handler(event('checkout','a',{interval:'month'})), handler(event('checkout','a',{interval:'year'}))]);
    expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]); expect(state.creates).toBe(1);
  });
  it('keeps access until paid cancellation ends, then revokes access without touching application data', async () => {
    await handler(event('checkout','a',{interval:'year'})); state.subscriptions=[subscription('a')];
    expect(JSON.parse((await handler(event('status'))).body)).toMatchObject({plan:'plus',cancelAtPeriodEnd:true});
    state.subscriptions=[subscription('a','canceled')];
    expect(JSON.parse((await handler(event('status'))).body).plan).toBe('free');
    expect(state.items.size).toBe(1);
  });
  it('verifies raw webhook signatures, handles redelivery once and ignores stale payload state', async () => {
    await handler(event('checkout','a',{interval:'year'})); state.subscriptions=[subscription('a','canceled')];
    const payload = JSON.stringify({id:'evt_test',object:'event',created:1,livemode:false,type:'customer.subscription.updated',data:{object:subscription('a')}});
    const e = event('webhook',''); e.body=payload;
    expect((await handler(e)).statusCode).toBe(400);
    e.headers['stripe-signature'] = Stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_fixture'});
    e.body=Buffer.from(payload).toString('base64'); e.isBase64Encoded=true;
    expect((await handler(e)).statusCode).toBe(200);
    expect(stored('a').billing.plan).toBe('free');
    const reads = state.subscriptionReads;
    expect((await handler(e)).statusCode).toBe(200); expect(state.subscriptionReads).toBe(reads);
  });
});
