import { getRxStorageLocalstorage } from 'rxdb/plugins/storage-localstorage';
import { Subject } from 'rxjs';
import type { RxStorage } from 'rxdb';

/** Small synchronous SQL surface shared by Expo SQLite and the disk-backed tests. */
export interface SqliteKeyValue {
  exec(sql: string): void;
  run(sql: string, ...params: (string | number)[]): void;
  first<T>(sql: string, ...params: (string | number)[]): T | null;
}

/** RxDB's free key/value engine, backed by transactional SQLite rather than Web Storage.
 * Documents, indexes and replication checkpoints all use the same durable store.
 * One serialized queue covers every collection, including RxDB's internal collections.
 */
export function sqliteStorage(sql: SqliteKeyValue): RxStorage<any, any> {
  sql.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
  const kv: Storage = {
    get length() { return sql.first<{ n: number }>('SELECT COUNT(*) AS n FROM kv')!.n; },
    getItem: key => sql.first<{ value: string }>('SELECT value FROM kv WHERE key = ?', key)?.value ?? null,
    setItem: (key, value) => sql.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value),
    removeItem: key => sql.run('DELETE FROM kv WHERE key = ?', key),
    clear: () => sql.run('DELETE FROM kv'),
    key: index => sql.first<{ key: string }>('SELECT key FROM kv ORDER BY key LIMIT 1 OFFSET ?', index)?.key ?? null,
  };
  const base = getRxStorageLocalstorage({ localStorage: kv });
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work); queue = next.catch(() => {}); return next;
  }
  return {
    name: base.name, rxdbVersion: base.rxdbVersion,
    async createStorageInstance(params) {
      if (params.multiInstance) throw new Error('Native SQLite storage supports one app process per account.');
      const instance = await base.createStorageInstance(params);
      const committed = new Subject<any>();
      let pending: any[] | undefined;
      const subscription = instance.changeStream().subscribe({ next: event => pending ? pending.push(event) : committed.next(event), complete: () => committed.complete() });
      const output: any = Object.create(instance);
      output.changeStream = () => committed.asObservable();
      for (const key of ['bulkWrite', 'cleanup', 'remove', 'close', 'query', 'count', 'findDocumentsById', 'getAttachmentData'] as const) {
        const method = instance[key].bind(instance) as (...args: any[]) => Promise<any>;
        const writes = ['bulkWrite', 'cleanup', 'remove', 'close'].includes(key);
        output[key] = (...args: any[]) => serial(async () => {
          if (!writes) return method(...args);
          sql.exec('BEGIN IMMEDIATE'); pending = [];
          try {
            const result = await method(...args);
            sql.exec('COMMIT');
            const events = pending; pending = undefined;
            events.forEach(event => committed.next(event));
            if (key === 'close' || key === 'remove') { subscription.unsubscribe(); committed.complete(); }
            return result;
          } catch (error) { sql.exec('ROLLBACK'); pending = undefined; throw error; }
        });
      }
      return output;
    },
  };
}
