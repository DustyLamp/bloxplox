import { randomUUID } from 'node:crypto';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type Stripe from 'stripe';
import { initialBilling, isPaidSubscription, type BillingStatus } from '../../packages/domain/src/index';
import type { BillingConfig } from './billing-config';
import { ddb } from './store';

export const billingKey = (owner: string) => ({ pk: `USER#${owner}`, sk: 'BILLING' });
export async function storedBilling(owner: string) {
  const item = (await ddb.send(new GetCommand({ TableName: process.env.DATA_TABLE!, Key: billingKey(owner), ConsistentRead: true }))).Item;
  return item as { customerId?: string; version?: string; billing?: BillingStatus; checkedAt?: number } | undefined;
}
export async function customerFor(stripe: Stripe, owner: string) {
  const prior = await storedBilling(owner);
  if (prior?.customerId) return prior.customerId;
  const customer = await stripe.customers.create({ metadata: { bloxploxSubject: owner } }, { idempotencyKey: `bloxplox-customer:${owner}` });
  try { await ddb.send(new PutCommand({ TableName: process.env.DATA_TABLE!, Item: { ...billingKey(owner), customerId: customer.id, version: randomUUID() }, ConditionExpression: 'attribute_not_exists(pk)' })); }
  catch (e) { if (!(e instanceof Error) || e.name !== 'ConditionalCheckFailedException') throw e; }
  return (await storedBilling(owner))!.customerId!;
}

/** Read current Stripe state, never trust a delayed event's subscription payload.
 * Optimistic versioning makes concurrent deliveries re-read rather than regress.
 */
export async function refreshBilling(stripe: Stripe, config: BillingConfig, owner: string): Promise<BillingStatus> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await storedBilling(owner);
    if (!current?.customerId) return { ...initialBilling, checkoutEnabled: true, currency: config.currency, status: 'free' };
    const subscriptions: Stripe.Subscription[] = [];
    for await (const s of stripe.subscriptions.list({ customer: current.customerId, status: 'all', limit: 100 })) subscriptions.push(s);
    const prices = [config.monthlyPriceId, config.annualPriceId];
    const subscription = subscriptions.find(s => isPaidSubscription(s, prices));
    const last = subscription ?? subscriptions.filter(s => s.items.data.some(i => prices.includes(i.price.id))).sort((a,b) => b.created - a.created)[0];
    const billing: BillingStatus = { plan: subscription ? 'plus' : 'free', checkoutEnabled: true, currency: config.currency,
      status: last?.status ?? 'free', currentPeriodEnd: last ? Math.max(...last.items.data.map(i => i.current_period_end)) : null, cancelAtPeriodEnd: last?.cancel_at_period_end ?? false };
    try {
      await ddb.send(new PutCommand({ TableName: process.env.DATA_TABLE!, Item: { ...billingKey(owner), customerId: current.customerId, version: randomUUID(), billing, checkedAt: Date.now() },
        ConditionExpression: '#version = :version', ExpressionAttributeNames: { '#version': 'version' }, ExpressionAttributeValues: { ':version': current.version } }));
      return billing;
    } catch (e) { if (!(e instanceof Error) || e.name !== 'ConditionalCheckFailedException') throw e; }
  }
  throw new Error('Billing is updating. Try again.');
}
