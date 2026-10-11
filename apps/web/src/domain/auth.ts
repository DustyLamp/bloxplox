import { AuthenticationDetails, CognitoUser, CognitoUserAttribute, CognitoUserPool, type CognitoUserSession } from 'amazon-cognito-identity-js';
import type { RuntimeConfig } from '../commons/config';

export class AuthService {
  readonly pool: CognitoUserPool | undefined;
  constructor(readonly config: RuntimeConfig) {
    if (config.region !== 'local') this.pool = new CognitoUserPool({ UserPoolId: config.userPoolId, ClientId: config.userPoolClientId });
  }
  user(email: string) { return new CognitoUser({ Username: email.trim().toLowerCase(), Pool: this.pool! }); }
  async session(): Promise<CognitoUserSession> {
    const user = this.pool?.getCurrentUser();
    if (!user) throw new Error('Sign in');
    return new Promise((resolve, reject) => user.getSession((error: Error | null, session: CognitoUserSession) => error ? reject(error) : resolve(session)));
  }
  async identity(): Promise<{ subject: string; email: string } | null> {
    if (this.config.region === 'local') return { subject: new URLSearchParams(location.search).get('user') || 'local-user', email: 'local@example.test' };
    try {
      const session = await this.session(), claims = session.getIdToken().decodePayload();
      const identity = { subject: claims.sub, email: claims.email };
      localStorage.setItem(`bloxplox-session:${this.config.userPoolId}`, JSON.stringify(identity));
      return identity;
    } catch {
      // Only an already signed-in user can open their cached data while offline.
      if (!navigator.onLine && this.pool?.getCurrentUser()) {
        const cached = localStorage.getItem(`bloxplox-session:${this.config.userPoolId}`);
        if (cached) return JSON.parse(cached);
      }
      return null;
    }
  }
  async token(force = false): Promise<string> {
    const session = await this.session();
    if (!force) return session.getAccessToken().getJwtToken();
    const user = this.pool!.getCurrentUser()!;
    const fresh = await new Promise<CognitoUserSession>((resolve, reject) => user.refreshSession(session.getRefreshToken(), (error, value) => error ? reject(error) : resolve(value)));
    return fresh.getAccessToken().getJwtToken();
  }
  signIn(email: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => this.user(email).authenticateUser(new AuthenticationDetails({ Username: email.trim().toLowerCase(), Password: password }), {
      onSuccess: () => resolve(), onFailure: reject,
      newPasswordRequired: () => reject(new Error('Reset your password to finish setting up this account.')),
    }));
  }
  signUp(email: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => this.pool!.signUp(email.trim().toLowerCase(), password, [new CognitoUserAttribute({ Name: 'email', Value: email.trim().toLowerCase() })], [], error => error ? reject(error) : resolve()));
  }
  confirm(email: string, code: string): Promise<void> {
    return new Promise((resolve, reject) => this.user(email).confirmRegistration(code.trim(), true, error => error ? reject(error) : resolve()));
  }
  resend(email: string): Promise<void> {
    return new Promise((resolve, reject) => this.user(email).resendConfirmationCode(error => error ? reject(error) : resolve()));
  }
  forgot(email: string): Promise<void> {
    return new Promise((resolve, reject) => this.user(email).forgotPassword({ onSuccess: () => resolve(), onFailure: reject, inputVerificationCode: () => resolve() }));
  }
  reset(email: string, code: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => this.user(email).confirmPassword(code.trim(), password, { onSuccess: () => resolve(), onFailure: reject }));
  }
  signOut() {
    this.pool?.getCurrentUser()?.signOut();
    localStorage.removeItem(`bloxplox-session:${this.config.userPoolId}`);
    const channel = new BroadcastChannel('bloxplox-auth');
    channel.postMessage('signed-out');
    channel.close();
  }
}
