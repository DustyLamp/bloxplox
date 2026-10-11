import { App, Tags } from 'aws-cdk-lib';
import { deployment } from '../config';
import { PipelineStack } from '../lib/pipeline-stack';
const app = new App();
new PipelineStack(app, 'BloxPloxPipeline', { env: { account: deployment.account, region: deployment.region } });
Tags.of(app).add('Application', 'BloxPlox');
Tags.of(app).add('Environment', 'production');
