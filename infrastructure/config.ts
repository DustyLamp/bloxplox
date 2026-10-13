export const deployment = {
  account: '807550663091', region: 'eu-north-1', domain: 'bloxplox.com',
  hostedZoneId: 'Z04220421N4TQXYWS7C92', repository: 'DustyLamp/bloxplox', branch: 'main',
  googleSignInClientId: '574465139761-cj6bj9vn0iknt7i4biepie4ju8jrv5oq.apps.googleusercontent.com',
  googleCalendarEnabled: true,
  appleSignIn: { clientId: 'com.bloxplox.signin', teamId: '7H234Q95ZH', keyId: '93354NVL36' }, // Apple Developer identifiers; private key stays in Secrets Manager.
  sourceSecretName: 'bloxplox/github-token',
} as const;
