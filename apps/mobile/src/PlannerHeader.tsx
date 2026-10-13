import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { formatDate } from '../../../packages/domain/src/index';
import type { SyncStatus } from '../../../packages/sync/src/index';
import { colors, Icon, s } from './ui';

export function PlannerHeader({ page, date, layout, status, go, changeDay, chooseDate, changeLayout, menu, sync }: {
  page: string; date: string; layout: 'grid' | 'list'; status: SyncStatus;
  go(page: string): void; changeDay(delta: number): void; chooseDate(): void;
  changeLayout(layout: 'grid' | 'list'): void; menu(): void; sync(): void;
}) {
  const { width } = useWindowDimensions();
  return <View style={h.header}>
    <View style={s.spread}>
      <View accessibilityRole="tablist" style={h.tabs}>
        {['blocks', 'habits', 'things'].map(tab => {
          const selected = page === tab || tab === 'things' && page === 'graph';
          return <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => go(tab)} style={[h.tab, selected && h.selected]}>
            <Text style={h.tabText}>{tab[0].toUpperCase() + tab.slice(1)}</Text>
          </Pressable>;
        })}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Menu" onPress={menu} style={h.iconButton}><Icon name="menu" size={21}/></Pressable>
    </View>
    <View style={s.spread}>
      <View style={h.date}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" onPress={() => changeDay(-1)} style={h.iconButton}><Icon name="left" size={17}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Choose date, ${formatDate(date)}`} onPress={chooseDate} style={h.dateButton}>
          <Text numberOfLines={1} style={[h.tabText, { fontSize: 12 }]}>{formatDate(date)}</Text><Icon name="down" size={13}/>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next day" onPress={() => changeDay(1)} style={h.iconButton}><Icon name="right" size={17}/></Pressable>
      </View>
      <View style={h.layouts}>{(['grid', 'list'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'grid' ? 'Grid' : 'List'} accessibilityState={{ selected: layout === value }} onPress={() => changeLayout(value)} style={[h.layout, layout === value && { backgroundColor: '#eeedf1' }]}>
        <Icon name={value} size={16}/>{width >= 390 && <Text style={h.layoutText}>{value === 'grid' ? 'Grid' : 'List'}</Text>}
      </Pressable>)}</View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Sync status" hitSlop={{ top: 3, bottom: 3 }} onPress={sync} style={h.sync}>
      <View style={[h.dot, { backgroundColor: status === 'synced' ? '#3ba87b' : colors.muted }]}/>
      <Text style={[s.small, { fontSize: 10 }]}>{({ synced: 'Synced', syncing: 'Syncing', offline: 'Offline · saved on this device', retrying: 'Saved on this device · retry sync', 'sign-in': 'Sign in again to sync' })[status]}</Text>
    </Pressable>
  </View>;
}
const h = StyleSheet.create({
  header: { paddingHorizontal: 8, paddingTop: 3, paddingBottom: 4 },
  tabs: { flexDirection: 'row', padding: 3, gap: 2, backgroundColor: '#eeedf1', borderRadius: 11 },
  tab: { minHeight: 40, minWidth: 73, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  selected: { backgroundColor: '#fff', shadowColor: '#28242e', shadowOpacity: .09, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 1 },
  tabText: { fontFamily: 'PoppinsSemi', fontSize: 13, color: colors.ink },
  iconButton: { width: 40, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  date: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  dateButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, flexShrink: 1 },
  layouts: { flexDirection: 'row', gap: 2 },
  layout: { minWidth: 38, minHeight: 40, paddingHorizontal: 7, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  layoutText: { fontFamily: 'Poppins', fontSize: 10, color: colors.ink },
  sync: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
