import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState, Linking, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { disableReminders } from './reminders';
import NetInfo from '@react-native-community/netinfo';
import { AuthService, type RuntimeConfig } from '../../../packages/auth/src/index';
import { defaultSettings, documentSchema, editDocument, entities, initialBilling, plans, plusEnabled, type BillingStatus, type DataByKind, type Document } from '../../../packages/domain/src/index';
import { createActions, type SaveRecord } from '../../../packages/domain/src/actions';
import { startSync, wireDocument, writeRecord, type SyncStatus } from '../../../packages/sync/src/index';
import { mobileRuntime } from '../../../packages/sync/src/runtime';
import { credentials, deviceActor, openNativeDatabase } from './storage';

let online = true;
NetInfo.addEventListener(state => { online = state.isConnected !== false && state.isInternetReachable !== false; });
export async function createAuth() {
  const cacheKey = 'production-config';
  await NetInfo.fetch().then(state => { online = state.isConnected !== false && state.isInternetReachable !== false; });
  let config: RuntimeConfig;
  try {
    if (!online) throw new Error('Connect to the internet for your first sign-in.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('https://bloxplox.com/config.json', { signal: controller.signal });
      if (!response.ok) throw new Error('Could not load configuration');
      config = await response.json();
      if (config.region !== 'eu-north-1' || !config.apiUrl.startsWith('https://') || !config.websocketUrl.startsWith('wss://')) throw new Error('Invalid application configuration');
      credentials.setItem(cacheKey, JSON.stringify(config));
    } finally { clearTimeout(timeout); }
  } catch (error) {
    const cached = credentials.getItem(cacheKey); if (!cached) throw error;
    config = JSON.parse(cached);
  }
  return new AuthService(config, { storage: credentials, isOnline: () => online, signedOut() {} });
}
interface Session {
  request(path: string, body?: unknown): Promise<any>; docs: Document[]; status: SyncStatus; save: SaveRecord; sync(): void;
  signOut(): Promise<void>; deleteAccount(skipApple?: boolean): Promise<void>; appleSignIn: boolean; email: string; billing: BillingStatus; refreshBilling(): Promise<void>;
}
const Context = createContext<Session | null>(null);
export function useData() { const value = useContext(Context); if (!value) throw new Error('Storage unavailable'); return value; }
export function useActions() { const { docs, save } = useData(); return createActions(docs, save); }
export function useSettings() {
  const { docs, save } = useData(), settings = entities(docs, 'settings').find(s => s.id === 'settings') ?? defaultSettings();
  return { settings, saveSettings: (patch: Partial<DataByKind['settings']>) => save('settings', 'settings', docs.some(d => d.id === 'settings') ? patch : { ...defaultSettings(), ...patch }) };
}
export function DataProvider({ auth, identity, onSignOut, children }: { auth: AuthService; identity: { subject: string; email: string }; onSignOut(): void; children: ReactNode }) {
  const [docs, setDocs] = useState<Document[]>([]), [status, setStatus] = useState<SyncStatus>('syncing'), [error, setError] = useState('');
  const [session, setSession] = useState<{ database: Awaited<ReturnType<typeof openNativeDatabase>>; sync: ReturnType<typeof startSync> }>();
  const billingKey = `billing:${identity.subject}`, [billing, setBilling] = useState<BillingStatus>(() => JSON.parse(credentials.getItem(billingKey) || JSON.stringify(initialBilling)));
  const pending = useRef(new Set<Promise<unknown>>()), actor = useRef(deviceActor());
  const removing = useRef(false), purge = useRef<() => Promise<void>>(async () => {});
  async function refreshBilling() {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try { const response = await fetch(`${auth.config.apiUrl}/billing/status`, { method: 'POST', headers: { authorization: `Bearer ${await auth.token()}` }, signal: controller.signal }); if (!response.ok) return; const value = await response.json(); setBilling(value); credentials.setItem(billingKey, JSON.stringify(value)); } finally { clearTimeout(timeout); }
  }
  useEffect(() => {
    let disposed = false, dispose: (() => Promise<void>) | undefined;
    void refreshBilling().catch(() => {});
    const active = AppState.addEventListener('change', state => { if (state === 'active') void refreshBilling().catch(() => {}); });
    void (async () => {
      const database = await openNativeDatabase(`${auth.config.userPoolId}:${identity.subject}`);
      if (disposed) { await database.close(); return; }
      const subscription = database.db.records.find().$.subscribe(rows => setDocs(rows.map(row => wireDocument(row.toJSON()))));
      const runtime = mobileRuntime({ isOnline: () => online, onConnection: callback => NetInfo.addEventListener(state => callback(state.isConnected !== false && state.isInternetReachable !== false)), onActive: callback => { const sub = AppState.addEventListener('change', state => { if (state === 'active') callback(); }); return () => sub.remove(); } });
      const sync = startSync(database.db, { ...auth.config, subject: identity.subject, token: force => auth.token(force), accountDeleted: () => { void purge.current().catch(error => setError(error.message)); } }, setStatus, runtime);
      let purging: Promise<void> | undefined;
      purge.current = () => purging ??= (async () => { removing.current = true; await Promise.allSettled([...pending.current]); subscription.unsubscribe(); await sync.close(); await disableReminders(); await database.remove(); credentials.removeItem(billingKey); auth.signOut(); onSignOut(); })();
      dispose = async () => { subscription.unsubscribe(); await sync.close(); await database.close(); };
      setSession({ database, sync });
      void sync.replication.awaitInitialReplication().then(async () => { if (!disposed && !removing.current && !await database.db.records.findOne('settings').exec()) await writeRecord(database.db, 'settings', 'settings', defaultSettings(), undefined, actor.current); }).catch(() => {});
      for (const [id, name, color] of [['personal', 'Personal', '#ff9b57'], ['work', 'Work', '#70b4ff'], ['learning', 'Learning', '#b48aff'], ['movement', 'Movement', '#c5ef51'], ['reading', 'Reading', '#ffe35c'], ['family', 'Family', '#ff86ac']]) {
        if (disposed || removing.current) break;
        if (await database.db.records.findOne(`category:${id}`).exec()) continue;
        const doc = editDocument(undefined, `category:${id}`, 'category', { name, color }, 'bootstrap'); doc.revision = `bootstrap-${id}`;
        try { await database.db.records.insert(documentSchema.parse(doc)); } catch { /* The first pull may have initialized it. */ }
      }
    })().catch(error => setError(error.message));
    return () => { disposed = true; active.remove(); void dispose?.(); };
  }, [auth, identity.subject]);
  const save: SaveRecord = async (id, kind, data, deleted) => {
    if (!session || removing.current) throw new Error('Storage is unavailable');
    if (kind === 'habit' && !deleted && 'active' in data && data.active && !plusEnabled(billing)) {
      const current = docs.find(d => d.id === id);
      if ((!current || current.deleted || !current.data.active) && entities(docs, 'habit').filter(h => h.active).length >= plans.free.activeHabits) throw new Error('Free includes five active habits. Make one inactive to add another.');
    }
    const write = writeRecord(session.database.db, id, kind, data, deleted, actor.current);
    pending.current.add(write); try { await write; } finally { pending.current.delete(write); }
  };
  const finishDeletion = async () => {
    await auth.request('/account/delete', { confirmation: 'DELETE' });
    await purge.current();
    Alert.alert('Account deletion started', 'Server data will be removed in a few minutes.');
  };
  const callbackWork = useRef<{ url: string; work: Promise<void> } | undefined>(undefined);
  const finishApple = (url: string) => {
    if (callbackWork.current?.url === url) return callbackWork.current.work;
    const work = auth.finishAppleDeletion(url).then(finishDeletion);
    callbackWork.current = { url, work };
    return work;
  };
  useEffect(() => {
    if (!session) return;
    const complete = (url: string | null) => {
      if (url?.startsWith('bloxplox://account-delete?')) void finishApple(url).catch(err => Alert.alert('Account not deleted', err.message));
    };
    void Linking.getInitialURL().then(complete);
    const listener = Linking.addEventListener('url', event => complete(event.url));
    return () => listener.remove();
  }, [session, auth]);
  const deleteAccount = async (skipApple = false) => {
    if (!skipApple) {
      const url = await auth.prepareAppleDeletion('bloxplox://account-delete');
      if (url) {
        const result = await WebBrowser.openAuthSessionAsync(url, 'bloxplox://account-delete');
        if (result.type === 'success') { await finishApple(result.url); return; }
        auth.cancelAppleDeletion();
        throw new Error('Apple confirmation was cancelled. Try again, or delete without Apple confirmation.');
      }
    } else auth.cancelAppleDeletion();
    await finishDeletion();
  };
  if (!session) return <View style={{ padding: 24 }}><Text>{error || 'Opening BloxPlox…'}</Text></View>;
  return <Context.Provider value={{ docs, status, save, request: (path, body) => auth.request(path, body), email: identity.email, sync: () => session.sync.resync(), billing, refreshBilling,
    deleteAccount, appleSignIn: !!auth.config.socialProviders?.includes('SignInWithApple'),
    async signOut() { await Promise.all([...pending.current]); await session.sync.close(); await disableReminders(); auth.signOut(); onSignOut(); },
  }}>{children}</Context.Provider>;
}
