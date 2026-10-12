import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { paidPlansEnabled, plans } from '../../../../../packages/domain/src/index';
import { useBilling } from '../../commons/billing';
import { Button, ErrorText, Logo } from './common';

export function PricingCards({ currency = 'usd', action, disabled = false }: { currency?: string; action: (interval: 'month' | 'year') => void; disabled?: boolean }) {
  const [interval, setInterval] = useState<'month' | 'year'>('year');
  const money = (amount: number) => new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(amount / 100);
  if (!paidPlansEnabled) return <div className="pricing-card"><h1>Free access</h1><p>All features are free during the preview. No payment details needed.</p></div>;
  return <><div className="pricing-heading"><h1>Plans</h1><p>Choose Free or Plus.</p></div>
    <div className="pricing-grid"><article className="pricing-card"><h2>Free</h2><p className="pricing-amount">{money(0)}<small>forever</small></p><ul>{['Unlimited Blocks and Things', 'Prerequisite graphs', `${plans.free.activeHabits} active habits`, 'Offline use and cross-device sync', 'Completion history and data export'].map(text => <li key={text}><Check/>{text}</li>)}</ul></article>
      <article className="pricing-card pricing-plus"><h2>Plus</h2><div className="bp2-switch"><button type="button" aria-pressed={interval === 'month'} onClick={() => setInterval('month')}>Monthly</button><button type="button" aria-pressed={interval === 'year'} onClick={() => setInterval('year')}>Yearly</button></div>
        <p className="pricing-amount">{money(interval === 'month' ? plans.plus.monthlyAmount : plans.plus.annualAmount)}<small>per {interval}, billed {interval === 'month' ? 'monthly' : 'yearly'}</small></p>
        <ul>{['Everything in Free', 'Unlimited active habits', 'Reusable day templates', 'Detailed category reports'].map(text => <li key={text}><Check/>{text}</li>)}</ul>
        <Button primary className="bp2-full" disabled={disabled} onClick={() => action(interval)}>Choose Plus</Button><p className="bp2-muted">Cancel renewal at any time. No data deleted on downgrade.</p>
      </article></div><p className="pricing-footnote">Prices in {currency.toUpperCase()}. Any applicable tax is shown at checkout.</p></>;
}
export function PublicPricing() {
  return <div id="bloxplox-v2"><main className="pricing-page"><a href="/blocks"><Logo/></a><PricingCards action={() => window.location.assign('/blocks?returnTo=pricing')}/><a className="pricing-signin" href="/blocks">Sign in or create an account</a></main></div>;
}
export function Pricing() {
  const { status, loading, error, refresh, checkout, portal } = useBilling();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const returned = new URLSearchParams(location.search).get('checkout');
  useEffect(() => {
    if (returned !== 'success' || status.plan === 'plus') return;
    let attempts = 0; const timer = setInterval(() => { if (++attempts > 6) clearInterval(timer); else void refresh(); }, 3000);
    return () => clearInterval(timer);
  }, [returned, status.plan, refresh]);
  async function run(work: () => Promise<void>) { setBusy(true); setMessage(''); try { await work(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } }
  return <section className="pricing-page"><p className="bp2-muted">Your plan: {status.plan === 'plus' ? 'Plus' : 'Free'}</p>
    {status.plan === 'plus' ? <div className="pricing-card pricing-plus"><h1>BloxPlox Plus</h1><p>{status.cancelAtPeriodEnd ? 'Your subscription will end' : 'Your subscription renews'}{status.currentPeriodEnd ? ` on ${new Date(status.currentPeriodEnd * 1000).toLocaleDateString()}` : ''}.</p><Button primary disabled={busy} onClick={() => void run(portal)}>Manage subscription</Button><p className="bp2-muted">Change billing details, download invoices or cancel renewal.</p></div>
      : <PricingCards currency={status.currency} disabled={busy || loading || !status.checkoutEnabled} action={interval => void run(() => checkout(interval))}/>}
    {!loading && !status.checkoutEnabled && <p className="pricing-notice">Paid plans are not open yet. All current features remain available.</p>}
    {returned === 'success' && status.plan !== 'plus' && <p role="status">Confirming your subscription. If it takes a moment, use Refresh plan.</p>}
    {returned === 'cancelled' && <p>Checkout cancelled. Your plan is unchanged.</p>}
    <ErrorText message={message || error}/><Button disabled={busy} onClick={() => void run(refresh)}>Refresh plan</Button>
    {status.plan === 'free' && status.status !== 'free' && status.status !== 'unconfigured' && <Button disabled={busy} onClick={() => void run(portal)}>Manage billing</Button>}
  </section>;
}
