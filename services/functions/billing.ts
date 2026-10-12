import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { initialBilling } from '../../packages/domain/src/index';
import { authenticate } from './auth';
import { ddb } from './store';
import { billingConfig, stripeClient } from './billing-config';
import { customerFor, refreshBilling, storedBilling } from './billing-store';

const response = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const inputSchema = z.object({ interval: z.enum(['month', 'year']) }).strict();
export async function handler(event: APIGatewayProxyEventV2) {
  try {
    if (event.rawPath === '/billing/webhook') {
      const config = await billingConfig(); if (!config) return response(503, { error: 'Billing is not configured' });
      const stripe = stripeClient(config);
      let notification;
      try { notification = stripe.webhooks.constructEvent(Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8'), event.headers['stripe-signature'] ?? '', config.webhookSecret); }
      catch { return response(400, { error: 'Invalid signature' }); }
      if (notification.livemode !== config.secretKey.startsWith('sk_live_')) return response(400, { error: 'Wrong payment mode' });
      if (!['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'].includes(notification.type)) return response(200, { received: true });
      const key = { pk: `STRIPE#${notification.id}`, sk: 'RECEIPT' };
      if ((await ddb.send(new GetCommand({ TableName: process.env.DATA_TABLE!, Key: key }))).Item) return response(200, { received: true });
      const object = notification.data.object as { customer?: string };
      if (typeof object.customer === 'string') {
        const customer = await stripe.customers.retrieve(object.customer);
        if (!customer.deleted && customer.metadata.bloxploxSubject) {
          const owner = customer.metadata.bloxploxSubject, saved = await storedBilling(owner);
          if (saved?.customerId === customer.id) await refreshBilling(stripe, config, owner);
        }
      }
      await ddb.send(new PutCommand({ TableName: process.env.DATA_TABLE!, Item: { ...key, expires: Math.floor(Date.now() / 1000) + 31 * 86400 } }));
      return response(200, { received: true });
    }
    const { subject } = await authenticate(event);
    const config = await billingConfig();
    if (event.rawPath === '/billing/status') return response(200, config ? await refreshBilling(stripeClient(config), config, subject) : initialBilling);
    if (!config) return response(503, { error: 'Paid plans are not open yet. Your current features remain available.' });
    const stripe = stripeClient(config), origin = process.env.PRODUCTION_ORIGIN!;
    if (event.rawPath === '/billing/portal') {
      const current = await storedBilling(subject);
      if (!current?.customerId) return response(409, { error: 'No billing account yet.' });
      const portal = await stripe.billingPortal.sessions.create({ configuration: config.portalConfigurationId, customer: current.customerId, return_url: `${origin}/pricing` });
      return response(200, { url: portal.url });
    }
    if (event.rawPath !== '/billing/checkout') return response(404, { error: 'Not found' });
    const { interval } = inputSchema.parse(JSON.parse(event.body ?? '{}'));
    const lock = { pk: `USER#${subject}`, sk: 'CHECKOUT_LOCK' }, nonce = randomUUID(), now = Math.floor(Date.now() / 1000);
    try { await ddb.send(new PutCommand({ TableName: process.env.DATA_TABLE!, Item: { ...lock, nonce, expires: now + 60 }, ConditionExpression: 'attribute_not_exists(pk) OR expires < :now', ExpressionAttributeValues: { ':now': now } })); }
    catch (e) { if (e instanceof Error && e.name === 'ConditionalCheckFailedException') return response(409, { error: 'Checkout is already opening. Try again shortly.' }); throw e; }
    try {
      const customer = await customerFor(stripe, subject), billing = await refreshBilling(stripe, config, subject);
      if (billing.plan === 'plus' || ['incomplete','past_due','unpaid','paused'].includes(billing.status)) return response(200, { url: (await stripe.billingPortal.sessions.create({ configuration: config.portalConfigurationId, customer, return_url: `${origin}/pricing` })).url });
      // Reuse retries. Switching interval first expires the old checkout under
      // the per-account lock, so only one payment session can remain open.
      const open = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 100 });
      const price = interval === 'month' ? config.monthlyPriceId : config.annualPriceId;
      const existing = open.data.filter(s => s.mode === 'subscription' && s.metadata?.bloxploxSubject === subject);
      const matching = existing.find(s => s.metadata?.priceId === price);
      for (const session of existing.filter(s => s.id !== matching?.id)) await stripe.checkout.sessions.expire(session.id);
      if (matching?.url) return response(200, { url: matching.url });
      const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer, client_reference_id: subject,
        line_items: [{ price, quantity: 1 }], metadata: { bloxploxSubject: subject, priceId: price }, subscription_data: { metadata: { bloxploxSubject: subject } },
        success_url: `${origin}/pricing?checkout=success`, cancel_url: `${origin}/pricing?checkout=cancelled`,
        billing_address_collection: 'auto', expires_at: now + 1800,
        automatic_tax: { enabled: config.automaticTax },
      }, { idempotencyKey: `bloxplox-checkout:${subject}:${nonce}` });
      return response(200, { url: session.url });
    } finally {
      await ddb.send(new DeleteCommand({ TableName: process.env.DATA_TABLE!, Key: lock, ConditionExpression: 'nonce = :nonce', ExpressionAttributeValues: { ':nonce': nonce } }));
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return response(401, { error: 'Sign in again' });
    if (e instanceof z.ZodError || e instanceof SyntaxError) return response(400, { error: 'Invalid request' });
    console.error('billing_request_failed', { requestId: event.requestContext.requestId, name: e instanceof Error ? e.name : 'Error' });
    return response(503, { error: 'Billing is unavailable. Try again shortly.' });
  }
}
