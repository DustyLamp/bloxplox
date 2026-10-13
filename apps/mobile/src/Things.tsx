import { useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { entities, formatDuration, prerequisites, thingBlockDuration, thingGraph, type Block, type Thing } from '../../../packages/domain/src/index';
import { blankBlock } from '../../../packages/domain/src/actions';
import { useData, useSettings } from './session';
import { Button, colors, Icon, s, Txt, useWork, ErrorText } from './ui';
export function Things({ date, edit, graph, block }: { date: string; edit(thing?: Thing): void; graph(id?: string): void; block(block: Block): void }) {
  const { docs, save } = useData(), { settings } = useSettings(), { width } = useWindowDimensions();
  const [done, setDone] = useState(false), [selecting, setSelecting] = useState(false), [selected, setSelected] = useState<string[]>([]), { error, run } = useWork();
  const all = entities(docs, 'thing'), list = all.filter(t => !!t.completedOn === done).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.order - b.order), g = thingGraph(docs), palette = Object.fromEntries(entities(docs, 'category').map(c => [c.id, c.color]));
  return <><View style={s.spread}><Text style={s.title}>Things</Text><View style={s.row}><Button onPress={() => graph()}>Graph</Button><Button primary onPress={() => edit()}>+ Thing</Button></View></View>
    <View style={s.spread}><View style={s.row}><Button primary={!done} onPress={() => { setDone(false); setSelected([]); }}>Open</Button><Button primary={done} onPress={() => { setDone(true); setSelected([]); setSelecting(false); }}>Done</Button></View>{!done && <Button onPress={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? 'Cancel' : 'Select'}</Button>}</View><ErrorText message={error}/>
    {!!selected.length && <Button primary onPress={() => { const chosen = all.filter(t => selected.includes(t.id)); block({ ...blankBlock(date, settings.dayStart), name: chosen.length === 1 ? chosen[0].name : 'Things', thingIds: chosen.map(t => t.id), categories: [...new Set(chosen.flatMap(t => t.categories))], timing: { date, start: settings.dayStart, duration: thingBlockDuration(chosen) } }); setSelected([]); setSelecting(false); }}>Schedule {selected.length} {selected.length === 1 ? 'thing' : 'things'}</Button>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{list.map(t => {
      const waiting = prerequisites(g, t.id, true).filter(p => !p.completedOn), checked = selected.includes(t.id);
      return <View key={t.id} style={{ width: settings.layout === 'grid' && width >= 600 ? (width - 36) / 2 : '100%', backgroundColor: t.completedOn ? '#d5e9dc' : palette[t.categories[0]] ?? '#dacaf4', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 5, borderWidth: 2, borderColor: checked ? colors.ink : 'transparent' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {selecting && <Pressable accessibilityRole="checkbox" accessibilityLabel={`Plan ${t.name}`} accessibilityState={{ checked }} onPress={() => setSelected(checked ? selected.filter(id => id !== t.id) : [...selected, t.id])} style={{ width: 44, minHeight: 52, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>{checked && <Icon name="check" size={17}/>}</View></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${t.name}`} onPress={() => edit(t)} style={{ flex: 1, minWidth: 0, minHeight: 52, padding: 5, justifyContent: 'center', gap: 3 }}>
            <Text style={[s.h2, { fontSize: 15, lineHeight: 21 }, t.completedOn && { textDecorationLine: 'line-through' }]}>{t.name}</Text>
            {!!t.notes && <Text numberOfLines={2} style={[s.small, { color: '#49404f', fontSize: 11 }]}>{t.notes}</Text>}
            {(t.completedOn || t.dueDate || t.estimate) && <Txt small style={{ color: '#49404f', fontSize: 10 }}>{t.completedOn ? `Done ${t.completedOn}` : t.dueDate ? `Due ${t.dueDate}` : ''}{t.estimate ? `${t.completedOn || t.dueDate ? ' · ' : ''}${formatDuration(t.estimate)}` : ''}</Txt>}
          </Pressable>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`Complete ${t.name}`} accessibilityState={{ checked: !!t.completedOn }} onPress={() => void run(() => save(t.id, 'thing', { completedOn: t.completedOn ? null : date }))} style={{ width: 44, minHeight: 52, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 25, height: 25, borderWidth: 1.5, borderColor: '#514458', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>{t.completedOn && <Icon name="check" size={19}/>}</View></Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Graph for ${t.name}`} onPress={() => graph(t.id)} style={{ minHeight: 36, paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="graph" size={14}/><Txt style={{ fontSize: 11 }}>{waiting.length ? `Waiting on ${waiting.length}` : 'Prerequisites'}</Txt></Pressable>
      </View>;
    })}</View>{!list.length && <Txt small>{done ? 'No completed things.' : 'No open things.'}</Txt>}
  </>;
}
