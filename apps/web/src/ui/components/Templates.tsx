import { useRef, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { applyTemplate, captureTemplate, dayBlocks, entities, formatDuration } from '../../../../../packages/domain/src/index';
import { useData } from '../../commons/data';
import { useBilling } from '../../commons/billing';
import { useActions } from '../../domain/actions';
import { Button, ErrorText, Field } from './common';

export function Templates({ date, report }: { date: string; report: (message: string) => void }) {
  const { docs, save } = useData(), { saveBlock } = useActions(), { plus } = useBilling();
  const [name, setName] = useState(''), [source, setSource] = useState(date), [target, setTarget] = useState(date), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const application = useRef<{ templateId: string; date: string; blocks: ReturnType<typeof applyTemplate> } | undefined>(undefined);
  const templates = entities(docs, 'template');
  async function run(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await work(); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <section className="bp2-content"><h1>Day templates</h1><p className="bp2-muted">Reuse a day's block names, times, categories and notes. One-off Things, linked habits and completion stay with the original day.</p>
    {!plus && <p className="pricing-notice">Creating and applying templates is included in Plus. <a href="/pricing">Compare plans</a></p>}
    <form className="template-create" onSubmit={e => { e.preventDefault(); void run(async () => { const blocks = dayBlocks(docs, source); if (!blocks.length) throw new Error('Choose a day with blocks.'); await save(crypto.randomUUID(), 'template', captureTemplate(name.trim(), blocks)); setName(''); report('Template saved'); }); }}>
      <Field label="Template name"><input required maxLength={120} value={name} onChange={e => setName(e.target.value)}/></Field><Field label="Copy day"><input type="date" required value={source} onChange={e => setSource(e.target.value)}/></Field><Button primary type="submit" disabled={busy || !plus || !name.trim()}>Save day as template</Button>
    </form>
    <Field label="Apply to day"><input type="date" required value={target} onChange={e => setTarget(e.target.value)}/></Field>
    {templates.map(t => <article key={t.id} className="template-row"><div><h2>{t.name}</h2><p>{t.blocks.length} blocks · {formatDuration(t.blocks.reduce((sum,b) => sum + b.duration,0))}</p><small>{t.blocks.map(b => b.name).join(' · ')}</small></div><div className="bp2-actionrow">
      <Button disabled={busy || !plus || !target} onClick={() => void run(async () => {
        if (!application.current || application.current.templateId !== t.id || application.current.date !== target) { const attempt = crypto.randomUUID(); application.current = { templateId: t.id, date: target, blocks: applyTemplate(t, target, dayBlocks(docs,target), attempt).filter(b => b.id.startsWith(`template:${attempt}:`)) }; }
        for (const b of application.current.blocks) await saveBlock(b);
        application.current = undefined; report('Template applied');
      })}><Copy/>Apply {t.name}</Button>
      <Button className="danger" disabled={busy} aria-label={`Delete template ${t.name}`} onClick={() => void run(() => save(t.id,'template',{},true))}><Trash2/></Button>
    </div></article>)}
    {!templates.length && <p className="empty-copy">No saved templates.</p>}<ErrorText message={error}/>
  </section>;
}
