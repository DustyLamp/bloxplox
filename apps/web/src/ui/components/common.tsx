import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { X, ChevronDown } from 'lucide-react';

export function Button({ children, primary, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" {...props} className={`bp2-button ${primary ? 'bp2-primary' : ''} ${props.className || ''}`}>{children}</button>;
}
export function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" {...props} aria-label={label} className={`bp2-iconbutton ${props.className || ''}`}>{children}</button>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="bp2-field"><span>{label}</span>{children}</label>; }
export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className="bp2-selectwrap"><select {...props}>{children}</select><ChevronDown className="bp2-selectcaret" size={16}/></span>;
}
export function Dialog({ title, onClose, children, tracker = false }: { title: string; onClose: () => void; children: ReactNode; tracker?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className={`bp2-native bp2-dialog ${tracker ? 'rt-dialog' : ''}`} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }} aria-label={title}>
    <div className="bp2-dialoghead"><h2>{title}</h2><IconButton label="Close" onClick={onClose}><X/></IconButton></div>{children}
  </dialog>;
}
export function Logo() { return <span className="brand-lockup"><img src="/logo.svg" alt="" width="28" height="28"/><span>BloxPlox</span></span>; }
export function ErrorText({ message }: { message: string }) { return message ? <p className="bp2-error" role="alert">{message}</p> : null; }
export function DebossFilter() { return <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none' }}><defs><filter id="bp2-check-deboss" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB"><feOffset in="SourceAlpha" dx="0" dy="0.95" result="lower"/><feComposite in="SourceAlpha" in2="lower" operator="out" result="upper-edge"/><feGaussianBlur in="upper-edge" stdDeviation="0.3" result="soft-upper"/><feFlood floodColor="#19241f" floodOpacity="0.86" result="shade"/><feComposite in="shade" in2="soft-upper" operator="in" result="inner-shade"/><feOffset in="SourceAlpha" dx="0" dy="-0.55" result="upper"/><feComposite in="upper" in2="SourceAlpha" operator="out" result="lower-edge"/><feGaussianBlur in="lower-edge" stdDeviation="0.2" result="soft-lower"/><feFlood floodColor="#ffffff" floodOpacity="0.45" result="light"/><feComposite in="light" in2="soft-lower" operator="in" result="inner-light"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="inner-shade"/><feMergeNode in="inner-light"/></feMerge></filter></defs></svg>; }
