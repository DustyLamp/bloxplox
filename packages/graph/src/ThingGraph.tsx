import { memo, useEffect, useMemo } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { graphPositions, prerequisites, type ThingGraph as Graph } from '../../domain/src/index';
import '@xyflow/react/dist/style.css';
import './graph.css';

type ThingNode = Node<{ name: string; done: boolean; waiting: number; color: string }, 'thing'>;
const Tile = memo(function Tile({ data, selected }: NodeProps<ThingNode>) {
  return <div className={`graph-tile ${selected ? 'selected' : ''} ${data.done ? 'done' : ''}`} style={{ background: data.done ? '#ccebdc' : data.color }}>
    <Handle type="target" position={Position.Left} aria-label="Requires"/>
    <strong>{data.name}</strong><span>{data.done ? 'Done' : data.waiting ? `Waiting on ${data.waiting}` : 'Ready'}</span>
    <Handle type="source" position={Position.Right} aria-label="Required by"/>
  </div>;
});
const nodeTypes = { thing: Tile };
export interface ThingGraphProps {
  graph: Graph; selected?: string; colors?: Record<string, string>;
  onSelect: (id: string) => void; onConnect?: (thingId: string, prerequisiteId: string) => void;
}
function Canvas({ graph, selected, colors = {}, onSelect, onConnect }: ThingGraphProps) {
  const flow = useReactFlow();
  const positions = useMemo(() => graphPositions(graph), [graph]);
  const topology = graph.things.map(t => t.id).sort().join('|') + graph.links.map(l => l.id).sort().join('|');
  useEffect(() => { const timer = setTimeout(() => void flow.fitView({ padding: .2, maxZoom: 1, duration: 200 }), 50); return () => clearTimeout(timer); }, [flow, topology]);
  const nodes: ThingNode[] = graph.things.map(t => ({ id: t.id, type: 'thing', position: positions.get(t.id)!, selected: selected === t.id,
    ariaLabel: `${t.name}, ${t.completedOn ? 'done' : 'open'}`, data: { name: t.name, done: !!t.completedOn, waiting: prerequisites(graph, t.id, true).filter(p => !p.completedOn).length, color: colors[t.categories[0]] ?? '#c4b0f2' } }));
  const edges = graph.links.map(l => ({ id: l.id, source: l.prerequisiteId, target: l.thingId, type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#8b839b' }, style: { stroke: '#8b839b', strokeWidth: 2 }, selectable: false }));
  return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={.15} maxZoom={1.5}
    nodesDraggable={false} nodesConnectable={!!onConnect} connectOnClick={!!onConnect} deleteKeyCode={null}
    onNodeClick={(_, node) => onSelect(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { const node = (event.target as HTMLElement).closest('[data-id]'); if (node?.getAttribute('data-id')) { event.preventDefault(); onSelect(node.getAttribute('data-id')!); } } }} onConnect={connection => onConnect?.(connection.target, connection.source)}
    aria-label="Thing prerequisite graph" panOnDrag zoomOnPinch preventScrolling={false}>
    <Background color="#8b839b" gap={20}/><Controls showInteractive={false}/>
  </ReactFlow>;
}
/** Presentation only: no account, storage, navigation or network dependencies.
 * The same canvas can be bundled locally inside a React Native WebView.
 */
export function ThingGraph(props: ThingGraphProps) {
  return <div className="thing-graph-canvas"><ReactFlowProvider><Canvas {...props}/></ReactFlowProvider></div>;
}
