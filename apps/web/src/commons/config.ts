export interface RuntimeConfig { region: string; userPoolId: string; userPoolClientId: string; apiUrl: string; websocketUrl: string; publicSignup: boolean }
export async function loadConfig(): Promise<RuntimeConfig> {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_TEST === 'true') {
    return { region: 'local', userPoolId: 'local', userPoolClientId: 'local', apiUrl: '', websocketUrl: '', publicSignup: true };
  }
  const response = await fetch('/config.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Application configuration is unavailable. Reload to try again.');
  return response.json();
}
