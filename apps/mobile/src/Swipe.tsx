import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { swipeStatus, type Completion } from '../../../packages/domain/src/index';
import { Txt } from './ui';
export function Swipe({ status, color, children, onStatus, hold, move, drop, cancel, radius = 17 }: { radius?: number; status: Completion['status']; color: string; children: ReactNode; onStatus(status: Completion['status']): void; hold?(): void; move?(x: number, y: number): void; drop?(): void; cancel?(): void }) {
  const x = useRef(new Animated.Value(0)).current, [dx, setDx] = useState(0), [width, setWidth] = useState(300);
  const refs = useRef({ status, onStatus, hold, move, drop, cancel, width }); refs.current = { status, onStatus, hold, move, drop, cancel, width };
  const gesture = useRef({ active: false, held: false, startX: 0, startY: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined });
  const target = swipeStatus(status, dx >= 0 ? 'right' : 'left');
  const reset = () => { clearTimeout(gesture.current.timer); gesture.current.held = false; gesture.current.active = false; x.setValue(0); setDx(0); };
  useEffect(() => () => { clearTimeout(gesture.current.timer); x.stopAnimation(); }, []);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => { if (!gesture.current.held && Math.hypot(g.dx, g.dy) > 6) clearTimeout(gesture.current.timer); return gesture.current.held || Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.25; },
    onPanResponderGrant: () => { gesture.current.active = true; if (!gesture.current.held) clearTimeout(gesture.current.timer); },
    onPanResponderMove: (_, g) => { if (gesture.current.held) refs.current.move?.(g.moveX, g.moveY); else { const offset = Math.sign(g.dx) * Math.min(refs.current.width, Math.abs(g.dx)); x.setValue(offset); setDx(offset); } },
    onPanResponderRelease: (_, g) => {
      if (gesture.current.held) { refs.current.drop?.(); reset(); return; }
      const commit = Math.abs(g.dx) >= Math.min(100, Math.max(32, refs.current.width * .4));
      Animated.timing(x, { toValue: commit ? Math.sign(g.dx) * refs.current.width : 0, duration: 160, useNativeDriver: true }).start(() => { if (commit) refs.current.onStatus(swipeStatus(refs.current.status, g.dx > 0 ? 'right' : 'left')); reset(); });
    },
    onPanResponderTerminationRequest: () => !gesture.current.held,
    onPanResponderTerminate: () => { refs.current.cancel?.(); reset(); },
  }), []);
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} onTouchStart={event => { clearTimeout(gesture.current.timer); gesture.current.startX = event.nativeEvent.pageX; gesture.current.startY = event.nativeEvent.pageY; if (refs.current.hold) gesture.current.timer = setTimeout(() => { gesture.current.held = true; refs.current.hold?.(); }, 350); }} onTouchMove={event => { if (!gesture.current.held && Math.hypot(event.nativeEvent.pageX - gesture.current.startX, event.nativeEvent.pageY - gesture.current.startY) > 6) clearTimeout(gesture.current.timer); }} onTouchEnd={() => { clearTimeout(gesture.current.timer); if (!gesture.current.active && gesture.current.held) { refs.current.drop?.(); reset(); } }} onTouchCancel={() => { if (!gesture.current.active) { refs.current.cancel?.(); reset(); } }} {...responder.panHandlers} style={{ overflow: 'hidden', borderRadius: radius, backgroundColor: target === 'done' ? '#3ca779' : target === 'missed' ? '#d35673' : '#a09aa7' }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: dx >= 0 ? 'flex-start' : 'flex-end', justifyContent: 'center', paddingHorizontal: 20 }}>{target === 'none' ? <Svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8}><Path d="m15 3-4 9m-2-1 7 3-3 7H3l3-8 3-2Zm-3 7 2-5m2 7 2-5"/></Svg> : <Txt style={{ color: '#fff', fontSize: 36, fontFamily: 'PoppinsBold', textShadowColor: '#0004', textShadowOffset: { width: 0, height: -1 }, textShadowRadius: 1 }}>{target === 'done' ? '✓' : '×'}</Txt>}</View>
    <Animated.View style={{ backgroundColor: color, borderRadius: dx ? 0 : radius, transform: [{ translateX: x }] }}>{children}</Animated.View>
  </View>;
}
export function Resize({ duration, commit, axis, scale, maximum = 1440, moving }: { duration: number; commit(minutes: number): void; axis: 'x' | 'y'; scale: number; maximum?: number; moving(value: boolean): void }) {
  const [preview, setPreview] = useState<number>(), latest = useRef({ duration, commit, axis, scale, maximum, moving }); latest.current = { duration, commit, axis, scale, maximum, moving };
  const next = (dx: number, dy: number) => Math.max(15, Math.min(latest.current.maximum, latest.current.duration + Math.round((latest.current.axis === 'x' ? dx : dy) / latest.current.scale / 15) * 15));
  const pan = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => true, onPanResponderGrant: () => latest.current.moving(true), onPanResponderMove: (_, g) => setPreview(next(g.dx, g.dy)), onPanResponderRelease: (_, g) => { latest.current.commit(next(g.dx, g.dy)); latest.current.moving(false); setPreview(undefined); }, onPanResponderTerminate: () => { latest.current.moving(false); setPreview(undefined); } }), []);
  return <View {...pan.panHandlers} accessibilityLabel="Resize block" accessibilityRole="adjustable" accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={event => commit(Math.max(15, Math.min(maximum, duration + (event.nativeEvent.actionName === 'increment' ? 15 : -15))))} style={axis === 'x' ? { position: 'absolute', right: -4, width: 20, top: 12, bottom: 12, justifyContent: 'center', alignItems: 'center' } : { position: 'absolute', left: 12, right: 12, bottom: -4, height: 20, justifyContent: 'center', alignItems: 'center' }}><View style={{ width: axis === 'x' ? 4 : 36, height: axis === 'x' ? 32 : 4, borderRadius: 4, backgroundColor: '#51465866' }}/>{preview !== undefined && <View pointerEvents="none" style={{ position: 'absolute', right: 12, top: -8, padding: 5, borderRadius: 5, backgroundColor: '#fff', minWidth: 65 }}><Txt small>{preview} min</Txt></View>}</View>;
}
