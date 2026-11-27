import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ChartPayload } from '../lib/chartData';
import {
  FlowchartLayoutNode,
  FlowchartNodeKind,
  layoutFlowchartGraph,
  normalizeFlowchartPayload,
} from '../lib/flowchartEngine';

interface FlowchartViewProps {
  payload: ChartPayload;
  isDark: boolean;
  isFullscreen: boolean;
  onSelectInfo?: (info: string | null) => void;
}

const KIND_LABELS: Record<FlowchartNodeKind, string> = {
  start: 'Điểm bắt đầu',
  end: 'Điểm kết thúc',
  decision: 'Nút quyết định (Rẽ nhánh)',
  process: 'Bước xử lý',
  io: 'Nhập / Xuất dữ liệu',
};

export const FlowchartView: React.FC<FlowchartViewProps> = ({
  payload,
  isDark,
  isFullscreen,
  onSelectInfo,
}) => {
  const normalized = useMemo(() => normalizeFlowchartPayload(payload), [payload]);
  const layout = useMemo(
    () => layoutFlowchartGraph(normalized.nodes, normalized.edges),
    [normalized.nodes, normalized.edges]
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    layout.nodes[0]?.id ?? null
  );
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transform, setTransform] = useState<{ scale: number; x: number; y: number }>({
    scale: 1,
    x: 0,
    y: 0,
  });
  const [isPanning, setIsPanning] = useState(false);
  const panOriginRef = useRef<{ cx: number; cy: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    setSelectedNodeId(layout.nodes[0]?.id ?? null);
    setStepIdx(0);
    setIsPlaying(false);
    setTransform({ scale: 1, x: 0, y: 0 });
  }, [layout]);

  useEffect(() => {
    if (!isPlaying || layout.stepsOrder.length <= 1) return;
    const timer = window.setInterval(() => {
      setStepIdx((prev) => {
        const next = prev + 1;
        if (next >= layout.stepsOrder.length) {
          setIsPlaying(false);
          return prev;
        }
        setSelectedNodeId(layout.stepsOrder[next]);
        return next;
      });
    }, 1050);
    return () => window.clearInterval(timer);
  }, [isPlaying, layout.stepsOrder]);

  const activeNode: FlowchartLayoutNode | null = useMemo(
    () => layout.nodes.find((n) => n.id === selectedNodeId) || layout.nodes[0] || null,
    [layout.nodes, selectedNodeId]
  );

  const relatedEdges = useMemo(() => {
    if (!activeNode) return { incoming: [], outgoing: [] };
    const findLabel = (id: string) => layout.nodes.find((n) => n.id === id)?.label || id;
    return {
      incoming: layout.edges
        .filter((e) => e.to === activeNode.id)
        .map((e) => ({ ...e, peerLabel: findLabel(e.from) })),
      outgoing: layout.edges
        .filter((e) => e.from === activeNode.id)
        .map((e) => ({ ...e, peerLabel: findLabel(e.to) })),
    };
  }, [activeNode, layout.edges, layout.nodes]);

  const selectNode = (node: FlowchartLayoutNode) => {
    setSelectedNodeId(node.id);
    const ord = layout.stepsOrder.indexOf(node.id);
    if (ord !== -1) setStepIdx(ord);
    onSelectInfo?.(`[${KIND_LABELS[node.kind]}] ${node.label} — ${node.description}`);
  };

  const stepPrev = () => {
    setIsPlaying(false);
    const nextIdx = Math.max(0, stepIdx - 1);
    setStepIdx(nextIdx);
    const id = layout.stepsOrder[nextIdx];
    if (id) setSelectedNodeId(id);
  };

  const stepNext = () => {
    setIsPlaying(false);
    const nextIdx = Math.min(Math.max(0, layout.stepsOrder.length - 1), stepIdx + 1);
    setStepIdx(nextIdx);
    const id = layout.stepsOrder[nextIdx];
    if (id) setSelectedNodeId(id);
  };

  const surfaceFill = (kind: FlowchartNodeKind, selected: boolean) => {
    if (selected) {
      return isDark ? '#1e3a8a' : '#dbeafe';
    }
    if (kind === 'start') return isDark ? '#064e3b' : '#ecfdf5';
    if (kind === 'end') return isDark ? '#3f1d2e' : '#fef2f2';
    if (kind === 'decision') return isDark ? '#422006' : '#fffbeb';
    if (kind === 'io') return isDark ? '#164e63' : '#ecfeff';
    return isDark ? '#18181b' : '#ffffff';
  };

  const strokeColor = (kind: FlowchartNodeKind, selected: boolean) => {
    if (selected) return '#3b82f6';
    if (kind === 'start') return '#10b981';
    if (kind === 'end') return '#ef4444';
    if (kind === 'decision') return '#d97706';
    if (kind === 'io') return '#06b6d4';
    return isDark ? '#52525b' : '#94a3b8';
  };

  const textFill = isDark ? '#f4f4f5' : '#0f172a';
  const mutedStroke = isDark ? '#71717a' : '#64748b';

  const splitNodeLines = (label: string, maxChars: number): string[] => {
    const words = label.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length <= maxChars) {
        cur = (cur + ' ' + w).trim();
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  };

  return (
    <div className="space-y-3">
      {/* Walkthrough & Zoom Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={stepPrev}
            disabled={stepIdx <= 0}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border-color text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
            title="Bước trước"
          >
            <ChevronLeft size={12} />
            <span>Trước</span>
          </button>
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border transition-colors ${
              isPlaying
                ? 'border-blue-500 bg-blue-500/10 text-blue-400 font-medium'
                : 'border-border-color text-text-primary hover:bg-tertiary/40'
            }`}
          >
            {isPlaying ? <Pause size={11} /> : <Play size={11} />}
            <span>{isPlaying ? 'Tạm dừng' : 'Chạy luồng'}</span>
          </button>
          <button
            type="button"
            onClick={stepNext}
            disabled={stepIdx >= layout.stepsOrder.length - 1}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border-color text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
            title="Bước tiếp theo"
          >
            <span>Tiếp</span>
            <ChevronRight size={12} />
          </button>
          <span className="ml-1 font-mono tabular-nums text-text-secondary">
            Bước {Math.min(stepIdx + 1, Math.max(1, layout.stepsOrder.length))}/{Math.max(1, layout.stepsOrder.length)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setTransform((t) => ({ ...t, scale: Math.min(2.4, Number((t.scale * 1.15).toFixed(2))) }))
            }
            className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary"
            title="Phóng to"
            aria-label="Phóng to sơ đồ"
          >
            <ZoomIn size={12} />
          </button>
          <button
            type="button"
            onClick={() =>
              setTransform((t) => ({ ...t, scale: Math.max(0.55, Number((t.scale / 1.15).toFixed(2))) }))
            }
            className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary"
            title="Thu nhỏ"
            aria-label="Thu nhỏ sơ đồ"
          >
            <ZoomOut size={12} />
          </button>
          <button
            type="button"
            onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}
            className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary"
            title="Đặt lại khung nhìn"
            aria-label="Đặt lại khung nhìn"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Main Split: Interactive Diagram + Node Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div
          className={`lg:col-span-8 rounded-lg border border-border-color overflow-hidden relative select-none ${
            isDark ? 'bg-zinc-950/70' : 'bg-slate-50/70'
          } ${isFullscreen ? 'h-[calc(100dvh-220px)] min-h-[380px]' : 'h-[360px]'}`}
          onWheel={(e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            setTransform((t) => ({
              ...t,
              scale: Math.max(0.55, Math.min(2.4, Number((t.scale * factor).toFixed(2)))),
            }));
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement)?.closest('[data-node-id]')) return;
            setIsPanning(true);
            panOriginRef.current = { cx: e.clientX, cy: e.clientY, ox: transform.x, oy: transform.y };
          }}
          onPointerMove={(e) => {
            if (!isPanning || !panOriginRef.current) return;
            const dx = e.clientX - panOriginRef.current.cx;
            const dy = e.clientY - panOriginRef.current.cy;
            setTransform((t) => ({
              ...t,
              x: panOriginRef.current!.ox + dx,
              y: panOriginRef.current!.oy + dy,
            }));
          }}
          onPointerUp={() => {
            setIsPanning(false);
            panOriginRef.current = null;
          }}
          onPointerLeave={() => {
            setIsPanning(false);
            panOriginRef.current = null;
          }}
        >
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          >
            <defs>
              <marker
                id="tm-flow-arrow"
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={mutedStroke} />
              </marker>
              <marker
                id="tm-flow-arrow-active"
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#3b82f6" />
              </marker>
            </defs>

            <g
              transform={`translate(${transform.x + layout.width / 2}, ${transform.y + layout.height / 2}) scale(${transform.scale}) translate(${-layout.width / 2}, ${-layout.height / 2})`}
            >
              {/* Directed Edges */}
              {layout.edges.map((edge) => {
                const isRelated =
                  activeNode && (edge.from === activeNode.id || edge.to === activeNode.id);
                return (
                  <g key={edge.id}>
                    <path
                      d={edge.pathD}
                      fill="none"
                      stroke={isRelated ? '#3b82f6' : mutedStroke}
                      strokeWidth={isRelated ? 2 : 1.35}
                      strokeDasharray={edge.isBackEdge ? '5 4' : undefined}
                      markerEnd={isRelated ? 'url(#tm-flow-arrow-active)' : 'url(#tm-flow-arrow)'}
                    />
                    {edge.label && (
                      <text
                        x={edge.labelX}
                        y={edge.labelY}
                        textAnchor="middle"
                        fontSize={10.5}
                        fontWeight={600}
                        fill={isRelated ? '#3b82f6' : mutedStroke}
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Interactive Flowchart Blocks */}
              {layout.nodes.map((node) => {
                const selected = activeNode?.id === node.id;
                const fill = surfaceFill(node.kind, selected);
                const stroke = strokeColor(node.kind, selected);
                const lines = splitNodeLines(node.label, node.kind === 'decision' ? 18 : 24);
                const startY = node.y - ((lines.length - 1) * 13) / 2 + 4;

                return (
                  <g
                    key={node.id}
                    data-node-id={node.id}
                    onClick={() => selectNode(node)}
                    className="cursor-pointer"
                  >
                    {node.kind === 'decision' ? (
                      <polygon
                        points={`${node.x},${node.y - node.height / 2} ${node.x + node.width / 2},${node.y} ${node.x},${node.y + node.height / 2} ${node.x - node.width / 2},${node.y}`}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={selected ? 2.2 : 1.5}
                      />
                    ) : node.kind === 'io' ? (
                      <polygon
                        points={`${node.x - node.width / 2 + 12},${node.y - node.height / 2} ${node.x + node.width / 2},${node.y - node.height / 2} ${node.x + node.width / 2 - 12},${node.y + node.height / 2} ${node.x - node.width / 2},${node.y + node.height / 2}`}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={selected ? 2.2 : 1.5}
                      />
                    ) : (
                      <rect
                        x={node.x - node.width / 2}
                        y={node.y - node.height / 2}
                        width={node.width}
                        height={node.height}
                        rx={node.kind === 'start' || node.kind === 'end' ? node.height / 2 : 8}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={selected ? 2.2 : 1.5}
                      />
                    )}
                    {lines.map((ln, idx) => (
                      <text
                        key={idx}
                        x={node.x}
                        y={startY + idx * 13}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={selected ? 600 : 500}
                        fill={textFill}
                      >
                        {ln}
                      </text>
                    ))}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Click-to-Inspect Block Explanation Panel */}
        <aside className="lg:col-span-4 rounded-lg border border-border-color bg-primary/30 p-3 flex flex-col justify-between gap-3">
          {activeNode ? (
            <div className="space-y-2.5 text-xs">
              <div className="space-y-1 pb-2 border-b border-border-color/70">
                <div className="text-[11px] text-text-secondary">
                  {KIND_LABELS[activeNode.kind]}
                </div>
                <h5 className="text-sm font-semibold text-text-primary leading-snug">
                  {activeNode.label}
                </h5>
              </div>

              <p className="text-xs text-text-primary/90 leading-relaxed">
                {activeNode.description}
              </p>

              {activeNode.codeHint && (
                <pre
                  className={`p-2 rounded border border-border-color text-[11px] font-mono overflow-x-auto ${
                    isDark ? 'bg-zinc-900 text-zinc-200' : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {activeNode.codeHint}
                </pre>
              )}

              {activeNode.complexity && (
                <div className="text-[11px] font-mono tabular-nums text-text-secondary">
                  Độ phức tạp khối: <span className="text-text-primary font-semibold">{activeNode.complexity}</span>
                </div>
              )}

              {(relatedEdges.incoming.length > 0 || relatedEdges.outgoing.length > 0) && (
                <div className="pt-2 border-t border-border-color/70 space-y-1.5 text-[11px]">
                  {relatedEdges.incoming.length > 0 && (
                    <div>
                      <span className="text-text-secondary">Nhận luồng từ: </span>
                      <span className="text-text-primary">
                        {relatedEdges.incoming
                          .map((e) => (e.label ? `${e.peerLabel} (${e.label})` : e.peerLabel))
                          .join(', ')}
                      </span>
                    </div>
                  )}
                  {relatedEdges.outgoing.length > 0 && (
                    <div>
                      <span className="text-text-secondary">Chuyển tiếp sang: </span>
                      <span className="text-text-primary">
                        {relatedEdges.outgoing
                          .map((e) => (e.label ? `[${e.label}] → ${e.peerLabel}` : e.peerLabel))
                          .join(' · ')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-text-secondary">
              Nhấn vào bất kỳ khối nào trên sơ đồ để xem giải thích chi tiết.
            </div>
          )}

          <div className="pt-2 border-t border-border-color/70 text-[10px] text-text-secondary">
            Mẹo: Nhấn từng khối hoặc dùng nút Trước / Tiếp để theo dõi luồng xử lý.
          </div>
        </aside>
      </div>
    </div>
  );
};
