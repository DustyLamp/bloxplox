import { beforeEach, expect, it, vi } from 'vitest';
import type { Context, SQSEvent } from 'aws-lambda';
import { editDocument, type Document } from '../../packages/domain/src/index';
const state = vi.hoisted(() => ({ docs: [] as Document[], saved: [] as any[], queued: [] as any[], requests: [] as string[], updates: [] as any[], failSecond: false, pages: [] as any[], enabled: true }));
const source = () => ({pk:'USER#owner',sk:'GCALSOURCE#source',id:'source',accountId:'google-account',calendarId:'private-calendar-id',enabled:state.enabled,windowDate:'2026-10-12',watchExpires:Date.now()+3*86400000});
vi.mock('./store', () => ({ ddb: { send: async (command: any) => { state.updates.push(command.input); if (command.constructor.name === 'QueryCommand') return {Items:[{pk:'USER#owner',sk:'GCALACCOUNT#google-account'}]}; return {}; } } }));
vi.mock('./google-config', () => ({ googleConfig: async () => ({clientId:'id',clientSecret:'secret',redirectUri:'https://example.com'}), googleFetch: async (url: string) => { state.requests.push(url); if (state.failSecond && url.includes('pageToken')) throw new Error('Network unavailable'); return state.pages[url.includes('pageToken')?1:0]; } }));
vi.mock('./google-store', async () => {
  const { editDocument } = await import('../../packages/domain/src/index');
  return {table:()=> 'test',pk:(owner:string)=>`USER#${owner}`,stableId:(...parts:string[])=>parts.join(':'),item:async (owner:string,sk:string) => owner !== 'owner' ? undefined : sk.startsWith('GCALSOURCE#') ? source() : {pk:'USER#owner',sk:'GCALACCOUNT#google-account',id:'google-account'},items:async (_: string,prefix: string)=>prefix.startsWith('DOC#') ? state.docs.map(document=>({document})) : [source()],googleToken:async()=> 'secret-token',enqueueCalendar:async(...args:any[])=>{state.queued.push(args);},saveImported:async(owner:string,id:string,kind:any,data:any,deleted=false)=>{state.saved.push({owner,id,data,deleted});const previous=state.docs.find(d=>d.id===id),next=editDocument(previous,id,kind,data,'google',deleted);state.docs=state.docs.filter(d=>d.id!==id).concat(next);} };
});
import { handler, importedEvent } from './google-worker';
const remote = (id:string) => ({id,summary:id,start:{dateTime:'2026-10-12T10:00:00+02:00'},end:{dateTime:'2026-10-12T11:00:00+02:00'}});
const job = {Records:[{messageId:'job',body:JSON.stringify({owner:'owner',sourceId:'source'})}]} as SQSEvent;
beforeEach(()=>{state.docs=[];state.saved=[];state.queued=[];state.requests=[];state.updates=[];state.failSecond=false;state.enabled=true;state.pages=[{items:[remote('new')]}];});
it('keeps old data intact when a later Google page fails', async () => {
  state.docs=[editDocument(undefined,'event:source:old','calendarEvent',importedEvent(remote('old'),'source')!,'google')];
  state.pages=[{items:[remote('new')],nextPageToken:'page2'}];state.failSecond=true;
  expect(await handler(job)).toEqual({batchItemFailures:[{itemIdentifier:'job'}]});expect(state.saved).toEqual([]);expect(state.docs[0].deleted).toBe(false);
});
it('imports a complete snapshot, removes canceled/missing events, and skips unchanged writes on repeated deliveries', async () => {
  state.docs=[editDocument(undefined,'event:source:old','calendarEvent',importedEvent(remote('old'),'source')!,'google')];
  expect(await handler(job)).toEqual({batchItemFailures:[]});expect(state.saved).toEqual([expect.objectContaining({id:'event:source:new',deleted:false}),expect.objectContaining({id:'event:source:old',deleted:true})]);
  state.saved=[]; await handler(job);expect(state.saved).toEqual([]);
  expect(state.requests.every(url=>url.includes('singleEvents=true')&&url.includes('timeMin='))).toBe(true);
});
it('continues long imports without pruning, then finishes the same stable records', async () => {
  expect(await handler(job,{getRemainingTimeInMillis:()=>15000} as Context)).toEqual({batchItemFailures:[]});expect(state.queued).toEqual([['owner','source']]);expect(state.saved).toEqual([]);
  await handler(job);expect(state.saved).toHaveLength(1);
});
it('disabled sources perform no external reads and daily catch-up works from keys-only index entries', async () => {
  state.enabled=false;await handler(job);expect(state.requests).toEqual([]);state.enabled=true;await handler({daily:true});expect(state.queued).toEqual([['owner','source']]);
});
it('treats Google text as plain data, preserves all-day exclusive end dates, and filters unsafe links', () => {
  expect(importedEvent({id:'all',summary:'<b>Holiday</b>',description:'<a>notes</a>',start:{date:'2026-10-12'},end:{date:'2026-10-14'},htmlLink:'javascript:alert(1)'},'source')).toMatchObject({name:'Holiday',notes:'notes',allDay:true,start:'2026-10-12',end:'2026-10-14',htmlUrl:''});
  expect(importedEvent({...remote('gone'),status:'cancelled'},'source')).toBeUndefined();
});
