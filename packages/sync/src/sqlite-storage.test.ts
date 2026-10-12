import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteStorage } from './sqlite-storage';
import { createDatabase, writeRecord } from './database';

const folders: string[] = [];
afterEach(() => { for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true }); });
function disk() {
  const path = mkdtempSync(join(tmpdir(), 'bloxplox-native-')); folders.push(path);
  const open = () => {
    const db = new DatabaseSync(join(path, 'account.sqlite'));
    let failAfter = 0;
    const storage = sqliteStorage({ exec: sql => { db.exec(sql); }, run: (sql, ...params) => { if (sql.startsWith('INSERT') && failAfter > 0 && --failAfter === 0) { throw new Error('Disk full'); } db.prepare(sql).run(...params); }, first: <T>(sql: string, ...params: (string | number)[]) => db.prepare(sql).get(...params) as T ?? null });
    return { storage, close: () => db.close(), failAfterWrites: (n: number) => { failAfter = n; } };
  };
  return open;
}
const thing = (name: string) => ({ name, notes: '', categories: [], estimate: null, dueDate: null, completedOn: null, order: 1 });
describe('native SQLite durability', () => {
  it('survives a process restart with more than 500 documents and isolates accounts', async () => {
    const open = disk(); let diskDb = open();
    let db = await createDatabase('native-a', diskDb.storage);
    for (let offset = 0; offset < 620; offset += 20) await Promise.all(Array.from({ length: 20 }, (_, n) => writeRecord(db, `thing-${offset + n}`, 'thing', thing(`Thing ${offset + n}`), undefined, 'phone')));
    await writeRecord(db, 'thing-619', 'thing', { notes: 'Saved offline' }, undefined, 'phone');
    await db.close(); diskDb.close(); diskDb = open(); db = await createDatabase('native-a', diskDb.storage);
    expect(await db.records.count().exec()).toBe(620);
    expect((await db.records.findOne('thing-619').exec())?.data.notes).toBe('Saved offline');
    const other = await createDatabase('native-b', diskDb.storage);
    expect(await other.records.count().exec()).toBe(0);
    await other.close(); await db.close(); diskDb.close();
  }, 20000);
  it('rolls back document and index updates when storage fails', async () => {
    const open = disk(); let diskDb = open(); let db = await createDatabase('failure', diskDb.storage);
    await writeRecord(db, 'thing-a', 'thing', thing('Original'), undefined, 'phone');
    diskDb.failAfterWrites(2);
    await expect(writeRecord(db, 'thing-a', 'thing', { name: 'Unsaved' }, undefined, 'phone')).rejects.toThrow('Disk full');
    await db.close(); diskDb.close(); diskDb = open(); db = await createDatabase('failure', diskDb.storage);
    expect((await db.records.findOne('thing-a').exec())?.data.name).toBe('Original');
    await writeRecord(db, 'thing-a', 'thing', { notes: 'Recovered' }, undefined, 'phone');
    expect((await db.records.findOne('thing-a').exec())?.data.notes).toBe('Recovered');
    await db.close(); diskDb.close();
  });
});
