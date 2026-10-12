// Release policy: keep every account free until paid access is explicitly launched.
// This also overrides a stale paid-plan cache while offline.
export const paidPlansEnabled = false;
export const plans = {
  free: { name: 'Free', activeHabits: 5 },
  plus: { name: 'Plus', monthlyAmount: 400, annualAmount: 3000 },
} as const;
export interface BillingStatus {
  plan: 'free' | 'plus'; checkoutEnabled: boolean; currency: string;
  status: string; currentPeriodEnd: number | null; cancelAtPeriodEnd: boolean;
}
export const initialBilling: BillingStatus = { plan: 'free', checkoutEnabled: false, currency: 'usd', status: 'unconfigured', currentPeriodEnd: null, cancelAtPeriodEnd: false };
export function plusEnabled(status: BillingStatus) { return !paidPlansEnabled || status.plan === 'plus' || !status.checkoutEnabled; }
export function isPaidSubscription(subscription: { status: string; items: { data: { price: { id: string }; current_period_end: number }[] } }, prices: string[], now = Date.now() / 1000) {
  return ['active', 'trialing'].includes(subscription.status) && subscription.items.data.some(item => prices.includes(item.price.id) && item.current_period_end > now);
}
