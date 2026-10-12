import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Text, View } from 'react-native';
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
  let config: RuntimeConfig;
  try {
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
  await NetInfo.fetch().then(state => { online = state.isConnected !== false && state.isInternetReachable !== false; });
  return new AuthService(config, { storage: credentials, isOnline: () => online, signedOut() {} });
}
interface Session {
  request(path: string, body?: unknown): Promise<any>; docs: Document[]; status: SyncStatus; save: SaveRecord; sync(): void;
  signOut(): Promise<void>; email: string; billing: BillingStatus; refreshBilling(): Promise<void>;
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
      const sync = startSync(database.db, { ...auth.config, subject: identity.subject, token: force => auth.token(force) }, setStatus, runtime);
      dispose = async () => { subscription.unsubscribe(); await sync.close(); await database.close(); };
      setSession({ database, sync });
      void sync.replication.awaitInitialReplication().then(async () => { if (!disposed && !await database.db.records.findOne('settings').exec()) await writeRecord(database.db, 'settings', 'settings', defaultSettings(), undefined, actor.current); }).catch(() => {});
      for (const [id, name, color] of [['personal', 'Personal', '#ff9b57'], ['work', 'Work', '#70b4ff'], ['learning', 'Learning', '#b48aff'], ['movement', 'Movement', '#c5ef51'], ['reading', 'Reading', '#ffe35c'], ['family', 'Family', '#ff86ac']]) {
        if (await database.db.records.findOne(`category:${id}`).exec()) continue;
        const doc = editDocument(undefined, `category:${id}`, 'category', { name, color }, 'bootstrap'); doc.revision = `bootstrap-${id}`;
        try { await database.db.records.insert(documentSchema.parse(doc)); } catch { /* The first pull may have initialized it. */ }
      }
    })().catch(error => setError(error.message));
    return () => { disposed = true; active.remove(); void dispose?.(); };
  }, [auth, identity.subject]);
  const save: SaveRecord = async (id, kind, data, deleted) => {
    if (!session) throw new Error('Storage is still opening');
    if (kind === 'habit' && !deleted && 'active' in data && data.active && !plusEnabled(billing)) {
      const current = docs.find(d => d.id === id);
      if ((!current || current.deleted || !current.data.active) && entities(docs, 'habit').filter(h => h.active).length >= plans.free.activeHabits) throw new Error('Free includes five active habits. Make one inactive to add another.');
    }
    const write = writeRecord(session.database.db, id, kind, data, deleted, actor.current);
    pending.current.add(write); try { await write; } finally { pending.current.delete(write); }
  };
  if (!session) return <View style={{ padding: 24 }}><Text>{error || 'Opening BloxPlox…'}</Text></View>;
  return <Context.Provider value={{ docs, status, save, request: (path, body) => auth.request(path, body), email: identity.email, sync: () => session.sync.resync(), billing, refreshBilling,
    async signOut() { await Promise.all([...pending.current]); await session.sync.close(); await disableReminders(); auth.signOut(); onSignOut(); },
  }}>{children}</Context.Provider>;
}
