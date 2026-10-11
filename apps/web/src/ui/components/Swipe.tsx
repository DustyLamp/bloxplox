import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, X, BrushCleaning } from 'lucide-react';
import { swipeStatus, type Completion } from '../../../../../packages/domain/src/index';

export function Swipe({ status, children, className = '', onStatus, onHold, onMove, onDrop, onCancel, style, ...attributes }: {
  status: Completion['status']; children: ReactNode; className?: string; style?: CSSProperties;
  onStatus: (status: Completion['status']) => void; onHold?: (x: number, y: number) => void;
  onMove?: (x: number, y: number) => void; onDrop?: () => void; onCancel?: () => void;
  'data-block'?: string; 'data-habitrow'?: string; 'data-slot-start'?: number; 'data-slot-minutes'?: number;
}) {
  const [dx, setDx] = useState(0), [settling, setSettling] = useState(false);
  const ref = useRef<HTMLDivElement>(null), suppress = useRef(false);
  const gesture = useRef<{ x: number; y: number; mode: 'pending' | 'swipe' | 'move'; timer?: ReturnType<typeof setTimeout>; pointer: number } | null>(null);
  const target = swipeStatus(status, dx >= 0 ? 'right' : 'left');
  const Icon = target === 'done' ? Check : target === 'missed' ? X : BrushCleaning;
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape') { clearTimeout(gesture.current?.timer); gesture.current = null; setDx(0); suppress.current = true; onCancel?.(); setTimeout(() => { suppress.current = false; }, 100); } };
    const touch = (e: TouchEvent) => { if (gesture.current?.mode === 'move') { e.preventDefault(); if (e.touches[0]) onMove?.(e.touches[0].clientX, e.touches[0].clientY); } };
    document.addEventListener('keydown', cancel); const el = ref.current!; el.addEventListener('touchmove', touch, { passive: false });
    return () => { document.removeEventListener('keydown', cancel); el.removeEventListener('touchmove', touch); clearTimeout(gesture.current?.timer); };
  }, [onCancel, onMove]);
  const width = ref.current?.getBoundingClientRect().width ?? 100;
  return <div ref={ref} {...attributes} className={`${className} ${dx ? 'bp2-swiping' : ''} ${settling ? 'bp2-swipe-settling' : ''}`} data-swipe={target} data-swipe-side={dx >= 0 ? 'right' : 'left'}
    style={{ ...style, '--bp2-swipe-x': `${dx}px`, '--bp2-swipe-icon': `${Math.min(52, Math.max(25, width * .15))}px`, '--bp2-swipe-inset': `${Math.min(23, Math.max(9, width * .075))}px` } as CSSProperties}
    onClickCapture={e => { if (suppress.current || settling) { e.preventDefault(); e.stopPropagation(); } }}
    onContextMenu={e => { if (gesture.current?.mode === 'move') e.preventDefault(); }}
    onPointerDown={e => {
      if (e.button !== 0 || settling || (e.target as HTMLElement).closest('[data-resize],[data-reorder]')) return;
      const next = { x: e.clientX, y: e.clientY, mode: 'pending' as const, pointer: e.pointerId } as NonNullable<typeof gesture.current>;
      if (onHold) next.timer = setTimeout(() => { if (gesture.current !== next) return; next.mode = 'move'; suppress.current = true; ref.current?.setPointerCapture(next.pointer); onHold(next.x, next.y); }, 350);
      gesture.current = next;
    }}
    onPointerMove={e => {
      const g = gesture.current; if (!g) return;
      const x = e.clientX - g.x, y = e.clientY - g.y;
      if (g.mode === 'move') { e.preventDefault(); onMove?.(e.clientX, e.clientY); return; }
      if (Math.hypot(x, y) < 8 && g.mode === 'pending') return;
      clearTimeout(g.timer);
      if (g.mode === 'pending' && Math.abs(y) > Math.abs(x)) { gesture.current = null; return; }
      g.mode = 'swipe'; suppress.current = true; e.currentTarget.setPointerCapture(e.pointerId); setDx(Math.sign(x) * Math.min(Math.abs(x), width));
    }}
    onPointerUp={e => {
      const g = gesture.current; if (!g) return; clearTimeout(g.timer); gesture.current = null;
      if (g.mode === 'move') { onDrop?.(); setTimeout(() => { suppress.current = false; }, 100); return; }
      if (g.mode !== 'swipe') return;
      const delta = e.clientX - g.x, commit = Math.abs(delta) >= Math.min(100, Math.max(32, width * .4));
      setSettling(true); setDx(commit ? Math.sign(delta) * width : 0);
      setTimeout(() => { if (commit) onStatus(swipeStatus(status, delta > 0 ? 'right' : 'left')); setDx(0); setSettling(false); suppress.current = false; }, matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 175);
    }} onPointerCancel={() => { clearTimeout(gesture.current?.timer); gesture.current = null; setDx(0); suppress.current = false; onCancel?.(); }}>
    <div className="bp2-swipe-underlay" aria-hidden="true"><span className="bp2-swipe-symbol"><Icon/></span></div>{children}
  </div>;
}
