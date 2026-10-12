import { beforeEach, expect, it, vi } from 'vitest';
import type { PreSignUpTriggerEvent } from 'aws-lambda';
const state = vi.hoisted(() => ({ users: [] as any[], calls: [] as any[] }));
vi.mock('@aws-sdk/client-cognito-identity-provider', async (original) => {
  const sdk = await original<any>();
  return { ...sdk, CognitoIdentityProviderClient: class { async send(command: any) {
    state.calls.push({ name: command.constructor.name, input: command.input });
    if (command.constructor.name === 'ListUsersCommand') return { Users: state.users };
    if (command.constructor.name === 'AdminCreateUserCommand') return { User: { Username: 'new-canonical-sub', Enabled: true, UserStatus: 'FORCE_CHANGE_PASSWORD', Attributes: command.input.UserAttributes } };
    return {};
  } } };
});
import { handler } from './link-identity';
const event = (provider = 'Google', email = 'Demo@Example.com', verified = 'true') => ({ triggerSource: 'PreSignUp_ExternalProvider', userPoolId: 'pool', userName: `${provider}_provider-sub`, version: '1', region: 'eu-north-1', callerContext: { awsSdkVersion: 'test', clientId: 'test' }, request: { userAttributes: { email, email_verified: verified } }, response: { autoConfirmUser: false, autoVerifyEmail: false, autoVerifyPhone: false } } as PreSignUpTriggerEvent);
const existing = (verified = true) => ({ Username: 'original-sub', Enabled: true, UserStatus: 'CONFIRMED', Attributes: [{ Name: 'email', Value: 'demo@example.com' }, { Name: 'email_verified', Value: String(verified) }] });
beforeEach(() => { state.users = []; state.calls = []; });
it('preserves an existing verified account for Google and Apple, using provider subject rather than email as credential', async () => {
  state.users = [existing()];
  for (const provider of ['Google', 'SignInWithApple']) await handler(event(provider));
  expect(state.calls.filter(c => c.name === 'AdminLinkProviderForUserCommand').map(c => c.input)).toEqual(['Google','SignInWithApple'].map(ProviderName => ({ UserPoolId: 'pool', DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: 'original-sub' }, SourceUser: { ProviderName, ProviderAttributeName: 'Cognito_Subject', ProviderAttributeValue: 'provider-sub' } })));
  expect(state.calls.some(c => c.name === 'AdminSetUserPasswordCommand')).toBe(false);
});
it('creates a local profile for social-first signup so later email password reset uses the same account', async () => {
  await handler(event());
  const creation = state.calls.find(c => c.name === 'AdminCreateUserCommand').input;
  expect(creation).toMatchObject({ Username: 'demo@example.com', MessageAction: 'SUPPRESS' });
  expect(state.calls.find(c => c.name === 'AdminSetUserPasswordCommand').input.Permanent).toBe(true);
  expect(state.calls.find(c => c.name === 'AdminLinkProviderForUserCommand').input.DestinationUser.ProviderAttributeValue).toBe('new-canonical-sub');
});
it('rejects unverified identity claims, untrusted providers, disabled and unverified existing accounts', async () => {
  for (const request of [event('Google', 'demo@example.com', 'false'), event('Untrusted')]) await expect(handler(request)).rejects.toThrow('verified email');
  state.users = [existing(false)]; await expect(handler(event())).rejects.toThrow('Verify');
  state.users = [{ ...existing(), Enabled: false }]; await expect(handler(event())).rejects.toThrow('Verify');
  expect(state.calls.some(c => c.name === 'AdminLinkProviderForUserCommand')).toBe(false);
});
it('does not guess which account owns an ambiguous email or merge an Apple relay email', async () => {
  state.users = [existing(), { ...existing(), Username: 'other-sub' }]; await expect(handler(event())).rejects.toThrow('existing account');
  state.users = [existing()]; await handler(event('SignInWithApple', 'private@privaterelay.appleid.com'));
  expect(state.calls.find(c => c.name === 'AdminLinkProviderForUserCommand').input.DestinationUser.ProviderAttributeValue).toBe('new-canonical-sub');
});
it('leaves manual email verification and internal creation flows intact', async () => {
  for (const triggerSource of ['PreSignUp_SignUp', 'PreSignUp_AdminCreateUser']) await handler({ ...event(), triggerSource } as PreSignUpTriggerEvent);
  expect(state.calls).toEqual([]);
});
