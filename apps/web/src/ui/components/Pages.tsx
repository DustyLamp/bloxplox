import { useState } from 'react';
import { ArrowUp, ArrowDown, Plus, Pencil, Repeat, Bell } from 'lucide-react';
import { categoryMinutes, changedFields, completionStats, dayBlocks, entities, formatDate, formatDuration, formatTime, getCompletion, localDate, resultId, shiftDate, type Block, type Habit, type Rule } from '../../../../../packages/domain/src/index';
import { useBilling } from '../../commons/billing';
import { useData, useSettings } from '../../commons/data';
import { useActions } from '../../domain/actions';
import { Button, Dialog, ErrorText, Field, IconButton, Select } from './common';
import { CategoryPicker } from './Editors';
import { useCategoryFill } from './Boards';

export function Backlog({ date, edit, report }: { date: string; edit: (b: Block) => void; report: (message: string) => void }) {
  const { docs } = useData(), { settings, saveSettings } = useSettings(), { saveBlock, place } = useActions(), fill = useCategoryFill();
  const backlog = entities(docs, 'block').filter(b => !b.timing.date).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const run = (work: Promise<unknown>) => { void work.catch(e => report((e as Error).message)); };
  return <section className="bp2-content"><div className="bp2-sectionhead"><h1>Backlog</h1></div><label className="bp2-rule"><span>Roll dated items forward when overdue</span><input type="checkbox" checked={settings.autoBacklog} onChange={e => run(saveSettings({ autoBacklog: e.target.checked }))}/></label>
    {!backlog.length && <p className="empty-copy">No blocks in the backlog.</p>}
    {backlog.map((b, i) => <div className="bp2-listrow" key={b.id}><div className="bp2-rank"><IconButton label={`Move ${b.name} up`} disabled={!i} onClick={() => { const prior = backlog[i - 1]; run(saveBlock({ ...b, order: prior.order - 1 })); }}><ArrowUp/></IconButton><IconButton label={`Move ${b.name} down`} disabled={i === backlog.length - 1} onClick={() => { const next = backlog[i + 1]; run(saveBlock({ ...b, order: next.order + 1 })); }}><ArrowDown/></IconButton></div><span className="bp2-dot" style={{ background: fill(b.categories) }}/><button className="bp2-listtext" onClick={() => edit(b)}><strong>{b.name}</strong><small>{formatDuration(b.timing.duration)}</small></button>
      <label className="backlog-date">Date<input type="date" value={b.backlogDate ?? ''} onChange={e => run(saveBlock({ ...b, backlogDate: e.target.value || null }))}/></label><Button onClick={() => run(place({ ...b, timing: { ...b.timing, date, start: settings.dayStart }, backlogDate: null }, 'free'))}>+ {date === localDate(settings.timezone) ? 'Today' : formatDate(date)}</Button>
    </div>)}
  </section>;
}
export function Categories({ report }: { report: (message: string) => void }) {
  const { docs, save } = useData(), [selected, setSelected] = useState<string | null>(null), [name, setName] = useState(''), [color, setColor] = useState('#b48aff'), [baseline, setBaseline] = useState<{ name: string; color: string }>();
  return <section className="bp2-content"><div className="bp2-sectionhead"><h1>Categories</h1><Button onClick={() => { setSelected('new'); setBaseline(undefined); setName(''); setColor('#b48aff'); }}><Plus/>Add</Button></div><div className="bp2-categorygrid">{entities(docs, 'category').map(c => <button key={c.id} className="bp2-category" style={{ background: c.color }} onClick={() => { setSelected(c.id); setBaseline(c); setName(c.name); setColor(c.color); }}><h3>{c.name}</h3><Pencil size={16}/></button>)}</div>
    {selected && <Dialog title={selected === 'new' ? 'Add category' : 'Edit category'} onClose={() => setSelected(null)}><form onSubmit={e => { e.preventDefault(); void save(selected === 'new' ? crypto.randomUUID() : selected, 'category', baseline ? changedFields(baseline, { name: name.trim(), color }) : { name: name.trim(), color }).then(() => setSelected(null)).catch(e => report((e as Error).message)); }}><Field label="Name"><input required maxLength={120} value={name} onChange={e => setName(e.target.value)}/></Field><Field label="Colour"><input type="color" value={color} onChange={e => setColor(e.target.value)}/></Field><Button primary type="submit" className="bp2-full">Save</Button></form></Dialog>}
  </section>;
}
export function ManageHabits({ add, edit, schedule }: { add: () => void; edit: (h: Habit) => void; schedule: (r: Rule) => void }) {
  const { docs } = useData();
  return <section className="bp2-content"><div className="bp2-sectionhead"><h1>Habits</h1><Button onClick={add}><Plus/>Add habit</Button></div>{entities(docs, 'habit').map(h => <div className="bp2-listrow" key={h.id}><button className="bp2-listtext" onClick={() => edit(h)}><strong>{h.name}</strong><small>{h.active ? `${h.weekdays.length} days a week` : 'Inactive'}{h.type === 'value' ? ` · ${h.target} ${h.unit}` : ''}</small></button><Button onClick={() => edit(h)}>Edit</Button></div>)}<div className="bp2-sectionhead recurring-heading"><h2>Recurring blocks</h2></div>{entities(docs, 'rule').map(r => <button key={r.id} className="bp2-option" onClick={() => schedule(r)}><Repeat/><span>{r.name}<small>{r.recurrence.repeat} · {formatTime(r.start)}</small></span></button>)}</section>;
}
export function Reports({ date, habit }: { date: string; habit?: Habit }) {
  const { plus } = useBilling();
  const { docs } = useData(), [from, setFrom] = useState(shiftDate(date, -89)), [to, setTo] = useState(date);
  const safeRange = from <= to && Date.parse(`${to}T12:00Z`) - Date.parse(`${from}T12:00Z`) <= 366 * 86400000;
  const categories = entities(docs, 'category'), totals = safeRange ? categoryMinutes(docs, from, to) : {};
  let done = 0, total = 0, sum = 0;
  const bars: { date: string; done: number; total: number }[] = [];
  if (safeRange) for (let day = from; day <= to; day = shiftDate(day, 1)) {
    if (habit) { const result = getCompletion(docs, resultId(habit.id, day)); if (result.status === 'done') done++; if (result.status !== 'none' && result.status !== 'skip') total++; sum += result.value; bars.push({ date: day, done: result.status === 'done' ? 1 : 0, total: 1 }); }
    else { const stats = completionStats(docs, day); done += stats.done; total += stats.total; bars.push({ date: day, ...stats }); }
  }
  const max = Math.max(1, ...Object.values(totals));
  return <section className="bp2-content"><div className="bp2-sectionhead"><h1>{habit ? `${habit.name} stats` : 'History'}</h1></div><div className="bp2-fields"><Field label="From"><input type="date" value={from} onChange={e => setFrom(e.target.value)}/></Field><Field label="To"><input type="date" value={to} onChange={e => setTo(e.target.value)}/></Field></div>
    {!safeRange ? <ErrorText message="Choose a period of up to one year."/> : <><p className="bp2-stat">{done}<small> / {total} done</small></p>{habit?.type === 'value' && <p>{sum} {habit.unit} recorded</p>}
      <div className="report-history" aria-label="Completion history">{bars.map(bar => <div key={bar.date} title={`${formatDate(bar.date)}: ${bar.done} / ${bar.total}`} style={{ height: `${bar.total ? Math.max(2, bar.done / bar.total * 100) : 2}%` }}/>)}</div>
      {!habit && !plus && <p className="pricing-notice">Detailed category reports are included in Plus. <a href="/pricing">Compare plans</a></p>}{!habit && plus && <><h2>Completed time by category</h2><p className="bp2-muted">Time shared by several categories is divided equally.</p>{categories.map(c => <div className="category-report" key={c.id}><span>{c.name}</span><strong>{formatDuration(Math.round(totals[c.id] ?? 0))}</strong><div style={{ width: `${(totals[c.id] ?? 0) / max * 100}%`, background: c.color }}/></div>)}</>}
    </>}
  </section>;
}
export function Settings({ report }: { report: (message: string) => void }) {
  const { email, signOut, deleteAccount, appleSignIn, docs } = useData(), { settings, saveSettings } = useSettings(), [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false), [confirmation, setConfirmation] = useState(''), [deletingBusy, setDeletingBusy] = useState(false), [deletionError, setDeletionError] = useState('');
  const run = (work: Promise<unknown>) => { void work.catch(e => report((e as Error).message)); };
  return <section className="bp2-content"><div className="bp2-sectionhead"><h1>Settings</h1></div><p className="account-email">{email}</p><Field label="Schedule timezone"><Select value={settings.timezone} onChange={e => run(saveSettings({ timezone: e.target.value }))}>{[...new Set([settings.timezone, ...Intl.supportedValuesOf('timeZone')])].map(tz => <option key={tz}>{tz}</option>)}</Select></Field><Field label="Day starts at"><input type="time" step="900" value={formatTime(settings.dayStart)} onChange={e => { const [h, m] = e.target.value.split(':').map(Number); run(saveSettings({ dayStart: h * 60 + m })); }}/></Field><p className="bp2-muted">Earlier blocks remain visible. Recurring blocks keep their saved local time.</p>
    {'Notification' in window && <Button onClick={() => { void Notification.requestPermission().then(result => report(result === 'granted' ? 'Reminders enabled while BloxPlox is open' : 'Browser reminders are off')); }}><Bell/>Enable reminders</Button>}
    <Button onClick={() => { const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), records: docs }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `bloxplox-${localDate(settings.timezone)}.json`; anchor.click(); URL.revokeObjectURL(url); }}>Export data</Button>
    <p className="public-links"><a href="/privacy">Privacy</a><a href="mailto:hello@bloxplox.com">Contact support</a></p>
    <Button onClick={() => setLeaving(true)}>Sign out</Button>{leaving && <Dialog title="Sign out?" onClose={() => setLeaving(false)}><p className="bp2-muted">Changes saved on this device stay here until your next sign-in. Allow synchronization to finish before switching devices.</p><div className="bp2-actionrow"><Button onClick={() => setLeaving(false)}>Cancel</Button><Button primary onClick={() => run(signOut())}>Sign out</Button></div></Dialog>}
    <Button className="danger" onClick={() => { setDeleting(true); setConfirmation(''); setDeletionError(''); }}>Delete account</Button>
    {deleting && <Dialog title="Delete account?" onClose={() => { if (!deletingBusy) setDeleting(false); }}><p>This permanently removes your login, Blocks, Habits, Things, history and connected calendar data. Your Google calendars stay unchanged.</p><p className="bp2-muted">Access stops now; server cleanup takes a few minutes. This device’s copy is removed. Clear app storage on any other offline devices. Backups expire within 35 days.</p>{appleSignIn && <p className="bp2-muted">If you use Apple, confirm with Apple to revoke its access. Cannot confirm? You can still delete below, then <a href="https://support.apple.com/en-us/102571" target="_blank" rel="noreferrer">stop using Apple with BloxPlox</a> in your Apple Account settings.</p>}<Field label="Type DELETE to confirm"><input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off"/></Field><ErrorText message={deletionError}/><div className="bp2-actionrow"><Button disabled={deletingBusy} onClick={() => setDeleting(false)}>Cancel</Button><Button className="danger" disabled={deletingBusy || confirmation !== 'DELETE'} onClick={() => { setDeletingBusy(true); void deleteAccount().catch(error => setDeletionError(error.message)).finally(() => setDeletingBusy(false)); }}>{deletingBusy ? 'Deleting…' : 'Permanently delete account'}</Button></div>{appleSignIn && <Button disabled={deletingBusy || confirmation !== 'DELETE'} onClick={() => { setDeletingBusy(true); void deleteAccount(true).catch(error => setDeletionError(error.message)).finally(() => setDeletingBusy(false)); }}>Delete without Apple confirmation</Button>}</Dialog>}
  </section>;
}
