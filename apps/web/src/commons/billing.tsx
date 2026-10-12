import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { initialBilling, plusEnabled, type BillingStatus } from '../../../../packages/domain/src/index';
import type { AuthService } from '../domain/auth';

interface BillingContext { status: BillingStatus; plus: boolean; loading: boolean; error: string; refresh: () => Promise<void>; checkout: (interval: 'month' | 'year') => Promise<void>; portal: () => Promise<void> }
const Context = createContext<BillingContext | null>(null);
export function useBilling() { const value = useContext(Context); if (!value) throw new Error('Billing context missing'); return value; }
export function BillingProvider({ auth, subject, children }: { auth: AuthService; subject: string; children: ReactNode }) {
  const cacheKey = `bloxplox-billing:${auth.config.userPoolId}:${subject}`;
  const [status, setStatus] = useState<BillingStatus>(() => { try { return JSON.parse(localStorage.getItem(cacheKey) ?? 'null') ?? initialBilling; } catch { return initialBilling; } });
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const request = useCallback(async (path: string, body = {}) => {
    const response = await fetch(`${auth.config.apiUrl}/billing/${path}`, { method: 'POST', headers: { authorization: `Bearer ${await auth.token()}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Billing unavailable'); return data;
  }, [auth]);
  const refresh = useCallback(async () => {
    if (!auth.config.apiUrl) { setLoading(false); return; }
    try { const next = await request('status') as BillingStatus; setStatus(next); localStorage.setItem(cacheKey, JSON.stringify(next)); setError(''); }
    catch { setError('Could not refresh your plan. Your saved data is available.'); }
    finally { setLoading(false); }
  }, [auth.config.apiUrl, cacheKey, request]);
  useEffect(() => {
    void refresh(); const focus = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(() => { if (navigator.onLine) void refresh(); }, 300000);
    window.addEventListener('online', focus); document.addEventListener('visibilitychange', focus);
    return () => { clearInterval(timer); window.removeEventListener('online', focus); document.removeEventListener('visibilitychange', focus); };
  }, [refresh]);
  const open = async (path: string, body = {}) => { const { url } = await request(path, body); const next = new URL(url); if (next.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(next.hostname)) throw new Error('Invalid billing destination'); window.location.assign(next.href); };
  return <Context.Provider value={{ status, plus: plusEnabled(status), loading, error, refresh, checkout: interval => open('checkout', { interval }), portal: () => open('portal') }}>{children}</Context.Provider>;
}
