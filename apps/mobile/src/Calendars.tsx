import { useEffect, useState } from 'react';
import { Alert, AppState, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { calendarPreferenceId, dayBlocks, entities, formatDate, formatTime, mergeCalendarEvent, type CalendarSlot, type CalendarStatus } from '../../../packages/domain/src/index';
import { useActions, useData } from './session';
import { Button, ErrorText, s, Sheet, Toggle, Txt, useWork } from './ui';
export function useCalendarRefresh(date: string) {
  const { docs, request } = useData(), enabled = entities(docs, 'calendarSource').some(s => s.enabled);
  useEffect(() => { if (!enabled) return; const refresh = () => { if (AppState.currentState === 'active') void request('/calendars/refresh', { date }).catch(() => {}); }; refresh(); const active = AppState.addEventListener('change', state => { if (state === 'active') refresh(); }), timer = setInterval(refresh, 300000); return () => { active.remove(); clearInterval(timer); }; }, [date, enabled]);
}
export function Calendars({ date }: { date: string }) {
  const { docs, request, save } = useData(), [status, setStatus] = useState<CalendarStatus>(), [message, setMessage] = useState(''), { error, busy, run } = useWork();
  const sources = entities(docs, 'calendarSource'), hidden = entities(docs, 'calendarPreference').filter(p => p.hidden), events = entities(docs, 'calendarEvent');
  const refresh = async () => setStatus(await request('/calendars/status'));
  const work = (job: () => Promise<unknown>) => void run(async () => { await job(); await refresh(); });
  useEffect(() => { void run(refresh); const timer = setInterval(() => void refresh().catch(() => {}), 10000); return () => clearInterval(timer); }, []);
  return <><Text style={s.title}>Calendars</Text><Txt small>Import calendars into Blocks. Hiding and merging only change BloxPlox.</Txt><Button primary disabled={busy || !status?.enabled} onPress={() => work(async () => {
    const { url } = await request('/calendars/connect', { platform: 'native' }); if (new URL(url).origin !== 'https://accounts.google.com') throw new Error('Invalid Google destination');
    const result = await WebBrowser.openAuthSessionAsync(url, 'bloxplox://calendars'); if (result.type === 'success') { const outcome = new URL(result.url).searchParams.get('calendar'); setMessage(outcome === 'connected' ? 'Google account connected. Choose calendars below.' : 'Could not connect. Try again and allow calendar access.'); }
  })}>Connect Google account</Button>{status && !status.enabled && <Txt small>Google Calendar connections are not open yet.</Txt>}{!!message && <Txt>{message}</Txt>}
    {status?.accounts.map(account => <View key={account.id} style={s.card}><Text style={s.h2}>{account.email}</Text>{account.needsReconnect && <Txt>Reconnect this account to refresh calendars.</Txt>}{sources.filter(source => source.accountId === account.id).map(source => { const sync = status.sources.find(s => s.id === source.id); return <View key={source.id}><Toggle label={source.name} value={source.enabled} onChange={enabled => { if (!busy) work(() => request('/calendars/select', { id: source.id, enabled, date })); }}/><Txt small>{sync?.error || (sync?.lastSynced ? `Updated ${new Date(sync.lastSynced).toLocaleTimeString()}` : source.enabled ? 'Importing…' : '')}</Txt></View>; })}<Button disabled={busy} onPress={() => Alert.alert('Disconnect Google account?', 'Its calendars stop appearing here. Your Google calendars stay unchanged.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Disconnect', onPress: () => work(() => request('/calendars/disconnect', { accountId: account.id })) }])}>Disconnect</Button></View>)}
    {!!status?.accounts.length && <Button disabled={busy} onPress={() => work(() => request('/calendars/refresh', { date, discover: true }))}>Refresh calendars</Button>}
    {!!hidden.length && <Text style={s.h2}>Hidden events</Text>}{hidden.map(preference => { const event = events.find(e => e.id === preference.eventId); return event && <View key={preference.id} style={s.card}><Txt>{event.name}</Txt><Button disabled={busy} onPress={() => work(() => save(preference.id, 'calendarPreference', { hidden: false }))}>Show again</Button></View>; })}<ErrorText message={error}/>
  </>;
}
export function CalendarEventEditor({ slot, date, close }: { slot: CalendarSlot; date: string; close(): void }) {
  const { docs, save } = useData(), actions = useActions(), { error, busy, run } = useWork(close), blocks = dayBlocks(docs, date);
  return <Sheet title={slot.event.name} close={close}><Txt small>{slot.sourceName} · {formatDate(date)} · {slot.event.allDay ? 'All day' : `${formatTime(slot.start)}–${formatTime(slot.start + slot.duration)}`} · Read-only</Txt>{!!slot.event.location && <Txt>{slot.event.location}</Txt>}{!!slot.event.notes && <Txt small>{slot.event.notes}</Txt>}<Button disabled={busy} onPress={() => void run(() => save(calendarPreferenceId(slot.event.id), 'calendarPreference', { eventId: slot.event.id, hidden: true }))}>Hide this event</Button>
    {!slot.event.allDay && blocks.length > 0 && <><Text style={s.h2}>Merge into block</Text><Txt small>The block covers both time windows. Following blocks move if needed. Google stays unchanged.</Txt>{blocks.map(block => <Button key={block.id} disabled={busy} onPress={() => Alert.alert(`Merge into ${block.name}?`, 'Keep its habits and things and combine the time windows.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Merge', onPress: () => void run(() => actions.place(mergeCalendarEvent(block, slot, date))) }])}>{block.name} · {formatTime(block.timing.start)}</Button>)}</>}<ErrorText message={error}/>
  </Sheet>;
}
