import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createDatabase } from '../../../packages/sync/src/database';
import { sqliteStorage } from '../../../packages/sync/src/sqlite-storage';

const secureKey = (key: string) => `bp.${Array.from(new TextEncoder().encode(key)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
export const credentials = {
  getItem(key: string) { return SecureStore.getItem(secureKey(key)) || null; },
  setItem(key: string, value: string) {
    const keys = new Set<string>(JSON.parse(SecureStore.getItem('bp.keys') || '[]')); keys.add(secureKey(key));
    SecureStore.setItem('bp.keys', JSON.stringify([...keys]), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    SecureStore.setItem(secureKey(key), value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  clear() { for (const key of JSON.parse(SecureStore.getItem('bp.keys') || '[]')) SecureStore.setItem(key, ''); SecureStore.setItem('bp.keys', '[]'); },
  // Cognito expects a synchronous remove. Overwrite immediately so a session
  // cannot reappear during the asynchronous Keychain deletion.
  removeItem(key: string) { SecureStore.setItem(secureKey(key), '', { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); const keys: string[] = JSON.parse(SecureStore.getItem('bp.keys') || '[]'); SecureStore.setItem('bp.keys', JSON.stringify(keys.filter(saved => saved !== secureKey(key))), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); },
};
export function deviceActor() {
  let id = credentials.getItem('device');
  if (!id) { id = Crypto.randomUUID(); credentials.setItem('device', id); }
  return id;
}
export async function openNativeDatabase(account: string) {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, account);
  const sql = SQLite.openDatabaseSync(`bloxplox-${hash}.sqlite`);
  const storage = sqliteStorage({ exec: text => sql.execSync(text), run: (text, ...params) => { sql.runSync(text, ...params); }, first: (text, ...params) => sql.getFirstSync(text, ...params) });
  try {
    const db = await createDatabase(`bloxplox-${hash}`, storage);
    let closed = false;
    return { db, async close() { if (closed) return; closed = true; await db.close(); sql.closeSync(); }, async remove() { await db.remove(); if (!closed) { closed = true; sql.closeSync(); } SQLite.deleteDatabaseSync(`bloxplox-${hash}.sqlite`); } };
  } catch (error) { sql.closeSync(); throw error; }
}
