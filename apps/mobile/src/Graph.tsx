import { useState } from 'react';
import { View, Text } from 'react-native';
import { entities, focusedGraph, prerequisiteError, prerequisites, thingGraph } from '../../../packages/domain/src/index';
import { useData } from './session';
import { Button, ErrorText, Field, s, Txt, useWork } from './ui';
import GraphCanvas from './GraphCanvas';
export function Graph({ focus, date, edit }: { focus?: string; date: string; edit(id: string): void }) {
  const { docs, save } = useData(), [selected, setSelected] = useState(focus), [showAll, setShowAll] = useState(!focus), [search, setSearch] = useState('');
  const { error, busy, run } = useWork(), graph = thingGraph(docs), selectedThing = graph.things.find(t => t.id === selected);
  const direct = selected ? prerequisites(graph, selected) : [], ancestors = selected ? prerequisites(graph, selected, true) : [];
  const visible = !showAll && selected ? focusedGraph(graph, selected) : graph;
  const add = async (thingId: string, prerequisiteId: string) => { const error = prerequisiteError(graph, thingId, prerequisiteId); if (error) throw new Error(error); await save(crypto.randomUUID(), 'prerequisite', { thingId, prerequisiteId }); };
  return <><View style={s.spread}><Text style={s.h2}>Things graph</Text><Button onPress={() => setShowAll(!showAll)}>{showAll ? 'Focus' : 'Show all'}</Button></View><Txt small>Prerequisites flow from left to right.</Txt>
    <View style={{ height: 300, borderRadius: 18, overflow: 'hidden' }}><GraphCanvas graph={visible} selected={selected} colors={Object.fromEntries(entities(docs, 'category').map(c => [c.id, c.color]))} onSelect={async id => { setSelected(id); }} onConnect={async (thingId, prerequisiteId) => { await run(() => add(thingId, prerequisiteId)); }} dom={{ scrollEnabled: false, style: { height: 300, width: '100%' }, containerStyle: { height: 300, width: '100%', flex: 0 } }}/></View>
    <ErrorText message={error}/>
    {selectedThing ? <><Text style={s.h2}>{selectedThing.name}</Text><Txt>{selectedThing.completedOn ? 'Done' : ancestors.some(t => !t.completedOn) ? `Waiting on ${ancestors.filter(t => !t.completedOn).map(t => t.name).join(', ')}` : 'Ready'}</Txt>
      <View style={s.row}><Button onPress={() => edit(selectedThing.id)}>Edit thing</Button><Button disabled={busy} onPress={() => void run(() => save(selectedThing.id, 'thing', { completedOn: selectedThing.completedOn ? null : date }))}>{selectedThing.completedOn ? 'Reopen' : 'Complete'}</Button></View>
      <Text style={s.h2}>Prerequisites</Text>{!direct.length && <Txt small>No prerequisites.</Txt>}
      {direct.map(t => <View key={t.id} style={s.spread}><Button style={{ flex: 1, alignItems: 'flex-start' }} onPress={() => setSelected(t.id)}>{t.completedOn ? '✓ ' : ''}{t.name}</Button><Button label={`Remove prerequisite ${t.name}`} onPress={() => void run(async () => { for (const link of entities(docs, 'prerequisite').filter(l => l.thingId === selected && l.prerequisiteId === t.id)) await save(link.id, 'prerequisite', {}, true); })}>Remove</Button></View>)}
      {ancestors.filter(t => !direct.some(d => d.id === t.id)).length > 0 && <><Txt small>Also required</Txt>{ancestors.filter(t => !direct.some(d => d.id === t.id)).map(t => <Button key={t.id} onPress={() => setSelected(t.id)}>{t.completedOn ? '✓ ' : ''}{t.name}</Button>)}</>}
      <Field label="Find a prerequisite" value={search} onChangeText={setSearch}/>{graph.things.filter(t => !prerequisiteError(graph, selectedThing.id, t.id) && t.name.toLowerCase().includes(search.toLowerCase())).map(t => <Button key={t.id} disabled={busy} onPress={() => void run(() => add(selectedThing.id, t.id))}>+ {t.name}</Button>)}
      {!!search.trim() && <Button primary disabled={busy} onPress={() => void run(async () => { const id = crypto.randomUUID(); await save(id, 'thing', { name: search.trim(), notes: '', categories: [], estimate: null, dueDate: null, completedOn: null, order: Date.now() }); await save(crypto.randomUUID(), 'prerequisite', { thingId: selectedThing.id, prerequisiteId: id }); setSearch(''); })}>Create “{search.trim()}” as prerequisite</Button>}
    </> : <><Txt small>Select a thing to see its prerequisites.</Txt>{graph.things.map(t => <Button key={t.id} onPress={() => setSelected(t.id)}>{t.name}</Button>)}</>}
    {graph.conflicts.map(l => <View key={l.id} style={s.card}><Txt>A concurrent connection would create a cycle: {graph.things.find(t => t.id === l.prerequisiteId)?.name} → {graph.things.find(t => t.id === l.thingId)?.name}.</Txt><Button onPress={() => void run(() => save(l.id, 'prerequisite', {}, true))}>Remove conflicting connection</Button></View>)}
  </>;
}
