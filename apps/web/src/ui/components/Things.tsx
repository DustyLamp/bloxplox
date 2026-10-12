import { useState, type FormEvent } from 'react';
import { CalendarPlus, Check, GitBranch, Plus, Trash2 } from 'lucide-react';
import { changedFields, dayBlocks, entities, formatDate, formatDuration, formatTime, localDate, thingBlockDuration, thingSessions, thingGraph, prerequisites, type Block, type Thing } from '../../../../../packages/domain/src/index';
import { useData, useSettings } from '../../commons/data';
import { blankBlock, useActions } from '../../domain/actions';
import { useCategoryFill } from './Boards';
import { CategoryPicker } from './Editors';
import { newThing } from './ThingPicker';
import { ThingGraphWorkspace } from './ThingGraphWorkspace';
import { useLiveDraft } from './useLiveDraft';
import { Button, Dialog, ErrorText, Field, Select } from './common';

export function Things({ date, editBlock, report }: { date: string; editBlock: (block: Block) => void; report: (message: string) => void }) {
  const { docs, save } = useData(), { settings } = useSettings(), fill = useCategoryFill();
  const [name, setName] = useState(''), [adding, setAdding] = useState(false), [filter, setFilter] = useState<'open' | 'done'>('open');
  const [draft, setDraft] = useState<Thing>(), [planning, setPlanning] = useState(false), [selected, setSelected] = useState<string[]>([]), [scheduling, setScheduling] = useState(false);
  const [graphFocus, setGraphFocus] = useState<string | null>(null);
  const graph = thingGraph(docs);
  const things = entities(docs, 'thing'), today = localDate(settings.timezone);
  const visible = things.filter(t => filter === 'done' ? !!t.completedOn : !t.completedOn).sort((a, b) => filter === 'done'
    ? b.completedOn!.localeCompare(a.completedOn!) || b.order - a.order
    : (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.order - b.order || a.id.localeCompare(b.id));
  const chosen = things.filter(t => selected.includes(t.id) && !t.completedOn);
  async function add(e: FormEvent) {
    e.preventDefault(); if (!name.trim() || adding) return; setAdding(true);
    try { const { id, ...data } = newThing(name.trim()); await save(id, 'thing', data); setName(''); setFilter('open'); }
    catch (e) { report((e as Error).message); } finally { setAdding(false); }
  }
  if (graphFocus !== null) return <ThingGraphWorkspace initial={graphFocus || undefined} onClose={() => setGraphFocus(null)}/>;
  return <section className="things-surface" aria-label="Things to do"><div className="things-heading"><div><h1>Things</h1><p>One-off tasks.</p></div><div className="things-heading-actions"><Button onClick={() => setGraphFocus('')}><GitBranch/>Graph</Button><Button aria-pressed={planning} onClick={() => { setPlanning(!planning); setFilter('open'); setSelected([]); }}><CalendarPlus/>{planning ? 'Cancel selection' : 'Plan a block'}</Button></div></div>
    <form className="things-quickadd" onSubmit={e => void add(e)}><input aria-label="New thing" placeholder="Add a thing" value={name} maxLength={120} required onChange={e => setName(e.target.value)}/><Button type="submit" primary disabled={adding || !name.trim()} aria-label="Add thing"><Plus/></Button></form>
    <div className="things-toolbar"><div className="bp2-switch"><button type="button" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>Open {things.filter(t => !t.completedOn).length}</button><button type="button" aria-pressed={filter === 'done'} onClick={() => { setFilter('done'); setPlanning(false); }}>Done {things.filter(t => t.completedOn).length}</button></div>
      {planning && <Button primary disabled={!chosen.length} onClick={() => setScheduling(true)}>Schedule {chosen.length} {chosen.length === 1 ? 'thing' : 'things'}</Button>}
    </div>
    <div className={`things-items ${settings.layout === 'grid' ? 'things-grid' : ''}`}>{visible.map(t => {
      const sessions = thingSessions(docs, t.id), next = sessions.find(b => b.timing.date && b.timing.date >= today), last = sessions.at(-1);
      const planned = next ?? last;
      return <article key={t.id} data-thing={t.id} className={`thing-card ${t.completedOn ? 'is-done' : ''} ${selected.includes(t.id) && planning ? 'is-selected' : ''}`} style={{ background: t.completedOn ? undefined : fill(t.categories) }}>
        {planning ? <input type="checkbox" aria-label={`Select ${t.name}`} checked={selected.includes(t.id)} onChange={e => setSelected(e.target.checked ? [...selected, t.id] : selected.filter(id => id !== t.id))}/> : <button type="button" className="thing-complete" aria-label={`${t.completedOn ? 'Reopen' : 'Complete'} ${t.name}`} aria-pressed={!!t.completedOn} onClick={() => { void save(t.id, 'thing', { completedOn: t.completedOn ? null : today }).catch(e => report((e as Error).message)); }}><Check/></button>}
        <div className="thing-body"><button type="button" className="thing-edit" aria-label={`Edit ${t.name}`} onClick={() => setDraft(t)}><strong>{t.name}</strong>{t.notes && <span>{t.notes}</span>}</button>
          <div className="thing-meta">{t.estimate && <span>{formatDuration(t.estimate)}</span>}{t.dueDate && !t.completedOn && <span className={t.dueDate < today ? 'thing-overdue' : ''}>Due {formatDate(t.dueDate)}</span>}{t.completedOn && <span>Done {formatDate(t.completedOn)}</span>}</div>
          <button type="button" className="thing-session" onClick={() => setGraphFocus(t.id)} aria-label={`Graph for ${t.name}`}><GitBranch/>{prerequisites(graph, t.id, true).filter(p => !p.completedOn).length ? `Waiting on ${prerequisites(graph, t.id, true).filter(p => !p.completedOn).length}` : `${prerequisites(graph, t.id).length} prerequisites`}</button>
          {planned && <button type="button" className="thing-session" onClick={() => editBlock(planned)}><CalendarPlus/>{planned.name} · {planned.timing.date ? `${formatDate(planned.timing.date)} · ${formatTime(planned.timing.start)}` : 'Backlog'}{sessions.length > 1 && ` · ${sessions.length} sessions`}</button>}
        </div>
      </article>;
    })}</div>
    {!visible.length && <p className="empty-copy">{filter === 'open' ? 'No open things.' : 'No completed things.'}</p>}
    {draft && <ThingEditor thing={draft} graph={() => { setGraphFocus(draft.id); setDraft(undefined); }} onClose={() => setDraft(undefined)} schedule={() => { setSelected([draft.id]); setDraft(undefined); setScheduling(true); }} report={report}/>}
    {scheduling && <ScheduleThings things={chosen} date={date} onClose={() => setScheduling(false)} editBlock={b => { setScheduling(false); setPlanning(false); setSelected([]); editBlock(b); }}/>}
  </section>;
}

function ThingEditor({ thing, onClose, schedule, graph, report }: { graph: () => void; thing: Thing; onClose: () => void; schedule: () => void; report: (message: string) => void }) {
  const { save, docs } = useData(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [draft, setDraft, baseline] = useLiveDraft(thing, entities(docs, 'thing').find(t => t.id === thing.id));
  async function submit(after: () => void) {
    setBusy(true); setError('');
    try { const { id, ...data } = draft; await save(id, 'thing', changedFields(baseline, data)); after(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog title="Edit thing" onClose={onClose}><form onSubmit={e => { e.preventDefault(); void submit(onClose); }}>
    <Field label="Name"><input required autoFocus maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></Field>
    <div className="bp2-fields"><Field label="Estimate (minutes)"><input type="number" min="1" max="1440" value={draft.estimate ?? ''} onChange={e => setDraft({ ...draft, estimate: e.target.value ? Number(e.target.value) : null })}/></Field><Field label="Due date (optional)"><input type="date" value={draft.dueDate ?? ''} onChange={e => setDraft({ ...draft, dueDate: e.target.value || null })}/></Field></div>
    <CategoryPicker selected={draft.categories} onChange={categories => setDraft({ ...draft, categories })}/>
    <Field label="Notes"><textarea maxLength={2000} rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></Field><ErrorText message={error}/><Button type="submit" primary disabled={busy} className="bp2-full">Save</Button>
  </form><Button className="bp2-full" disabled={busy} onClick={() => void submit(graph)}><GitBranch/>View prerequisites</Button>{!thing.completedOn && <Button className="bp2-full" disabled={busy} onClick={() => void submit(schedule)}><CalendarPlus/>Schedule thing</Button>}
    {thingSessions(docs, thing.id).length > 0 && <p className="bp2-muted">Completion is shared across every block containing this thing.</p>}
    <Button className="bp2-full danger" disabled={busy} onClick={() => { setBusy(true); void save(thing.id, 'thing', {}, true).then(() => { report('Thing deleted'); onClose(); }).catch(e => { setError((e as Error).message); setBusy(false); }); }}><Trash2/>Delete thing</Button>
  </Dialog>;
}

function ScheduleThings({ things, date, onClose, editBlock }: { things: Thing[]; date: string; onClose: () => void; editBlock: (block: Block) => void }) {
  const { docs } = useData(), { settings } = useSettings(), { saveBlock } = useActions();
  const [day, setDay] = useState(date), [blockId, setBlockId] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const blocks = dayBlocks(docs, day);
  return <Dialog title="Schedule things" onClose={onClose}><Field label="Date"><input type="date" required value={day} onChange={e => { setDay(e.target.value); setBlockId(''); }}/></Field>
    <Field label="Block"><Select value={blockId} onChange={e => setBlockId(e.target.value)}><option value="">New block</option>{blocks.map(b => <option key={b.id} value={b.id}>{b.name} · {formatTime(b.timing.start)}</option>)}</Select></Field>
    <p className="bp2-muted">{things.length} {things.length === 1 ? 'thing' : 'things'} · {formatDuration(thingBlockDuration(things))} estimated</p><ErrorText message={error}/>
    <Button primary disabled={busy || !day || !things.length} className="bp2-full" onClick={async () => {
      const ids = things.map(t => t.id);
      if (!blockId) { const block = blankBlock(day, settings.dayStart); editBlock({ ...block, name: things.length === 1 ? things[0].name : 'Things', thingIds: ids, timing: { ...block.timing, duration: Math.min(1440 - settings.dayStart, thingBlockDuration(things)) }, categories: [...new Set(things.flatMap(t => t.categories))].slice(0, 12) }); return; }
      const block = blocks.find(b => b.id === blockId); if (!block) { setError('That block has moved. Choose another.'); return; }
      setBusy(true); setError(''); try { await saveBlock({ ...block, thingIds: [...new Set([...(block.thingIds ?? []), ...ids])] }); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>{blockId ? 'Add to block' : 'Choose time and duration'}</Button>
  </Dialog>;
}
