import { blockResultId, completionWithStatus, dayBlocks, getCompletion, insertBlock, resultId } from './schedule';
import { canonical, changedFields } from './conflicts';
import type { Block, Completion, DataByKind } from './model';

export type SaveRecord = <K extends import('./model').Kind>(id: string, kind: K, data: Partial<DataByKind[K]>, deleted?: boolean) => Promise<void>;
export function createActions(docs: import('./model').Document[], save: SaveRecord) {
  async function saveBlock(block: Block, deleted?: boolean, baseline?: Block) {
    const { id, ...data } = block;
    const existing = docs.find(d => d.id === id);
    if (existing?.deleted && deleted === undefined) throw new Error('This block was deleted on another device.');
    const changes = existing ? changedFields(baseline ?? existing.data, data) : data;
    await save(id, 'block', changes, deleted);
  }
  async function place(block: Block, policy: 'push' | 'free' = 'push', baseline?: Block) {
    if (!block.timing.date) return saveBlock(block, undefined, baseline);
    const proposed = insertBlock(dayBlocks(docs, block.timing.date), block, policy);
    if (!proposed) throw new Error('Would extend past midnight. Choose another time or add to backlog.');
    for (const item of proposed) {
      const existing = dayBlocks(docs, block.timing.date).find(b => b.id === item.id);
      if (item.id === block.id || !existing || canonical(item) !== canonical(existing)) await saveBlock(item, undefined, item.id === block.id ? baseline : undefined);
    }
  }
  async function complete(subjectId: string, date: string, completion: Completion) {
    for (const block of dayBlocks(docs, date).filter(b => b.habitId === subjectId && b.ruleId && !docs.some(d => d.id === b.id))) await saveBlock(block);
    await save(resultId(subjectId, date), 'result', { subjectId, date, completion });
  }
  async function completeBlock(block: Block, status: Completion['status']) {
    // Freeze the occurrence when acted on, so subsequent rule edits preserve history.
    if (block.ruleId && !docs.some(d => d.id === block.id)) await saveBlock(block);
    const old = getCompletion(docs, blockResultId(block));
    await complete(block.habitId ?? block.id, block.resultDate, completionWithStatus(old, status));
  }
  async function link(block: Block, habitId: string | null) {
    const old = getCompletion(docs, blockResultId(block));
    await saveBlock({ ...block, habitId });
    const subject = habitId ?? block.id;
    if (old.status !== 'none' && getCompletion(docs, resultId(subject, block.resultDate)).status === 'none') await complete(subject, block.resultDate, old);
  }
  return { saveBlock, place, complete, completeBlock, link, save };
}
export function blankBlock(date: string, start = 480): Block {
  return { id: crypto.randomUUID(), name: '', timing: { date, start, duration: 30 }, categories: ['category:personal'], activities: [], habitId: null, resultDate: date, ruleId: null, occurrenceDate: null, order: Date.now(), notes: '', backlogDate: null };
}
export const blockData = ({ id: _id, ...data }: Block): DataByKind['block'] => data;
