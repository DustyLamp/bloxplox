export const deployment = {
  account: '807550663091', region: 'eu-north-1', domain: 'bloxplox.com',
  hostedZoneId: 'Z04220421N4TQXYWS7C92', repository: 'DustyLamp/bloxplox', branch: 'main',
  googleSignInClientId: '', // Activate after the public Google consent configuration is ready.
  googleCalendarEnabled: false,
  appleSignIn: { clientId: '', teamId: '', keyId: '' }, // Apple Developer identifiers; private key stays in Secrets Manager.
  sourceSecretName: 'bloxplox/github-token',
} as const;
