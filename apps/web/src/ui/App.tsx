import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { CalendarDays, ChevronLeft, ChevronRight, Grid2X2, List, Menu, Plus, RefreshCw } from 'lucide-react';
import { dayBlocks, dueHabits, entities, formatDate, getCompletion, localDate, paidPlansEnabled, resultId, shiftDate, type CalendarSlot, type Block, type Habit, type Rule } from '../../../../packages/domain/src/index';
import { useData, useSettings } from '../commons/data';
import { blankBlock, useActions } from '../domain/actions';
import { Blocks, Tracker } from './components/Boards';
import { History } from './components/History';
import { Calendars, CalendarEventEditor, useCalendarRefresh } from './components/Calendars';
import { SplitThings } from './components/SplitThings';
import { Templates } from './components/Templates';
import { Pricing } from './components/Pricing';
import { Things } from './components/Things';
import { Backlog, Categories, ManageHabits, Reports, Settings } from './components/Pages';
import { BlockEditor, HabitEditor, HabitMenu, MovePicker, NumericResult, RuleEditor } from './components/Editors';
import { Button, DebossFilter, Dialog, Field, IconButton, Logo } from './components/common';

type Modal = { type: 'block' | 'move' | 'split'; block: Block } | { type: 'habit' | 'habit-menu' | 'value'; habit?: Habit } | { type: 'rule'; habit?: Habit; block?: Block; rule?: Rule } | { type: 'calendar' } | { type: 'calendar-event'; slot: CalendarSlot } | null;
export function App() {
  const { docs, status, saving, sync, signOut, error, clearError } = useData(), { settings, saveSettings } = useSettings(), actions = useActions();
  const navigate = useNavigate(), path = useRouterState({ select: s => s.location.pathname });
  const page = path === '/tracker' ? 'habits' : path.slice(1) || 'blocks', [date, setDate] = useState(() => localDate(settings.timezone));
  const [menu, setMenu] = useState(false), [modal, setModal] = useState<Modal>(null), [notice, setNotice] = useState(''), [undo, setUndo] = useState<Block | null>(null), [statsHabit, setStatsHabit] = useState<Habit>();
  useCalendarRefresh(date);
  const clock = useRef(localDate(settings.timezone)), backlogBusy = useRef(false), reminded = useRef(new Set<string>());
  const [rolloverEpoch, setRolloverEpoch] = useState(0);
  const close = useCallback(() => setModal(null), []);
  const report = useCallback((message: string) => { setNotice(message); }, []);
  const go = (to: string) => { setMenu(false); setModal(null); void navigate({ to: `/${to}` }); };
  const run = (work: Promise<unknown>) => { void work.catch(e => report((e as Error).message)); };
  useEffect(() => {
    const prior = clock.current, today = localDate(settings.timezone);
    setDate(current => current === prior ? today : current); clock.current = today;
  }, [settings.timezone]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => { setNotice(''); setUndo(null); }, undo ? 10000 : 5000); return () => clearTimeout(timer); }, [notice, undo]);
  useEffect(() => {
    const timer = setInterval(() => {
      const today = localDate(settings.timezone);
      if (clock.current !== today) { if (date === clock.current) setDate(today); clock.current = today; setRolloverEpoch(n => n + 1); }
      const time = new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      for (const h of dueHabits(docs, today)) {
        const key = `${h.id}:${today}`, result = getCompletion(docs, resultId(h.id, today));
        if (h.reminder !== time || reminded.current.has(key) || result.status === 'done' || result.status === 'skip') continue;
        reminded.current.add(key); report(h.name);
        if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification(h.name, { tag: key, icon: '/logo.svg' });
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [docs, date, settings.timezone, report]);
  useEffect(() => {
    if (backlogBusy.current) return;
    const today = localDate(settings.timezone);
    const due = entities(docs, 'block').filter(b => !b.timing.date && b.backlogDate && (b.backlogDate === today || settings.autoBacklog && b.backlogDate < today)).sort((a, b) => a.order - b.order);
    if (!due.length) return;
    backlogBusy.current = true;
    // One at a time; the reactive database supplies the updated schedule before the next.
    const b = due[0];
    void actions.place({ ...b, timing: { ...b.timing, date: today, start: settings.dayStart }, backlogDate: null }, 'free').then(() => { backlogBusy.current = false; setRolloverEpoch(n => n + 1); }).catch(e => { backlogBusy.current = false; report((e as Error).message); });
  }, [docs, settings.autoBacklog, settings.dayStart, settings.timezone, rolloverEpoch]);
  const applicableRule = (rules: Rule[]) => rules.filter(r => r.effectiveFrom <= date && (!r.recurrence.endDate || r.recurrence.endDate >= date)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const openRule = (block: Block) => {
    const rules = entities(docs, 'rule'), original = rules.find(r => r.id === block.ruleId);
    setModal({ type: 'rule', block, rule: applicableRule(rules.filter(r => r.seriesId === original?.seriesId)) ?? original });
  };
  return <div className="bp2-app"><DebossFilter/><header className="bp2-header">
    <button type="button" className="bp2-brand" aria-label="BloxPlox home" onClick={() => go('blocks')}><Logo/></button>
    <div className="bp2-switch" aria-label="Main views"><button type="button" aria-pressed={page === 'blocks'} onClick={() => go('blocks')}>Blocks</button><button type="button" aria-pressed={page === 'habits'} onClick={() => go('habits')}>Habits</button><button type="button" aria-pressed={page === 'things'} onClick={() => go('things')}>Things</button></div>
    <div className="bp2-layoutswitch" aria-label="Layout for all views"><button type="button" aria-pressed={settings.layout === 'grid'} onClick={() => run(saveSettings({ layout: 'grid' }))}><Grid2X2/>Grid</button><button type="button" aria-pressed={settings.layout === 'list'} onClick={() => run(saveSettings({ layout: 'list' }))}><List/>List</button></div>
    <div className="bp2-datebar"><IconButton label="Previous day" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft/></IconButton><button className="bp2-datebutton" onClick={() => setModal({ type: 'calendar' })}>{formatDate(date)}<CalendarDays size={15}/></button><IconButton label="Next day" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight/></IconButton></div>
    <IconButton label="Menu" className="bp2-menutoggle" aria-expanded={menu} onClick={() => setMenu(!menu)}><Menu/></IconButton>
    {menu && <nav className="bp2-menu" aria-label="Main menu">{['backlog', 'calendars', 'manage-habits', 'categories', 'history', 'templates', ...(paidPlansEnabled ? ['pricing'] : []), 'settings'].map(item => <button key={item} onClick={() => { if (item === 'history') setStatsHabit(undefined); go(item); }}>{item === 'manage-habits' ? 'Manage habits' : item[0].toUpperCase() + item.slice(1)}</button>)}</nav>}
  </header>
  <div className={`sync-line sync-${status}`} role="status"><span className="sync-dot"/>{saving ? 'Saving on this device…' : ({ offline: 'Offline · saved on this device', syncing: 'Syncing', synced: 'Synced', retrying: 'Saved on this device · retrying sync', 'sign-in': 'Saved on this device · sign in to sync' })[status]}{status === 'retrying' && <button onClick={sync} aria-label="Retry sync"><RefreshCw size={13}/></button>}{status === 'sign-in' && <button onClick={() => run(signOut())}>Sign in</button>}</div>
  <main className="bp2-main">
    {['blocks', 'habits'].includes(page) && <History date={date} onDate={setDate} manage={page === 'habits' ? () => go('manage-habits') : undefined}/>}
    {page === 'blocks' && <Blocks date={date} openCalendar={slot => setModal({ type: 'calendar-event', slot })} edit={block => setModal({ type: 'block', block })} add={start => setModal({ type: 'block', block: blankBlock(date, start ?? settings.dayStart) })} movePicker={block => setModal({ type: 'move', block })} report={report}/>}
    {page === 'habits' && <Tracker date={date} menu={habit => setModal({ type: 'habit-menu', habit })} value={habit => setModal({ type: 'value', habit })} add={() => setModal({ type: 'habit' })} report={report}/>}
    {page === 'things' && <Things date={date} editBlock={block => setModal({ type: 'block', block })} report={report}/>}
    {page === 'calendars' && <Calendars date={date}/>}
    {page === 'backlog' && <Backlog date={date} edit={block => setModal({ type: 'block', block })} report={report}/>}
    {page === 'categories' && <Categories report={report}/>}
    {page === 'manage-habits' && <ManageHabits add={() => setModal({ type: 'habit' })} edit={habit => setModal({ type: 'habit', habit })} schedule={rule => setModal({ type: 'rule', rule })}/>}
    {page === 'history' && <Reports date={date} habit={statsHabit}/>}
    {page === 'templates' && <Templates date={date} report={report}/>}
    {page === 'pricing' && <Pricing/>}
    {page === 'settings' && <Settings report={report}/>}
    {!['blocks', 'habits', 'things', 'backlog', 'categories', 'habits', 'history', 'templates', 'pricing', 'settings'].includes(page) && <section className="bp2-content"><h1>Page not found</h1><Button onClick={() => go('blocks')}>Back to Blocks</Button></section>}
  </main>
  {modal?.type === 'calendar' && <Dialog title="Date" onClose={close}><Field label="Choose date"><input type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }}/></Field><div className="bp2-actionrow"><Button onClick={() => { setDate(localDate(settings.timezone)); close(); }}>Today</Button><Button primary onClick={close}>Done</Button></div></Dialog>}
  {modal?.type === 'calendar-event' && <CalendarEventEditor slot={modal.slot} date={date} onClose={close}/>}
  {modal?.type === 'block' && <BlockEditor key={modal.block.id} block={modal.block} onClose={close} schedule={openRule} move={block => setModal({ type: 'move', block })} split={block => setModal({ type: 'split', block })} removed={block => { setUndo(block); report('Block deleted'); }}/>}
  {modal?.type === 'split' && <SplitThings block={modal.block} onClose={close}/>}
  {modal?.type === 'move' && <MovePicker block={modal.block} onClose={close}/>}
  {modal?.type === 'habit' && <HabitEditor habit={modal.habit} date={date} onClose={close}/>}
  {modal?.type === 'habit-menu' && modal.habit && <HabitMenu habit={modal.habit} date={date} onClose={close} edit={() => setModal({ type: 'habit', habit: modal.habit })} schedule={() => setModal({ type: 'rule', habit: modal.habit, rule: applicableRule(entities(docs, 'rule').filter(r => r.habitId === modal.habit!.id)) })} stats={() => { setStatsHabit(modal.habit); go('history'); }}/>}
  {modal?.type === 'value' && modal.habit && <NumericResult habit={modal.habit} date={date} onClose={close}/>}
  {modal?.type === 'rule' && <RuleEditor key={modal.rule?.id ?? modal.block?.id ?? modal.habit?.id} {...modal} date={date} onClose={close}/>}
  {(notice || error) && <div className="bp2-toast" role={error ? 'alert' : 'status'}>{error || notice}{undo && <button onClick={() => { run(actions.saveBlock(undo, false)); setUndo(null); report('Block restored'); }}>Undo</button>}{error && <button onClick={clearError}>Dismiss</button>}</div>}
  </div>;
}
