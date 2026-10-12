export const deployment = {
  account: '807550663091', region: 'eu-north-1', domain: 'bloxplox.com',
  hostedZoneId: 'Z04220421N4TQXYWS7C92', repository: 'DustyLamp/bloxplox', branch: 'main',
  googleSignInClientId: '', // Set after Google OAuth client creation; secret stays in Secrets Manager.
  sourceSecretName: 'bloxplox/github-token',
} as const;
