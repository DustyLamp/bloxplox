'use dom';
import { ThingGraph } from '../../../packages/graph/src/ThingGraph';
import type { ThingGraph as Graph } from '../../../packages/domain/src/graph';
export default function GraphCanvas({ graph, selected, colors, onSelect, onConnect }: { graph: Graph; selected?: string; colors: Record<string, string>; onSelect(id: string): Promise<void>; onConnect(thingId: string, prerequisiteId: string): Promise<void>; dom?: import('expo/dom').DOMProps }) {
  return <><style>{`html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#eeeaf3;font-family:system-ui,sans-serif}.thing-graph-canvas{height:100vh!important;min-height:0!important}`}</style><ThingGraph graph={graph} selected={selected} colors={colors} onSelect={id => void onSelect(id)} onConnect={(thingId, prerequisiteId) => void onConnect(thingId, prerequisiteId)}/></>;
}
