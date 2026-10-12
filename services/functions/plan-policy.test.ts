import { describe, expect, it } from 'vitest';
import { activatingHabit, limitHabit } from './plan-policy';
import { editDocument, mergeDocuments } from '../../packages/domain/src/index';
const habit = editDocument(undefined, 'habit', 'habit', { name: 'Read', description: '', type: 'binary', target: 1, unit: '', active: true, weekdays: [1], startDate: '2026-10-12', reminder: '', categories: [] }, 'phone');
describe('Free plan admission', () => {
  it('keeps a sixth offline habit and its data while synchronizing its inactive state', () => {
    expect(limitHabit(habit,4,false)).toBe(habit);
    const limited = limitHabit(habit,5,false);
    expect(limited.data).toEqual({...habit.data,active:false});
    expect(mergeDocuments(limited,habit).data.active).toBe(false);
    expect(limited.deleted).toBe(false);
    expect(limitHabit(habit,500,true)).toBe(habit);
  });
  it('only admits activations; edits, deactivation and deletion never lose history', () => {
    expect(activatingHabit(habit)).toBe(true);
    expect(activatingHabit(habit,habit)).toBe(false);
    expect(activatingHabit({...habit,deleted:true})).toBe(false);
    expect(activatingHabit(habit,{...habit,deleted:true})).toBe(true);
    expect(activatingHabit({...habit,data:{...habit.data,active:false}})).toBe(false);
  });
});
