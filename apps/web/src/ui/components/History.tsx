import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { completionStats, formatDate, shiftDate, weekday, weekdayNames } from '../../../../../packages/domain/src/index';
import { useData } from '../../commons/data';

export function History({ date, onDate, manage }: { date: string; onDate: (date: string) => void; manage?: () => void }) {
  const { docs } = useData(), nav = useRef<HTMLElement>(null), extending = useRef(false);
  const [range, setRange] = useState({ from: shiftDate(date, -45), count: 91 });
  const pendingShift = useRef(0), selected = completionStats(docs, date);
  const needsCenter = useRef(true);
  const dragging = useRef<{ x: number; scroll: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useLayoutEffect(() => {
    const el = nav.current!;
    if (pendingShift.current) { el.scrollLeft += pendingShift.current; pendingShift.current = 0; }
    extending.current = false;
  }, [range]);
  useLayoutEffect(() => {
    if (!needsCenter.current) return;
    const el = nav.current!, item = el.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (!item) { setRange({ from: shiftDate(date, -45), count: 91 }); return; }
    el.scrollLeft = item.offsetLeft - el.offsetLeft - (el.clientWidth - item.clientWidth) / 2;
    needsCenter.current = false;
  }, [date, range]);
  const priorDate = useRef(date);
  if (priorDate.current !== date) { priorDate.current = date; needsCenter.current = true; }
  function extend() {
    const el = nav.current;
    if (!el || extending.current || !el.firstElementChild) return;
    const width = el.firstElementChild.getBoundingClientRect().width;
    if (el.scrollLeft < width * 8) {
      extending.current = true; pendingShift.current = width * 30;
      if (dragging.current) dragging.current.scroll += width * 30;
      setRange(r => ({ from: shiftDate(r.from, -30), count: Math.min(151, r.count + 30) }));
    } else if (el.scrollWidth - el.clientWidth - el.scrollLeft < width * 8) {
      extending.current = true;
      const remove = Math.max(0, range.count + 30 - 151);
      pendingShift.current = -remove * width;
      if (dragging.current) dragging.current.scroll -= remove * width;
      setRange(r => ({ from: shiftDate(r.from, remove), count: Math.min(151, r.count + 30) }));
    }
  }
  return <div className="bp2-historywrap"><nav ref={nav} className="rt-history" aria-label="Combined Blocks and Tracker history" onScroll={extend}
    onWheel={e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}
    onPointerDown={e => { if (e.pointerType === 'mouse') dragging.current = { x: e.clientX, scroll: e.currentTarget.scrollLeft, moved: false }; }}
    onPointerMove={e => { const drag = dragging.current; if (!drag || Math.abs(e.clientX - drag.x) < 5 && !drag.moved) return; drag.moved = true; suppressClick.current = true; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.scrollLeft = drag.scroll - (e.clientX - drag.x); }}
    onPointerUp={() => { dragging.current = null; setTimeout(() => { suppressClick.current = false; }, 80); }} onPointerCancel={() => { dragging.current = null; }}>
    {Array.from({ length: range.count }, (_, i) => {
      const day = shiftDate(range.from, i), stats = completionStats(docs, day), percent = stats.total ? stats.done / stats.total * 100 : 0;
      return <button type="button" key={day} data-date={day} className="rt-day" aria-pressed={day === date} aria-label={`${formatDate(day)}, ${stats.done} of ${stats.total} completed`}
        style={{ '--rt-progress': `${percent}%`, '--rt-date-ink': percent >= 39 ? '#173e2e' : '#fafaff', '--rt-week-ink': percent >= 89 ? '#173e2e' : '#fafaff' } as CSSProperties}
        onClick={() => { if (!suppressClick.current) onDate(day); }}><span className="rt-dayweek">{weekdayNames[weekday(day)].slice(0, 3)}</span><span>{new Date(`${day}T12:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span></button>;
    })}
  </nav><div className="rt-progress" aria-label={`Blocks and habits: ${selected.done} of ${selected.total} completed`} style={{ '--rt-done': `${selected.total ? selected.done / selected.total * 100 : 0}%` } as CSSProperties}><span>{selected.done} / {selected.total} done</span>{manage && <button type="button" onClick={manage}>Manage</button>}</div></div>;
}
