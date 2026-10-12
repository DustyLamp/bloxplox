import { randomBytes } from 'node:crypto';
import { AdminCreateUserCommand, AdminGetUserCommand, AdminLinkProviderForUserCommand, AdminSetUserPasswordCommand, CognitoIdentityProviderClient, ListUsersCommand, type UserType } from '@aws-sdk/client-cognito-identity-provider';
import type { PreSignUpTriggerEvent } from 'aws-lambda';
const cognito = new CognitoIdentityProviderClient({});
const attributes = (user: UserType) => Object.fromEntries((user.Attributes ?? []).map(a => [a.Name!, a.Value!]));

// Only Cognito invokes this function. Never accept a provider/email supplied by
// an application client as proof of identity. Provider mapping includes email_verified.
export async function handler(event: PreSignUpTriggerEvent) {
  if (event.triggerSource !== 'PreSignUp_ExternalProvider') return event;
  const separator = event.userName.indexOf('_'), provider = event.userName.slice(0, separator), providerId = event.userName.slice(separator + 1);
  const providers: Record<string, string> = { google: 'Google', signinwithapple: 'SignInWithApple' };
  const providerName = providers[provider.toLowerCase()], email = event.request.userAttributes.email?.trim().toLowerCase();
  if (!providerName || !providerId || !email || event.request.userAttributes.email_verified !== 'true') throw new Error('A verified email is required to link this sign-in.');
  const escaped = email.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const users: UserType[] = []; let next: string | undefined;
  do { const page = await cognito.send(new ListUsersCommand({ UserPoolId: event.userPoolId, Filter: `email = "${escaped}"`, PaginationToken: next, Limit: 60 })); users.push(...page.Users ?? []); next = page.PaginationToken; } while (next);
  const candidates = users.filter(u => attributes(u).email?.toLowerCase() === email);
  if (candidates.length > 1) throw new Error('Please sign in to your existing account before linking this sign-in.');
  let destination: UserType | undefined = candidates[0];
  if (!destination) {
    try {
      // A stable local profile means social-first users can later set a password
      // by verifying the same email with the normal password reset flow.
      destination = (await cognito.send(new AdminCreateUserCommand({ UserPoolId: event.userPoolId, Username: email, MessageAction: 'SUPPRESS', UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }] }))).User;
    } catch (error) {
      if ((error as Error).name !== 'UsernameExistsException') throw error;
      const existing = await cognito.send(new AdminGetUserCommand({ UserPoolId: event.userPoolId, Username: email }));
      destination = { Username: existing.Username, Attributes: existing.UserAttributes, Enabled: existing.Enabled, UserStatus: existing.UserStatus };
    }
  }
  if (!destination?.Username || destination.Enabled === false || attributes(destination).email_verified !== 'true') throw new Error('Verify your existing account email before linking this sign-in.');
  if (destination.UserStatus === 'FORCE_CHANGE_PASSWORD') {
    await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: event.userPoolId, Username: destination.Username, Password: `Aa1!${randomBytes(48).toString('base64url')}`, Permanent: true }));
  } else if (!['CONFIRMED', 'EXTERNAL_PROVIDER'].includes(destination.UserStatus ?? '')) throw new Error('Finish verifying your existing account before linking this sign-in.');
  await cognito.send(new AdminLinkProviderForUserCommand({ UserPoolId: event.userPoolId, DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: destination.Username }, SourceUser: { ProviderName: providerName, ProviderAttributeName: 'Cognito_Subject', ProviderAttributeValue: providerId } }));
  return event;
}
