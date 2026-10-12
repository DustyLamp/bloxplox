import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase, type RxJsonSchema, type RxStorage } from 'rxdb';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { documentSchema, editDocument, mergeDocuments, sameContent, type Document, type Kind, type DataByKind } from '../../domain/src/index';

addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBMigrationSchemaPlugin);
export type Database = RxDatabase<{ records: RxCollection<Document> }>;
export const schema: RxJsonSchema<Document> = {
  title: 'BloxPlox records', version: 0, primaryKey: 'id', type: 'object',
  properties: {
    id: { type: 'string', maxLength: 180 }, kind: { type: 'string' },
    data: { type: 'object', additionalProperties: true }, clocks: { type: 'object', additionalProperties: true },
    deleted: { type: 'boolean' }, revision: { type: 'string' },
  }, required: ['id', 'kind', 'data', 'clocks', 'deleted', 'revision'],
};
export function wireDocument(doc: Document): Document {
  return { id: doc.id, kind: doc.kind, data: doc.data, clocks: doc.clocks, deleted: doc.deleted, revision: doc.revision };
}
export async function openDatabase(subject: string): Promise<Database> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subject));
  const name = `bloxplox-${Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  const { getRxStorageDexie } = await import('rxdb/plugins/storage-dexie');
  return createDatabase(name, getRxStorageDexie(), true);
}
export async function createDatabase(name: string, storage: RxStorage<any, any>, multiInstance = false): Promise<Database> {
  const db = await createRxDatabase<{ records: RxCollection<Document> }>({ name, storage, multiInstance });
  await db.addCollections({ records: { schema, migrationStrategies: {}, conflictHandler: {
    isEqual: (a, b) => sameContent(a, b),
    resolve: async ({ realMasterState, newDocumentState }) => ({ ...mergeDocuments(realMasterState, newDocumentState), _deleted: false }),
  } } });
  return db;
}
export function deviceId(): string {
  const key = 'bloxplox-device';
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
}
export async function writeRecord<K extends Kind>(db: Database, id: string, kind: K, data: Partial<DataByKind[K]>, deleted?: boolean, actor = deviceId()) {
  const existing = await db.records.findOne(id).exec();
  if (existing) {
    await existing.incrementalModify(previous => {
      const next = editDocument(wireDocument(previous), id, kind, data, actor, deleted ?? previous.deleted);
      documentSchema.parse(next);
      return next;
    });
  } else {
    const next = editDocument(undefined, id, kind, data, actor, deleted ?? false);
    documentSchema.parse(next);
    try { await db.records.insert(next); }
    catch (error) {
      // Another tab may have inserted the same deterministic occurrence/result.
      const concurrent = await db.records.findOne(id).exec();
      if (!concurrent) throw error;
      await concurrent.incrementalModify(previous => editDocument(wireDocument(previous), id, kind, data, actor, deleted ?? previous.deleted));
    }
  }
}
