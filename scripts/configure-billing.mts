// Run only after the business account, currency and tax setup are confirmed.
// Supply STRIPE_SECRET_KEY through the environment, never a command-line argument.
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { SecretsManagerClient, CreateSecretCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { fromIni } from '@aws-sdk/credential-providers';
import { plans } from '../packages/domain/src/plans';

const currency = process.env.BLOXPLOX_BILLING_CURRENCY, country = process.env.BLOXPLOX_BUSINESS_COUNTRY, accountId = process.env.BLOXPLOX_STRIPE_ACCOUNT;
assert(currency && ['usd','chf','eur','gbp'].includes(currency), 'Set BLOXPLOX_BILLING_CURRENCY explicitly');
assert(country && /^[A-Z]{2}$/.test(country), 'Set BLOXPLOX_BUSINESS_COUNTRY explicitly');
assert(accountId?.startsWith('acct_'), 'Set the confirmed BLOXPLOX_STRIPE_ACCOUNT');
const secretKey = process.env.STRIPE_SECRET_KEY;
assert(secretKey && /^sk_(live|test)_/.test(secretKey), 'Supply STRIPE_SECRET_KEY through a secure environment');
if (secretKey.startsWith('sk_live_')) assert(process.argv.includes('--live'), 'Live configuration requires --live');
assert(process.env.BLOXPLOX_TAX_READY === 'true', 'Confirm Stripe Tax registrations and business details first, then set BLOXPLOX_TAX_READY=true');
const stripe = new Stripe(secretKey), account = await stripe.accounts.retrieve(null);
assert.equal(account.id, accountId, 'Wrong Stripe account'); if (secretKey.startsWith('sk_live_')) assert(account.charges_enabled, 'Stripe account is not ready to accept payments'); assert.equal(account.country, country, 'Wrong business country');
const region = 'eu-north-1', credentials = fromIni({ profile: process.env.AWS_PROFILE || 'bloxplox' });
const stack = (await new CloudFormationClient({ region, credentials }).send(new DescribeStacksCommand({ StackName: 'bloxplox-production' }))).Stacks![0];
assert(stack.StackId?.includes(':807550663091:'), 'Wrong AWS account');
const api = stack.Outputs!.find(o => o.OutputKey === 'ApiUrl')!.OutputValue!;
const productId = 'bloxplox_plus_v1';
try { await stripe.products.retrieve(productId); }
catch (e) { if (!(e instanceof Stripe.errors.StripeInvalidRequestError) || e.code !== 'resource_missing') throw e; await stripe.products.create({ id: productId, name: 'BloxPlox Plus', description: 'Unlimited active habits, day templates and detailed category reports.' }); }
async function price(interval: 'month' | 'year', amount: number) {
  const key = `bloxplox_plus_${currency}_${interval}_v1`;
  const existing = (await stripe.prices.list({ lookup_keys: [key], active: true })).data[0];
  if (existing) { assert.equal(existing.unit_amount, amount); assert.equal(existing.currency, currency); assert.equal(existing.tax_behavior, 'inclusive'); assert.equal(existing.recurring?.interval, interval); return existing.id; }
  return (await stripe.prices.create({ product: productId, currency: currency!, unit_amount: amount, recurring: { interval }, tax_behavior: 'inclusive', lookup_key: key }, { idempotencyKey: key })).id;
}
const monthlyPriceId = await price('month', plans.plus.monthlyAmount), annualPriceId = await price('year', plans.plus.annualAmount);
const portalConfiguration = await stripe.billingPortal.configurations.create({ business_profile: { headline: 'Manage BloxPlox Plus' }, features: {
  customer_update: { enabled: true, allowed_updates: ['email','address','tax_id'] }, invoice_history: { enabled: true }, payment_method_update: { enabled: true }, subscription_cancel: { enabled: true, mode: 'at_period_end' },
} }, { idempotencyKey: `bloxplox-portal-v1:${currency}` });
const webhookUrl = `${api}/billing/webhook`;
// Stripe only returns a signing secret at creation. Keep an existing configured
// secret on rerun; don't replace a functioning endpoint and lose its history.
const secrets = new SecretsManagerClient({ region, credentials });
const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
let previous: Record<string,string> | undefined;
try { previous = JSON.parse((await secrets.send(new GetSecretValueCommand({ SecretId: 'bloxplox/stripe' }))).SecretString!); }
catch(e) { if (!(e instanceof Error) || e.name !== 'ResourceNotFoundException') throw e; }
if (previous) assert.equal(previous.secretKey, secretKey, 'Use a separate test account/configuration for payment-mode changes');
const webhookSecret = previous?.webhookSecret ?? (await stripe.webhookEndpoints.create({ url: webhookUrl, enabled_events: ['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'] }, { idempotencyKey: `bloxplox-webhook:${api}` })).secret!;
const SecretString = JSON.stringify({ secretKey, webhookSecret, monthlyPriceId, annualPriceId, currency, automaticTax: true, portalConfigurationId: portalConfiguration.id });
if (previous) await secrets.send(new PutSecretValueCommand({ SecretId: 'bloxplox/stripe', SecretString }));
else await secrets.send(new CreateSecretCommand({ Name: 'bloxplox/stripe', Description: 'BloxPlox Stripe billing configuration', SecretString }));
console.log(`Configured BloxPlox Plus in ${currency.toUpperCase()} (${secretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST'} mode). Secrets stored in AWS Secrets Manager.`);
