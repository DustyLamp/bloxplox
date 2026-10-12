import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { z } from 'zod';
import Stripe from 'stripe';

const schema = z.object({ secretKey: z.string().regex(/^sk_(test|live)_/), webhookSecret: z.string().startsWith('whsec_'), monthlyPriceId: z.string().startsWith('price_'), annualPriceId: z.string().startsWith('price_'), currency: z.string().regex(/^[a-z]{3}$/), automaticTax: z.boolean(), portalConfigurationId: z.string().startsWith('bpc_') });
export type BillingConfig = z.infer<typeof schema>;
const secrets = new SecretsManagerClient({});
let cached: { config: BillingConfig | null; until: number } | undefined;
export async function billingConfig(): Promise<BillingConfig | null> {
  if (process.env.PAID_PLANS_ENABLED !== 'true' || !process.env.STRIPE_SECRET_NAME) return null;
  if (cached && cached.until > Date.now()) return cached.config;
  try {
    const value = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.STRIPE_SECRET_NAME }));
    const config = schema.parse(JSON.parse(value.SecretString ?? '{}'));
    cached = { config, until: Date.now() + 60_000 }; return config;
  } catch (e) {
    if (e instanceof Error && e.name === 'ResourceNotFoundException') { cached = { config: null, until: Date.now() + 60_000 }; return null; }
    throw e;
  }
}
export const stripeClient = (config: BillingConfig) => new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 10000 });
