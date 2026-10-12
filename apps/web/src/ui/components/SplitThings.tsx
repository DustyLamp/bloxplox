import { useRef, useState } from 'react';
import { entities, formatTime, parseTime, splitThings, type Block } from '../../../../../packages/domain/src/index';
import { useData } from '../../commons/data';
import { useActions } from '../../domain/actions';
import { Button, Dialog, ErrorText, Field } from './common';
export function SplitThings({ block, onClose }: { block: Block; onClose(): void }) {
  const { docs } = useData(), { saveBlock } = useActions(), [selected, setSelected] = useState<string[]>([]), [date, setDate] = useState(block.timing.date ?? block.resultDate), [time, setTime] = useState(formatTime(Math.min(1425, block.timing.start + block.timing.duration))), [busy, setBusy] = useState(false), [locked, setLocked] = useState(false), [error, setError] = useState('');
  const operation = useRef(crypto.randomUUID()), retry = useRef<Block[] | undefined>(undefined);
  return <Dialog title="Schedule things separately" onClose={onClose}><p className="bp2-muted">Each selected thing gets its own block. The original block keeps its time and remaining things.</p><form onSubmit={event => { event.preventDefault(); setBusy(true); setError(''); void (async () => { retry.current ??= splitThings(docs, block, selected, date, parseTime(time), operation.current); setLocked(true); for (const next of retry.current) await saveBlock(next); onClose(); })().catch(error => setError(error.message)).finally(() => setBusy(false)); }}>
    {entities(docs, 'thing').filter(t => block.thingIds?.includes(t.id)).map(t => <label key={t.id} className="bp2-check"><input type="checkbox" disabled={busy || locked} checked={selected.includes(t.id)} onChange={event => { retry.current = undefined; setSelected(event.target.checked ? [...selected, t.id] : selected.filter(id => id !== t.id)); }}/>{t.name}</label>)}
    <Field label="Date"><input type="date" required value={date} disabled={busy || locked} onChange={event => { retry.current = undefined; setDate(event.target.value); }}/></Field><Field label="Start time"><input type="time" step="900" required value={time} disabled={busy || locked} onChange={event => { retry.current = undefined; setTime(event.target.value); }}/></Field><p className="bp2-muted">Existing blocks stay in place. Things use the next available time, based on their estimates.</p><ErrorText message={error}/><Button type="submit" primary disabled={busy || !selected.length}>{busy ? 'Scheduling…' : locked ? 'Retry scheduling' : 'Schedule separately'}</Button>
  </form></Dialog>;
}
