import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { completionStats, formatDate, shiftDate } from '../../../packages/domain/src/index';
import { useData } from './session';
import { colors, s } from './ui';

const dayWidth = 50, barHeight = 74;
export function History({ date, change, manage }: { date: string; change(date: string): void; manage?: () => void }) {
  const { docs } = useData(), { width } = useWindowDimensions();
  const [anchor] = useState(date), [before, setBefore] = useState(30), [after, setAfter] = useState(30);
  const scroll = useRef<ScrollView>(null), first = useRef(true), focusDate = useRef(false), prepend = useRef<number | undefined>(undefined), offset = useRef(0);
  const selected = Math.round((Date.parse(`${date}T12:00Z`) - Date.parse(`${anchor}T12:00Z`)) / 86400000) + before;
  useEffect(() => {
    if (selected < 0) { focusDate.current = true; setBefore(n => n - selected + 30); return; }
    if (selected > before + after) { focusDate.current = true; setAfter(n => n + selected - before - after + 30); return; }
    const x = selected * dayWidth;
    if (x < offset.current || x + dayWidth > offset.current + width) scroll.current?.scrollTo({ x: Math.max(0, x - (width - dayWidth) / 2), animated: false });
  }, [date, width]);
  const summary = completionStats(docs, date);
  return <View style={{ backgroundColor: colors.grey }}>
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Combined Blocks and Habits history" style={{ flexGrow: 0, height: barHeight }} scrollEventThrottle={32}
      onScroll={event => { offset.current = event.nativeEvent.contentOffset.x; }}
      onContentSizeChange={() => {
        if (first.current || focusDate.current) { first.current = false; focusDate.current = false; scroll.current?.scrollTo({ x: Math.max(0, selected * dayWidth - (width - dayWidth) / 2), animated: false }); }
        else if (prepend.current !== undefined) { scroll.current?.scrollTo({ x: prepend.current + 30 * dayWidth, animated: false }); prepend.current = undefined; }
      }}
      onMomentumScrollEnd={event => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        if (contentOffset.x < 40) { prepend.current = contentOffset.x; setBefore(n => n + 30); }
        if (contentOffset.x + layoutMeasurement.width > contentSize.width - 40) setAfter(n => n + 30);
      }}>
      {Array.from({ length: before + after + 1 }, (_, i) => shiftDate(anchor, i - before)).map(day => {
        const stats = completionStats(docs, day), ratio = stats.total ? stats.done / stats.total : 0;
        const label = new Date(`${day}T12:00Z`), week = label.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), month = label.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
        return <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${formatDate(day)}: ${stats.done} of ${stats.total} done`} accessibilityState={{ selected: date === day }} onPress={() => change(day)} style={{ width: dayWidth, height: barHeight, paddingVertical: 9, alignItems: 'center', justifyContent: 'space-between' }}>
          <View pointerEvents="none" style={{ position: 'absolute', left: 3, right: 3, bottom: 0, height: ratio * barHeight, backgroundColor: colors.green, borderTopLeftRadius: 7, borderTopRightRadius: 7 }}/>
          <Text style={[s.small, { color: ratio > .8 ? '#183c2d' : colors.light, fontSize: 10, fontFamily: 'PoppinsSemi' }]}>{week}</Text>
          <Text style={[s.small, { color: ratio > .35 ? '#183c2d' : colors.light, fontSize: 10, fontFamily: 'PoppinsSemi' }]}>{Number(day.slice(8))} {month}</Text>
          {date === day && <View pointerEvents="none" style={{ position: 'absolute', inset: 1, bottom: 0, borderWidth: 2, borderColor: '#fff', borderTopLeftRadius: 8, borderTopRightRadius: 8 }}/>}</Pressable>;
      })}
    </ScrollView>
    <View accessibilityLabel={`Blocks and habits: ${summary.done} of ${summary.total} completed`} style={{ minHeight: manage ? 40 : 30, borderTopWidth: 2, borderColor: '#282a30', paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${summary.total ? summary.done / summary.total * 100 : 0}%`, backgroundColor: '#4e7d6e' }}/>
      <Text style={[s.small, { color: colors.light, fontSize: 11 }]}>{summary.done} / {summary.total} done</Text>
      {manage && <Pressable accessibilityRole="button" accessibilityLabel="Manage habits" onPress={manage} style={{ minHeight: 40, minWidth: 64, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={[s.small, { color: colors.light, fontSize: 11 }]}>Manage</Text></Pressable>}
    </View>
  </View>;
}
