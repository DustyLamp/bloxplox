import { useData } from '../commons/data';
import { blockResultId, canonical, dayBlocks, getCompletion, insertBlock, resultId, type Block, type Completion, type DataByKind } from '../../../../packages/domain/src/index';

export function useActions() {
  const { docs, save } = useData();
  async function saveBlock(block: Block, deleted = false) {
    const { id, ...data } = block;
    const existing = docs.find(d => d.id === id);
    const changes = existing ? Object.fromEntries(Object.entries(data).filter(([key, value]) => canonical(value) !== canonical(existing.data[key]))) : data;
    await save(id, 'block', changes, deleted);
  }
  async function place(block: Block, policy: 'push' | 'free' = 'push') {
    if (!block.timing.date) return saveBlock(block);
    const proposed = insertBlock(dayBlocks(docs, block.timing.date), block, policy);
    if (!proposed) throw new Error('Would extend past midnight. Choose another time or add to backlog.');
    for (const item of proposed) {
      const existing = dayBlocks(docs, block.timing.date).find(b => b.id === item.id);
      if (item.id === block.id || !existing || canonical(item) !== canonical(existing)) await saveBlock(item);
    }
  }
  async function complete(subjectId: string, date: string, completion: Completion) {
    await save(resultId(subjectId, date), 'result', { subjectId, date, completion });
  }
  async function completeBlock(block: Block, status: Completion['status']) {
    // Freeze the occurrence when acted on, so subsequent rule edits preserve history.
    if (block.ruleId && !docs.some(d => d.id === block.id)) await saveBlock(block);
    const old = getCompletion(docs, blockResultId(block));
    await complete(block.habitId ?? block.id, block.resultDate, { ...old, status });
  }
  async function link(block: Block, habitId: string | null) {
    const old = getCompletion(docs, blockResultId(block));
    await saveBlock({ ...block, habitId });
    const subject = habitId ?? block.id;
    if (old.status !== 'none') await complete(subject, block.resultDate, old);
  }
  return { saveBlock, place, complete, completeBlock, link, save };
}
export function blankBlock(date: string, start = 480): Block {
  return { id: crypto.randomUUID(), name: '', timing: { date, start, duration: 30 }, categories: ['category:personal'], activities: [], habitId: null, resultDate: date, ruleId: null, occurrenceDate: null, order: Date.now(), notes: '', backlogDate: null };
}
export const blockData = ({ id: _id, ...data }: Block): DataByKind['block'] => data;
