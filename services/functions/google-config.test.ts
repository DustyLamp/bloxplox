import { afterEach, expect, it, vi } from 'vitest';
import { exchangeGoogle, googleFetch } from './google-config';
afterEach(() => vi.unstubAllGlobals());
it('retries quota failures without asking users to reconnect', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:{errors:[{reason:'rateLimitExceeded'}]}}),{status:403})).mockResolvedValueOnce(new Response(JSON.stringify({error:{errors:[{reason:'insufficientPermissions'}]}}),{status:403}));
  vi.stubGlobal('fetch', fetch);
  const url = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
  await expect(googleFetch(url,'token')).rejects.toMatchObject({name:'GoogleRequestError'});
  await expect(googleFetch(url,'token')).rejects.toMatchObject({name:'GoogleAuthorizationError'});
});
it('distinguishes a revoked refresh token from an unavailable token endpoint', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('{}',{status:503})).mockResolvedValueOnce(new Response('{"error":"invalid_grant"}',{status:400})));
  const config = {clientId:'test',clientSecret:'test',redirectUri:'https://example.com'};
  await expect(exchangeGoogle(config,{})).rejects.toMatchObject({name:'GoogleRequestError'});
  await expect(exchangeGoogle(config,{})).rejects.toMatchObject({name:'GoogleAuthorizationError'});
});
