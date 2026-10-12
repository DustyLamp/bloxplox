import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { z } from 'zod';
const schema = z.object({ clientId: z.string().endsWith('.apps.googleusercontent.com'), clientSecret: z.string().min(10), redirectUri: z.string().url() });
export type GoogleConfig = z.infer<typeof schema>;
const secrets = new SecretsManagerClient({});
let cache: { until: number; config: GoogleConfig | null } | undefined;
export async function googleConfig(): Promise<GoogleConfig | null> {
  if (cache && cache.until > Date.now()) return cache.config;
  if (!process.env.GOOGLE_SECRET_NAME) return null;
  try { const response = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.GOOGLE_SECRET_NAME })); const config = schema.parse(JSON.parse(response.SecretString!)); cache = { until: Date.now() + 60000, config }; return config; }
  catch (error) { if ((error as Error).name === 'ResourceNotFoundException') { cache = { until: Date.now() + 60000, config: null }; return null; } throw error; }
}
export const googleScopes = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly'];
export async function googleFetch<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  if (!url.startsWith('https://www.googleapis.com/calendar/v3/') && url !== 'https://openidconnect.googleapis.com/v1/userinfo') throw new Error('Invalid Google endpoint');
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    const details = await response.json().catch(() => ({})) as { error?: { errors?: { reason?: string }[] } };
    const denied = response.status === 401 || (response.status === 403 && details.error?.errors?.some(error => ['authError', 'insufficientPermissions'].includes(error.reason ?? '')));
    const error = new Error(`Google Calendar returned ${response.status}`); error.name = denied ? 'GoogleAuthorizationError' : 'GoogleRequestError'; throw error;
  }
  return response.status === 204 ? undefined as T : response.json();
}
export async function exchangeGoogle(config: GoogleConfig, parameters: Record<string, string>) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...parameters }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) { const details = await response.json().catch(() => ({})) as { error?: string }; const revoked = details.error === 'invalid_grant'; const error = new Error(revoked ? 'Reconnect your Google account.' : 'Google is temporarily unavailable. Try again.'); error.name = revoked ? 'GoogleAuthorizationError' : 'GoogleRequestError'; throw error; }
  return await response.json() as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
}
