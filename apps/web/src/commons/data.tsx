import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { defaultSettings, documentSchema, editDocument, entities, type DataByKind, type Document, type Kind } from '../../../../packages/domain/src/index';
import { openDatabase, startSync, wireDocument, writeRecord, type Database, type SyncStatus } from '../../../../packages/sync/src/index';
import type { AuthService } from '../domain/auth';
import { useBilling } from './billing';
import { plans } from '../../../../packages/domain/src/index';

interface DataContextValue {
  docs: Document[]; status: SyncStatus; saving: boolean; save: <K extends Kind>(id: string, kind: K, data: Partial<DataByKind[K]>, deleted?: boolean) => Promise<void>;
  request: (path: string, body?: unknown) => Promise<any>; sync: () => void; signOut: () => Promise<void>; email: string; error: string; clearError: () => void;
}
const Context = createContext<DataContextValue | null>(null);
export const useData = () => { const value = useContext(Context); if (!value) throw new Error('Database unavailable'); return value; };

export function DataProvider({ auth, identity, onSignOut, children }: { auth: AuthService; identity: { subject: string; email: string }; onSignOut: () => void; children: ReactNode }) {
  const { plus } = useBilling();
  const [docs, setDocs] = useState<Document[]>([]), [status, setStatus] = useState<SyncStatus>('syncing');
  const [session, setSession] = useState<{ db: Database; sync?: ReturnType<typeof startSync> }>(), [error, setError] = useState('');
  const pendingWrites = useRef(new Set<Promise<unknown>>()), [saving, setSaving] = useState(false);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (pendingWrites.current.size) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  useEffect(() => {
    let cancelled = false, dispose: (() => Promise<void>) | undefined;
    void (async () => {
      const db = await openDatabase(`${auth.config.userPoolId}:${identity.subject}`);
      if (cancelled) { await db.close(); return; }
      const subscription = db.records.find().$.subscribe(rows => setDocs(rows.map(row => wireDocument(row.toJSON()))));
      const sync = auth.config.apiUrl ? startSync(db, { ...auth.config, subject: identity.subject, token: force => auth.token(force) }, setStatus) : undefined;
      dispose = async () => { subscription.unsubscribe(); await sync?.close(); await db.close(); };
      setSession({ db, sync });
      if (!sync) setStatus('offline');
      const initializeSettings = async () => {
        if (cancelled || await db.records.findOne('settings').exec()) return;
        const settings = defaultSettings();
        await writeRecord(db, 'settings', 'settings', settings);
      };
      // Pull an existing account's timezone before assigning this device's default.
      if (sync) void sync.replication.awaitInitialReplication().then(initializeSettings).catch(() => {});
      else await initializeSettings();
      // Stable defaults safely coalesce if two newly signed-in devices initialize together.
      const defaults = [
        ['personal', 'Personal', '#ff9b57'], ['work', 'Work', '#70b4ff'], ['learning', 'Learning', '#b48aff'],
        ['movement', 'Movement', '#c5ef51'], ['reading', 'Reading', '#ffe35c'], ['family', 'Family', '#ff86ac'],
      ];
      for (const [id, name, color] of defaults) {
        if (await db.records.findOne(`category:${id}`).exec()) continue;
        const next = editDocument(undefined, `category:${id}`, 'category', { name, color }, 'bootstrap');
        next.revision = `bootstrap-${id}`;
        try { await db.records.insert(documentSchema.parse(next)); } catch { /* Another tab initialized it. */ }
      }
    })().catch(err => setError(err instanceof Error ? err.message : 'Could not open local storage'));
    return () => { cancelled = true; void dispose?.(); };
  }, [auth, identity.subject]);
  const save: DataContextValue['save'] = async (id, kind, data, deleted) => {
    if (!session) throw new Error('Still opening storage');
    if (kind === 'habit' && !deleted && 'active' in data && data.active && !plus) {
      const current = docs.find(d => d.id === id);
      if ((!current || current.deleted || !current.data.active) && entities(docs, 'habit').filter(h => h.active).length >= plans.free.activeHabits) throw new Error('Free includes five active habits. Make one inactive or choose Plus from Pricing.');
    }
    const write = writeRecord(session.db, id, kind, data, deleted);
    pendingWrites.current.add(write); setSaving(true);
    try { await write; }
    catch (err) { const message = err instanceof Error ? err.message : 'Could not save'; setError(message); throw err; }
    finally { pendingWrites.current.delete(write); setSaving(pendingWrites.current.size > 0); }
  };
  const signOut = async () => {
    await Promise.all([...pendingWrites.current]);
    await session?.sync?.close();
    auth.signOut(); onSignOut();
  };
  useEffect(() => {
    const channel = new BroadcastChannel('bloxplox-auth');
    channel.onmessage = event => { if (event.data === 'signed-out') { void session?.sync?.close(); onSignOut(); } };
    return () => channel.close();
  }, [session, onSignOut]);
  if (!session) return <main className="loading" role="status">{error || 'Opening BloxPlox…'}</main>;
  return <Context.Provider value={{ docs, status, saving, save, request: (path, body) => auth.config.apiUrl ? auth.request(path, body) : Promise.resolve({ enabled: false, accounts: [], sources: [] }), sync: () => session.sync?.resync(), signOut, email: identity.email, error, clearError: () => setError('') }}>{children}</Context.Provider>;
}
export function useSettings() {
  const { docs, save } = useData();
  const settings = entities(docs, 'settings').find(s => s.id === 'settings') ?? defaultSettings();
  return { settings, saveSettings: (patch: Partial<DataByKind['settings']>) => {
    if (docs.some(d => d.id === 'settings')) return save('settings', 'settings', patch);
    const { layout, timezone, dayStart, autoBacklog } = settings;
    return save('settings', 'settings', { layout, timezone, dayStart, autoBacklog, ...patch });
  } };
}
