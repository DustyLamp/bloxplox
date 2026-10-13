import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { DynamoEventSource, SqsDlq, SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration, WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import { resolve } from 'node:path';
import { deployment } from '../config';

export class ApplicationStack extends Stack {
  readonly apiUrl: CfnOutput; readonly socketUrl: CfnOutput; readonly poolId: CfnOutput;
  readonly clientId: CfnOutput; readonly appId: CfnOutput; readonly authDomain: CfnOutput; readonly socialProviders: CfnOutput;
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    Tags.of(this).add('Application', 'BloxPlox');
    Tags.of(this).add('Environment', 'production');
    const data = new ddb.Table(this, 'Data', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING }, sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST, encryption: ddb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN, stream: ddb.StreamViewType.KEYS_ONLY,
      timeToLiveAttribute: 'expires',
    });
    data.addGlobalSecondaryIndex({ indexName: 'by-integration', partitionKey: { name: 'integration', type: ddb.AttributeType.STRING }, sortKey: { name: 'integrationKey', type: ddb.AttributeType.STRING }, projectionType: ddb.ProjectionType.KEYS_ONLY });
    const connections = new ddb.Table(this, 'Connections', {
      partitionKey: { name: 'connectionId', type: ddb.AttributeType.STRING }, billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expires', encryption: ddb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    connections.addGlobalSecondaryIndex({ indexName: 'by-user', partitionKey: { name: 'userId', type: ddb.AttributeType.STRING }, projectionType: ddb.ProjectionType.ALL });
    const pool = new cognito.UserPool(this, 'Users', {
      userPoolName: 'bloxplox-production', featurePlan: cognito.FeaturePlan.LITE, selfSignUpEnabled: true, signInAliases: { email: true },
      signInCaseSensitive: false, autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 8, requireLowercase: false, requireUppercase: true, requireDigits: true, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, mfa: cognito.Mfa.OPTIONAL, mfaSecondFactor: { sms: false, otp: true },
      removalPolicy: RemovalPolicy.RETAIN, deletionProtection: true,
      userVerification: { emailSubject: 'Verify your BloxPlox email', emailBody: 'Your BloxPlox verification code is {####}.', emailStyle: cognito.VerificationEmailStyle.CODE },
    });
    const identityLink = new NodejsFunction(this, 'LinkIdentity', {
      entry: resolve('services/functions/link-identity.ts'), runtime: lambda.Runtime.NODEJS_22_X, architecture: lambda.Architecture.ARM_64,
      memorySize: 256, timeout: Duration.seconds(5), bundling: { minify: true, sourceMap: true, externalModules: [] }, depsLockFilePath: resolve('yarn.lock'),
      logGroup: new logs.LogGroup(this, 'LinkIdentityLogs', { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
    });
    identityLink.addToRolePolicy(new iam.PolicyStatement({ actions: ['cognito-idp:ListUsers', 'cognito-idp:AdminGetUser', 'cognito-idp:AdminCreateUser', 'cognito-idp:AdminSetUserPassword', 'cognito-idp:AdminLinkProviderForUser'], resources: [`arn:${this.partition}:cognito-idp:${this.region}:${this.account}:userpool/*`], conditions: { StringEquals: { 'aws:ResourceTag/Application': 'BloxPlox', 'aws:ResourceTag/Environment': 'production' } } }));
    pool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, identityLink);
    const domain = pool.addDomain('SignInDomain', { managedLoginVersion: cognito.ManagedLoginVersion.CLASSIC_HOSTED_UI, cognitoDomain: { domainPrefix: `bloxplox-${this.account}` } });
    // Resolve provider secrets by name. A partial ARN ending in '-signin' is
    // ambiguous because Secrets Manager treats six trailing characters as its suffix.
    const googleClientId = deployment.googleSignInClientId as string;
    const googleProvider = googleClientId ? new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleSignIn', {
      userPool: pool, clientId: googleClientId,
      clientSecretValue: SecretValue.secretsManager('bloxplox/google-signin', { jsonField: 'clientSecret' }),
      scopes: ['openid', 'email'],
      attributeMapping: { email: cognito.ProviderAttribute.GOOGLE_EMAIL, emailVerified: cognito.ProviderAttribute.other('email_verified') },
    }) : undefined;
    const apple = deployment.appleSignIn as { clientId: string; teamId: string; keyId: string };
    const appleProvider = apple.clientId && apple.teamId && apple.keyId ? new cognito.UserPoolIdentityProviderApple(this, 'AppleSignIn', {
      userPool: pool, ...apple, scopes: ['email'],
      privateKeyValue: SecretValue.secretsManager('bloxplox/apple-signin', { jsonField: 'privateKey' }),
      attributeMapping: { email: cognito.ProviderAttribute.other('email'), emailVerified: cognito.ProviderAttribute.other('email_verified') },
    }) : undefined;
    const client = pool.addClient('Web', { userPoolClientName: 'bloxplox-web', generateSecret: false,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO, ...(googleProvider ? [cognito.UserPoolClientIdentityProvider.GOOGLE] : []), ...(appleProvider ? [cognito.UserPoolClientIdentityProvider.APPLE] : [])],
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE, cognito.OAuthScope.COGNITO_ADMIN], callbackUrls: [`https://${deployment.domain}/auth/callback`, `https://www.${deployment.domain}/auth/callback`, 'bloxplox://auth'], logoutUrls: [`https://${deployment.domain}/blocks`, 'bloxplox://signed-out'] },
      authFlows: { userSrp: true }, preventUserExistenceErrors: true, enableTokenRevocation: true,
      accessTokenValidity: Duration.minutes(60), idTokenValidity: Duration.minutes(60), refreshTokenValidity: Duration.days(30),
    });
    if (googleProvider) client.node.addDependency(googleProvider);
    if (appleProvider) client.node.addDependency(appleProvider);
    const fn = (name: string, entry: string) => new NodejsFunction(this, name, {
      entry: resolve(`services/functions/${entry}.ts`), handler: 'handler', runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64, memorySize: 256, timeout: Duration.seconds(29),
      bundling: { minify: true, sourceMap: true, externalModules: [] }, depsLockFilePath: resolve('yarn.lock'),
      logGroup: new logs.LogGroup(this, `${name}Logs`, { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
      environment: { DATA_TABLE: data.tableName, CONNECTION_TABLE: connections.tableName, USER_POOL_ID: pool.userPoolId, USER_POOL_CLIENT_ID: client.userPoolClientId, NODE_OPTIONS: '--enable-source-maps' },
    });
    const http = fn('SyncHttp', 'http'), socket = fn('SyncSocket', 'socket'), notify = fn('SyncNotifications', 'notify');
    const billing = fn('Billing', 'billing');
    const account = fn('Account', 'account'), accountWorker = fn('AccountDeletion', 'account-worker');
    (accountWorker.node.defaultChild as lambda.CfnFunction).timeout = 120;
    const deletionFailures = new sqs.Queue(this, 'DeletionFailures', { retentionPeriod: Duration.days(14), encryption: sqs.QueueEncryption.SQS_MANAGED });
    const deletionQueue = new sqs.Queue(this, 'DeletionJobs', { visibilityTimeout: Duration.minutes(15), encryption: sqs.QueueEncryption.SQS_MANAGED, deadLetterQueue: { queue: deletionFailures, maxReceiveCount: 6 } });
    for (const worker of [notify, accountWorker]) { deletionQueue.grantSendMessages(worker); worker.addEnvironment('DELETION_QUEUE_URL', deletionQueue.queueUrl); }
    data.grantReadWriteData(account); data.grantReadWriteData(accountWorker); connections.grantReadWriteData(accountWorker); data.grantReadData(socket);
    accountWorker.addToRolePolicy(new iam.PolicyStatement({ actions: ['cognito-idp:AdminDeleteUser'], resources: [pool.userPoolArn] }));
    accountWorker.addEventSource(new SqsEventSource(deletionQueue, { batchSize: 1, maxConcurrency: 2, reportBatchItemFailures: true }));
    deletionFailures.metricApproximateNumberOfMessagesVisible().createAlarm(this, 'DeletionFailureAlarm', { threshold: 1, evaluationPeriods: 1, alarmDescription: 'Account deletion needs attention. Redrive the failed job after resolving the error.' });
    const stripeSecretName = 'bloxplox/stripe';
    const stripeSecret = secretsmanager.Secret.fromSecretNameV2(this, 'StripeConfiguration', stripeSecretName);
    for (const function_ of [http, billing]) { function_.addEnvironment('PAID_PLANS_ENABLED', 'false'); function_.addEnvironment('STRIPE_SECRET_NAME', stripeSecretName); stripeSecret.grantRead(function_); }
    billing.addEnvironment('PRODUCTION_ORIGIN', `https://${deployment.domain}`);
    data.grantReadWriteData(billing);
    data.grantReadWriteData(http); connections.grantReadWriteData(http); connections.grantReadWriteData(socket); connections.grantReadWriteData(notify);
    const websocket = new apigw.WebSocketApi(this, 'WebSocket', {
      connectRouteOptions: { integration: new WebSocketLambdaIntegration('Connect', socket) },
      disconnectRouteOptions: { integration: new WebSocketLambdaIntegration('Disconnect', socket) },
      defaultRouteOptions: { integration: new WebSocketLambdaIntegration('Heartbeat', socket) },
    });
    const wsStage = new apigw.WebSocketStage(this, 'WebSocketStage', { webSocketApi: websocket, stageName: 'live', autoDeploy: true, throttle: { rateLimit: 30, burstLimit: 60 } });
    websocket.grantManageConnections(socket); websocket.grantManageConnections(notify);
    notify.addEnvironment('WEBSOCKET_MANAGEMENT_URL', wsStage.callbackUrl);
    const failures = new sqs.Queue(this, 'NotificationFailures', { retentionPeriod: Duration.days(14), encryption: sqs.QueueEncryption.SQS_MANAGED });
    notify.addEventSource(new DynamoEventSource(data, {
      startingPosition: lambda.StartingPosition.LATEST, batchSize: 100, maxBatchingWindow: Duration.seconds(1),
      retryAttempts: 5, bisectBatchOnError: true, reportBatchItemFailures: true, onFailure: new SqsDlq(failures),
      filters: [lambda.FilterCriteria.filter({ eventName: ['INSERT'], dynamodb: { Keys: { sk: { S: [{ prefix: 'CHANGE#' }] } } } }), lambda.FilterCriteria.filter({ eventName: ['INSERT'], dynamodb: { Keys: { pk: { S: [{ prefix: 'DELETED#' }] } } } })],
    }));
    failures.metricApproximateNumberOfMessagesVisible().createAlarm(this, 'NotificationFailureAlarm', { threshold: 1, evaluationPeriods: 1, alarmDescription: 'Inspect notification dead letters. HTTP catch-up remains available.' });
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', { hostedZoneId: deployment.hostedZoneId, zoneName: deployment.domain });
    const apiHostname = `api.${deployment.domain}`, publicApiUrl = `https://${apiHostname}`;
    const certificate = new acm.Certificate(this, 'ApiCertificate', { domainName: apiHostname, validation: acm.CertificateValidation.fromDns(zone) });
    const apiDomain = new apigw.DomainName(this, 'ApiDomain', { domainName: apiHostname, certificate });
    new route53.ARecord(this, 'ApiAlias', { zone, recordName: 'api', target: route53.RecordTarget.fromAlias(new route53Targets.ApiGatewayv2DomainProperties(apiDomain.regionalDomainName, apiDomain.regionalHostedZoneId)) });
    const api = new apigw.HttpApi(this, 'HttpApi', {
      defaultDomainMapping: { domainName: apiDomain },
      apiName: 'bloxplox-production', corsPreflight: { allowOrigins: [`https://${deployment.domain}`, `https://www.${deployment.domain}`, 'http://127.0.0.1:5174'],
        allowHeaders: ['authorization', 'content-type'], allowMethods: [apigw.CorsHttpMethod.POST], maxAge: Duration.hours(1) },
      defaultAuthorizer: new HttpJwtAuthorizer('Cognito', pool.userPoolProviderUrl, { jwtAudience: [client.userPoolClientId] }),
    });
    for (const path of ['/sync/pull', '/sync/push', '/sync/ticket']) api.addRoutes({ path, methods: [apigw.HttpMethod.POST], integration: new HttpLambdaIntegration(path.replaceAll('/', ''), http) });
    api.addRoutes({ path: '/account/delete', methods: [apigw.HttpMethod.POST], integration: new HttpLambdaIntegration('AccountDeletionRequest', account) });
    const appleDeletion = fn('AppleDeletion', 'apple-deletion');
    data.grantReadWriteData(appleDeletion);
    appleDeletion.addToRolePolicy(new iam.PolicyStatement({ actions: ['cognito-idp:AdminGetUser'], resources: [pool.userPoolArn] }));
    appleDeletion.addEnvironment('API_URL', publicApiUrl); appleDeletion.addEnvironment('PRODUCTION_ORIGIN', `https://${deployment.domain}`);
    const appleSecret = secretsmanager.Secret.fromSecretNameV2(this, 'AppleConfiguration', 'bloxplox/apple-signin');
    for (const worker of [appleDeletion, accountWorker]) {
      appleSecret.grantRead(worker);
      worker.addEnvironment('APPLE_CLIENT_ID', apple.clientId); worker.addEnvironment('APPLE_TEAM_ID', apple.teamId); worker.addEnvironment('APPLE_KEY_ID', apple.keyId);
    }
    api.addRoutes({ path: '/account/apple/prepare', methods: [apigw.HttpMethod.POST], integration: new HttpLambdaIntegration('AppleDeletionPrepare', appleDeletion) });
    api.addRoutes({ path: '/account/apple/callback', methods: [apigw.HttpMethod.POST], authorizer: new apigw.HttpNoneAuthorizer(), integration: new HttpLambdaIntegration('AppleDeletionCallback', appleDeletion) });
    for (const path of ['/billing/status', '/billing/checkout', '/billing/portal']) api.addRoutes({ path, methods: [apigw.HttpMethod.POST], integration: new HttpLambdaIntegration(path.replaceAll('/', ''), billing) });
    api.addRoutes({ path: '/billing/webhook', methods: [apigw.HttpMethod.POST], authorizer: new apigw.HttpNoneAuthorizer(), integration: new HttpLambdaIntegration('StripeWebhook', billing) });
    const calendar = fn('GoogleCalendars', 'google');
    const calendarWorker = fn('GoogleCalendarWorker', 'google-worker');
    (calendarWorker.node.defaultChild as lambda.CfnFunction).timeout = 120;
    const calendarFailures = new sqs.Queue(this, 'CalendarFailures', { retentionPeriod: Duration.days(14), encryption: sqs.QueueEncryption.SQS_MANAGED });
    const calendarQueue = new sqs.Queue(this, 'CalendarJobs', { visibilityTimeout: Duration.minutes(15), encryption: sqs.QueueEncryption.SQS_MANAGED, deadLetterQueue: { queue: calendarFailures, maxReceiveCount: 4 } });
    const googleSecret = secretsmanager.Secret.fromSecretNameV2(this, 'GoogleCalendarConfiguration', 'bloxplox/google-calendar');
    for (const worker of [calendar, calendarWorker]) {
      data.grantReadWriteData(worker); googleSecret.grantRead(worker); calendarQueue.grantSendMessages(worker);
      worker.addEnvironment('GOOGLE_SECRET_NAME', deployment.googleCalendarEnabled ? 'bloxplox/google-calendar' : ''); worker.addEnvironment('CALENDAR_QUEUE_URL', calendarQueue.queueUrl);
      worker.addEnvironment('API_URL', publicApiUrl); worker.addEnvironment('PRODUCTION_ORIGIN', `https://${deployment.domain}`);
    }
    calendarWorker.addEventSource(new SqsEventSource(calendarQueue, { batchSize: 1, maxConcurrency: 2, reportBatchItemFailures: true }));
    new events.Rule(this, 'CalendarDailyCatchup', { schedule: events.Schedule.rate(Duration.days(1)), targets: [new targets.LambdaFunction(calendarWorker, { event: events.RuleTargetInput.fromObject({ daily: true }), retryAttempts: 2 })] });
    for (const path of ['/calendars/status', '/calendars/connect', '/calendars/select', '/calendars/refresh', '/calendars/disconnect']) api.addRoutes({ path, methods: [apigw.HttpMethod.POST], integration: new HttpLambdaIntegration(path.replaceAll('/', ''), calendar) });
    api.addRoutes({ path: '/calendars/google/callback', methods: [apigw.HttpMethod.GET], authorizer: new apigw.HttpNoneAuthorizer(), integration: new HttpLambdaIntegration('GoogleCalendarCallback', calendar) });
    api.addRoutes({ path: '/calendars/google/notifications', methods: [apigw.HttpMethod.POST], authorizer: new apigw.HttpNoneAuthorizer(), integration: new HttpLambdaIntegration('GoogleCalendarNotifications', calendar) });
    const cfnStage = api.defaultStage!.node.defaultChild as apigw.CfnStage;
    cfnStage.defaultRouteSettings = { throttlingBurstLimit: 50, throttlingRateLimit: 25 };
    const app = new amplify.CfnApp(this, 'Hosting', {
      name: 'bloxplox-production', platform: 'WEB',
      customRules: [{ source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webmanifest)$)([^.]+$)/>', target: '/index.html', status: '200' }],
      customHeaders: `customHeaders:\n  - pattern: '**'\n    headers:\n      - key: X-Content-Type-Options\n        value: nosniff\n      - key: Referrer-Policy\n        value: no-referrer\n      - key: X-Frame-Options\n        value: DENY\n      - key: Permissions-Policy\n        value: camera=(), microphone=(), geolocation=()\n      - key: Content-Security-Policy\n        value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cognito-idp.${this.region}.amazonaws.com ${domain.baseUrl()} ${publicApiUrl} ${api.apiEndpoint} ${wsStage.url}; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"\n  - pattern: '/config.json'\n    headers:\n      - key: Cache-Control\n        value: no-cache\n  - pattern: '/sw.js'\n    headers:\n      - key: Cache-Control\n        value: no-cache\n`,
    });
    const branch = new amplify.CfnBranch(this, 'MainBranch', { appId: app.attrAppId, branchName: 'main', stage: 'PRODUCTION', enableAutoBuild: false, framework: 'React' });
    const hostingDomain = new amplify.CfnDomain(this, 'ProductionDomain', { appId: app.attrAppId, domainName: deployment.domain, subDomainSettings: [{ branchName: branch.branchName, prefix: '' }, { branchName: branch.branchName, prefix: 'www' }], enableAutoSubDomain: false });
    hostingDomain.addResourceDependency(branch);
    this.authDomain = new CfnOutput(this, 'AuthDomain', { value: domain.baseUrl() });
    this.socialProviders = new CfnOutput(this, 'SocialProviders', { value: JSON.stringify([...(googleProvider ? ['Google'] : []), ...(appleProvider ? ['SignInWithApple'] : [])]) });
    this.apiUrl = new CfnOutput(this, 'ApiUrl', { value: publicApiUrl });
    this.socketUrl = new CfnOutput(this, 'WebSocketUrl', { value: wsStage.url });
    this.poolId = new CfnOutput(this, 'UserPoolId', { value: pool.userPoolId });
    this.clientId = new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    this.appId = new CfnOutput(this, 'AmplifyAppId', { value: app.attrAppId });
    new CfnOutput(this, 'DefaultUrl', { value: `https://main.${app.attrDefaultDomain}` });
    new CfnOutput(this, 'ProductionUrl', { value: `https://${deployment.domain}` });
    new CfnOutput(this, 'DataTableName', { value: data.tableName });
  }
}
