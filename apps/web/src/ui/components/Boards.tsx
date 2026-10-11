import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, X, GripVertical, Link, Repeat, Plus, Minus } from 'lucide-react';
import { blockResultId, completionWithStatus, dayBlocks, dueHabits, entities, formatDuration, formatTime, getCompletion, insertBlock, resultId, thingsInBlock, type Block, type Habit } from '../../../../../packages/domain/src/index';
import { useData, useSettings } from '../../commons/data';
import { useActions } from '../../domain/actions';
import { Swipe } from './Swipe';

export function useCategoryFill() {
  const { docs } = useData(), categories = entities(docs, 'category');
  return (ids: string[]) => {
    const colors = ids.map(id => categories.find(c => c.id === id)?.color ?? '#bfc6fa');
    return colors.length > 1 ? `linear-gradient(120deg,${colors.map((color, i) => `${color} ${i / colors.length * 100}%,${color} ${(i + 1) / colors.length * 100}%`).join(',')})` : colors[0] ?? '#bfc6fa';
  };
}
type Move = { block: Block; x: number; y: number; start: number | null; target: string | null; after: boolean; moved: boolean; originX: number; originY: number };
export function Blocks({ date, edit, add, movePicker, report }: { date: string; edit: (b: Block) => void; add: (start?: number) => void; movePicker: (b: Block) => void; report: (message: string) => void }) {
  const { docs } = useData(), { settings } = useSettings(), actions = useActions(), fill = useCategoryFill();
  const blocks = dayBlocks(docs, date), [small, setSmall] = useState(window.innerWidth < 560), [moving, setMoving] = useState<Move | null>(null);
  const moveRef = useRef<Move | null>(null), board = useRef<HTMLDivElement>(null);
  const [resize, setResize] = useState<{ id: string; x: number; y: number; duration: number; scale: number; next: number; list: boolean } | null>(null);
  const resizing = blocks.find(b => b.id === resize?.id);
  const displayed = resize && resizing ? insertBlock(blocks, { ...resizing, timing: { ...resizing.timing, duration: resize.next } }) ?? blocks : blocks;
  const isList = settings.layout === 'list', period = small ? 120 : 240;
  const start = Math.min(settings.dayStart, ...displayed.map(b => Math.floor(b.timing.start / period) * period));
  const end = Math.min(1440, Math.max(Math.min(start + period * (small ? 4 : 3), 1440), start + Math.ceil((Math.max(start, ...displayed.map(b => b.timing.start + b.timing.duration)) - start) / period) * period));
  useEffect(() => { const fn = () => setSmall(window.innerWidth < 560); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn); }, []);
  const run = (job: Promise<unknown>) => { void job.catch(e => report((e as Error).message)); };
  const beginMove = useCallback((block: Block, x: number, y: number) => { const next: Move = { block, x, y, start: null, target: null, after: false, moved: false, originX: x, originY: y }; moveRef.current = next; setMoving(next); }, []);
  const cancelMove = useCallback(() => { moveRef.current = null; setMoving(null); }, []);
  const updateMove = useCallback((x: number, y: number) => {
    const m = moveRef.current; if (!m) return;
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-block]');
    let target: string | null = null, after = false, targetStart: number | null = null;
    if (hit && hit.dataset.block !== m.block.id) {
      const r = hit.getBoundingClientRect(); after = isList ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
      target = hit.dataset.block!;
      if (target === 'available') { after = false; const minutes = Number(hit.dataset.slotMinutes); targetStart = Number(hit.dataset.slotStart) + (isList ? 0 : Math.min(minutes - 15, Math.max(0, Math.floor((x - r.left) / r.width * minutes / 15) * 15))); }
      else { const b = blocks.find(b => b.id === target); if (b) targetStart = b.timing.start + (after ? b.timing.duration : 0); }
    }
    const next = { ...m, x, y, target, after, start: targetStart, moved: m.moved || Math.hypot(x - m.originX, y - m.originY) > 8 }; moveRef.current = next; setMoving(next);
    if (y > innerHeight - 50) window.scrollBy(0, 12); else if (y < 80) window.scrollBy(0, -12);
  }, [isList, blocks]);
  function drop() { const m = moveRef.current; cancelMove(); if (m?.moved && m.start !== null) run(actions.place({ ...m.block, timing: { ...m.block.timing, start: m.start } })); }
  const segments: { block?: Block; start: number; duration: number }[] = [];
  let at = start;
  for (const b of displayed.filter(b => b.timing.start < 1440)) { if (b.timing.start > at) segments.push({ start: at, duration: b.timing.start - at }); segments.push({ block: b, start: b.timing.start, duration: Math.min(b.timing.duration, 1440 - b.timing.start) }); at = b.timing.start + b.timing.duration; }
  if (at < end) segments.push({ start: at, duration: end - at });
  function renderSegment(segment: typeof segments[number], slotStart: number, length: number, key: string) {
    const b = segment.block, status = b ? getCompletion(docs, blockResultId(b)).status : 'none';
    const target = moving?.target === (b?.id ?? 'available') && (b || moving.start! >= slotStart && moving.start! < slotStart + length);
    const className = `bp2-block ${!b ? 'bp2-free' : ''} ${length <= 45 && !isList ? 'bp2-small' : ''} ${length <= 15 && !isList ? 'bp2-tiny' : ''} ${['done', 'missed'].includes(status) ? `bp2-recorded ${status === 'done' ? 'bp2-isdone' : 'bp2-ismissed'}` : ''} ${moving?.block.id === b?.id ? 'bp2-moving' : ''} ${target ? moving?.after ? 'bp2-drop-after' : 'bp2-drop-before' : ''}`;
    const style = { background: b ? fill(b.categories) : undefined, gridColumn: `span ${length / 15}`, '--bp2-drop-x': `${moving?.start ? (moving.start - slotStart) / length * 100 : 0}%` } as CSSProperties;
    const face = <button type="button" className="bp2-face" onClick={() => b ? edit(b) : add(slotStart)} data-open={b?.id} aria-label={b ? `${formatTime(slotStart)} ${b.name} ${formatDuration(b.timing.duration)}` : `Available ${formatTime(slotStart)} ${formatDuration(length)}`}>
      <span className="bp2-time">{formatTime(slotStart)}{b?.habitId && <span className="bp2-linkicon" aria-label="Linked habit">{b.ruleId ? <Repeat/> : <Link/>}</span>}</span><span className="bp2-name">{b?.name ?? 'Available'}</span>
      {b && <span className="bp2-meta">{formatDuration(resize?.id === b.id ? resize.next : b.timing.duration)}{thingsInBlock(docs, b).length > 0 && <span className="block-things"> · {thingsInBlock(docs, b).filter(t => t.completedOn).length}/{thingsInBlock(docs, b).length} things</span>}</span>}
      {['done', 'missed'].includes(status) && <span className="bp2-completionstamp" role="img" aria-label={status === 'done' ? 'Completed' : 'Not done'}>{status === 'done' ? <Check/> : <X/>}</span>}
    </button>;
    if (!b) return <div key={key} className={className} style={style} data-block="available" data-slot-start={slotStart} data-slot-minutes={length}><div className="bp2-cardclip">{face}</div></div>;
    return <div key={key} className={className} style={style} data-block={b.id} data-slot-start={slotStart} data-slot-minutes={length}>
      <Swipe className="bp2-cardclip" status={status} onStatus={next => run(actions.completeBlock(b, next))} onHold={(x, y) => beginMove(b, x, y)} onMove={updateMove} onDrop={drop} onCancel={cancelMove}>{face}</Swipe>
      <button type="button" className="bp2-movegrip" data-reorder={b.id} aria-label={`Move ${b.name}`} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); beginMove(b, e.clientX, e.clientY); }} onPointerMove={e => { if (moveRef.current) updateMove(e.clientX, e.clientY); }} onPointerUp={() => { if (!moveRef.current?.moved) { cancelMove(); movePicker(b); } else drop(); }} onPointerCancel={cancelMove}
        onKeyDown={e => { const step = ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : ['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : 0; if (!step) return; e.preventDefault(); const target = blocks[blocks.findIndex(x => x.id === b.id) + step]; if (target) run(actions.place({ ...b, timing: { ...b.timing, start: target.timing.start + (step > 0 ? target.timing.duration : 0) } })); }} onClick={e => { if (e.detail === 0) movePicker(b); }}><GripVertical/></button>
      <button type="button" className="bp2-edge" data-resize={b.id} aria-label={`Resize ${b.name}; arrow keys adjust fifteen minutes`}
        onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); const band = e.currentTarget.closest('.bp2-band')?.getBoundingClientRect(); setResize({ id: b.id, x: e.clientX, y: e.clientY, duration: b.timing.duration, next: b.timing.duration, scale: isList ? 2 : (band?.width ?? 960) / period, list: isList }); }}
        onPointerMove={e => { if (resize?.id !== b.id) return; const delta = (resize.list ? e.clientY - resize.y : e.clientX - resize.x) / resize.scale; setResize({ ...resize, next: Math.max(15, Math.min(1440 - b.timing.start, resize.duration + Math.round(delta / 15) * 15)) }); }}
        onPointerUp={() => { if (resize) void actions.place({ ...b, timing: { ...b.timing, duration: resize.next } }).catch(e => report((e as Error).message)).finally(() => setResize(null)); }} onPointerCancel={() => setResize(null)}
        onKeyDown={e => { const delta = ['ArrowLeft', 'ArrowDown'].includes(e.key) ? -15 : ['ArrowRight', 'ArrowUp'].includes(e.key) ? 15 : 0; if (!delta) return; e.preventDefault(); run(actions.place({ ...b, timing: { ...b.timing, duration: Math.max(15, b.timing.duration + delta) } })); }}/>
    </div>;
  }
  return <><div ref={board} data-resizing={!!resize} className={`${isList ? 'bp2-list' : 'bp2-grid'} ${moving ? 'bp2-rearranging' : ''}`}>
    {isList ? segments.map((s, i) => renderSegment(s, s.start, s.duration, `${s.block?.id}-${i}`)) : Array.from({ length: Math.ceil((end - start) / period) }, (_, row) => <div className="bp2-band" data-period={period} key={row} style={{ gridTemplateColumns: `repeat(${period / 15}, minmax(0, 1fr))` }}>{segments.flatMap((s, i) => { const a = Math.max(start + row * period, s.start), z = Math.min(start + (row + 1) * period, s.start + s.duration); return z > a ? [renderSegment(s, a, z - a, `${row}-${i}`)] : []; })}</div>)}
  </div>{moving && <div className="bp2-dragpreview" style={{ position: 'fixed', left: moving.x - 90, top: moving.y - 55, width: 180, height: 110, background: fill(moving.block.categories) }}><div className="bp2-face"><span className="bp2-time">{formatTime(moving.start ?? moving.block.timing.start)}</span><span className="bp2-name">{moving.block.name}</span></div></div>}
    {blocks.some(b => b.timing.start + b.timing.duration > 1440) && <div className="overflow-blocks"><p>These blocks need another time.</p>{blocks.filter(b => b.timing.start + b.timing.duration > 1440).map(b => <button key={b.id} onClick={() => edit({ ...b, timing: { ...b.timing, start: Math.min(b.timing.start, 1440 - b.timing.duration) } })}>{b.name} · Move or add to backlog</button>)}</div>}
    <button type="button" className="bp2-fab" aria-label="Add a block" onClick={() => add()}><Plus/></button></>;
}

export function Tracker({ date, menu, value, add, report }: { date: string; menu: (h: Habit) => void; value: (h: Habit) => void; add: () => void; report: (message: string) => void }) {
  const { docs } = useData(), { settings } = useSettings(), { complete } = useActions();
  const blocks = dayBlocks(docs, date);
  return <section className="rt-surface" aria-label="Daily habit tracker"><div className={`rt-items ${settings.layout === 'grid' ? 'rt-grid' : ''}`}>
    {dueHabits(docs, date).map(h => {
      const result = getCompletion(docs, resultId(h.id, date)), planned = blocks.find(b => b.habitId === h.id);
      return <Swipe key={h.id} className={`rt-row rt-${result.status}`} data-habitrow={h.id} status={result.status} onStatus={status => { void complete(h.id, date, completionWithStatus(result, status)).catch(e => report((e as Error).message)); }}>
        <div className="rt-cardfront"><button type="button" className="rt-rowbody" onClick={() => menu(h)}><span className="rt-title">{h.name}</span>{h.description && <span className="rt-target">{h.description}</span>}{h.type === 'value' && <span className="rt-target">At least {h.target} {h.unit}</span>}{planned && <span className="bp2-linked">{planned.ruleId ? <Repeat/> : <Link/>}{formatTime(planned.timing.start)}</span>}</button><button type="button" className="rt-value" aria-label={`${h.type === 'value' ? 'Set' : 'Toggle'} result for ${h.name}`} onClick={() => h.type === 'value' ? value(h) : void complete(h.id, date, { ...result, status: result.status === 'done' ? 'none' : 'done' }).catch(e => report((e as Error).message))}>{h.type === 'value' ? result.value : result.status === 'missed' ? <X/> : result.status === 'skip' ? <Minus/> : <Check/>}</button></div>
      </Swipe>;
    })}
  </div><button type="button" className="rt-add" onClick={add}><Plus/>Add habit</button></section>;
}
