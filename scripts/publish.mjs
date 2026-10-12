import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { AmplifyClient, CreateDeploymentCommand, StartDeploymentCommand, GetJobCommand } from '@aws-sdk/client-amplify';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { fromIni } from '@aws-sdk/credential-providers';

const region = process.env.BLOXPLOX_REGION || 'eu-north-1';
const credentials = process.env.AWS_PROFILE ? fromIni({ profile: process.env.AWS_PROFILE }) : undefined;
let values = {};
if (!process.env.BLOXPLOX_API_URL) {
  const cfn = new CloudFormationClient({ region, credentials });
  const result = await cfn.send(new DescribeStacksCommand({ StackName: 'bloxplox-production' }));
  values = Object.fromEntries(result.Stacks[0].Outputs.map(o => [o.OutputKey, o.OutputValue]));
}
const config = {
  authDomain: process.env.BLOXPLOX_AUTH_DOMAIN || values.AuthDomain || '', socialProviders: JSON.parse(process.env.BLOXPLOX_SOCIAL_PROVIDERS || values.SocialProviders || '[]'),
  region, apiUrl: process.env.BLOXPLOX_API_URL || values.ApiUrl, websocketUrl: process.env.BLOXPLOX_SOCKET_URL || values.WebSocketUrl,
  userPoolId: process.env.BLOXPLOX_POOL_ID || values.UserPoolId, userPoolClientId: process.env.BLOXPLOX_CLIENT_ID || values.UserPoolClientId, publicSignup: true,
};
if (Object.values(config).some(value => value === undefined)) throw new Error('Missing deployment configuration');
await writeFile('dist/config.json', JSON.stringify(config));
const assets = await readdir('dist/assets');
const version = createHash('sha256').update((await readFile('dist/index.html'))).update(JSON.stringify(config)).digest('hex').slice(0, 16);
const files = ['/index.html', '/config.json', '/logo.svg', '/manifest.webmanifest', ...assets.map(a => `/assets/${a}`)];
await writeFile('dist/sw.js', `const CACHE='bloxplox-${version}';const FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('bloxplox-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));return;}if(url.pathname==='/config.json'){event.respondWith(fetch(event.request).catch(()=>caches.match('/config.json')));return;}if(FILES.includes(url.pathname))event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));});
`);
const appId = process.env.BLOXPLOX_AMPLIFY_APP_ID || values.AmplifyAppId;
await rm('bloxplox-web.zip', { force: true });
execFileSync('zip', ['-qr', '../bloxplox-web.zip', '.'], { cwd: 'dist' });
const amplify = new AmplifyClient({ region, credentials });
const deployment = await amplify.send(new CreateDeploymentCommand({ appId, branchName: 'main' }));
const uploaded = await fetch(deployment.zipUploadUrl, { method: 'PUT', body: await readFile('bloxplox-web.zip'), headers: { 'content-type': 'application/zip' } });
if (!uploaded.ok) throw new Error(`Upload failed: ${uploaded.status}`);
await amplify.send(new StartDeploymentCommand({ appId, branchName: 'main', jobId: deployment.jobId }));
for (let attempt = 0; attempt < 90; attempt++) {
  const job = await amplify.send(new GetJobCommand({ appId, branchName: 'main', jobId: deployment.jobId }));
  const status = job.job.summary.status;
  console.log(`Amplify deployment ${deployment.jobId}: ${status}`);
  if (status === 'SUCCEED') process.exit(0);
  if (['FAILED', 'CANCELLED'].includes(status)) throw new Error(`Amplify deployment ${status}`);
  await new Promise(resolve => setTimeout(resolve, 10000));
}
throw new Error('Deployment still running; inspect the existing Amplify job before retrying');
