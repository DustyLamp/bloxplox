import { Subject } from 'rxjs';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import type { RxReplicationPullStreamItem } from 'rxdb';
import type { Document } from '../../domain/src/index';
import { wireDocument, type Database } from './database';

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'retrying' | 'sign-in';
export interface SyncConfig { apiUrl: string; websocketUrl: string; token: (force?: boolean) => Promise<string>; subject: string }
type Checkpoint = { sequence: number };

export function startSync(db: Database, config: SyncConfig, onStatus: (status: SyncStatus) => void) {
  let closed = false, socket: WebSocket | undefined, reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0, lastPong = Date.now(), refreshing: Promise<string> | undefined, healthy = false;
  const stream = new Subject<RxReplicationPullStreamItem<Document, Checkpoint>>();
  async function request<T>(path: string, data?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let token: string;
      try {
        if (attempt) {
          refreshing ??= config.token(true).finally(() => { refreshing = undefined; });
          token = await refreshing;
        } else token = await config.token();
      } catch (error) { onStatus(navigator.onLine ? 'sign-in' : 'offline'); throw error; }
      const response = await fetch(`${config.apiUrl}${path}`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(20000), cache: 'no-store',
      });
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok) { if (response.status === 401) onStatus('sign-in'); throw new Error(`Sync request failed (${response.status})`); }
      return response.json();
    }
    throw new Error('Sign in again');
  }
  const replication = replicateRxCollection<Document, Checkpoint>({
    collection: db.records, replicationIdentifier: `bloxplox-v1:${config.apiUrl}:${config.subject}`,
    live: true, retryTime: 5000, waitForLeadership: true,
    pull: { batchSize: 50, stream$: stream, handler: async (checkpoint, limit) => {
      const result = await request<{ documents: Document[]; checkpoint: Checkpoint }>('/sync/pull', { checkpoint, limit });
      return { ...result, documents: result.documents.map(doc => ({ ...doc, _deleted: false })) };
    } },
    push: { batchSize: 20, handler: async rows => {
      const response = await request<{ conflicts: Document[] }>('/sync/push', { changes: rows.map(row => ({
        newDocumentState: wireDocument(row.newDocumentState), assumedMasterState: row.assumedMasterState ? wireDocument(row.assumedMasterState) : null,
      })) });
      stream.next('RESYNC');
      return response.conflicts.map(doc => ({ ...doc, _deleted: false }));
    } },
  });
  const subscriptions = [
    replication.active$.subscribe(active => {
      if (!navigator.onLine) return onStatus('offline');
      if (active) onStatus('syncing');
      else if (healthy) onStatus('synced');
    }),
    replication.error$.subscribe(() => { healthy = false; onStatus(navigator.onLine ? 'retrying' : 'offline'); }),
  ];
  replication.awaitInitialReplication().then(() => { healthy = true; if (!closed) onStatus(navigator.onLine ? 'synced' : 'offline'); }).catch(() => {});

  const resync = () => { if (!closed && navigator.onLine) { healthy = true; replication.reSync(); } };
  const reconnect = () => {
    if (closed || reconnectTimer || !navigator.onLine) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = undefined; void connect(); }, Math.min(30000, 500 * 2 ** Math.min(attempts++, 6)) + Math.random() * 300);
  };
  async function connect() {
    if (closed || !navigator.onLine) return;
    try {
      const { ticket } = await request<{ ticket: string }>('/sync/ticket');
      if (closed) return;
      const next = new WebSocket(`${config.websocketUrl}?ticket=${encodeURIComponent(ticket)}`);
      socket = next;
      next.onopen = () => { if (closed || socket !== next) return next.close(); attempts = 0; lastPong = Date.now(); resync(); };
      next.onmessage = event => {
        if (socket !== next) return;
        try { const message = JSON.parse(event.data); if (message.type === 'pong') lastPong = Date.now(); if (message.type === 'changed') resync(); } catch { /* Ignore unknown protocol frames. */ }
      };
      next.onerror = () => next.close();
      next.onclose = () => { if (socket === next) { socket = undefined; reconnect(); } };
    } catch { reconnect(); }
  }
  const heartbeat = setInterval(() => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastPong > 65000) socket.close();
    else socket.send('{"type":"ping"}');
  }, 25000);
  const fallback = setInterval(resync, 60000);
  const online = () => { resync(); if (!socket) void connect(); };
  const offline = () => { healthy = false; onStatus('offline'); socket?.close(); };
  const focus = () => { if (document.visibilityState === 'visible') online(); };
  window.addEventListener('online', online); window.addEventListener('offline', offline); document.addEventListener('visibilitychange', focus);
  void connect();
  onStatus(navigator.onLine ? 'syncing' : 'offline');
  return { replication, resync, async close() {
    closed = true; clearInterval(heartbeat); clearInterval(fallback); clearTimeout(reconnectTimer);
    window.removeEventListener('online', online); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', focus);
    socket?.close(); subscriptions.forEach(s => s.unsubscribe()); stream.complete(); await replication.cancel();
  } };
}
