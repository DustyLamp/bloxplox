import { useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { blockResultId, calendarDay, calendarWindows, completionWithStatus, dayBlocks, dueHabits, entities, formatDuration, formatTime, getCompletion, resultId, startInAvailableSpace, thingsInBlock, type CalendarSlot, type ScheduleWindow, type Block, type Habit } from '../../../packages/domain/src/index';
import { useActions, useData, useSettings } from './session';
import { Button, colors, ErrorText, Icon, s, Txt, useWork } from './ui';
import { Resize, Swipe } from './Swipe';
export function Blocks({ date, edit, add, moving, openCalendar }: { openCalendar(slot: CalendarSlot): void; date: string; edit(block: Block): void; add(start?: number, duration?: number): void; moving(value: boolean): void }) {
  const { docs, save } = useData(), { settings } = useSettings(), actions = useActions(), { error, run } = useWork(), { width } = useWindowDimensions();
  const [boardWidth, setBoardWidth] = useState(width - 6);
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
    const color = !block ? '#eceff0' : recorded ? '#dedee3' : palette[block.categories[0]] ?? '#c5b4ee';
    const height = list ? Math.max(nested ? 108 : 70, length * 1.15) : 132, compact = !list && length <= 30, rowFace = list && !nested;
    const face = <Pressable accessibilityRole="button" accessibilityLabel={block ? `${formatTime(from)} ${block.name} ${formatDuration(block.timing.duration)}` : `Available ${formatTime(from)}`} accessibilityHint={block ? undefined : 'Add a one-hour block'} onPress={event => {
      if (dragRef.current || Date.now() < suppress.current) return;
      if (block) return edit(block);
      const { pageX, pageY } = event.nativeEvent, cell = cells.current.get(key);
      if (!cell) return add(startInAvailableSpace(from, length), 60);
      cell.node.measureInWindow((x, y, width, height) => {
        const fraction = list ? (pageY - y) / height : (pageX - x) / width;
        add(startInAvailableSpace(from, length, Number.isFinite(fraction) ? fraction : 0), 60);
      });
    }} style={{ paddingHorizontal: compact ? 7 : 12, paddingVertical: rowFace ? 12 : 10, height, flexDirection: rowFace ? 'row' : 'column', alignItems: rowFace ? 'center' : 'stretch', justifyContent: 'space-between', gap: rowFace ? 10 : 5 }}>
      {block && !recorded && block.categories.length > 1 && <CategoryFill palette={block.categories.map(id => palette[id]).filter(Boolean)}/>}
      <Text style={[s.small, { color: block ? ink : '#667078', fontSize: compact ? 9 : 11, width: rowFace ? 38 : undefined }]}>{formatTime(from)}{block?.habitId ? ' ↗︎' : ''}</Text>
      <Text numberOfLines={rowFace ? 3 : compact ? 4 : 3} style={[s.h2, { color: block ? ink : '#667078', flex: rowFace ? 1 : undefined, fontSize: rowFace ? 14 : compact ? 12 : 18, lineHeight: rowFace ? 20 : compact ? 16 : 23 }, recorded && { textShadowColor: '#fff', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 }]}>{block?.name ?? 'Available'}</Text>
      {recorded && !rowFace && <Text accessible={false} style={{ color: ink, fontSize: compact ? 27 : 40, lineHeight: compact ? 30 : 42, alignSelf: 'center', textShadowColor: '#fff', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1 }}>{status === 'done' ? '✓' : '×'}</Text>}
      {block && <View style={{ alignItems: 'flex-end', alignSelf: rowFace ? 'center' : 'flex-end', flexShrink: 0 }}><Text style={[s.text, { color: ink, fontSize: compact ? 12 : 14, fontFamily: 'PoppinsSemi' }]}>{formatDuration(block.timing.duration)}</Text>{!compact && !!block.thingIds?.length && <Txt small style={{ color: ink, fontSize: 10 }}>{thingsInBlock(docs, block).filter(t => t.completedOn).length}/{thingsInBlock(docs, block).length} things</Txt>}</View>}
      {recorded && rowFace && <Text accessible={false} style={{ color: ink, fontSize: 27, textShadowColor: '#fff', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1 }}>{status === 'done' ? '✓' : '×'}</Text>}
    </Pressable>;
    return <View key={key} ref={node => { if (node) cells.current.set(key, { node, block, from, length }); else cells.current.delete(key); }} style={{ width: nested ? undefined : list ? '100%' : (boardWidth + 3) * length / period - 3, flex: nested ? 1 : undefined, marginBottom: nested ? 0 : 3, borderRadius: list ? 10 : 17, backgroundColor: color, borderWidth: drag?.target === key ? 3 : 0, borderColor: '#8462b6', opacity: drag && drag.id === block?.id ? .6 : 1 }}>
      {block ? <><Swipe radius={list ? 10 : 17} color={color} status={status} onStatus={next => void run(() => actions.completeBlock(block, next))} hold={() => begin(block)} move={(x,y) => update(block,x,y)} drop={() => drop(block)} cancel={() => { dragRef.current = undefined; setDrag(undefined); moving(false); }}>{face}</Swipe><Resize moving={moving} axis={list ? 'y' : 'x'} scale={list ? 1.15 : boardWidth / period} maximum={1440 - block.timing.start} duration={block.timing.duration} commit={duration => void run(() => actions.place({ ...block, timing: { ...block.timing, duration } }))}/></> : face}
    </View>;
  }
  function calendar(slot: CalendarSlot, from: number, length: number, key: string) { return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${slot.event.name} · ${slot.event.allDay ? 'All day' : formatTime(from)} · ${slot.sourceName}`} onPress={() => openCalendar(slot)} style={{ backgroundColor: slot.color, borderRadius: 17, padding: !list && length < 30 ? 6 : 12, flex: 1, minHeight: list ? Math.max(70, length * 1.15) : 132, justifyContent: 'space-between', gap: 5 }}><Txt small>{slot.event.allDay ? 'All day' : formatTime(from)}</Txt><Text numberOfLines={4} style={[s.h2, { fontSize: length <= 45 && !list ? 12 : 17 }]}>{slot.event.name}</Text><Txt small>{slot.sourceName}</Txt></Pressable>; }
  function window(item: ScheduleWindow, from: number, length: number, key: string) { return <View key={key} accessibilityLabel={`${formatTime(from)} time window`} style={{ flexDirection: list ? 'row' : 'column', gap: 4, width: list ? '100%' : (boardWidth + 3) * length / period - 3, marginBottom: 3 }}>{item.items.length ? item.items.map(i => i.calendar ? calendar(i.calendar, from, length, i.id) : segment({ block: i.block, start: from, duration: length }, from, length, `${key}-${i.id}`, true)) : segment({ start: from, duration: length }, from, length, `${key}-available`, true)}</View>; }
  return <View ref={board} onLayout={event => setBoardWidth(event.nativeEvent.layout.width)}>{imported.some(s => s.event.allDay) && <View style={{ gap: 4, marginBottom: 8 }}>{imported.filter(s => s.event.allDay).map(s => calendar(s, 0, 60, s.event.id))}</View>}<ErrorText message={error}/>
    {timed.length ? list ? windows.map((w, i) => window(w, w.start, w.duration, String(i))) : Array.from({ length: Math.ceil((end - start) / period) }, (_, row) => <View key={row} style={{ flexDirection: 'row', gap: 3 }}>{windows.flatMap((w, i) => { const a = Math.max(start + row * period, w.start), z = Math.min(start + (row + 1) * period, w.start + w.duration); return z > a ? [window(w, a, z - a, `${row}-${i}`)] : []; })}</View>) : list ? segments.map((item, index) => segment(item, item.start, item.duration, String(index))) : Array.from({ length: Math.ceil((end - start) / period) }, (_, row) => <View key={row} style={{ flexDirection: 'row', gap: 3 }}>{segments.flatMap((item, index) => { const from = Math.max(start + row * period, item.start), to = Math.min(start + (row + 1) * period, item.start + item.duration); return to > from ? [segment(item, from, to - from, `${row}-${index}`)] : []; })}</View>)}
    {blocks.filter(b => b.timing.start + b.timing.duration > 1440).map(b => <Button key={b.id} onPress={() => edit({ ...b, timing: { ...b.timing, start: Math.min(b.timing.start, 1440 - b.timing.duration) } })}>{b.name} · Move or add to backlog</Button>)}<Button primary onPress={() => add()}>+ Block</Button>{drag && <View pointerEvents="none" accessibilityLabel="Insertion preview" style={[s.card, { position: 'absolute', zIndex: 20, width: 180, minHeight: 90, top: drag.y - 65, left: Math.max(0, Math.min(width - 210, drag.x - 90)), backgroundColor: '#d6b8ff', opacity: .95, borderWidth: 2, borderColor: '#8662b8' }]}><Txt>{blocks.find(b => b.id === drag.id)?.name}</Txt><Txt small>{drag.start !== null ? formatTime(drag.start) : 'Move to a time'}</Txt></View>}
  </View>;
}
export function Habits({ date, edit, add }: { date: string; edit(habit: Habit): void; add(): void }) {
  const { docs } = useData(), { settings } = useSettings(), { complete } = useActions(), { error, run } = useWork(), { width } = useWindowDimensions();
  const blocks = dayBlocks(docs, date), list = settings.layout === 'list';
  const columns = width >= 700 ? 3 : 2, cardWidth = (width - 6 - (columns - 1) * 3) / columns;
  return <View style={{ gap: 3 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
    {dueHabits(docs, date).map(habit => {
      const result = getCompletion(docs, resultId(habit.id, date)), planned = blocks.find(b => b.habitId === habit.id);
      const ink = result.status === 'done' ? '#183c2d' : result.status === 'missed' ? '#4b1722' : colors.light;
      const target = habit.description || (habit.type === 'value' ? `At least ${habit.target} ${habit.unit}`.trim() : '');
      return <View key={habit.id} style={{ width: list ? '100%' : cardWidth }}>
        <Swipe radius={list ? 8 : 17} color={result.status === 'done' ? colors.green : result.status === 'missed' ? colors.red : colors.grey} status={result.status} onStatus={status => void run(() => complete(habit.id, date, completionWithStatus(result, status)))}>
          <View style={{ flexDirection: list ? 'row' : 'column', minHeight: list ? 72 : 163 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={habit.name} accessibilityHint="Habit actions, schedule and statistics" onPress={() => edit(habit)} style={{ flex: 1, minWidth: 0, paddingHorizontal: 13, paddingVertical: list ? 11 : 17, justifyContent: 'center', gap: 3 }}>
              <Text style={[s.h2, { color: ink, fontSize: list ? 15 : 17, lineHeight: list ? 21 : 23 }, result.status === 'skip' && { textDecorationLine: 'line-through', opacity: .65 }]}>{habit.name}</Text>
              {!!target && <Text style={[s.small, { color: ink, fontSize: 11, lineHeight: 16 }]}>{target}</Text>}
              {planned && <Text style={[s.small, { color: ink, fontSize: 10 }]}>{planned.ruleId ? '↻ ' : '↗︎ '}{formatTime(planned.timing.start)}</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${habit.type === 'value' ? 'Set result' : 'Toggle result'} for ${habit.name}`} accessibilityValue={{ text: habit.type === 'value' ? `${result.value} ${habit.unit}, target ${habit.target}` : result.status === 'none' ? 'Unrecorded' : result.status }} onPress={() => habit.type === 'value' ? edit(habit) : void run(() => complete(habit.id, date, completionWithStatus(result, result.status === 'done' ? 'none' : 'done')))} style={{ width: list ? 64 : '100%', minHeight: list ? 72 : 46, paddingHorizontal: 14, paddingBottom: list ? 0 : 9, alignItems: list ? 'center' : 'flex-end', justifyContent: 'center' }}>
              {habit.type === 'value' ? <Text style={{ fontFamily: 'PoppinsSemi', fontSize: 26, color: ink }}>{result.value}</Text> : <View style={{ opacity: result.status === 'none' ? .7 : 1 }}><Icon name={result.status === 'missed' ? 'cross' : result.status === 'skip' ? 'minus' : 'check'} color={ink} size={23}/></View>}
            </Pressable>
          </View>
        </Swipe>
      </View>;
    })}
  </View><ErrorText message={error}/>
    <Pressable accessibilityRole="button" accessibilityLabel="Add habit" onPress={add} style={{ minHeight: 48, borderRadius: 8, backgroundColor: colors.grey, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginTop: 3 }}><Icon name="plus" color={colors.light} size={17}/><Txt style={{ color: colors.light, fontSize: 13 }}>Add habit</Txt></Pressable>
  </View>;
}

function CategoryFill({ palette }: { palette: string[] }) {
  return <View pointerEvents="none" accessible={false} style={{ position: 'absolute', inset: 0 }}><Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" accessible={false}>{palette.map((color, index) => {
    const left = index === 0 ? -40 : index / palette.length * 100, right = index === palette.length - 1 ? 140 : (index + 1) / palette.length * 100;
    return <Polygon key={`${index}-${color}`} points={`${left + 20},0 ${right + 20},0 ${right - 20},100 ${left - 20},100`} fill={color}/>;
  })}</Svg></View>;
}
