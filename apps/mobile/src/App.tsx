import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { entities, formatDate, localDate, paidPlansEnabled, shiftDate, weekday, type CalendarSlot, type Block, type Habit, type Rule, type Thing } from '../../../packages/domain/src/index';
import { blankBlock } from '../../../packages/domain/src/actions';
import type { AuthService } from '../../../packages/auth/src/index';
import { Auth } from './Auth';
import { createAuth, DataProvider, useActions, useData, useSettings } from './session';
import { Button, ErrorText, Field, Loading, Logo, s, Sheet, Txt } from './ui';
import { Blocks, Habits } from './Boards';
import { History } from './History';
import { Things } from './Things';
import { Graph } from './Graph';
import { BlockEditor, HabitEditor, HabitResult, MovePicker, RuleEditor, ThingEditor } from './Editors';
import { Backlog, CategoriesPage, ManageHabits, Pricing, Reports, Settings, Templates } from './Pages';
import { Calendars, CalendarEventEditor, useCalendarRefresh } from './Calendars';
import { Split } from './Split';
import { refreshReminders } from './reminders';
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }; static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <SafeAreaView style={[s.screen, s.content]}><Text style={s.h2}>Could not open BloxPlox</Text><ErrorText message={this.state.error}/><Button onPress={() => this.setState({ error: '' })}>Try again</Button></SafeAreaView> : this.props.children; }
}
export default function App() {
  const [fonts, fontError] = useFonts({ Poppins: require('../../prototype/assets/fonts/Poppins-500.ttf'), PoppinsSemi: require('../../prototype/assets/fonts/Poppins-600.ttf'), PoppinsBold: require('../../prototype/assets/fonts/Poppins-700.ttf') });
  return <SafeAreaProvider><ErrorBoundary>{fonts || fontError ? <Root/> : <Loading/>}</ErrorBoundary></SafeAreaProvider>;
}
function Root() {
  const [auth, setAuth] = useState<AuthService>(), [identity, setIdentity] = useState<{ subject: string; email: string } | null>(), [error, setError] = useState(''), [authError, setAuthError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; setError(''); void createAuth().then(async service => { const initialUrl = await Linking.getInitialURL(); if (initialUrl?.startsWith('bloxplox://auth?')) { try { await service.finishSocialSignIn(initialUrl); } catch (e) { if (active) setAuthError((e as Error).message); } } const identity = await service.identity(); if (active) { setAuth(service); setIdentity(identity); } }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [retry]);
  if (error) return <SafeAreaView style={[s.screen, s.content]}><ErrorText message={error}/><Button onPress={() => setRetry(n => n + 1)}>Try again</Button></SafeAreaView>;
  if (!auth || identity === undefined) return <Loading/>;
  return <SafeAreaView style={s.screen}><StatusBar barStyle="dark-content"/>{identity ? <DataProvider key={identity.subject} auth={auth} identity={identity} onSignOut={() => setIdentity(null)}><Main/></DataProvider> : <Auth auth={auth} initialError={authError} signedIn={async () => setIdentity(await auth.identity())}/>}</SafeAreaView>;
}
type Dialog = { type: 'block' | 'move' | 'split'; block: Block } | { type: 'habit' | 'result'; habit?: Habit } | { type: 'thing'; thing?: Thing } | { type: 'rule'; habit?: Habit; block?: Block; rule?: Rule } | { type: 'calendar' } | { type: 'calendar-event'; slot: CalendarSlot };
function Main() {
  const { docs, status, sync, signOut } = useData(), { settings, saveSettings } = useSettings(), actions = useActions();
  const [page, setPage] = useState('blocks'), [date, setDate] = useState(() => localDate(settings.timezone)), [menu, setMenu] = useState(false), [dialog, setDialog] = useState<Dialog>(), [graphFocus, setGraphFocus] = useState<string>(), [statsHabit, setStatsHabit] = useState<Habit>(), [error, setError] = useState(''), [dragging, setDragging] = useState(false), [epoch, setEpoch] = useState(0);
  useCalendarRefresh(date);
  useEffect(() => { const route = (url: string | null) => { if (url?.startsWith('bloxplox://calendars')) setPage('calendars'); }; void Linking.getInitialURL().then(route); const listener = Linking.addEventListener('url', event => route(event.url)); return () => listener.remove(); }, []);
  const today = useRef(localDate(settings.timezone)), backlogBusy = useRef(false), scroll = useRef<ScrollView>(null), close = () => setDialog(undefined);
  const run = (work: Promise<unknown>) => { void work.catch(error => setError(error.message)); };
  const go = (next: string) => { setPage(next); setMenu(false); close(); scroll.current?.scrollTo({ y: 0, animated: false }); };
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [settings.layout]);
  const graph = (id?: string) => { setGraphFocus(id); go('graph'); };
  const applicableRule = (rules: Rule[]) => rules.filter(r => r.effectiveFrom <= date && (!r.recurrence.endDate || r.recurrence.endDate >= date)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  useEffect(() => { const tick = () => { const current = localDate(settings.timezone); if (current !== today.current) { setDate(value => value === today.current ? current : value); today.current = current; setEpoch(n => n + 1); } }; tick(); const timer = setInterval(tick, 15000), active = AppState.addEventListener('change', state => { if (state === 'active') tick(); }); return () => { clearInterval(timer); active.remove(); }; }, [settings.timezone]);
  useEffect(() => { const timer = setTimeout(() => void refreshReminders(docs, settings.timezone).catch(() => {}), 2000); return () => clearTimeout(timer); }, [docs, settings.timezone, epoch]);
  useEffect(() => { if (backlogBusy.current) return; const today = localDate(settings.timezone), due = entities(docs, 'block').filter(b => !b.timing.date && b.backlogDate && (b.backlogDate === today || settings.autoBacklog && b.backlogDate < today)).sort((a, b) => a.order - b.order); if (!due.length) return; backlogBusy.current = true; const block = due[0]; void actions.place({ ...block, timing: { ...block.timing, date: today, start: settings.dayStart }, backlogDate: null }, 'free').then(() => { backlogBusy.current = false; setEpoch(n => n + 1); }).catch(error => { backlogBusy.current = false; setError(error.message); }); }, [docs, settings.autoBacklog, settings.dayStart, settings.timezone, epoch]);
  const repeat = (block: Block) => { const original = entities(docs, 'rule').find(r => r.id === block.ruleId); setDialog({ type: 'rule', block, rule: applicableRule(entities(docs, 'rule').filter(r => r.seriesId === original?.seriesId)) ?? original }); };
  return <><View style={{ paddingHorizontal: 12, paddingTop: 4, gap: 8 }}><View style={s.spread}><Pressable accessibilityLabel="BloxPlox home" onPress={() => go('blocks')}><Logo/></Pressable><View style={[s.row, { flex: 1, justifyContent: 'center', gap: 3 }]}>{['blocks', 'habits', 'things'].map(tab => <Button key={tab} primary={page === tab || tab === 'things' && page === 'graph'} style={{ paddingHorizontal: 9 }} onPress={() => go(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</Button>)}</View><Button label="Menu" onPress={() => setMenu(!menu)}>☰</Button></View><View style={s.spread}><View style={[s.row, { gap: 3 }]}><Button label="Previous day" onPress={() => setDate(shiftDate(date, -1))}>‹</Button><Pressable accessibilityRole="button" accessibilityLabel="Choose date" onPress={() => setDialog({ type: 'calendar' })}><Txt small>{formatDate(date)}</Txt></Pressable><Button label="Next day" onPress={() => setDate(shiftDate(date, 1))}>›</Button></View><View style={[s.row, { gap: 3 }]}>{(['grid', 'list'] as const).map(layout => <Button key={layout} primary={settings.layout === layout} onPress={() => run(saveSettings({ layout }))} style={{ paddingHorizontal: 8 }}>{layout === 'grid' ? 'Grid' : 'List'}</Button>)}</View></View>
    <Pressable onPress={() => status === 'sign-in' ? run(signOut()) : sync()} accessibilityLabel="Sync status"><Txt small style={{ paddingBottom: 7 }}>{({ synced: '● Synced', syncing: '◌ Syncing', offline: '○ Offline · saved on this device', retrying: '○ Saved on this device · retry sync', 'sign-in': '○ Sign in again to sync' })[status]}</Txt></Pressable>
    {menu && <View style={[s.row, { paddingBottom: 12 }]}>{[['backlog', 'Backlog'], ['calendars', 'Calendars'], ['manage', 'Manage habits'], ['categories', 'Categories'], ['history', 'History'], ['templates', 'Templates'], ...(paidPlansEnabled ? [['pricing', 'Pricing']] : []), ['settings', 'Settings']].map(([key, name]) => <Button key={key} onPress={() => { if (key === 'history') setStatsHabit(undefined); go(key); }}>{name}</Button>)}</View>}
  </View>{['blocks', 'habits'].includes(page) && <History date={date} change={setDate}/>}
  <ScrollView ref={scroll} scrollEnabled={!dragging} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    {!!error && <View style={s.card}><ErrorText message={error}/><Button onPress={() => setError('')}>Dismiss</Button></View>}
    {page === 'blocks' && <Blocks date={date} openCalendar={slot => setDialog({ type: 'calendar-event', slot })} moving={setDragging} edit={block => setDialog({ type: 'block', block })} add={(start, duration) => setDialog({ type: 'block', block: blankBlock(date, start ?? settings.dayStart, duration) })}/>}
    {page === 'habits' && <Habits date={date} edit={habit => setDialog({ type: 'result', habit })} add={() => setDialog({ type: 'habit' })}/>}
    {page === 'things' && <Things date={date} edit={thing => setDialog({ type: 'thing', thing })} graph={graph} block={block => setDialog({ type: 'block', block })}/>}
    {page === 'graph' && <><Button onPress={() => go('things')}>‹ Things</Button><Graph key={graphFocus} focus={graphFocus} date={date} edit={id => setDialog({ type: 'thing', thing: entities(docs, 'thing').find(t => t.id === id) })}/></>}
    {page === 'calendars' && <Calendars date={date}/>}
    {page === 'backlog' && <Backlog date={date} edit={block => setDialog({ type: 'block', block })}/>}
    {page === 'manage' && <ManageHabits add={() => setDialog({ type: 'habit' })} edit={habit => setDialog({ type: 'habit', habit })} rule={rule => setDialog({ type: 'rule', rule })}/>}
    {page === 'categories' && <CategoriesPage/>}{page === 'history' && <Reports key={statsHabit?.id} date={date} habit={statsHabit}/>}{page === 'templates' && <Templates date={date}/>}{page === 'pricing' && <Pricing/>}{page === 'settings' && <Settings/>}
  </ScrollView>
  {dialog?.type === 'calendar-event' && <CalendarEventEditor slot={dialog.slot} date={date} close={close}/>}
  {dialog?.type === 'calendar' && <Calendar date={date} change={setDate} close={close} today={localDate(settings.timezone)}/>}
  {dialog?.type === 'thing' && <ThingEditor key={dialog.thing?.id ?? 'new'} thing={dialog.thing} date={date} close={close} graph={graph}/>}
  {dialog?.type === 'block' && <BlockEditor key={dialog.block.id} block={dialog.block} close={close} repeat={repeat} move={block => setDialog({ type: 'move', block })} split={block => setDialog({ type: 'split', block })}/>}
  {dialog?.type === 'move' && <MovePicker block={dialog.block} close={close}/>}{dialog?.type === 'split' && <Split block={dialog.block} close={close}/>}
  {dialog?.type === 'habit' && <HabitEditor habit={dialog.habit} date={date} close={close}/>}
  {dialog?.type === 'result' && dialog.habit && <HabitResult habit={dialog.habit} date={date} close={close} edit={() => setDialog({ type: 'habit', habit: dialog.habit })} schedule={() => setDialog({ type: 'rule', habit: dialog.habit, rule: applicableRule(entities(docs, 'rule').filter(r => r.habitId === dialog.habit!.id)) })} stats={() => { setStatsHabit(dialog.habit); go('history'); }}/>}
  {dialog?.type === 'rule' && <RuleEditor {...dialog} date={date} close={close}/>}
  </>;
}
function Calendar({ date, change, close, today }: { date: string; change(date: string): void; close(): void; today: string }) {
  const [month, setMonth] = useState(date.slice(0, 7)), first = `${month}-01`, offset = weekday(first), days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const move = (delta: number) => { const next = new Date(`${first}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + delta); setMonth(next.toISOString().slice(0, 7)); };
  return <Sheet title="Date" close={close}><View style={s.spread}><Button label="Previous month" onPress={() => move(-1)}>‹</Button><Text style={s.h2}>{new Date(`${first}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</Text><Button label="Next month" onPress={() => move(1)}>›</Button></View><View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{Array.from({ length: offset + days }, (_, index) => { const day = shiftDate(first, index - offset); return <View key={index} style={{ width: '14.28%', padding: 2 }}>{index < offset ? <View style={{ height: 44 }}/> : <Button primary={date === day} style={{ paddingHorizontal: 0 }} onPress={() => { change(day); close(); }}>{index - offset + 1}</Button>}</View>; })}</View><Button onPress={() => { change(today); close(); }}>Today</Button></Sheet>;
}
