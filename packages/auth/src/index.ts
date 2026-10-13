import { AuthenticationDetails, CognitoUser, CognitoUserAttribute, CognitoUserPool, CognitoUserSession, CognitoIdToken, CognitoAccessToken, CognitoRefreshToken } from 'amazon-cognito-identity-js';
export interface RuntimeConfig { region: string; userPoolId: string; userPoolClientId: string; apiUrl: string; websocketUrl: string; publicSignup: boolean; authDomain?: string; socialProviders?: ('Google' | 'SignInWithApple')[] }
export interface AuthRuntime {
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; clear(): void };
  isOnline(): boolean;
  signedOut(): void;
  localSubject?: string;
}

export class AuthService {
  readonly pool: CognitoUserPool | undefined;
  constructor(readonly config: RuntimeConfig, readonly runtime: AuthRuntime) {
    if (config.region !== 'local') this.pool = new CognitoUserPool({ UserPoolId: config.userPoolId, ClientId: config.userPoolClientId, Storage: runtime.storage });
  }
  user(email: string) { return new CognitoUser({ Username: email.trim().toLowerCase(), Pool: this.pool!, Storage: this.runtime.storage }); }
  async session(): Promise<CognitoUserSession> {
    const user = this.pool?.getCurrentUser();
    if (!user) throw new Error('Sign in');
    return new Promise((resolve, reject) => user.getSession((error: Error | null, session: CognitoUserSession) => error ? reject(error) : resolve(session)));
  }
  async identity(): Promise<{ subject: string; email: string } | null> {
    if (this.config.region === 'local') return { subject: this.runtime.localSubject || 'local-user', email: 'local@example.test' };
    const offlineIdentity = () => {
      const user = this.pool?.getCurrentUser();
      if (!this.runtime.isOnline() && user) {
        const cached = this.runtime.storage.getItem(`bloxplox-session:${this.config.userPoolId}`);
        if (cached) {
          const identity = JSON.parse(cached) as { subject: string; email: string };
          const token = this.runtime.storage.getItem(`CognitoIdentityServiceProvider.${this.config.userPoolClientId}.${user.getUsername()}.idToken`);
          // The offline cache must belong to the current Cognito user. A sign-in
          // interrupted between token storage and identity caching can switch it.
          if (token && new CognitoIdToken({ IdToken: token }).decodePayload().sub === identity.subject) return identity;
        }
      }
      return null;
    };
    // Open the existing local account immediately without waiting for an
    // expired token's network refresh while the device is known to be offline.
    const cached = offlineIdentity(); if (cached) return cached;
    try {
      const session = await this.session(), claims = session.getIdToken().decodePayload();
      const identity = { subject: claims.sub, email: claims.email };
      this.runtime.storage.setItem(`bloxplox-session:${this.config.userPoolId}`, JSON.stringify(identity));
      return identity;
    } catch {
      // Only an already signed-in user can open their cached data while offline.
      return offlineIdentity();
    }
  }
  async token(force = false): Promise<string> {
    const session = await this.session();
    if (!force) return session.getAccessToken().getJwtToken();
    const user = this.pool!.getCurrentUser()!;
    const fresh = await new Promise<CognitoUserSession>((resolve, reject) => user.refreshSession(session.getRefreshToken(), (error, value) => error ? reject(error) : resolve(value)));
    return fresh.getAccessToken().getJwtToken();
  }
  async request(path: string, body: unknown = {}): Promise<any> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(`${this.config.apiUrl}${path}`, { method: 'POST', headers: { authorization: `Bearer ${await this.token(!!attempt)}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        if (response.status === 401 && !attempt) continue;
        const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Request failed. Try again.'); return value;
      } finally { clearTimeout(timeout); }
    }
    throw new Error('Sign in again');
  }
  async socialSignIn(provider: 'Google' | 'SignInWithApple', redirectUri: string): Promise<string> {
    if (!this.config.authDomain || !this.config.socialProviders?.includes(provider)) throw new Error('This sign-in method is not available yet.');
    const domain = new URL(this.config.authDomain);
    if (domain.protocol !== 'https:') throw new Error('Invalid sign-in configuration');
    const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    const state = encode(crypto.getRandomValues(new Uint8Array(32))), verifier = encode(crypto.getRandomValues(new Uint8Array(32))), nonce = encode(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const previous = this.runtime.storage.getItem('bloxplox-oauth-active');
    if (previous) this.runtime.storage.removeItem(`bloxplox-oauth:${previous}`);
    this.runtime.storage.setItem('bloxplox-oauth-active', state);
    this.runtime.storage.setItem(`bloxplox-oauth:${state}`, JSON.stringify({ verifier, nonce, redirectUri, expires: Date.now() + 10 * 60000 }));
    const url = new URL('/oauth2/authorize', domain);
    url.search = new URLSearchParams({ client_id: this.config.userPoolClientId, response_type: 'code', redirect_uri: redirectUri, identity_provider: provider, scope: 'openid email profile aws.cognito.signin.user.admin', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    return url.href;
  }
  cancelSocialSignIn(authorizeUrl: string) {
    const state = new URL(authorizeUrl).searchParams.get('state');
    if (state && /^[A-Za-z0-9_-]{43}$/.test(state)) {
      this.runtime.storage.removeItem(`bloxplox-oauth:${state}`);
      if (this.runtime.storage.getItem('bloxplox-oauth-active') === state) this.runtime.storage.removeItem('bloxplox-oauth-active');
    }
  }
  async finishSocialSignIn(callbackUrl: string): Promise<void> {
    const callback = new URL(callbackUrl), state = callback.searchParams.get('state');
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) throw new Error('This sign-in has expired. Please try again.');
    const key = `bloxplox-oauth:${state}`, serialized = this.runtime.storage.getItem(key);
    if (!serialized) throw new Error('This sign-in has expired. Please try again.');
    const pending = JSON.parse(serialized) as { verifier: string; nonce: string; redirectUri: string; expires: number };
    this.runtime.storage.removeItem(key);
    if (this.runtime.storage.getItem('bloxplox-oauth-active') === state) this.runtime.storage.removeItem('bloxplox-oauth-active');
    const redirect = new URL(pending.redirectUri);
    if (pending.expires < Date.now() || callback.protocol !== redirect.protocol || callback.host !== redirect.host || callback.pathname !== redirect.pathname) throw new Error('This sign-in has expired. Please try again.');
    if (callback.searchParams.has('error')) throw new Error('Sign-in was cancelled or could not be completed. Try again.');
    const code = callback.searchParams.get('code'); if (!code || !this.config.authDomain) throw new Error('Missing sign-in code. Try again.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(new URL('/oauth2/token', this.config.authDomain).href, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: this.config.userPoolClientId, code, redirect_uri: pending.redirectUri, code_verifier: pending.verifier }), signal: controller.signal });
      if (!response.ok) throw new Error('Could not finish signing in. Please try again.');
      const tokens = await response.json();
      if (!tokens.id_token || !tokens.access_token || !tokens.refresh_token) throw new Error('Incomplete sign-in response. Try again.');
      const session = new CognitoUserSession({ IdToken: new CognitoIdToken({ IdToken: tokens.id_token }), AccessToken: new CognitoAccessToken({ AccessToken: tokens.access_token }), RefreshToken: new CognitoRefreshToken({ RefreshToken: tokens.refresh_token }) });
      const claims = session.getIdToken().decodePayload();
      // Tokens come directly from Cognito's HTTPS token endpoint, never from the
      // callback URL. Bind the returned identity to this client and this attempt.
      if (!session.isValid() || claims.nonce !== pending.nonce || claims.aud !== this.config.userPoolClientId || claims.iss !== `https://cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}` || claims.token_use !== 'id' || !claims['cognito:username'] || !claims.sub) throw new Error('Invalid sign-in response. Try again.');
      this.user(claims['cognito:username']).setSignInUserSession(session);
    } finally { clearTimeout(timeout); }
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
    this.runtime.storage.removeItem(`bloxplox-session:${this.config.userPoolId}`);
    this.runtime.signedOut();
  }
}
