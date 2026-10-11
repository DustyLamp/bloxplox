import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { CalendarDays, ChevronLeft, ChevronRight, Grid2X2, List, Menu, Plus, RefreshCw } from 'lucide-react';
import { dayBlocks, dueHabits, entities, formatDate, getCompletion, localDate, resultId, shiftDate, type Block, type Habit, type Rule } from '../../../../packages/domain/src/index';
import { useData, useSettings } from '../commons/data';
import { blankBlock, useActions } from '../domain/actions';
import { Blocks, Tracker } from './components/Boards';
import { History } from './components/History';
import { Backlog, Categories, ManageHabits, Reports, Settings } from './components/Pages';
import { BlockEditor, HabitEditor, HabitMenu, MovePicker, NumericResult, RuleEditor } from './components/Editors';
import { Button, DebossFilter, Dialog, Field, IconButton, Logo } from './components/common';

type Modal = { type: 'block' | 'move'; block: Block } | { type: 'habit' | 'habit-menu' | 'value'; habit?: Habit } | { type: 'rule'; habit?: Habit; block?: Block; rule?: Rule } | { type: 'calendar' } | null;
export function App() {
  const { docs, status, sync, error, clearError } = useData(), { settings, saveSettings } = useSettings(), actions = useActions();
  const navigate = useNavigate(), path = useRouterState({ select: s => s.location.pathname });
  const page = path.slice(1) || 'blocks', [date, setDate] = useState(() => localDate(settings.timezone));
  const [menu, setMenu] = useState(false), [modal, setModal] = useState<Modal>(null), [notice, setNotice] = useState(''), [undo, setUndo] = useState<Block | null>(null), [statsHabit, setStatsHabit] = useState<Habit>();
  const clock = useRef(localDate(settings.timezone)), backlogBusy = useRef(false), reminded = useRef(new Set<string>());
  const close = useCallback(() => setModal(null), []);
  const report = useCallback((message: string) => { setNotice(message); }, []);
  const go = (to: string) => { setMenu(false); setModal(null); void navigate({ to: `/${to}` }); };
  const run = (work: Promise<unknown>) => { void work.catch(e => report((e as Error).message)); };
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => { setNotice(''); setUndo(null); }, undo ? 10000 : 5000); return () => clearTimeout(timer); }, [notice, undo]);
  useEffect(() => {
    const timer = setInterval(() => {
      const today = localDate(settings.timezone);
      if (clock.current !== today) { if (date === clock.current) setDate(today); clock.current = today; }
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
    void actions.place({ ...b, timing: { ...b.timing, date: today, start: settings.dayStart }, backlogDate: null }, 'free').catch(e => report((e as Error).message)).finally(() => { backlogBusy.current = false; });
  }, [docs, settings.autoBacklog, settings.dayStart, settings.timezone]);
  const openRule = (block: Block) => setModal({ type: 'rule', block, rule: entities(docs, 'rule').find(r => r.id === block.ruleId) });
  return <div className="bp2-app"><DebossFilter/><header className="bp2-header">
    <button type="button" className="bp2-brand" aria-label="BloxPlox home" onClick={() => go('blocks')}><Logo/></button>
    <div className="bp2-switch" aria-label="Day view"><button type="button" aria-pressed={page === 'blocks'} onClick={() => go('blocks')}>Blocks</button><button type="button" aria-pressed={page === 'tracker'} onClick={() => go('tracker')}>Tracker</button></div>
    <div className="bp2-layoutswitch" aria-label="Layout for Blocks and Tracker"><button type="button" aria-pressed={settings.layout === 'grid'} onClick={() => run(saveSettings({ layout: 'grid' }))}><Grid2X2/>Grid</button><button type="button" aria-pressed={settings.layout === 'list'} onClick={() => run(saveSettings({ layout: 'list' }))}><List/>List</button></div>
    <div className="bp2-datebar"><IconButton label="Previous day" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft/></IconButton><button className="bp2-datebutton" onClick={() => setModal({ type: 'calendar' })}>{formatDate(date)}<CalendarDays size={15}/></button><IconButton label="Next day" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight/></IconButton></div>
    <IconButton label="Menu" className="bp2-menutoggle" aria-expanded={menu} onClick={() => setMenu(!menu)}><Menu/></IconButton>
    {menu && <nav className="bp2-menu" aria-label="Main menu">{['backlog', 'habits', 'categories', 'history', 'settings'].map(item => <button key={item} onClick={() => { if (item === 'history') setStatsHabit(undefined); go(item); }}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>}
  </header>
  <div className={`sync-line sync-${status}`} role="status"><span className="sync-dot"/>{({ offline: 'Offline · saved on this device', syncing: 'Syncing', synced: 'Synced', retrying: 'Saved on this device · retrying sync', 'sign-in': 'Saved on this device · sign in to sync' })[status]}{['retrying', 'sign-in'].includes(status) && <button onClick={sync} aria-label="Retry sync"><RefreshCw size={13}/></button>}</div>
  <main className="bp2-main">
    {['blocks', 'tracker'].includes(page) && <History date={date} onDate={setDate} manage={page === 'tracker' ? () => go('habits') : undefined}/>}
    {page === 'blocks' && <Blocks date={date} edit={block => setModal({ type: 'block', block })} add={start => setModal({ type: 'block', block: blankBlock(date, start ?? settings.dayStart) })} movePicker={block => setModal({ type: 'move', block })} report={report}/>}
    {page === 'tracker' && <Tracker date={date} menu={habit => setModal({ type: 'habit-menu', habit })} value={habit => setModal({ type: 'value', habit })} add={() => setModal({ type: 'habit' })} report={report}/>}
    {page === 'backlog' && <Backlog date={date} edit={block => setModal({ type: 'block', block })} report={report}/>}
    {page === 'categories' && <Categories report={report}/>}
    {page === 'habits' && <ManageHabits add={() => setModal({ type: 'habit' })} edit={habit => setModal({ type: 'habit', habit })} schedule={rule => setModal({ type: 'rule', rule })}/>}
    {page === 'history' && <Reports date={date} habit={statsHabit}/>}
    {page === 'settings' && <Settings report={report}/>}
    {!['blocks', 'tracker', 'backlog', 'categories', 'habits', 'history', 'settings'].includes(page) && <section className="bp2-content"><h1>Page not found</h1><Button onClick={() => go('blocks')}>Back to Blocks</Button></section>}
  </main>
  {modal?.type === 'calendar' && <Dialog title="Date" onClose={close}><Field label="Choose date"><input type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }}/></Field><div className="bp2-actionrow"><Button onClick={() => { setDate(localDate(settings.timezone)); close(); }}>Today</Button><Button primary onClick={close}>Done</Button></div></Dialog>}
  {modal?.type === 'block' && <BlockEditor key={modal.block.id} block={modal.block} onClose={close} schedule={openRule} move={block => setModal({ type: 'move', block })} removed={block => { setUndo(block); report('Block deleted'); }}/>} 
  {modal?.type === 'move' && <MovePicker block={modal.block} onClose={close}/>}
  {modal?.type === 'habit' && <HabitEditor habit={modal.habit} date={date} onClose={close}/>}
  {modal?.type === 'habit-menu' && modal.habit && <HabitMenu habit={modal.habit} date={date} onClose={close} edit={() => setModal({ type: 'habit', habit: modal.habit })} schedule={() => setModal({ type: 'rule', habit: modal.habit, rule: entities(docs, 'rule').find(r => r.habitId === modal.habit!.id) })} stats={() => { setStatsHabit(modal.habit); go('history'); }}/>} 
  {modal?.type === 'value' && modal.habit && <NumericResult habit={modal.habit} date={date} onClose={close}/>}
  {modal?.type === 'rule' && <RuleEditor key={modal.rule?.id ?? modal.block?.id ?? modal.habit?.id} {...modal} date={date} onClose={close}/>}
  {(notice || error) && <div className="bp2-toast" role={error ? 'alert' : 'status'}>{error || notice}{undo && <button onClick={() => { run(actions.saveBlock(undo, false)); setUndo(null); report('Block restored'); }}>Undo</button>}{error && <button onClick={clearError}>Dismiss</button>}</div>}
  </div>;
}
