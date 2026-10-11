import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { entities, localDate, thingsInBlock, type Thing } from '../../../../../packages/domain/src/index';
import { useData, useSettings } from '../../commons/data';
import { Button, ErrorText, Field, IconButton } from './common';

export function newThing(name = ''): Thing {
  return { id: crypto.randomUUID(), name, notes: '', estimate: null, dueDate: null, completedOn: null, categories: [], order: Date.now() };
}

function ThingCheckbox({ thing, report }: { thing: Thing; report: (message: string) => void }) {
  const { save } = useData(), { settings } = useSettings(), [pending, setPending] = useState<boolean | null>(null);
  useEffect(() => { if (pending === !!thing.completedOn) setPending(null); }, [thing.completedOn, pending]);
  return <input type="checkbox" aria-label={`Complete ${thing.name}`} checked={pending ?? !!thing.completedOn} disabled={pending !== null} onChange={e => {
    const checked = e.target.checked; setPending(checked);
    void save(thing.id, 'thing', { completedOn: checked ? localDate(settings.timezone) : null }).catch(e => { setPending(null); report((e as Error).message); });
  }}/>;
}

export function ThingPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { docs, save } = useData();
  const [search, setSearch] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const chosen = thingsInBlock(docs, { thingIds: selected });
  const available = entities(docs, 'thing').filter(t => !t.completedOn && !selected.includes(t.id) && t.name.toLowerCase().includes(search.toLowerCase()));
  async function create() {
    if (!search.trim() || busy) return;
    setBusy(true); setError('');
    try { const { id, ...data } = newThing(search.trim()); await save(id, 'thing', data); onChange([...selected, id]); setSearch(''); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="thing-picker" aria-label="Things in this block"><h3>Things <span>{chosen.filter(t => t.completedOn).length} / {chosen.length}</span></h3>
    {chosen.map(t => <div className="thing-checkrow" key={t.id}>
      <label><ThingCheckbox thing={t} report={setError}/><span className={t.completedOn ? 'thing-done' : ''}>{t.name}</span></label>
      <IconButton label={`Remove ${t.name} from block`} onClick={() => onChange(selected.filter(id => id !== t.id))}><X/></IconButton>
    </div>)}
    <details><summary>Add things</summary><Field label="Find or add a thing"><input maxLength={120} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void create(); } }}/></Field>
      <div className="thing-options">{available.map(t => <button key={t.id} type="button" onClick={() => onChange([...selected, t.id])}><Plus/>{t.name}</button>)}</div>
      {search.trim() && <Button disabled={busy || selected.length >= 100} onClick={() => void create()}><Plus/>Create “{search.trim()}”</Button>}
    </details><ErrorText message={error}/>
  </section>;
}
