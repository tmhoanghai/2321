import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { AlgorithmStep, AlgorithmTraceResult, buildAlgorithmTrace } from '../lib/algorithmVisualizer';

interface AlgorithmTraceViewProps {
  payload: any;
  isDark: boolean;
  isFullscreen?: boolean;
  onSelectInfo?: (info: string) => void;
}

const GraphStageSvg: React.FC<{
  trace: AlgorithmTraceResult;
  step: AlgorithmStep;
  mode: 'primary' | 'secondary';
  titleBadge?: string;
  isDark: boolean;
  onSelectInfo?: (info: string) => void;
}> = ({ trace, step, mode, titleBadge, isDark, onSelectInfo }) => {
  const W = 600;
  const H = 290;
  const nodeMap = useMemo(() => new Map(trace.nodes.map((n) => [n.id, n])), [trace.nodes]);

  const activeNode = mode === 'primary' ? step.activeNode : step.secondaryActiveNode;
  const visited = mode === 'primary' ? step.visited : step.secondaryVisited || [];
  const frontier = mode === 'primary' ? step.frontier : step.secondaryFrontier || [];
  const treeEdges = mode === 'primary' ? step.treeEdges : step.secondaryTreeEdges || [];

  const visitedSet = new Set(visited);
  const frontierSet = new Set(frontier.map((f) => f.split(':')[0]));
  const treeEdgeSet = new Set(treeEdges.map(([u, v]) => `${u}->${v}`));

  const edgeBaseStroke = isDark ? 'rgba(148,163,184,0.28)' : 'rgba(71,85,105,0.25)';
  const treeEdgeStroke = mode === 'primary' ? '#2563eb' : '#059669';
  const activeStroke = '#f59e0b';
  const surfaceBg = isDark ? '#09090b' : '#ffffff';
  const labelColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const markerId = `algo-arrow-${mode}`;

  return (
    <div className="space-y-1.5">
      {titleBadge && (
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="font-semibold text-text-primary">{titleBadge}</span>
          <span className="text-text-secondary">
            {visited.length > 0 ? visited.join(' → ') : 'Chờ duyệt'}
          </span>
        </div>
      )}
      <div
        className={`rounded-lg border overflow-hidden ${
          isDark ? 'border-zinc-800 bg-zinc-950' : 'border-slate-200 bg-white'
        }`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          {trace.directed && (
            <defs>
              <marker id={markerId} viewBox="0 -5 10 10" refX={24} refY={0} markerWidth={6} markerHeight={6} orient="auto">
                <path d="M0,-5L10,0L0,5" fill={mutedColor} />
              </marker>
            </defs>
          )}

          {/* Edges */}
          {trace.edges.map((e, idx) => {
            const s = nodeMap.get(e.source);
            const t = nodeMap.get(e.target);
            if (!s || !t) return null;
            const isActiveEdge =
              step.activeEdge &&
              ((step.activeEdge[0] === e.source && step.activeEdge[1] === e.target) ||
                (!trace.directed && step.activeEdge[0] === e.target && step.activeEdge[1] === e.source));
            const isTreeEdge =
              treeEdgeSet.has(`${e.source}->${e.target}`) ||
              (!trace.directed && treeEdgeSet.has(`${e.target}->${e.source}`));

            const mx = (s.x + t.x) / 2;
            const my = (s.y + t.y) / 2;
            return (
              <g key={`edge-${idx}`}>
                <line
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={isActiveEdge ? activeStroke : isTreeEdge ? treeEdgeStroke : edgeBaseStroke}
                  strokeWidth={isActiveEdge ? 2.8 : isTreeEdge ? 2.2 : 1.4}
                  markerEnd={trace.directed ? `url(#${markerId})` : undefined}
                />
                {e.weight !== undefined && (
                  <g>
                    <rect
                      x={mx - 10}
                      y={my - 8}
                      width={20}
                      height={15}
                      rx={3}
                      fill={surfaceBg}
                      stroke={edgeBaseStroke}
                      strokeWidth={0.8}
                    />
                    <text
                      x={mx}
                      y={my + 3}
                      textAnchor="middle"
                      fontSize={9.5}
                      fontWeight={600}
                      fontFamily="monospace"
                      fill={mutedColor}
                    >
                      {e.weight}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {trace.nodes.map((n) => {
            const isActive = activeNode === n.id;
            const visitIdx = visited.indexOf(n.id);
            const isVisited = visitedSet.has(n.id);
            const isFrontier = frontierSet.has(n.id);
            const distVal = step.distances?.[n.id];

            const fill = isActive
              ? '#f59e0b'
              : isVisited
              ? mode === 'primary'
                ? '#2563eb'
                : '#059669'
              : isFrontier
              ? isDark
                ? '#1e293b'
                : '#dbeafe'
              : isDark
              ? '#18181b'
              : '#f8fafc';

            const stroke = isActive
              ? '#fbbf24'
              : isVisited
              ? mode === 'primary'
                ? '#60a5fa'
                : '#34d399'
              : isFrontier
              ? '#38bdf8'
              : isDark
              ? '#3f3f46'
              : '#cbd5e1';

            const txtFill = isActive || isVisited ? '#ffffff' : labelColor;

            return (
              <g
                key={n.id}
                className="cursor-pointer"
                onClick={() =>
                  onSelectInfo?.(
                    `Đỉnh ${n.label}${visitIdx >= 0 ? ` · Thứ tự thăm #${visitIdx + 1}` : ''}${
                      distVal !== undefined && Number.isFinite(distVal) ? ` · dist = ${distVal}` : ''
                    }`
                  )
                }
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={18}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isActive || isFrontier ? 2.4 : 1.6}
                />
                <text
                  x={n.x}
                  y={n.y + 4}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={700}
                  fontFamily="monospace"
                  fill={txtFill}
                >
                  {n.label}
                </text>
                {visitIdx >= 0 && (
                  <g>
                    <circle
                      cx={n.x + 14}
                      cy={n.y - 14}
                      r={7.5}
                      fill={isDark ? '#09090b' : '#ffffff'}
                      stroke={stroke}
                      strokeWidth={1.2}
                    />
                    <text
                      x={n.x + 14}
                      y={n.y - 11}
                      textAnchor="middle"
                      fontSize={8.5}
                      fontWeight={700}
                      fontFamily="monospace"
                      fill={labelColor}
                    >
                      {visitIdx + 1}
                    </text>
                  </g>
                )}
                {distVal !== undefined && (
                  <text
                    x={n.x}
                    y={n.y + 30}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontFamily="monospace"
                    fill={Number.isFinite(distVal) ? (isDark ? '#7dd3fc' : '#1d4ed8') : mutedColor}
                  >
                    d={Number.isFinite(distVal) ? distVal : '∞'}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export const AlgorithmTraceView: React.FC<AlgorithmTraceViewProps> = ({
  payload,
  isDark,
  onSelectInfo,
}) => {
  const [algoOverride, setAlgoOverride] = useState<'bfs' | 'dfs' | 'bfs_vs_dfs' | null>(null);
  const [speedMultiplier, setSpeedMultiplier] = useState<0.5 | 1 | 2>(1);

  useEffect(() => {
    setAlgoOverride(null);
  }, [payload]);

  const effectivePayload = useMemo(
    () => (algoOverride ? { ...payload, algorithm: algoOverride } : payload),
    [payload, algoOverride]
  );

  const trace = useMemo(() => buildAlgorithmTrace(effectivePayload), [effectivePayload]);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setStepIdx(0);
    setPlaying(false);
  }, [trace]);

  useEffect(() => {
    if (!playing) return;
    const intervalMs = speedMultiplier === 2 ? 420 : speedMultiplier === 0.5 ? 1550 : 900;
    const timer = window.setInterval(() => {
      setStepIdx((prev) => {
        if (prev >= trace.steps.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [playing, speedMultiplier, trace.steps.length]);

  const currentStep = trace.steps[Math.min(stepIdx, Math.max(0, trace.steps.length - 1))];
  if (!currentStep) return null;

  const isArrayAlgo = trace.kind === 'binary_search' || trace.kind === 'two_pointers';
  const canSwitchGraphAlgo =
    trace.kind === 'bfs' || trace.kind === 'dfs' || trace.kind === 'bfs_vs_dfs';

  return (
    <div className="space-y-2.5">
      {/* Minimalist Playback & Step Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (stepIdx >= trace.steps.length - 1) setStepIdx(0);
              setPlaying((p) => !p);
            }}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] transition-colors ${
              playing
                ? 'border-blue-500/60 bg-blue-500/10 text-text-primary'
                : 'border-border-color text-text-secondary hover:text-text-primary'
            }`}
          >
            {playing ? <Pause size={11} /> : <Play size={11} />}
            <span>{playing ? 'Tạm dừng' : 'Chạy'}</span>
          </button>
          <button
            type="button"
            disabled={stepIdx <= 0}
            onClick={() => {
              setPlaying(false);
              setStepIdx((s) => Math.max(0, s - 1));
            }}
            className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary disabled:opacity-35"
            title="Bước trước"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            type="button"
            disabled={stepIdx >= trace.steps.length - 1}
            onClick={() => {
              setPlaying(false);
              setStepIdx((s) => Math.min(trace.steps.length - 1, s + 1));
            }}
            className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary disabled:opacity-35"
            title="Bước tiếp"
          >
            <ChevronRight size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setStepIdx(0);
            }}
            className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary"
            title="Đặt lại bước 0"
          >
            <RotateCcw size={12} />
          </button>
          <span className="ml-1.5 font-mono tabular-nums text-text-secondary">
            Bước {stepIdx + 1}/{trace.steps.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canSwitchGraphAlgo && (
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'bfs', label: 'BFS' },
                  { id: 'dfs', label: 'DFS' },
                  { id: 'bfs_vs_dfs', label: 'So sánh' },
                ] as const
              ).map((mOpt) => (
                <button
                  key={mOpt.id}
                  type="button"
                  onClick={() => setAlgoOverride(mOpt.id)}
                  className={`px-2 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                    trace.kind === mOpt.id
                      ? 'border-blue-500/70 bg-blue-500/15 text-text-primary font-semibold'
                      : 'border-border-color text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {mOpt.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-0.5">
            {([0.5, 1, 2] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setSpeedMultiplier(spd)}
                className={`px-1.5 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                  speedMultiplier === spd
                    ? 'border-blue-500/70 bg-blue-500/15 text-text-primary font-semibold'
                    : 'border-border-color text-text-secondary hover:text-text-primary'
                }`}
                title={`Tốc độ phát ${spd}x`}
              >
                {spd}×
              </button>
            ))}
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, trace.steps.length - 1)}
            value={stepIdx}
            onChange={(e) => {
              setPlaying(false);
              setStepIdx(Number(e.target.value));
            }}
            className="w-24 sm:w-36 accent-blue-500"
            aria-label="Thanh trượt bước thuật toán"
          />
        </div>
      </div>

      {/* Visual Canvas: Array vs Graph vs Dual BFS+DFS */}
      {isArrayAlgo && trace.array ? (
        <div
          className={`p-3.5 rounded-lg border overflow-x-auto ${
            isDark ? 'border-zinc-800 bg-zinc-950' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-3 text-[11px] font-mono">
            <span className="text-text-secondary">
              Mảng đã sắp xếp ({trace.array.length} phần tử)
            </span>
            {trace.targetValue !== undefined && (
              <span className="px-2 py-0.5 rounded border border-border-color text-text-primary font-semibold">
                target = {trace.targetValue}
              </span>
            )}
          </div>

          <div className="flex items-stretch gap-1.5 min-w-max pb-1">
            {trace.array.map((val, idx) => {
              const ptrs = currentStep.arrayPointers || {};
              const isMid = ptrs.mid === idx;
              const isFound = ptrs.foundIdx === idx;
              const isLow = ptrs.low === idx || ptrs.left === idx;
              const isHigh = ptrs.high === idx || ptrs.right === idx;
              const isEliminated = (ptrs.eliminated || []).includes(idx);

              const boxStyle = isFound
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400 font-bold'
                : isMid
                ? 'border-amber-500 bg-amber-500/20 text-amber-400 font-bold'
                : isLow || isHigh
                ? 'border-blue-500/80 bg-blue-500/10 text-text-primary font-semibold'
                : isEliminated
                ? isDark
                  ? 'border-zinc-800/70 bg-zinc-900/40 text-zinc-600 opacity-55'
                  : 'border-slate-200 bg-slate-100 text-slate-400 opacity-60'
                : isDark
                ? 'border-zinc-700 bg-zinc-900 text-zinc-200'
                : 'border-slate-300 bg-slate-50 text-slate-800';

              const badges: string[] = [];
              if (ptrs.low === idx) badges.push('L');
              if (ptrs.left === idx) badges.push('L');
              if (ptrs.mid === idx) badges.push('mid');
              if (ptrs.high === idx) badges.push('R');
              if (ptrs.right === idx) badges.push('R');

              return (
                <button
                  key={`${idx}-${val}`}
                  type="button"
                  onClick={() => onSelectInfo?.(`arr[${idx}] = ${val}`)}
                  className="flex flex-col items-center gap-1 min-w-[42px]"
                >
                  <span className="text-[10px] font-mono text-text-secondary">{idx}</span>
                  <div
                    className={`w-full px-2.5 py-2 rounded border text-xs font-mono tabular-nums transition-colors ${boxStyle}`}
                  >
                    {val}
                  </div>
                  <span className="h-3.5 text-[10px] font-mono font-semibold text-blue-400">
                    {badges.join('/')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : trace.kind === 'bfs_vs_dfs' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <GraphStageSvg
            trace={trace}
            step={currentStep}
            mode="primary"
            titleBadge="BFS (Queue · theo tầng)"
            isDark={isDark}
            onSelectInfo={onSelectInfo}
          />
          <GraphStageSvg
            trace={trace}
            step={currentStep}
            mode="secondary"
            titleBadge="DFS (Stack · theo chiều sâu)"
            isDark={isDark}
            onSelectInfo={onSelectInfo}
          />
        </div>
      ) : (
        <GraphStageSvg
          trace={trace}
          step={currentStep}
          mode="primary"
          isDark={isDark}
          onSelectInfo={onSelectInfo}
        />
      )}

      {/* Step Explanation + Live Queue/Stack/Pointers Visual Chips */}
      <div
        className={`px-3 py-2.5 rounded-lg border text-xs space-y-2 ${
          isDark ? 'border-zinc-800 bg-zinc-900/50 text-zinc-200' : 'border-slate-200 bg-slate-50 text-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium text-text-primary">{currentStep.title}</div>
          {!isArrayAlgo && (
            <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-mono text-text-secondary">
              <span className="inline-flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-full border ${isDark ? 'bg-zinc-900 border-zinc-600' : 'bg-slate-50 border-slate-300'}`} />
                Chưa thăm
              </span>
              <span className="inline-flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-full border border-sky-400 ${isDark ? 'bg-slate-800' : 'bg-blue-100'}`} />
                Chờ ({currentStep.frontierLabel})
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-400" />
                Đang xét
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 border border-blue-400" />
                Đã duyệt
              </span>
            </div>
          )}
        </div>

        <div className="text-[11px] text-text-secondary">{currentStep.description}</div>

        <div className="pt-1 flex flex-col gap-1.5 text-[11px] font-mono tabular-nums">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-text-secondary shrink-0">{currentStep.frontierLabel}:</span>
            {currentStep.frontier.length > 0 ? (
              currentStep.frontier.map((item, idx) => (
                <span
                  key={`${item}-${idx}`}
                  className={`px-1.5 py-0.5 rounded border text-[10.5px] ${
                    idx === 0
                      ? 'border-amber-500/70 bg-amber-500/15 text-text-primary font-semibold'
                      : 'border-border-color text-text-secondary'
                  }`}
                >
                  {item}
                </span>
              ))
            ) : (
              <span className="text-text-secondary">[rỗng]</span>
            )}
          </div>

          {currentStep.secondaryFrontierLabel && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-text-secondary shrink-0">{currentStep.secondaryFrontierLabel}:</span>
              {(currentStep.secondaryFrontier || []).length > 0 ? (
                (currentStep.secondaryFrontier || []).map((item, idx) => (
                  <span
                    key={`sec-${item}-${idx}`}
                    className={`px-1.5 py-0.5 rounded border text-[10.5px] ${
                      idx === 0
                        ? 'border-emerald-500/70 bg-emerald-500/15 text-text-primary font-semibold'
                        : 'border-border-color text-text-secondary'
                    }`}
                  >
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-text-secondary">[rỗng]</span>
              )}
            </div>
          )}

          {!isArrayAlgo && currentStep.visited.length > 0 && trace.kind !== 'bfs_vs_dfs' && (
            <div className="text-text-secondary">
              Đã duyệt: <strong className="text-text-primary">{currentStep.visited.join(' → ')}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
