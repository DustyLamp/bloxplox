/** The replication protocol has no dependency on a particular UI runtime. */
export interface SyncRuntime {
  isOnline(): boolean;
  subscribe(wake: () => void, offline: () => void): () => void;
}
export function browserRuntime(): SyncRuntime {
  return {
    isOnline: () => navigator.onLine,
    subscribe(wake, offline) {
      const visible = () => { if (document.visibilityState === 'visible') wake(); };
      window.addEventListener('online', wake); window.addEventListener('offline', offline); document.addEventListener('visibilitychange', visible);
      return () => { window.removeEventListener('online', wake); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible); };
    },
  };
}
/** Supply NetInfo and React Native AppState subscriptions. No DOM shims needed. */
export function mobileRuntime(events: {
  isOnline: () => boolean;
  onConnection: (callback: (online: boolean) => void) => () => void;
  onActive: (callback: () => void) => () => void;
}): SyncRuntime {
  return { isOnline: events.isOnline, subscribe(wake, offline) {
    const connection = events.onConnection(online => online ? wake() : offline()), active = events.onActive(() => { if (events.isOnline()) wake(); });
    return () => { connection(); active(); };
  } };
}
