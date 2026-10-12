import { AuthService as SharedAuthService, type RuntimeConfig } from '../../../../packages/auth/src/index';
export class AuthService extends SharedAuthService {
  constructor(config: RuntimeConfig) {
    super(config, {
      storage: localStorage, isOnline: () => navigator.onLine,
      localSubject: new URLSearchParams(location.search).get('user') || undefined,
      signedOut() { const channel = new BroadcastChannel('bloxplox-auth'); channel.postMessage('signed-out'); channel.close(); },
    });
  }
}
