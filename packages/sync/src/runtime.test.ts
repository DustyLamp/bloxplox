import { expect, it } from 'vitest';
import { mobileRuntime } from './runtime';
it('catches up after native reconnect/resume and disposes listeners on sign-out', () => {
  let online = true, wakeCount = 0, offlineCount = 0, disposed = 0;
  let connection: (value: boolean) => void = () => {}, active = () => {};
  const runtime = mobileRuntime({ isOnline: () => online, onConnection: callback => { connection = callback; return () => disposed++; }, onActive: callback => { active = callback; return () => disposed++; } });
  const close = runtime.subscribe(() => wakeCount++, () => offlineCount++);
  online = false; connection(false); active();
  expect(offlineCount).toBe(1); expect(wakeCount).toBe(0);
  online = true; connection(true); active();
  expect(wakeCount).toBe(2); expect(runtime.isOnline()).toBe(true);
  close(); expect(disposed).toBe(2);
});
