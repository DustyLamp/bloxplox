import { Duration, SecretValue, Stack, Stage, type StackProps } from 'aws-cdk-lib';
import { CodeBuildStep, CodePipeline, CodePipelineSource } from 'aws-cdk-lib/pipelines';
import { PipelineType } from 'aws-cdk-lib/aws-codepipeline';
import { ComputeType, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ApplicationStack } from './application-stack';
import { deployment } from '../config';

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const source = CodePipelineSource.gitHub(deployment.repository, deployment.branch, { authentication: SecretValue.secretsManager(deployment.sourceSecretName) });
    const installCommands = ['n 22', 'corepack enable', 'YARN_ENABLE_IMMUTABLE_INSTALLS=true yarn workspaces focus bloxplox'];
    const synth = new CodeBuildStep('BuildAndSynth', {
      input: source, installCommands,
      commands: ['yarn typecheck', 'yarn test', 'yarn build', 'yarn playwright install --with-deps chromium', 'yarn test:e2e', 'yarn synth'],
      primaryOutputDirectory: 'cdk.out',
    });
    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'bloxplox-production', pipelineType: PipelineType.V1, selfMutation: true,
      publishAssetsInParallel: false,
      codeBuildDefaults: { timeout: Duration.minutes(20), buildEnvironment: { buildImage: LinuxBuildImage.STANDARD_7_0, computeType: ComputeType.SMALL } },
      synth,
    });
    const production = new Stage(this, 'Production', { env: props.env });
    const app = new ApplicationStack(production, 'Application', { env: props.env, stackName: 'bloxplox-production' });
    pipeline.addStage(production, { post: [new CodeBuildStep('PublishWeb', {
      input: source, additionalInputs: { dist: synth.addOutputDirectory('dist') }, installCommands, commands: ['node scripts/publish.mjs'],
      envFromCfnOutputs: { BLOXPLOX_API_URL: app.apiUrl, BLOXPLOX_SOCKET_URL: app.socketUrl, BLOXPLOX_POOL_ID: app.poolId, BLOXPLOX_CLIENT_ID: app.clientId, BLOXPLOX_AMPLIFY_APP_ID: app.appId, BLOXPLOX_AUTH_DOMAIN: app.authDomain, BLOXPLOX_SOCIAL_PROVIDERS: app.socialProviders },
      env: { BLOXPLOX_REGION: deployment.region },
      rolePolicyStatements: [new PolicyStatement({ actions: ['amplify:CreateDeployment', 'amplify:StartDeployment', 'amplify:GetJob'], resources: [`arn:aws:amplify:${this.region}:${this.account}:apps/*/branches/main`, `arn:aws:amplify:${this.region}:${this.account}:apps/*/branches/main/deployments/*`, `arn:aws:amplify:${this.region}:${this.account}:apps/*/branches/main/jobs/*`] })],
    })] });
  }
}
