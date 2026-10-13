/** Destructive live check restricted to newly created disposable QA accounts. */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fromIni } from '@aws-sdk/credential-providers';
import { CloudFormationClient, DescribeStacksCommand, ListStackResourcesCommand } from '@aws-sdk/client-cloudformation';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminDeleteUserCommand, AdminGetUserCommand, AdminLinkProviderForUserCommand, AdminDisableProviderForUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, BatchWriteCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { AuthenticationDetails, CognitoUser, CognitoUserPool } from 'amazon-cognito-identity-js';
import { chromium, expect, type Page } from '@playwright/test';
import { editDocument } from '../../packages/domain/src/index';
await mkdir('test-results/native-beta', { recursive: true });
const region='eu-north-1', credentials=fromIni({profile:'bloxplox'}), cfn=new CloudFormationClient({region,credentials});
const stack=(await cfn.send(new DescribeStacksCommand({StackName:'bloxplox-production'}))).Stacks![0];
assert(stack.StackId!.includes(':807550663091:'));
const output=Object.fromEntries(stack.Outputs!.map(o=>[o.OutputKey!,o.OutputValue!]));
const resources=await cfn.send(new ListStackResourcesCommand({StackName:'bloxplox-production'}));
const connectionTable=resources.StackResourceSummaries!.find(r=>r.ResourceType==='AWS::DynamoDB::Table'&&r.LogicalResourceId!.startsWith('Connections'))!.PhysicalResourceId!;
const cognito=new CognitoIdentityProviderClient({region,credentials}),ddb=DynamoDBDocumentClient.from(new DynamoDBClient({region,credentials}));
const appleStateKeys: { pk: string; sk: string }[] = [];
const users:any[]=[], checks:string[]=[], prefix=`qa-delete-${Date.now()}-${randomBytes(3).toString('hex')}`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const check=(text:string)=>{checks.push(text);console.log(`PASS ${text}`);};
async function user(suffix:string){
 const email=`${prefix}-${suffix}@example.invalid`, password=randomBytes(24).toString('base64url')+'aA7!';
 const result=await cognito.send(new AdminCreateUserCommand({UserPoolId:output.UserPoolId,Username:email,MessageAction:'SUPPRESS',UserAttributes:[{Name:'email',Value:email},{Name:'email_verified',Value:'true'}]}));
 const value={email,password,username:result.User!.Username!,subject:result.User!.Attributes!.find(a=>a.Name==='sub')!.Value!,token:''};users.push(value);
 await cognito.send(new AdminSetUserPasswordCommand({UserPoolId:output.UserPoolId,Username:value.username,Password:password,Permanent:true}));
 value.token=await new Promise<string>((resolve,reject)=>new CognitoUser({Username:email,Pool:new CognitoUserPool({UserPoolId:output.UserPoolId,ClientId:output.UserPoolClientId})}).authenticateUser(new AuthenticationDetails({Username:email,Password:password}),{onSuccess:s=>resolve(s.getAccessToken().getJwtToken()),onFailure:reject}));
 return value;
}
async function request(value:any,path:string,body:any){return fetch(output.ApiUrl+path,{method:'POST',headers:{authorization:`Bearer ${value.token}`,'content-type':'application/json'},body:JSON.stringify(body)});}
async function signIn(page:any,value:any){await page.goto('https://bloxplox.com/settings');await page.getByLabel('Email',{exact:true}).fill(value.email);await page.getByLabel('Password',{exact:true}).fill(value.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Delete account',exact:true})).toBeVisible({timeout:30000});await expect(page.getByText('Synced',{exact:true})).toBeVisible({timeout:30000});}
// RxDB Dexie removes records but retains empty IndexedDB containers. Count all
// object stores, including replication metadata, rather than just database names.
async function localRecordCount(page: Page, databaseName: string) {
 return page.evaluate(async name => {
  const databases = (await indexedDB.databases()).filter(db => db.name?.startsWith(`rxdb-dexie-${name}--`));
  const counts = await Promise.all(databases.map(async info => {
   const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(info.name!); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
   try {
    return (await Promise.all(Array.from(db.objectStoreNames).map(store => new Promise<number>((resolve, reject) => {
     const request = db.transaction(store, 'readonly').objectStore(store).count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    })))).reduce((sum, count) => sum + count, 0);
   } finally { db.close(); }
  }));
  return counts.reduce((sum, count) => sum + count, 0);
 }, databaseName);
}
try {
 const a=await user('a'),b=await user('b');
 if (JSON.parse(output.SocialProviders || '[]').includes('SignInWithApple')) {
  const prepareBody={confirmation:'DELETE',state:randomBytes(32).toString('base64url'),returnTo:'https://bloxplox.com/settings'};
  const normal=await request(a,'/account/apple/prepare',prepareBody); assert.equal(normal.status,200); assert.deepEqual(await normal.json(),{url:null});
  assert.equal((await request(a,'/account/apple/prepare',{...prepareBody,returnTo:'https://attacker.invalid/settings'})).status,400);
  const appleId=`qa-${randomBytes(24).toString('hex')}`;
  await cognito.send(new AdminLinkProviderForUserCommand({UserPoolId:output.UserPoolId,DestinationUser:{ProviderName:'Cognito',ProviderAttributeValue:a.username},SourceUser:{ProviderName:'SignInWithApple',ProviderAttributeName:'Cognito_Subject',ProviderAttributeValue:appleId}}));
  const prepared=await request(a,'/account/apple/prepare',prepareBody); assert.equal(prepared.status,200);
  const url=new URL((await prepared.json()).url),state=url.searchParams.get('state')!;
  assert.equal(url.origin,'https://appleid.apple.com');assert.equal(url.searchParams.get('redirect_uri'),output.ApiUrl+'/account/apple/callback');
  const key={pk:'APPLEDELETE#'+createHash('sha256').update(state).digest('hex'),sk:'STATE'};appleStateKeys.push(key);
  const stored=(await ddb.send(new GetCommand({TableName:output.DataTableName,Key:key,ConsistentRead:true}))).Item!;
  assert.equal(stored.owner,a.subject);assert.equal(stored.appleUserId,appleId);assert.equal(stored.nonce,url.searchParams.get('nonce'));
  const cancel=()=>fetch(output.ApiUrl+'/account/apple/callback',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({state,error:'access_denied'})});
  const cancelled=await cancel();assert.equal(cancelled.status,303);assert.equal(new URL(cancelled.headers.get('location')!).searchParams.get('appleDelete'),'cancelled');assert.equal((await cancel()).status,400);
  assert.equal((await request(a,'/sync/pull',{limit:10})).status,200);
  await cognito.send(new AdminDisableProviderForUserCommand({UserPoolId:output.UserPoolId,User:{ProviderName:'SignInWithApple',ProviderAttributeName:'Cognito_Subject',ProviderAttributeValue:appleId}}));
  check('Live Apple confirmation authenticates ownership, binds provider subject/nonce, rejects untrusted returns and consumes cancellation state once without deleting the account');
 }

 const databaseName='bloxplox-'+createHash('sha256').update(output.UserPoolId+':'+a.subject).digest('hex');
 const doc=editDocument(undefined,'deletion-isolation','category',{name:'Keep other account',color:'#b48aff'},'qa');
 assert.equal((await request(b,'/sync/push',{changes:[{newDocumentState:doc}]})).status,200);
 const context=await browser.newContext(),page=await context.newPage(),other=await context.newPage();
 const remoteContext=await browser.newContext(),remote=await remoteContext.newPage(); await signIn(remote,a); await remoteContext.setOffline(true);
 const errors:string[]=[];remote.on('pageerror',(e:any)=>errors.push(e.message));page.on('pageerror',(e:any)=>errors.push(e.message));other.on('pageerror',(e:any)=>errors.push(e.message));
 await signIn(page,a); await other.goto('https://bloxplox.com/blocks');await expect(other.getByRole('button',{name:'Add a block',exact:true})).toBeVisible();
 for(const key of ['GOOGLESTATE#','GOOGLEWATCH#','APPLEDELETE#']) await ddb.send(new PutCommand({TableName:output.DataTableName,Item:{pk:key+prefix,sk:'QA',owner:a.subject,expires:Math.floor(Date.now()/1000)+3600}}));
 await ddb.send(new PutCommand({TableName:connectionTable,Item:{connectionId:'ticket:'+prefix,userId:a.subject,expires:Math.floor(Date.now()/1000)+3600}}));
 assert.equal((await request(a,'/account/delete',{confirmation:'NO'})).status,400);
 assert(await localRecordCount(page, databaseName) > 0); assert(await localRecordCount(remote, databaseName) > 0);
 await page.getByRole('button',{name:'Delete account',exact:true}).click();await page.getByLabel('Type DELETE to confirm').fill('DELETE');page.on('dialog',(dialog:any)=>dialog.accept());
 await page.getByRole('button',{name:'Permanently delete account',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible({timeout:30000});
 await expect(other.getByRole('button',{name:'Sign in',exact:true})).toBeVisible({timeout:30000});
 await expect.poll(() => localRecordCount(page, databaseName)).toBe(0);
 check('Production web deletion signs out both tabs and erases local account records and replication metadata');
 await remoteContext.setOffline(false); await expect(remote.getByRole('button',{name:'Sign in',exact:true})).toBeVisible({timeout:90000});
 await expect.poll(() => localRecordCount(remote, databaseName)).toBe(0);
 check('A separately cached offline device erases cached records and replication metadata on reconnect');
 assert.equal((await request(a,'/sync/pull',{limit:10})).status,410);
 assert.equal((await request(a,'/sync/push',{changes:[{newDocumentState:doc}]})).status,410);
 assert.equal((await request(a,'/sync/ticket',{})).status,410);
 assert.equal((await request(a,'/calendars/status',{})).status,410);
 assert.equal((await request(a,'/account/delete',{confirmation:'DELETE'})).status,202);
 assert.equal((await request(b,'/sync/pull',{limit:10})).status,200);
 check('Deleted-account tokens cannot read, write, connect or import; retries are idempotent and the other account stays usable');
 const markerKey={pk:`DELETED#${a.subject}`,sk:'ACCOUNT'};
 await expect.poll(async()=>(await ddb.send(new GetCommand({TableName:output.DataTableName,Key:markerKey,ConsistentRead:true}))).Item?.state,{timeout:420000,intervals:[5000]}).toBe('complete');
 const records=await ddb.send(new QueryCommand({TableName:output.DataTableName,ConsistentRead:true,KeyConditionExpression:'pk = :pk',ExpressionAttributeValues:{':pk':`USER#${a.subject}`}}));assert.equal(records.Items?.length,0);
 await assert.rejects(()=>cognito.send(new AdminGetUserCommand({UserPoolId:output.UserPoolId,Username:a.username})),{name:'UserNotFoundException'});
 for(const key of ['GOOGLESTATE#','GOOGLEWATCH#','APPLEDELETE#']) assert.equal((await ddb.send(new GetCommand({TableName:output.DataTableName,Key:{pk:key+prefix,sk:'QA'},ConsistentRead:true}))).Item,undefined);
 assert.equal((await ddb.send(new GetCommand({TableName:connectionTable,Key:{connectionId:'ticket:'+prefix},ConsistentRead:true}))).Item,undefined);
 check('Streams/SQS cleanup removed Cognito, planner revisions, OAuth state, watch metadata and connection tickets');
 assert.deepEqual(errors,[]);check('No runtime errors during local database removal');
 await page.screenshot({path:'test-results/native-beta/deletion-complete.png'});
} finally {
 await browser.close();
 for(const value of users){
  let cursor:any;do{const page=await ddb.send(new QueryCommand({TableName:output.DataTableName,ConsistentRead:true,KeyConditionExpression:'pk = :pk',ExpressionAttributeValues:{':pk':`USER#${value.subject}`},ExclusiveStartKey:cursor}));for(let i=0;i<(page.Items?.length??0);i+=25){let pending=page.Items!.slice(i,i+25).map(row=>({DeleteRequest:{Key:{pk:row.pk,sk:row.sk}}}));while(pending.length){const result=await ddb.send(new BatchWriteCommand({RequestItems:{[output.DataTableName]:pending}}));pending=result.UnprocessedItems?.[output.DataTableName] as typeof pending??[];}}cursor=page.LastEvaluatedKey;}while(cursor);
  await cognito.send(new AdminDeleteUserCommand({UserPoolId:output.UserPoolId,Username:value.username})).catch(e=>{if(e.name!=='UserNotFoundException')throw e;});
 }
 for(const key of appleStateKeys) await ddb.send(new DeleteCommand({TableName:output.DataTableName,Key:key}));
 for(const pk of ['GOOGLESTATE#'+prefix,'GOOGLEWATCH#'+prefix,'APPLEDELETE#'+prefix]) await ddb.send(new DeleteCommand({TableName:output.DataTableName,Key:{pk,sk:'QA'}}));
 await ddb.send(new DeleteCommand({TableName:connectionTable,Key:{connectionId:'ticket:'+prefix}}));
 await writeFile('test-results/native-beta/deletion-checks.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,temporaryUsersRemoved:users.length},null,2));
}
