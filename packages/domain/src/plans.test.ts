import { expect, it } from 'vitest';
import { initialBilling, isPaidSubscription, plusEnabled } from './plans';
it('keeps all features free, including with a stale cached Free-plan entitlement', () => {
  expect(plusEnabled(initialBilling)).toBe(true);
  expect(plusEnabled({ ...initialBilling, checkoutEnabled: true, status: 'free' })).toBe(true);
});
it('requires a current, paid BloxPlox price and handles cancellation at renewal', () => {
  const s = { status:'active', items:{ data:[{price:{id:'price_plus'},current_period_end:200}]} };
  expect(isPaidSubscription(s,['price_plus'],100)).toBe(true);
  expect(isPaidSubscription(s,['price_other'],100)).toBe(false);
  expect(isPaidSubscription(s,['price_plus'],200)).toBe(false);
  for (const status of ['past_due','incomplete','canceled','unpaid']) expect(isPaidSubscription({...s,status},['price_plus'],100)).toBe(false);
});
