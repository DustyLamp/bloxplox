import { useMemo, useState } from 'react';
import { ArrowLeft, Check, GitBranch, Plus, X } from 'lucide-react';
import { entities, focusedGraph, localDate, prerequisiteError, prerequisites, thingGraph } from '../../../../../packages/domain/src/index';
import { ThingGraph } from '../../../../../packages/graph/src/ThingGraph';
import { useData, useSettings } from '../../commons/data';
import { Button, ErrorText, Field, IconButton, Select } from './common';
import { newThing } from './ThingPicker';

export function ThingGraphWorkspace({ initial, onClose }: { initial?: string; onClose: () => void }) {
  const { docs, save } = useData(), { settings } = useSettings();
  const graph = useMemo(() => thingGraph(docs), [docs]);
  const [selected, setSelected] = useState(initial ?? ''), [all, setAll] = useState(!initial);
  const [search, setSearch] = useState(''), [candidate, setCandidate] = useState(''), [name, setName] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const thing = graph.things.find(t => t.id === selected);
  const direct = prerequisites(graph, selected), upstream = prerequisites(graph, selected, true).filter(t => !direct.some(d => d.id === t.id));
  const available = graph.things.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) && !prerequisiteError(graph, selected, t.id));
  const colors = Object.fromEntries(entities(docs, 'category').map(c => [c.id, c.color]));
  function select(id: string) { setSelected(id); setCandidate(''); setSearch(''); setError(''); }
  async function link(thingId: string, prerequisiteId: string) {
    const message = prerequisiteError(graph, thingId, prerequisiteId); if (message) throw new Error(message);
    await save(crypto.randomUUID(), 'prerequisite', { thingId, prerequisiteId });
    setCandidate(''); setSearch('');
  }
  async function run(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setError('');
    try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(prerequisiteId: string) {
    // Delete every duplicate pair created concurrently on disconnected devices.
    for (const l of entities(docs, 'prerequisite').filter(l => l.thingId === selected && l.prerequisiteId === prerequisiteId)) await save(l.id, 'prerequisite', {}, true);
  }
  const row = (id: string, name: string, completedOn: string | null, removable: boolean) => <li key={id}>
    <button type="button" className={`graph-check ${completedOn ? 'is-done' : ''}`} disabled={busy} aria-label={`${completedOn ? 'Reopen' : 'Complete'} ${name}`} onClick={() => void run(() => save(id, 'thing', { completedOn: completedOn ? null : localDate(settings.timezone) }))}><Check/></button>
    <button type="button" className="graph-list-name" onClick={() => select(id)}><span>{name}</span><small>{completedOn ? 'Done' : 'Open'}</small></button>
    {removable && <IconButton label={`Remove prerequisite ${name}`} disabled={busy} onClick={() => void run(() => remove(id))}><X/></IconButton>}
  </li>;
  return <section className="things-surface graph-workspace" aria-label="Things graph"><div className="things-heading"><div><h1>Things graph</h1><p>Prerequisites flow left to right.</p></div><Button onClick={onClose}><ArrowLeft/>Things</Button></div>
    <div className="graph-toolbar"><Field label="Focus thing"><Select value={selected} onChange={e => { select(e.target.value); setAll(!e.target.value); }}><option value="">Choose a thing</option>{[...graph.things].sort((a,b) => a.name.localeCompare(b.name)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      <Button aria-pressed={all} onClick={() => setAll(!all)} disabled={!selected}><GitBranch/>{all ? 'Focus prerequisites' : 'Show all things'}</Button>
    </div>
    <div className="graph-columns"><ThingGraph graph={focusedGraph(graph, all ? undefined : selected || undefined)} selected={selected} colors={colors} onSelect={select} onConnect={(thingId, prerequisiteId) => void run(() => link(thingId, prerequisiteId))}/>
    <aside className="graph-detail" aria-label="Prerequisite details">{thing ? <>
      <h2>{thing.name}</h2><p className="bp2-muted">{thing.completedOn ? 'Done' : prerequisites(graph, thing.id, true).some(t => !t.completedOn) ? `Waiting on ${prerequisites(graph, thing.id, true).filter(t => !t.completedOn).length}` : 'Ready'}</p>
      <h3>Prerequisites <span>{direct.length}</span></h3><ul className="graph-list" aria-label="Direct prerequisites">{direct.map(t => row(t.id, t.name, t.completedOn, true))}</ul>{!direct.length && <p className="bp2-muted">No prerequisites.</p>}
      {upstream.length > 0 && <><h3>Further prerequisites</h3><ul className="graph-list" aria-label="Further prerequisites">{upstream.map(t => row(t.id, t.name, t.completedOn, false))}</ul></>}
      <form onSubmit={e => { e.preventDefault(); void run(() => link(selected, candidate)); }}>
        <Field label="Find prerequisite"><input value={search} onChange={e => { setSearch(e.target.value); setCandidate(''); }} placeholder="Search things"/></Field>
        <Field label="Prerequisite"><Select value={candidate} onChange={e => setCandidate(e.target.value)}><option value="">Choose a thing</option>{available.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Button type="submit" primary className="bp2-full" disabled={busy || !candidate}><Plus/>Add prerequisite</Button>
      </form>
      <form className="graph-create" onSubmit={e => { e.preventDefault(); void run(async () => { const { id, ...data } = newThing(name.trim()); await save(id, 'thing', data); await save(crypto.randomUUID(), 'prerequisite', { thingId: selected, prerequisiteId: id }); setName(''); }); }}>
        <Field label="New prerequisite"><input maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Or create a thing"/></Field><Button type="submit" className="bp2-full" disabled={busy || !name.trim()}>Create prerequisite</Button>
      </form>
      {graph.conflicts.filter(l => l.thingId === selected).map(l => <div className="graph-conflict" key={l.id}><p>A synced link to “{graph.things.find(t => t.id === l.prerequisiteId)?.name}” would create a circle. It is excluded from the graph.</p><Button disabled={busy} onClick={() => void run(() => remove(l.prerequisiteId))}>Remove conflicting link</Button></div>)}
    </> : <p className="bp2-muted">{selected ? 'This thing was deleted.' : graph.things.length ? 'Choose a thing to see and edit its prerequisites.' : 'Add your first thing to start a graph.'}</p>}<ErrorText message={error}/></aside></div>
  </section>;
}
