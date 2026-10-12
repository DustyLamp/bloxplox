import * as Crypto from 'expo-crypto';

// RxDB hashes and Cognito SRP use the standard Web Crypto surface.
const nativeCrypto = globalThis.crypto ?? ({} as Crypto);
if (!nativeCrypto.getRandomValues) Object.assign(nativeCrypto, { getRandomValues: Crypto.getRandomValues });
if (!nativeCrypto.randomUUID) Object.assign(nativeCrypto, { randomUUID: Crypto.randomUUID });
if (!nativeCrypto.subtle) Object.assign(nativeCrypto, { subtle: {
  digest: (algorithm: string | { name: string }, data: BufferSource) => Crypto.digest((typeof algorithm === 'string' ? algorithm : algorithm.name) as Crypto.CryptoDigestAlgorithm, data),
} });
Object.defineProperty(globalThis, 'crypto', { value: nativeCrypto, configurable: true });
// The key/value RxDB engine listens for cross-tab browser events. A native app
// has one JS process and uses multiInstance:false; its in-process stream is used.
if (typeof window !== 'undefined' && !window.addEventListener) {
  Object.assign(window, { addEventListener() {}, removeEventListener() {} });
}
