import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  latestRevision,
  type ProjectSnapshot,
  type ProjectChange,
  type Scope,
} from '../../../shared/model';
import { STAGES } from '../../../domain/workflow/default-template';
const symbols = ['◈', '◎', '✎', '▤', '▦', '♙', '▧', '▷', '♫', '✂', '文', '✓', '↗', '▥'];
function StepCard({ data }: NodeProps<Node<any>>) {
  return (
    <div
      className={'flow-card ' + (data.selected ? 'selected' : '')}
      style={{ '--accent': data.color } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} />
      <div className="card-top">
        <span className="node-symbol">{data.symbol}</span>
        <span className="step-no">STEP {data.number}</span>
        <span className={'status-dot ' + data.status} />
      </div>
      <h3>{data.title}</h3>
      <p>{data.description}</p>
      <div className="card-bottom">
        <span>
          {data.status === 'approved'
            ? '已通過'
            : data.status === 'stale'
              ? '來源已更新'
              : data.status === 'draft'
                ? '編輯中'
                : '尚未開始'}
        </span>
        <span>↗</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
function ActCard({ data }: NodeProps<Node<any>>) {
  return (
    <button
      className="act-card"
      style={{ '--accent': data.color } as React.CSSProperties}
      onClick={data.toggle}
    >
      <span>
        ACT {data.number} <small>{data.english}</small>
      </span>
      <strong>
        {data.title}
        <b>{data.collapsed ? '＋' : '−'}</b>
      </strong>
      <div>{data.count} 個製作步驟</div>
    </button>
  );
}
const nodeTypes = { step: StepCard, act: ActCard };
export function WorkflowCanvas({
  snapshot,
  scope,
  selected,
  onSelect,
  onChange,
}: {
  snapshot: ProjectSnapshot;
  scope: Scope;
  selected: string | null;
  onSelect: (id: string) => void;
  onChange: (c: ProjectChange) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const visible = new Set<string>();
    snapshot.template.acts.forEach((act, a) => {
      const collapsed = snapshot.canvas.collapsedActs.includes(act.id);
      nodes.push({
        id: act.id,
        type: 'act',
        position: { x: a * 288, y: 0 },
        draggable: false,
        data: {
          title: act.title,
          color: act.color,
          number: String(a + 1).padStart(2, '0'),
          english: STAGES[a]?.[1],
          count: act.stepIds.length,
          collapsed,
          toggle: () =>
            onChange({
              type: 'canvas',
              canvas: {
                ...snapshot.canvas,
                collapsedActs: collapsed
                  ? snapshot.canvas.collapsedActs.filter((x) => x !== act.id)
                  : [...snapshot.canvas.collapsedActs, act.id],
              },
            }),
        },
      });
      if (collapsed) return;
      let i = 0;
      for (const id of act.stepIds) {
        const step = snapshot.template.steps.find((s) => s.id === id);
        if (!step || step.archived) continue;
        const rev = latestRevision(snapshot, id, scope);
        const approved =
          rev &&
          !rev.stale &&
          snapshot.reviews.some((r) => r.approved && r.revisionIds.includes(rev.id));
        visible.add(id);
        nodes.push({
          id,
          type: 'step',
          position: snapshot.canvas.positions[id] ?? { x: a * 288, y: 126 + i++ * 194 },
          data: {
            ...step,
            color: act.color,
            selected: id === selected,
            number: step.custom ? '＋' : step.key,
            symbol: symbols[Number(step.key) - 1] ?? '◇',
            status: rev?.stale ? 'stale' : approved ? 'approved' : rev ? 'draft' : 'empty',
          },
        });
      }
    });
    return {
      nodes,
      edges: snapshot.template.edges
        .filter((e) => visible.has(e.from) && visible.has(e.to))
        .map((e, i) => ({
          id: String(i),
          source: e.from,
          target: e.to,
          type: 'smoothstep',
          style: { stroke: '#424750', strokeWidth: 1, strokeDasharray: '4 5' },
        })),
    };
  }, [snapshot, scope, selected]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => {
        if (n.type === 'step') onSelect(n.id);
      }}
      onNodeDragStop={(_, n) =>
        onChange({
          type: 'canvas',
          canvas: {
            ...snapshot.canvas,
            positions: { ...snapshot.canvas.positions, [n.id]: n.position },
          },
        })
      }
      onMoveEnd={(_, viewport) =>
        onChange({ type: 'canvas', canvas: { ...snapshot.canvas, viewport } })
      }
      defaultViewport={snapshot.canvas.viewport}
      fitView={
        snapshot.canvas.viewport.zoom === 1 &&
        snapshot.canvas.viewport.x === 0 &&
        snapshot.canvas.viewport.y === 0
      }
      minZoom={0.3}
      maxZoom={1.5}
      nodesConnectable={false}
      colorMode="dark"
    >
      <Background color="#353942" gap={22} size={1} />
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={(n) => (n.type === 'act' ? '#d4b07e' : '#343944')}
        maskColor="rgba(12,14,19,.65)"
      />
    </ReactFlow>
  );
}
