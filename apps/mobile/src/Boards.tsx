import { useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { blockResultId, calendarDay, calendarWindows, completionWithStatus, dayBlocks, dueHabits, entities, formatDuration, formatTime, getCompletion, resultId, startInAvailableSpace, thingsInBlock, type CalendarSlot, type ScheduleWindow, type Block, type Habit } from '../../../packages/domain/src/index';
import { useActions, useData, useSettings } from './session';
import { Button, ErrorText, s, Txt, useWork } from './ui';
import { Resize, Swipe } from './Swipe';
export function Blocks({ date, edit, add, moving, openCalendar }: { openCalendar(slot: CalendarSlot): void; date: string; edit(block: Block): void; add(start?: number, duration?: number): void; moving(value: boolean): void }) {
  const { docs, save } = useData(), { settings } = useSettings(), actions = useActions(), { error, run } = useWork(), { width } = useWindowDimensions();
  const blocks = dayBlocks(docs, date), palette = Object.fromEntries(entities(docs, 'category').map(c => [c.id, c.color])), list = settings.layout === 'list', period = width < 560 ? 120 : 240;
  const imported = calendarDay(docs, date, settings.timezone), timed = imported.filter(s => !s.event.allDay);
  const start = Math.min(settings.dayStart, ...timed.map(s => Math.floor(s.start / period) * period), ...blocks.map(b => Math.floor(b.timing.start / period) * period)), end = Math.min(1440, Math.max(start + period * 4, Math.ceil(Math.max(start, ...timed.map(s => s.start + s.duration), ...blocks.map(b => b.timing.start + b.timing.duration)) / period) * period));
  type Drag = { id: string; start: number | null; target?: string; x: number; y: number };
  const [drag, setDrag] = useState<Drag>(), dragRef = useRef<Drag>(undefined), suppress = useRef(0), board = useRef<View>(null), origin = useRef({ x: 0, y: 0 });
  const cells = useRef(new Map<string, { node: View; block?: Block; from: number; length: number }>()), rectangles = useRef(new Map<string, { block?: Block; from: number; length: number; x: number; y: number; width: number; height: number }>());
  const begin = (block: Block) => { const next = { id: block.id, start: null, x: 80, y: 0 }; dragRef.current = next; setDrag(next); moving(true); rectangles.current.clear(); board.current?.measureInWindow((x,y) => { origin.current = { x,y }; }); cells.current.forEach((cell,key) => cell.node.measureInWindow((x,y,width,height) => rectangles.current.set(key,{ ...cell,x,y,width,height }))); };
  const update = (block: Block, x: number, y: number) => {
    const hit = [...rectangles.current.entries()].find(([,r]) => r.block?.id !== block.id && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
    let start: number | null = null;
    if (hit) { const r = hit[1]; start = r.block ? r.block.timing.start + ((list ? y > r.y + r.height / 2 : x > r.x + r.width / 2) ? r.block.timing.duration : 0) : Math.round((r.from + Math.min(r.length - 1, Math.max(0, (list ? (y-r.y)/r.height : (x-r.x)/r.width) * r.length))) / 15) * 15; start = Math.max(0, Math.min(1440 - block.timing.duration, start)); }
    const next = { id: block.id, start, target: hit?.[0], x: x - origin.current.x, y: y - origin.current.y }; dragRef.current = next; setDrag(next);
  };
  const drop = (block: Block) => { const current = dragRef.current; if (!current) return; suppress.current = Date.now() + 350; dragRef.current = undefined; setDrag(undefined); moving(false); if (current.start !== null) void run(() => actions.place({ ...block, timing: { ...block.timing, start: current.start! } })); };
  const segments: { block?: Block; start: number; duration: number }[] = []; let at = start;
  for (const block of blocks.filter(b => b.timing.start < 1440)) { if (block.timing.start > at) segments.push({ start: at, duration: block.timing.start - at }); segments.push({ block, start: block.timing.start, duration: Math.min(block.timing.duration, 1440 - block.timing.start) }); at = block.timing.start + block.timing.duration; }
  if (at < end) segments.push({ start: at, duration: end - at });
  const windows = calendarWindows(docs, date, settings.timezone, start, end);
  function segment(item: typeof segments[number], from: number, length: number, key: string, nested = false) {
    const block = item.block, status = block ? getCompletion(docs, blockResultId(block)).status : 'none', recorded = status === 'done' || status === 'missed', ink = status === 'done' ? '#248563' : status === 'missed' ? '#b53f5d' : '#28242e';
    const color = !block ? '#e3e1e7' : recorded ? '#dedee3' : palette[block.categories[0]] ?? '#c5b4ee';
    const height = list ? Math.max(95, length * 1.5) : 146, compact = !list && length <= 30;
    const face = <Pressable accessibilityRole="button" accessibilityLabel={block ? `${formatTime(from)} ${block.name} ${formatDuration(block.timing.duration)}` : `Available ${formatTime(from)}`} accessibilityHint={block ? undefined : 'Add a one-hour block'} onPress={event => {
      if (dragRef.current || Date.now() < suppress.current) return;
      if (block) return edit(block);
      const { pageX, pageY } = event.nativeEvent, cell = cells.current.get(key);
      if (!cell) return add(startInAvailableSpace(from, length), 60);
      cell.node.measureInWindow((x, y, width, height) => {
        const fraction = list ? (pageY - y) / height : (pageX - x) / width;
        add(startInAvailableSpace(from, length, Number.isFinite(fraction) ? fraction : 0), 60);
      });
    }} style={{ padding: compact ? 6 : 12, height: block && list ? height - 28 : height, justifyContent: 'space-between' }}><Txt small style={{ color: ink, fontSize: compact ? 10 : 12 }}>{formatTime(from)}{block?.habitId ? ' ↗' : ''}</Txt><Text numberOfLines={3} style={[s.h2, { color: ink, fontSize: compact ? 12 : 17 }, recorded && { textShadowColor: '#fff', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 }]}>{block?.name ?? 'Available'}</Text>{block && <Txt small style={{ color: ink, fontSize: compact ? 9 : 11 }}>{formatDuration(block.timing.duration)}{!compact && !!block.thingIds?.length ? ` · ${thingsInBlock(docs, block).filter(t => t.completedOn).length}/${thingsInBlock(docs, block).length} things` : ''}</Txt>}{recorded && <Text style={{ position: 'absolute', right: 8, top: 2, color: ink, fontSize: compact ? 22 : 40, textShadowColor: '#fff', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1 }}>{status === 'done' ? '✓' : '×'}</Text>}</Pressable>;
    return <View key={key} ref={node => { if (node) cells.current.set(key, { node, block, from, length }); else cells.current.delete(key); }} style={{ width: nested ? undefined : list ? '100%' : (width - 32) * length / period - 4, flex: nested ? 1 : undefined, marginBottom: 4, marginRight: list ? 0 : 4, borderRadius: 17, backgroundColor: color, borderWidth: drag?.target === key ? 3 : 0, borderColor: '#8462b6', opacity: drag && drag.id === block?.id ? .6 : 1 }}>
      {block ? <><Swipe color={color} status={status} onStatus={next => void run(() => actions.completeBlock(block, next))} hold={() => begin(block)} move={(x,y) => update(block,x,y)} drop={() => drop(block)} cancel={() => { dragRef.current = undefined; setDrag(undefined); moving(false); }}>{face}</Swipe><Resize moving={moving} axis={list ? 'y' : 'x'} scale={list ? 1.5 : (width - 32) / period} maximum={1440 - block.timing.start} duration={block.timing.duration} commit={duration => void run(() => actions.place({ ...block, timing: { ...block.timing, duration } }))}/></> : face}
    </View>;
  }
  function calendar(slot: CalendarSlot, from: number, length: number, key: string) { return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${slot.event.name} · ${slot.event.allDay ? 'All day' : formatTime(from)} · ${slot.sourceName}`} onPress={() => openCalendar(slot)} style={{ backgroundColor: slot.color, borderRadius: 17, padding: !list && length < 30 ? 6 : 12, flex: 1, minHeight: list ? Math.max(95, length * 1.5) : 146, justifyContent: 'space-between', gap: 5 }}><Txt small>{slot.event.allDay ? 'All day' : formatTime(from)}</Txt><Text numberOfLines={4} style={[s.h2, { fontSize: length <= 45 && !list ? 12 : 17 }]}>{slot.event.name}</Text><Txt small>{slot.sourceName}</Txt></Pressable>; }
  function window(item: ScheduleWindow, from: number, length: number, key: string) { return <View key={key} accessibilityLabel={`${formatTime(from)} time window`} style={{ flexDirection: list ? 'row' : 'column', gap: 4, width: list ? '100%' : (width - 32) * length / period - 4, marginRight: list ? 0 : 4, marginBottom: 4 }}>{item.items.length ? item.items.map(i => i.calendar ? calendar(i.calendar, from, length, i.id) : segment({ block: i.block, start: from, duration: length }, from, length, `${key}-${i.id}`, true)) : segment({ start: from, duration: length }, from, length, `${key}-available`, true)}</View>; }
  return <View ref={board}>{imported.some(s => s.event.allDay) && <View style={{ gap: 4, marginBottom: 8 }}>{imported.filter(s => s.event.allDay).map(s => calendar(s, 0, 60, s.event.id))}</View>}<ErrorText message={error}/>
    {timed.length ? list ? windows.map((w, i) => window(w, w.start, w.duration, String(i))) : Array.from({ length: Math.ceil((end - start) / period) }, (_, row) => <View key={row} style={{ flexDirection: 'row' }}>{windows.flatMap((w, i) => { const a = Math.max(start + row * period, w.start), z = Math.min(start + (row + 1) * period, w.start + w.duration); return z > a ? [window(w, a, z - a, `${row}-${i}`)] : []; })}</View>) : list ? segments.map((item, index) => segment(item, item.start, item.duration, String(index))) : Array.from({ length: Math.ceil((end - start) / period) }, (_, row) => <View key={row} style={{ flexDirection: 'row' }}>{segments.flatMap((item, index) => { const from = Math.max(start + row * period, item.start), to = Math.min(start + (row + 1) * period, item.start + item.duration); return to > from ? [segment(item, from, to - from, `${row}-${index}`)] : []; })}</View>)}
    {blocks.filter(b => b.timing.start + b.timing.duration > 1440).map(b => <Button key={b.id} onPress={() => edit({ ...b, timing: { ...b.timing, start: Math.min(b.timing.start, 1440 - b.timing.duration) } })}>{b.name} · Move or add to backlog</Button>)}<Button primary onPress={() => add()}>+ Block</Button>{drag && <View pointerEvents="none" accessibilityLabel="Insertion preview" style={[s.card, { position: 'absolute', zIndex: 20, width: 180, minHeight: 90, top: drag.y - 65, left: Math.max(0, Math.min(width - 210, drag.x - 90)), backgroundColor: '#d6b8ff', opacity: .95, borderWidth: 2, borderColor: '#8662b8' }]}><Txt>{blocks.find(b => b.id === drag.id)?.name}</Txt><Txt small>{drag.start !== null ? formatTime(drag.start) : 'Move to a time'}</Txt></View>}
  </View>;
}
export function Habits({ date, edit, add }: { date: string; edit(habit: Habit): void; add(): void }) {
  const { docs } = useData(), { settings } = useSettings(), { complete } = useActions(), { error, run } = useWork(), blocks = dayBlocks(docs, date), list = settings.layout === 'list';
  return <><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: list ? 4 : 8 }}>{dueHabits(docs, date).map(habit => {
    const result = getCompletion(docs, resultId(habit.id, date)), planned = blocks.find(b => b.habitId === habit.id);
    const status = result.status === 'done' ? '✓' : result.status === 'missed' ? '×' : result.status === 'skip' ? '−' : '○';
    return <View key={habit.id} style={{ width: list ? '100%' : '48.8%' }}>
      <Swipe color={result.status === 'done' ? '#c1e6d6' : result.status === 'missed' ? '#f0cad4' : '#dce2eb'} status={result.status} onStatus={status => void run(() => complete(habit.id, date, completionWithStatus(result, status)))}>
        <Pressable accessibilityRole="button" accessibilityLabel={habit.name} onPress={() => edit(habit)} style={{ minHeight: list ? 72 : 126, paddingHorizontal: 14, paddingVertical: list ? 10 : 14, gap: list ? 12 : 6, flexDirection: list ? 'row' : 'column', alignItems: list ? 'center' : undefined }}>
          {list ? <><View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={[s.h2, { fontSize: 15, lineHeight: 21 }]}>{habit.name}</Text>
            {!!habit.description && <Txt small style={{ lineHeight: 17 }}>{habit.description}</Txt>}
            {habit.type === 'value' && <Txt small style={{ lineHeight: 17 }}>{result.value} / {habit.target} {habit.unit}</Txt>}
            {planned && <Txt small style={{ lineHeight: 17 }}>{planned.ruleId ? '↻ ' : '↗ '}{formatTime(planned.timing.start)}</Txt>}
          </View><Txt style={{ fontSize: 22, lineHeight: 28, minWidth: 28, textAlign: 'center' }}>{status}</Txt></> : <>
            <Text style={s.h2}>{habit.name}</Text>
            {!!habit.description && <Txt small>{habit.description}</Txt>}
            {habit.type === 'value' && <Txt>{result.value} / {habit.target} {habit.unit}</Txt>}
            {planned && <Txt small>{planned.ruleId ? '↻ ' : '↗ '}{formatTime(planned.timing.start)}</Txt>}
            <Txt style={{ fontSize: 22 }}>{status}</Txt>
          </>}
        </Pressable>
      </Swipe>
    </View>;
  })}</View><ErrorText message={error}/><Button primary onPress={add}>+ Habit</Button></>;
}
