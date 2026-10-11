import { useState, type FormEvent } from 'react';
import { ChevronRight, Plus, Repeat, Link, Trash2, CalendarPlus, ArrowDownUp } from 'lucide-react';
import { blockResultId, completionWithStatus, changedFields, dayBlocks, entities, formatDate, formatDuration, formatTime, getCompletion, instantiate, matchesRecurrence, parseTime, resultId, shiftDate, weekdayNames, type Block, type Habit, type Rule, type Completion } from '../../../../../packages/domain/src/index';
import { useData, useSettings } from '../../commons/data';
import { useActions } from '../../domain/actions';
import { Button, Dialog, ErrorText, Field, Select } from './common';
import { useCategoryFill } from './Boards';
import { ThingPicker } from './ThingPicker';

function useSubmit(onClose?: () => void) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function run(work: () => Promise<unknown>) { setBusy(true); setError(''); try { await work(); onClose?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return { error, busy, run, setError };
}
export function CategoryPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { docs, save } = useData(), [adding, setAdding] = useState(false), [name, setName] = useState(''), [color, setColor] = useState('#b48aff');
  const { error, run } = useSubmit();
  return <><div className="bp2-chiprow" aria-label="Categories">{entities(docs, 'category').map(c => <button type="button" key={c.id} className="bp2-chip" style={{ background: c.color }} aria-pressed={selected.includes(c.id)} onClick={() => onChange(selected.includes(c.id) ? selected.filter(id => id !== c.id) : [...selected, c.id])}>{c.name}</button>)}<button type="button" className="bp2-chip bp2-chipnew" onClick={() => setAdding(!adding)}><Plus/>Category</button></div>
    {adding && <div className="inline-category"><Field label="Category name"><input value={name} onChange={e => setName(e.target.value)} maxLength={120}/></Field><Field label="Colour"><input type="color" value={color} onChange={e => setColor(e.target.value)}/></Field><Button onClick={() => { if (!name.trim()) return; void run(async () => { const id = crypto.randomUUID(); await save(id, 'category', { name: name.trim(), color }); onChange([...selected, id]); setName(''); setAdding(false); }); }}>Add</Button></div>}<ErrorText message={error}/></>;
}
export function BlockEditor({ block, onClose, schedule, move, removed }: { block: Block; onClose: () => void; schedule: (block: Block) => void; move: (block: Block) => void; removed: (block: Block) => void }) {
  const { docs } = useData(), actions = useActions(), { busy, error, run, setError } = useSubmit(onClose);
  const [draft, setDraft] = useState(block), [conflict, setConflict] = useState(false), [policy, setPolicy] = useState<'push' | 'free'>('push');
  const existing = docs.some(d => d.id === block.id) || !!block.ruleId;
  const result = getCompletion(docs, blockResultId(block));
  const clashes = dayBlocks(docs, draft.timing.date ?? draft.resultDate).filter(b => b.id !== draft.id && b.timing.start < draft.timing.start + draft.timing.duration && b.timing.start + b.timing.duration > draft.timing.start);
  function submit(e: FormEvent) { e.preventDefault(); if (!draft.name.trim()) return setError('Enter a name'); if (clashes.length && !conflict) return setConflict(true); void run(async () => {
    await actions.place({ ...draft, name: draft.name.trim(), activities: draft.activities.map(a => a.trim()).filter(Boolean) }, policy, block);
    if (block.habitId !== draft.habitId && result.status !== 'none' && getCompletion(docs, blockResultId(draft)).status === 'none') await actions.complete(draft.habitId ?? draft.id, draft.resultDate, result);
  }); }
  return <Dialog title={existing ? block.name : 'Add a block'} onClose={onClose}><form onSubmit={submit}>
    <Field label="Name"><input autoFocus required value={draft.name} maxLength={120} onChange={e => setDraft({ ...draft, name: e.target.value })}/></Field>
    <div className="bp2-fields"><Field label="Start time"><input type="time" step="900" required value={formatTime(draft.timing.start)} onChange={e => setDraft({ ...draft, timing: { ...draft.timing, start: parseTime(e.target.value) } })}/></Field><Field label="Duration (minutes)"><input type="number" min="15" max="1440" step="15" required value={draft.timing.duration} onChange={e => setDraft({ ...draft, timing: { ...draft.timing, duration: Number(e.target.value) } })}/></Field></div>
    <CategoryPicker selected={draft.categories} onChange={categories => setDraft({ ...draft, categories })}/>
    <ThingPicker selected={draft.thingIds ?? []} onChange={thingIds => setDraft({ ...draft, thingIds })}/>
    <details className="bp2-settings"><summary>Settings</summary><Field label="Date"><input type="date" required value={draft.timing.date ?? draft.resultDate} onChange={e => setDraft({ ...draft, timing: { ...draft.timing, date: e.target.value }, resultDate: draft.ruleId ? draft.resultDate : e.target.value })}/></Field>
      <Field label="Linked habit"><Select value={draft.habitId ?? ''} onChange={e => setDraft({ ...draft, habitId: e.target.value || null })}><option value="">None</option>{entities(docs, 'habit').map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</Select></Field>
      <Field label="Activities (one per line)"><textarea rows={3} value={draft.activities.join('\n')} onChange={e => setDraft({ ...draft, activities: e.target.value.split('\n') })}/></Field>
      <Field label="Notes"><textarea rows={3} maxLength={2000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></Field>
    </details>
    {conflict && <section className="conflict-panel" aria-label="Overlap"><h3>Overlapping blocks</h3>{clashes.map(b => <p key={b.id}>{b.name} · {formatTime(b.timing.start)}</p>)}<Field label="Placement"><Select value={policy} onChange={e => setPolicy(e.target.value as 'push' | 'free')}><option value="push">Push following blocks</option><option value="free">Find another time</option></Select></Field>
      {clashes.length === 1 && <Button onClick={() => void run(async () => { const other = clashes[0]; await actions.saveBlock({ ...other, name: `${other.name} + ${draft.name}`.slice(0, 120), activities: [...new Set([...other.activities, other.name, ...draft.activities, draft.name])], categories: [...new Set([...other.categories, ...draft.categories])], thingIds: [...new Set([...(other.thingIds ?? []), ...(draft.thingIds ?? [])])] }); if (existing) await actions.saveBlock(block, true); })}>Merge activities into {clashes[0].name}</Button>}
      <Button onClick={() => setConflict(false)}>Edit block</Button><Button onClick={() => void run(() => actions.saveBlock({ ...draft, timing: { ...draft.timing, date: null }, activities: draft.activities.filter(Boolean) }))}>Add to backlog</Button>
    </section>}
    <ErrorText message={error}/><Button type="submit" primary className="bp2-full" disabled={busy}>{busy ? 'Saving…' : conflict ? 'Place block' : 'Save'}</Button>
  </form>
  {existing && <><div className="bp2-actionrow">{(['done', 'missed', 'none'] as const).map((status, i) => <Button key={status} aria-pressed={result.status === status} onClick={() => void run(() => actions.completeBlock(block, status))}>{['Done', 'Not done', 'Clear'][i]}</Button>)}</div>
    <button type="button" className="bp2-option" onClick={() => move(block)}><ArrowDownUp/>Move within day<ChevronRight className="bp2-chevron"/></button>
    <button type="button" className="bp2-option" onClick={() => void run(() => actions.place({ ...block, timing: { ...block.timing, date: shiftDate(block.timing.date ?? block.resultDate, 1) } }, 'free'))}><CalendarPlus/>Move to tomorrow<ChevronRight className="bp2-chevron"/></button>
    <button type="button" className="bp2-option" onClick={() => void run(() => actions.saveBlock({ ...block, timing: { ...block.timing, date: null } }))}>Add to backlog<ChevronRight className="bp2-chevron"/></button>
    <button type="button" className="bp2-option" onClick={() => schedule(block)}><Repeat/>{block.ruleId ? 'Edit recurrence' : 'Repeat block'}<ChevronRight className="bp2-chevron"/></button>
    <button type="button" className="bp2-option danger" onClick={() => void run(async () => { await actions.saveBlock(block, true); removed(block); })}><Trash2/>Delete this block</button>
  </>}
  </Dialog>;
}
export function MovePicker({ block, onClose }: { block: Block; onClose: () => void }) {
  const { docs } = useData(), { place } = useActions(), { error, busy, run } = useSubmit(onClose);
  const others = dayBlocks(docs, block.timing.date ?? block.resultDate).filter(b => b.id !== block.id);
  const [position, setPosition] = useState(others[0]?.id ?? 'end');
  return <Dialog title={`Move ${block.name}`} onClose={onClose}><Field label="Position"><Select value={position} onChange={e => setPosition(e.target.value)}>{others.map(b => <option key={b.id} value={b.id}>Before {b.name} · {formatTime(b.timing.start)}</option>)}<option value="end">After last block</option></Select></Field><ErrorText message={error}/><Button primary className="bp2-full" disabled={busy} onClick={() => void run(() => { const target = others.find(b => b.id === position), last = others.at(-1); return place({ ...block, timing: { ...block.timing, start: target?.timing.start ?? (last ? last.timing.start + last.timing.duration : block.timing.start) } }); })}>Move</Button></Dialog>;
}
export function HabitEditor({ habit, date, onClose }: { habit?: Habit; date: string; onClose: () => void }) {
  const { save } = useData(), { error, busy, run } = useSubmit(onClose);
  const [draft, setDraft] = useState<Habit>(habit ?? { id: crypto.randomUUID(), name: '', description: '', type: 'binary', target: 1, unit: '', active: true, weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: date, reminder: '', categories: [] });
  return <Dialog title={habit ? 'Edit habit' : 'Add habit'} onClose={onClose} tracker><form onSubmit={e => { e.preventDefault(); void run(async () => { const { id, ...data } = draft; await save(id, 'habit', habit ? changedFields(habit, data) : data); }); }}>
    <Field label="Name"><input autoFocus required maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></Field>
    <Field label="Description"><input maxLength={500} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></Field>
    <Field label="Type"><Select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as Habit['type'] })}><option value="binary">Done / not done</option><option value="value">Numeric</option></Select></Field>
    {draft.type === 'value' && <div className="bp2-fields"><Field label="Target"><input type="number" required min="0" step="any" value={draft.target} onChange={e => setDraft({ ...draft, target: Number(e.target.value) })}/></Field><Field label="Unit"><input maxLength={40} value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })}/></Field></div>}
    <label className="bp2-check"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })}/>Active</label>
    <Weekdays value={draft.weekdays} onChange={weekdays => setDraft({ ...draft, weekdays })}/>
    <Field label="Starts"><input type="date" required value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })}/></Field>
    <Field label="Reminder"><input type="time" value={draft.reminder} onChange={e => setDraft({ ...draft, reminder: e.target.value })}/></Field><p className="bp2-muted">Reminders run while BloxPlox is open.</p>
    <CategoryPicker selected={draft.categories} onChange={categories => setDraft({ ...draft, categories })}/><ErrorText message={error}/><Button type="submit" disabled={busy} primary className="bp2-full">Save</Button>
  </form></Dialog>;
}
export function Weekdays({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return <div className="bp2-repeatdays" aria-label="Weekdays">{weekdayNames.map((name, i) => <button type="button" key={name} aria-label={name} aria-pressed={value.includes(i)} onClick={() => onChange(value.includes(i) ? value.filter(d => d !== i) : [...value, i])}>{name[0]}</button>)}</div>;
}
export function HabitMenu({ habit, date, onClose, edit, schedule, stats }: { habit: Habit; date: string; onClose: () => void; edit: () => void; schedule: () => void; stats: () => void }) {
  const { docs } = useData(), { complete } = useActions(), { error, run } = useSubmit(onClose), current = getCompletion(docs, resultId(habit.id, date));
  return <Dialog title={habit.name} onClose={onClose} tracker><div className="bp2-actionrow">{(['done', 'missed', 'none'] as const).map((status, i) => <Button key={status} onClick={() => void run(() => complete(habit.id, date, completionWithStatus(current, status)))}>{['Done', 'Not done', 'Clear'][i]}</Button>)}</div>
    <button className="bp2-option" onClick={schedule}><CalendarPlus/>Schedule habit<ChevronRight className="bp2-chevron"/></button><button className="bp2-option" onClick={edit}>Edit habit<ChevronRight className="bp2-chevron"/></button><button className="bp2-option" onClick={stats}>View stats<ChevronRight className="bp2-chevron"/></button><button className="bp2-option" onClick={() => void run(() => complete(habit.id, date, { ...current, status: current.status === 'skip' ? 'none' : 'skip' }))}>{current.status === 'skip' ? 'Unskip' : 'Skip'}</button><ErrorText message={error}/>
  </Dialog>;
}
export function NumericResult({ habit, date, onClose }: { habit: Habit; date: string; onClose: () => void }) {
  const { docs } = useData(), { complete } = useActions(), { error, run, busy } = useSubmit(onClose);
  const old = getCompletion(docs, resultId(habit.id, date)), [value, setValue] = useState(old.value);
  return <Dialog title={habit.name} onClose={onClose} tracker><form onSubmit={e => { e.preventDefault(); void run(() => complete(habit.id, date, { value, status: value >= habit.target ? 'done' : 'none' })); }}><Field label={habit.unit || 'Value'}><input type="number" autoFocus min="0" max="1000000000" step="any" required value={value} onChange={e => setValue(Number(e.target.value))}/></Field><p className="bp2-muted">Target: {habit.target} {habit.unit}</p><ErrorText message={error}/><Button type="submit" primary className="bp2-full" disabled={busy}>Set result</Button></form></Dialog>;
}
export function RuleEditor({ habit, block, rule, date, onClose }: { habit?: Habit; block?: Block; rule?: Rule; date: string; onClose: () => void }) {
  const { docs, save } = useData(), { settings } = useSettings(), actions = useActions(), { error, busy, run } = useSubmit(onClose);
  const [linkId, setLinkId] = useState('');
  const [seriesId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<Rule>(rule ?? { id: seriesId, seriesId, name: habit?.name ?? block?.name ?? '', habitId: habit?.id ?? block?.habitId ?? null, categories: habit?.categories.length ? habit.categories : block?.categories ?? ['category:personal'], effectiveFrom: date, start: block?.timing.start ?? Math.min(1425, Math.round(parseTime(habit?.reminder || '08:30') / 15) * 15), duration: block?.timing.duration ?? 30, conflict: 'push', recurrence: { startDate: date, endDate: null, repeat: 'once', weekdays: [0, 2, 4], interval: 2, monthDay: Number(date.slice(-2)), timezone: settings.timezone } });
  const r = draft.recurrence, patch = (value: Partial<Rule['recurrence']>) => setDraft({ ...draft, recurrence: { ...r, ...value } });
  return <Dialog title={rule ? 'Edit recurrence' : `Schedule ${draft.name}`} onClose={onClose}><form onSubmit={e => { e.preventDefault(); void run(async () => {
    if (linkId) { const b = dayBlocks(docs, date).find(b => b.id === linkId)!; await actions.link(b, habit!.id); return; }
    const split = !!rule && rule.recurrence.startDate < date && rule.effectiveFrom < date;
    const nextRule = { ...draft, id: split ? `rule:${draft.seriesId}:${date}` : draft.id, effectiveFrom: split ? date : draft.effectiveFrom };
    const { id, ...data } = nextRule;
    if (split) await save(rule!.id, 'rule', { recurrence: { ...rule!.recurrence, endDate: shiftDate(date, -1) } });
    await save(id, 'rule', rule && !split ? changedFields(rule, data) : data);
    if (block && !block.ruleId && block.timing.date && matchesRecurrence(nextRule.recurrence, block.timing.date)) {
      const result = getCompletion(docs, blockResultId(block));
      await actions.saveBlock(block, true);
      // Keep the original session's tasks and notes on its first occurrence only.
      // One-off work must not be copied into every future session of a recurrence.
      if (result.status !== 'none' || block.thingIds?.length || block.notes || block.activities.length) {
        const occurrence = { ...instantiate(nextRule, block.timing.date), thingIds: block.thingIds ?? [], notes: block.notes, activities: block.activities };
        await actions.saveBlock(occurrence);
        if (result.status !== 'none') await actions.complete(occurrence.habitId ?? occurrence.id, occurrence.resultDate, result);
      }
    }
  }); }}>
    {habit && !rule && <Field label="Placement"><Select value={linkId} onChange={e => setLinkId(e.target.value)}><option value="">New block</option>{dayBlocks(docs, date).filter(b => !b.habitId || b.habitId === habit.id).map(b => <option key={b.id} value={b.id}>Link to {b.name} · {formatTime(b.timing.start)}</option>)}</Select></Field>}
    {!linkId && <>{rule && <p className="bp2-muted">Changes apply from {formatDate(date)}. Earlier days stay as scheduled.</p>}<div className="bp2-fields"><Field label="Starts"><input type="date" required value={r.startDate} onChange={e => patch({ startDate: e.target.value })}/></Field><Field label="Repeat"><Select value={r.repeat} onChange={e => patch({ repeat: e.target.value as Rule['recurrence']['repeat'] })}><option value="once">Once</option><option value="daily">Every day</option><option value="weekly">Weekly</option><option value="interval">Every N days</option><option value="monthly">Monthly</option></Select></Field></div>
      <div className="bp2-fields"><Field label="Start time"><input type="time" required step="900" value={formatTime(draft.start)} onChange={e => setDraft({ ...draft, start: parseTime(e.target.value) })}/></Field><Field label="Duration (minutes)"><input type="number" required min="15" max="1440" step="15" value={draft.duration} onChange={e => setDraft({ ...draft, duration: Number(e.target.value) })}/></Field></div>
      {r.repeat === 'weekly' && <><p className="bp2-muted">{r.weekdays.length} times per week</p><Weekdays value={r.weekdays} onChange={weekdays => patch({ weekdays })}/></>}
      {r.repeat === 'interval' && <Field label="Every N days"><input type="number" required min="1" max="365" value={r.interval} onChange={e => patch({ interval: Number(e.target.value) })}/></Field>}
      {r.repeat === 'monthly' && <><Field label="Day of month"><input type="number" required min="1" max="31" value={r.monthDay} onChange={e => patch({ monthDay: Number(e.target.value) })}/></Field><p className="bp2-muted">Shorter months use the last day.</p></>}
      {r.repeat !== 'once' && <Field label="Ends (optional)"><input type="date" min={r.startDate} value={r.endDate ?? ''} onChange={e => patch({ endDate: e.target.value || null })}/></Field>}
      <CategoryPicker selected={draft.categories} onChange={categories => setDraft({ ...draft, categories })}/>
      <Field label="If the time is occupied"><Select value={draft.conflict} onChange={e => setDraft({ ...draft, conflict: e.target.value as Rule['conflict'] })}><option value="push">Push following blocks</option><option value="free">Next available</option></Select></Field>
      <p className="bp2-muted">Times follow your schedule’s local clock, including daylight-saving changes.</p>
    </>}
    <ErrorText message={error}/><Button type="submit" primary disabled={busy} className="bp2-full">{linkId ? 'Link habit' : 'Save schedule'}</Button>
  </form>{rule && <Button className="bp2-full danger" onClick={() => void run(() => rule.recurrence.startDate < date ? save(rule.id, 'rule', { recurrence: { ...rule.recurrence, endDate: shiftDate(date, -1) } }) : save(rule.id, 'rule', {}, true))}>Stop recurrence from this day</Button>}</Dialog>;
}
