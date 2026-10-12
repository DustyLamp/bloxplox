import { expect, it } from 'vitest';
import { applyTemplate, captureTemplate, type Block } from './index';
const block: Block = { id:'original', name:'Admin',timing:{date:'2026-10-12',start:480,duration:30},categories:['work'],activities:[],notes:'Start here',thingIds:['invoice'],habitId:'habit',ruleId:null,occurrenceDate:null,resultDate:'2026-10-12',backlogDate:null,order:0 };
it('copies reusable scheduling fields, leaving one-off work and history on the original day', () => {
  const template = { id:'template', ...captureTemplate('Morning',[block]) };
  const [copy] = applyTemplate(template,'2026-10-13',[],'attempt');
  expect(copy).toMatchObject({ name:'Admin',notes:'Start here',thingIds:[],habitId:null,resultDate:'2026-10-13',timing:{date:'2026-10-13',start:480,duration:30} });
  expect(copy.id).not.toBe(block.id);
  expect(applyTemplate(template,'2026-10-13',[copy],'attempt')).toHaveLength(1);
});
it('fits around existing blocks and rejects impossible days before writing anything', () => {
  const template = { id:'template', ...captureTemplate('Morning',[block]) };
  const next = applyTemplate(template,'2026-10-12',[block],'attempt');
  expect(next.find(b => b.id === 'original')!.timing.start).toBe(480);
  expect(next.find(b => b.id !== 'original')!.timing.start).toBe(510);
  expect(() => applyTemplate(template,'2026-10-12',[{...block,timing:{date:'2026-10-12',start:0,duration:1440}}],'attempt')).toThrow('midnight');
});
