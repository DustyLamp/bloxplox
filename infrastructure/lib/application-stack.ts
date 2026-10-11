import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { DynamoEventSource, SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration, WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import { resolve } from 'node:path';
import { deployment } from '../config';

export class ApplicationStack extends Stack {
  readonly apiUrl: CfnOutput; readonly socketUrl: CfnOutput; readonly poolId: CfnOutput;
  readonly clientId: CfnOutput; readonly appId: CfnOutput;
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const data = new ddb.Table(this, 'Data', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING }, sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST, encryption: ddb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN, stream: ddb.StreamViewType.KEYS_ONLY,
    });
    const connections = new ddb.Table(this, 'Connections', {
      partitionKey: { name: 'connectionId', type: ddb.AttributeType.STRING }, billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expires', encryption: ddb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    connections.addGlobalSecondaryIndex({ indexName: 'by-user', partitionKey: { name: 'userId', type: ddb.AttributeType.STRING }, projectionType: ddb.ProjectionType.ALL });
    const pool = new cognito.UserPool(this, 'Users', {
      userPoolName: 'bloxplox-production', selfSignUpEnabled: true, signInAliases: { email: true },
      signInCaseSensitive: false, autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 12, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, mfa: cognito.Mfa.OPTIONAL, mfaSecondFactor: { sms: false, otp: true },
      removalPolicy: RemovalPolicy.RETAIN, deletionProtection: true,
      userVerification: { emailSubject: 'Verify your BloxPlox email', emailBody: 'Your BloxPlox verification code is {####}.', emailStyle: cognito.VerificationEmailStyle.CODE },
    });
    const client = pool.addClient('Web', { userPoolClientName: 'bloxplox-web', generateSecret: false,
      authFlows: { userSrp: true }, preventUserExistenceErrors: true, enableTokenRevocation: true,
      accessTokenValidity: Duration.minutes(60), idTokenValidity: Duration.minutes(60), refreshTokenValidity: Duration.days(30),
    });
    const fn = (name: string, entry: string) => new NodejsFunction(this, name, {
      entry: resolve(`services/functions/${entry}.ts`), handler: 'handler', runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64, memorySize: 256, timeout: Duration.seconds(29),
      bundling: { minify: true, sourceMap: true, externalModules: [] }, depsLockFilePath: resolve('yarn.lock'),
      logGroup: new logs.LogGroup(this, `${name}Logs`, { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
      environment: { DATA_TABLE: data.tableName, CONNECTION_TABLE: connections.tableName, USER_POOL_ID: pool.userPoolId, USER_POOL_CLIENT_ID: client.userPoolClientId, NODE_OPTIONS: '--enable-source-maps' },
    });
    const http = fn('SyncHttp', 'http'), socket = fn('SyncSocket', 'socket'), notify = fn('SyncNotifications', 'notify');
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
      filters: [lambda.FilterCriteria.filter({ eventName: ['INSERT'], dynamodb: { Keys: { sk: { S: [{ prefix: 'CHANGE#' }] } } } })],
    }));
    failures.metricApproximateNumberOfMessagesVisible().createAlarm(this, 'NotificationFailureAlarm', { threshold: 1, evaluationPeriods: 1, alarmDescription: 'Inspect notification dead letters. HTTP catch-up remains available.' });
    const api = new apigw.HttpApi(this, 'HttpApi', {
      apiName: 'bloxplox-production', corsPreflight: { allowOrigins: [`https://${deployment.domain}`, `https://www.${deployment.domain}`, 'http://127.0.0.1:5174'],
        allowHeaders: ['authorization', 'content-type'], allowMethods: [apigw.CorsHttpMethod.POST], maxAge: Duration.hours(1) },
      defaultAuthorizer: new HttpJwtAuthorizer('Cognito', pool.userPoolProviderUrl, { jwtAudience: [client.userPoolClientId] }),
    });
    for (const path of ['/sync/pull', '/sync/push', '/sync/ticket']) api.addRoutes({ path, methods: [apigw.HttpMethod.POST], integration: new HttpLambdaIntegration(path.replaceAll('/', ''), http) });
    const cfnStage = api.defaultStage!.node.defaultChild as apigw.CfnStage;
    cfnStage.defaultRouteSettings = { throttlingBurstLimit: 50, throttlingRateLimit: 25 };
    const app = new amplify.CfnApp(this, 'Hosting', {
      name: 'bloxplox-production', platform: 'WEB',
      customRules: [{ source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webmanifest)$)([^.]+$)/>', target: '/index.html', status: '200' }],
      customHeaders: `customHeaders:\n  - pattern: '**'\n    headers:\n      - key: X-Content-Type-Options\n        value: nosniff\n      - key: Referrer-Policy\n        value: no-referrer\n      - key: X-Frame-Options\n        value: DENY\n      - key: Permissions-Policy\n        value: camera=(), microphone=(), geolocation=()\n      - key: Content-Security-Policy\n        value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cognito-idp.${this.region}.amazonaws.com ${api.apiEndpoint} ${wsStage.url}; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"\n  - pattern: '/config.json'\n    headers:\n      - key: Cache-Control\n        value: no-cache\n  - pattern: '/sw.js'\n    headers:\n      - key: Cache-Control\n        value: no-cache\n`,
    });
    const branch = new amplify.CfnBranch(this, 'MainBranch', { appId: app.attrAppId, branchName: 'main', stage: 'PRODUCTION', enableAutoBuild: false, framework: 'React' });
    const domain = new amplify.CfnDomain(this, 'ProductionDomain', { appId: app.attrAppId, domainName: deployment.domain, subDomainSettings: [{ branchName: branch.branchName, prefix: '' }, { branchName: branch.branchName, prefix: 'www' }], enableAutoSubDomain: false });
    domain.addDependency(branch);
    this.apiUrl = new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    this.socketUrl = new CfnOutput(this, 'WebSocketUrl', { value: wsStage.url });
    this.poolId = new CfnOutput(this, 'UserPoolId', { value: pool.userPoolId });
    this.clientId = new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    this.appId = new CfnOutput(this, 'AmplifyAppId', { value: app.attrAppId });
    new CfnOutput(this, 'DefaultUrl', { value: `https://main.${app.attrDefaultDomain}` });
    new CfnOutput(this, 'ProductionUrl', { value: `https://${deployment.domain}` });
    new CfnOutput(this, 'DataTableName', { value: data.tableName });
  }
}
