import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';
import { formatChartNumber } from '../lib/chartData';
import {
  computeIntegralVisualization,
  detectQuadraticHighlights,
  findFunctionIntersections2D,
  MathFunctionSpec,
  PointSpec,
  RiemannMethod,
  sampleFunction2D,
  sampleParametric2D,
  VectorSpec,
} from '../lib/mathGraphEngine';

export interface Math2DIntegralSpec {
  enabled: boolean;
  bounds: [number, number];
  slices: number;
  method: RiemannMethod;
  showTangent?: boolean;
  tangentX?: number;
}

interface Math2DCoordinateViewProps {
  isDark: boolean;
  functions: MathFunctionSpec[];
  vectors: VectorSpec[];
  points: PointSpec[];
  params: Record<string, number>;
  initialXRange?: [number, number];
  initialYRange?: [number, number];
  xLabel?: string;
  yLabel?: string;
  equalAspectDefault?: boolean;
  showVectorSum?: boolean;
  integralSpec?: Math2DIntegralSpec;
  onVectorChange?: (index: number, nextComponents: [number, number, number]) => void;
}

const VIEW_W = 680;
const VIEW_H = 380;

function pickNiceStep(span: number): number {
  const rough = span / 9;
  const pow10 = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, rough))));
  const norm = rough / pow10;
  if (norm < 1.5) return pow10;
  if (norm < 3.5) return 2 * pow10;
  if (norm < 7.5) return 5 * pow10;
  return 10 * pow10;
}

export const Math2DCoordinateView: React.FC<Math2DCoordinateViewProps> = ({
  isDark,
  functions,
  vectors,
  points,
  params,
  initialXRange = [-6, 6],
  initialYRange,
  xLabel,
  yLabel,
  equalAspectDefault,
  showVectorSum = false,
  integralSpec,
  onVectorChange,
}) => {
  const defaultSpan = Math.max(4, Math.abs(initialXRange[1] - initialXRange[0]) || 12);
  const defaultCenterX = (initialXRange[0] + initialXRange[1]) / 2 || 0;
  const defaultCenterY = initialYRange
    ? (initialYRange[0] + initialYRange[1]) / 2
    : 0;
  const defaultYSpan = initialYRange
    ? Math.max(4, Math.abs(initialYRange[1] - initialYRange[0]))
    : (defaultSpan * VIEW_H) / VIEW_W;

  const [equalAspect, setEqualAspect] = useState<boolean>(
    equalAspectDefault !== undefined ? equalAspectDefault : !initialYRange
  );

  const [viewBoxState, setViewBoxState] = useState<{
    cx: number;
    cy: number;
    spanX: number;
    spanY: number;
  }>({
    cx: defaultCenterX,
    cy: defaultCenterY,
    spanX: defaultSpan,
    spanY: defaultYSpan,
  });

  const x0 = initialXRange[0];
  const x1 = initialXRange[1];
  const y0 = initialYRange?.[0];
  const y1 = initialYRange?.[1];

  useEffect(() => {
    const nextSpanX = Math.max(4, Math.abs(x1 - x0) || 12);
    const nextCx = (x0 + x1) / 2 || 0;
    const hasY = typeof y0 === 'number' && typeof y1 === 'number';
    const nextCy = hasY ? (y0 + y1) / 2 : 0;
    const nextSpanY = hasY
      ? Math.max(4, Math.abs(y1 - y0))
      : (nextSpanX * VIEW_H) / VIEW_W;
    setEqualAspect(equalAspectDefault !== undefined ? equalAspectDefault : !hasY);
    setViewBoxState({ cx: nextCx, cy: nextCy, spanX: nextSpanX, spanY: nextSpanY });
  }, [x0, x1, y0, y1, equalAspectDefault]);

  const [hoverMathPos, setHoverMathPos] = useState<[number, number] | null>(null);
  const [draggingVecIdx, setDraggingVecIdx] = useState<number | null>(null);
  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    cx: number;
    cy: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const xMin = viewBoxState.cx - viewBoxState.spanX / 2;
  const xMax = viewBoxState.cx + viewBoxState.spanX / 2;
  const yMin = viewBoxState.cy - viewBoxState.spanY / 2;
  const yMax = viewBoxState.cy + viewBoxState.spanY / 2;

  const toSvgX = (mx: number) => ((mx - xMin) / (xMax - xMin)) * VIEW_W;
  const toSvgY = (my: number) => ((yMax - my) / (yMax - yMin)) * VIEW_H;
  const toMathCoords = (clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const px = ((clientX - rect.left) / rect.width) * VIEW_W;
    const py = ((clientY - rect.top) / rect.height) * VIEW_H;
    const mx = xMin + (px / VIEW_W) * (xMax - xMin);
    const my = yMax - (py / VIEW_H) * (yMax - yMin);
    return [mx, my];
  };

  const stepX = pickNiceStep(viewBoxState.spanX);
  const stepY = pickNiceStep(viewBoxState.spanY);

  const xTicks = useMemo(() => {
    const start = Math.ceil(xMin / stepX) * stepX;
    const ticks: number[] = [];
    for (let v = start; v <= xMax + 1e-9; v += stepX) {
      const clean = Math.abs(v) < stepX * 1e-4 ? 0 : Math.round(v * 1e6) / 1e6;
      ticks.push(clean);
      if (ticks.length > 40) break;
    }
    return ticks;
  }, [xMin, xMax, stepX]);

  const yTicks = useMemo(() => {
    const start = Math.ceil(yMin / stepY) * stepY;
    const ticks: number[] = [];
    for (let v = start; v <= yMax + 1e-9; v += stepY) {
      const clean = Math.abs(v) < stepY * 1e-4 ? 0 : Math.round(v * 1e6) / 1e6;
      ticks.push(clean);
      if (ticks.length > 40) break;
    }
    return ticks;
  }, [yMin, yMax, stepY]);

  const sampledCurves = useMemo(() => {
    const jumpThreshold = Math.max(12, viewBoxState.spanY * 3.5);
    return functions
      .filter((f) => f.visible)
      .map((fn) => {
        const segments =
          fn.isParametric && fn.xExpr && fn.yExpr
            ? sampleParametric2D(
                fn.xExpr,
                fn.yExpr,
                params,
                fn.tRange?.[0] ?? 0,
                fn.tRange?.[1] ?? Math.PI * 2,
                340
              )
            : sampleFunction2D(fn.expr, params, xMin, xMax, 340, jumpThreshold);

        const quad = !fn.isParametric ? detectQuadraticHighlights(fn.expr, params) : { roots: [] };

        const paths = segments.map((seg) =>
          seg.points
            .map(([mx, my], idx) => `${idx === 0 ? 'M' : 'L'} ${toSvgX(mx).toFixed(1)},${toSvgY(my).toFixed(1)}`)
            .join(' ')
        );
        return { fn, segments, paths, quad };
      });
  }, [functions, params, xMin, xMax, yMin, yMax, viewBoxState.spanY]);

  const intersections = useMemo(
    () => findFunctionIntersections2D(functions, params, xMin, xMax, 280),
    [functions, params, xMin, xMax]
  );

  const handleAutoFitY = () => {
    const ys: number[] = [];
    sampledCurves.forEach(({ segments }) => {
      segments.forEach((seg) => {
        seg.points.forEach(([, y]) => {
          if (Number.isFinite(y) && Math.abs(y) < 1e4) ys.push(y);
        });
      });
    });
    points.forEach((pt) => {
      if (Number.isFinite(pt.coords[1])) ys.push(pt.coords[1]);
    });
    if (ys.length === 0) return;

    let minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (minY >= 0 && minY <= maxY * 0.35) minY = 0;
    const rawSpan = Math.max(2, maxY - minY);
    const pad = rawSpan * 0.14;
    const fitMin = minY === 0 ? 0 : minY - pad;
    const fitMax = maxY + pad;
    setEqualAspect(false);
    setViewBoxState((prev) => ({
      ...prev,
      cy: (fitMin + fitMax) / 2,
      spanY: Math.max(2, fitMax - fitMin),
    }));
  };

  const activeVectors = useMemo(() => vectors.filter((v) => v.visible), [vectors]);

  const integralViz = useMemo(() => {
    if (!integralSpec?.enabled) return null;
    const visibleFns = functions.filter((f) => f.visible && !f.isParametric && f.expr.trim());
    if (visibleFns.length === 0) return null;
    const primary = visibleFns[0];
    const secondary = visibleFns.length >= 2 ? visibleFns[1] : undefined;
    return computeIntegralVisualization(
      primary.expr,
      params,
      integralSpec.bounds[0],
      integralSpec.bounds[1],
      integralSpec.slices,
      integralSpec.method,
      secondary?.expr,
      integralSpec.showTangent ? integralSpec.tangentX : undefined
    );
  }, [integralSpec, functions, params]);

  const sumVector = useMemo(() => {
    if (!showVectorSum || activeVectors.length < 2) return null;
    const sx = activeVectors.reduce((acc, v) => acc + v.components[0], 0);
    const sy = activeVectors.reduce((acc, v) => acc + v.components[1], 0);
    return { x: sx, y: sy };
  }, [activeVectors, showVectorSum]);

  const originSvgX = toSvgX(0);
  const originSvgY = toSvgY(0);
  const clampedAxisY = Math.max(18, Math.min(VIEW_H - 18, originSvgY));
  const clampedAxisX = Math.max(24, Math.min(VIEW_W - 24, originSvgX));

  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const minorGridStroke = isDark ? '#111827' : '#f1f5f9';
  const axisStroke = isDark ? '#94a3b8' : '#334155';
  const textFill = isDark ? '#94a3b8' : '#475569';
  const bgFill = isDark ? '#09090b' : '#ffffff';

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.85 : 1.18;
    const pt = toMathCoords(e.clientX, e.clientY);
    setViewBoxState((prev) => {
      const nextSpanX = Math.max(1.2, Math.min(400, prev.spanX * factor));
      const nextSpanY = equalAspect
        ? (nextSpanX * VIEW_H) / VIEW_W
        : Math.max(0.8, Math.min(2000, prev.spanY * factor));
      if (!pt) return { ...prev, spanX: nextSpanX, spanY: nextSpanY };
      const ratioX = (pt[0] - (prev.cx - prev.spanX / 2)) / prev.spanX;
      const ratioY = (prev.cy + prev.spanY / 2 - pt[1]) / prev.spanY;
      const nextCx = pt[0] - (ratioX - 0.5) * nextSpanX;
      const nextCy = pt[1] + (ratioY - 0.5) * nextSpanY;
      return { cx: nextCx, cy: nextCy, spanX: nextSpanX, spanY: nextSpanY };
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
        <div className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>
          {hoverMathPos ? (
            <span className="tabular-nums">
              {xLabel || 'x'}={hoverMathPos[0].toFixed(2)}, {yLabel || 'y'}={hoverMathPos[1].toFixed(2)}
            </span>
          ) : (
            <span>
              Hệ trục {equalAspect ? '1:1' : 'tùy chỉnh'} · Cuộn thu phóng, kéo di chuyển
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setEqualAspect((prev) => {
                const next = !prev;
                if (next) {
                  setViewBoxState((vb) => ({ ...vb, spanY: (vb.spanX * VIEW_H) / VIEW_W }));
                }
                return next;
              });
            }}
            className={`px-2 py-1 border rounded text-[10px] transition-colors ${
              equalAspect
                ? isDark
                  ? 'border-blue-500/70 bg-blue-500/15 text-blue-300'
                  : 'border-blue-600 bg-blue-50 text-blue-700'
                : isDark
                ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                : 'border-zinc-200 text-zinc-700 hover:bg-zinc-100'
            }`}
            title="Khóa tỷ lệ trục X:Y = 1:1"
          >
            1:1 Tỷ lệ
          </button>
          <button
            type="button"
            onClick={handleAutoFitY}
            className={`inline-flex items-center gap-1 px-2 py-1 border rounded text-[10px] ${
              isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-100'
            }`}
            title="Tự căn chỉnh tỷ lệ trục tung vừa với mọi hàm số"
          >
            <Maximize2 size={10} />
            <span>Auto Fit</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setViewBoxState((p) => {
                const nextSpanX = Math.max(1.2, p.spanX * 0.78);
                return {
                  ...p,
                  spanX: nextSpanX,
                  spanY: equalAspect ? (nextSpanX * VIEW_H) / VIEW_W : Math.max(0.8, p.spanY * 0.78),
                };
              })
            }
            className={`p-1 border rounded ${isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-100'}`}
            title="Phóng to"
          >
            <ZoomIn size={12} />
          </button>
          <button
            type="button"
            onClick={() =>
              setViewBoxState((p) => {
                const nextSpanX = Math.min(400, p.spanX * 1.28);
                return {
                  ...p,
                  spanX: nextSpanX,
                  spanY: equalAspect ? (nextSpanX * VIEW_H) / VIEW_W : Math.min(2000, p.spanY * 1.28),
                };
              })
            }
            className={`p-1 border rounded ${isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-100'}`}
            title="Thu nhỏ"
          >
            <ZoomOut size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              setEqualAspect(equalAspectDefault !== undefined ? equalAspectDefault : !initialYRange);
              setViewBoxState({
                cx: defaultCenterX,
                cy: defaultCenterY,
                spanX: defaultSpan,
                spanY: defaultYSpan,
              });
            }}
            className={`inline-flex items-center gap-1 px-2 py-1 border rounded text-[10px] ${
              isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-100'
            }`}
            title="Đặt lại khung nhìn"
          >
            <RotateCcw size={11} />
            <span>Đặt lại</span>
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className={`w-full h-[350px] rounded border select-none touch-none ${
          isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-white'
        } ${draggingVecIdx !== null ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onWheel={handleWheel}
        onPointerDown={(e) => {
          if (draggingVecIdx !== null) return;
          panStartRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            cx: viewBoxState.cx,
            cy: viewBoxState.cy,
          };
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const m = toMathCoords(e.clientX, e.clientY);
          if (m) setHoverMathPos(m);

          if (draggingVecIdx !== null && m && onVectorChange) {
            const target = vectors[draggingVecIdx];
            if (target) {
              const snapX = Math.round((m[0] - target.origin[0]) * 10) / 10;
              const snapY = Math.round((m[1] - target.origin[1]) * 10) / 10;
              onVectorChange(draggingVecIdx, [snapX, snapY, target.components[2]]);
            }
            return;
          }

          if (panStartRef.current && svgRef.current) {
            const rect = svgRef.current.getBoundingClientRect();
            const dxPx = e.clientX - panStartRef.current.clientX;
            const dyPx = e.clientY - panStartRef.current.clientY;
            const dxMath = (dxPx / rect.width) * viewBoxState.spanX;
            const dyMath = (dyPx / rect.height) * viewBoxState.spanY;
            setViewBoxState((p) => ({
              ...p,
              cx: panStartRef.current!.cx - dxMath,
              cy: panStartRef.current!.cy + dyMath,
            }));
          }
        }}
        onPointerUp={(e) => {
          panStartRef.current = null;
          setDraggingVecIdx(null);
          try {
            (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
          } catch {}
        }}
        onPointerLeave={() => {
          setHoverMathPos(null);
          panStartRef.current = null;
          setDraggingVecIdx(null);
        }}
      >
        <defs>
          <marker id="oxy-axis-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill={axisStroke} />
          </marker>
          {vectors.map((v, i) => (
            <marker
              key={v.id}
              id={`vec-arrow-${i}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill={v.color} />
            </marker>
          ))}
          <marker id="vec-arrow-sum" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#7c3aed" />
          </marker>
        </defs>

        <rect width={VIEW_W} height={VIEW_H} fill={bgFill} />

        {/* Minor & Major Grid */}
        {xTicks.map((tx) => {
          const sx = toSvgX(tx);
          const halfSx = toSvgX(tx + stepX / 2);
          return (
            <g key={`gx-${tx}`}>
              <line x1={sx} y1={0} x2={sx} y2={VIEW_H} stroke={gridStroke} strokeWidth={1} />
              <line x1={halfSx} y1={0} x2={halfSx} y2={VIEW_H} stroke={minorGridStroke} strokeWidth={0.75} />
            </g>
          );
        })}
        {yTicks.map((ty) => {
          const sy = toSvgY(ty);
          const halfSy = toSvgY(ty + stepY / 2);
          return (
            <g key={`gy-${ty}`}>
              <line x1={0} y1={sy} x2={VIEW_W} y2={sy} stroke={gridStroke} strokeWidth={1} />
              <line x1={0} y1={halfSy} x2={VIEW_W} y2={halfSy} stroke={minorGridStroke} strokeWidth={0.75} />
            </g>
          );
        })}

        {/* Main X & Y Axes */}
        <line
          x1={8}
          y1={clampedAxisY}
          x2={VIEW_W - 8}
          y2={clampedAxisY}
          stroke={axisStroke}
          strokeWidth={1.5}
          markerEnd="url(#oxy-axis-arrow)"
        />
        <line
          x1={clampedAxisX}
          y1={VIEW_H - 8}
          x2={clampedAxisX}
          y2={8}
          stroke={axisStroke}
          strokeWidth={1.5}
          markerEnd="url(#oxy-axis-arrow)"
        />
        <text x={VIEW_W - 14} y={clampedAxisY - 8} textAnchor="end" fill={axisStroke} fontSize="11" fontWeight="700" fontFamily="monospace">
          {xLabel || 'x'}
        </text>
        <text x={clampedAxisX + 8} y={16} fill={axisStroke} fontSize="11" fontWeight="700" fontFamily="monospace">
          {yLabel || 'y'}
        </text>

        {/* Tick labels */}
        {xTicks.map((tx) => {
          if (tx === 0) return null;
          const sx = toSvgX(tx);
          if (sx < 18 || sx > VIEW_W - 18) return null;
          return (
            <g key={`tx-${tx}`}>
              <line x1={sx} y1={clampedAxisY - 3} x2={sx} y2={clampedAxisY + 3} stroke={axisStroke} strokeWidth={1} />
              <text
                x={sx}
                y={clampedAxisY + 14}
                textAnchor="middle"
                fill={textFill}
                fontSize="9"
                fontFamily="monospace"
              >
                {formatChartNumber(tx)}
              </text>
            </g>
          );
        })}
        {yTicks.map((ty) => {
          if (ty === 0) return null;
          const sy = toSvgY(ty);
          if (sy < 18 || sy > VIEW_H - 18) return null;
          return (
            <g key={`ty-${ty}`}>
              <line x1={clampedAxisX - 3} y1={sy} x2={clampedAxisX + 3} y2={sy} stroke={axisStroke} strokeWidth={1} />
              <text
                x={clampedAxisX - 6}
                y={sy + 3}
                textAnchor="end"
                fill={textFill}
                fontSize="9"
                fontFamily="monospace"
              >
                {formatChartNumber(ty)}
              </text>
            </g>
          );
        })}
        {originSvgX >= 10 && originSvgX <= VIEW_W - 10 && originSvgY >= 10 && originSvgY <= VIEW_H - 10 && (
          <text x={originSvgX - 6} y={originSvgY + 13} textAnchor="end" fill={textFill} fontSize="9" fontWeight="600" fontFamily="monospace">
            O
          </text>
        )}

        {/* Integral Shaded Area + Riemann Slices + Bounds */}
        {integralViz && integralViz.shadedPolygon.length >= 3 && (
          <g>
            <polygon
              points={integralViz.shadedPolygon
                .map(([mx, my]) => `${toSvgX(mx).toFixed(1)},${toSvgY(my).toFixed(1)}`)
                .join(' ')}
              fill={isDark ? 'rgba(56, 189, 248, 0.22)' : 'rgba(37, 99, 235, 0.16)'}
              stroke="none"
            />
            {integralSpec?.method !== 'continuous' &&
              integralViz.slices.map((s, idx) => {
                const pts = [
                  [s.x0, s.y0Bottom],
                  [s.x0, s.y0Top],
                  [s.x1, s.y1Top],
                  [s.x1, s.y1Bottom],
                ]
                  .map(([mx, my]) => `${toSvgX(mx).toFixed(1)},${toSvgY(my).toFixed(1)}`)
                  .join(' ');
                return (
                  <polygon
                    key={`riemann-${idx}`}
                    points={pts}
                    fill={isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(5, 150, 105, 0.14)'}
                    stroke={isDark ? '#34d399' : '#059669'}
                    strokeWidth={1}
                  />
                );
              })}

            {[
              { label: 'a', val: integralViz.a },
              { label: 'b', val: integralViz.b },
            ].map((bItem) => {
              const bx = toSvgX(bItem.val);
              return (
                <g key={bItem.label}>
                  <line
                    x1={bx}
                    y1={12}
                    x2={bx}
                    y2={VIEW_H - 12}
                    stroke={isDark ? '#38bdf8' : '#2563eb'}
                    strokeWidth={1.25}
                    strokeDasharray="4 3"
                    opacity={0.75}
                  />
                  <text
                    x={bx + 4}
                    y={clampedAxisY - 6}
                    fill={isDark ? '#7dd3fc' : '#1d4ed8'}
                    fontSize="10"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {bItem.label}={formatChartNumber(bItem.val)}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Function Curves + Parabola Highlights */}
        {sampledCurves.map(({ fn, paths, quad }) => (
          <g key={fn.id}>
            {quad.vertex && (
              <>
                <line
                  x1={toSvgX(quad.vertex[0])}
                  y1={0}
                  x2={toSvgX(quad.vertex[0])}
                  y2={VIEW_H}
                  stroke={fn.color}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  opacity={0.45}
                />
              </>
            )}
            {paths.map((d, idx) => (
              <path key={idx} d={d} fill="none" stroke={fn.color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {quad.vertex && (
              <g>
                <circle
                  cx={toSvgX(quad.vertex[0])}
                  cy={toSvgY(quad.vertex[1])}
                  r={4}
                  fill={fn.color}
                  stroke={bgFill}
                  strokeWidth={1.5}
                />
                <text
                  x={toSvgX(quad.vertex[0]) + 7}
                  y={toSvgY(quad.vertex[1]) - 6}
                  fill={fn.color}
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="monospace"
                >
                  I({formatChartNumber(quad.vertex[0])}, {formatChartNumber(quad.vertex[1])})
                </text>
              </g>
            )}
            {quad.roots.map((rx, rIdx) => (
              <circle
                key={`root-${rIdx}`}
                cx={toSvgX(rx)}
                cy={toSvgY(0)}
                r={3.2}
                fill={bgFill}
                stroke={fn.color}
                strokeWidth={1.6}
              />
            ))}
          </g>
        ))}

        {/* Parallelogram Guide & Vector Sum u + v */}
        {sumVector && activeVectors.length >= 2 && (
          <g>
            <line
              x1={toSvgX(activeVectors[0].components[0])}
              y1={toSvgY(activeVectors[0].components[1])}
              x2={toSvgX(sumVector.x)}
              y2={toSvgY(sumVector.y)}
              stroke="#7c3aed"
              strokeWidth={1.1}
              strokeDasharray="4 3"
              opacity={0.65}
            />
            <line
              x1={toSvgX(activeVectors[1].components[0])}
              y1={toSvgY(activeVectors[1].components[1])}
              x2={toSvgX(sumVector.x)}
              y2={toSvgY(sumVector.y)}
              stroke="#7c3aed"
              strokeWidth={1.1}
              strokeDasharray="4 3"
              opacity={0.65}
            />
            <line
              x1={toSvgX(0)}
              y1={toSvgY(0)}
              x2={toSvgX(sumVector.x)}
              y2={toSvgY(sumVector.y)}
              stroke="#7c3aed"
              strokeWidth={2.2}
              strokeDasharray="5 2"
              markerEnd="url(#vec-arrow-sum)"
            />
            <text
              x={toSvgX(sumVector.x) + 6}
              y={toSvgY(sumVector.y) - 6}
              fill="#7c3aed"
              fontSize="10"
              fontWeight="700"
              fontFamily="monospace"
            >
              u+v ({formatChartNumber(sumVector.x)}, {formatChartNumber(sumVector.y)})
            </text>
          </g>
        )}

        {/* 2D Vectors with Draggable Tip Handles */}
        {vectors.map((v, idx) => {
          if (!v.visible) return null;
          const x1 = toSvgX(v.origin[0]);
          const y1 = toSvgY(v.origin[1]);
          const tx = v.origin[0] + v.components[0];
          const ty = v.origin[1] + v.components[1];
          const x2 = toSvgX(tx);
          const y2 = toSvgY(ty);
          return (
            <g key={v.id}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={v.color}
                strokeWidth={2.4}
                markerEnd={`url(#vec-arrow-${idx})`}
              />
              {onVectorChange && (
                <circle
                  cx={x2}
                  cy={y2}
                  r={7}
                  fill="transparent"
                  stroke={v.color}
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  className="cursor-move"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDraggingVecIdx(idx);
                    svgRef.current?.setPointerCapture(e.pointerId);
                  }}
                />
              )}
              <text
                x={x2 + 8}
                y={y2 - 6}
                fill={v.color}
                fontSize="10.5"
                fontWeight="700"
                fontFamily="monospace"
              >
                {v.label}({formatChartNumber(v.components[0])}, {formatChartNumber(v.components[1])})
              </text>
            </g>
          );
        })}

        {/* Highlighted Points */}
        {points.map((pt) => {
          const sx = toSvgX(pt.coords[0]);
          const sy = toSvgY(pt.coords[1]);
          return (
            <g key={pt.id}>
              <circle cx={sx} cy={sy} r={4} fill={pt.color} stroke={bgFill} strokeWidth={1.5} />
              <text x={sx + 7} y={sy - 5} fill={pt.color} fontSize="10" fontWeight="600" fontFamily="monospace">
                {pt.label}({formatChartNumber(pt.coords[0])}, {formatChartNumber(pt.coords[1])})
              </text>
            </g>
          );
        })}

        {/* Multi-function Intersections */}
        {intersections.map((ipt, idx) => {
          const sx = toSvgX(ipt.x);
          const sy = toSvgY(ipt.y);
          if (sx < 8 || sx > VIEW_W - 8 || sy < 8 || sy > VIEW_H - 8) return null;
          return (
            <g key={`ix-${idx}`}>
              <circle cx={sx} cy={sy} r={4.5} fill="#d97706" stroke={bgFill} strokeWidth={1.5} />
              <text
                x={sx + 7}
                y={sy - 7}
                fill="#d97706"
                fontSize="9.5"
                fontWeight="700"
                fontFamily="monospace"
              >
                ({formatChartNumber(ipt.x)}, {formatChartNumber(ipt.y)})
              </text>
            </g>
          );
        })}

        {/* Derivative Tangent Line Overlay */}
        {integralViz?.tangent && (() => {
          const { x: tx, y: ty, slope } = integralViz.tangent;
          const span = Math.max(1, viewBoxState.spanX * 0.22);
          const x1 = tx - span;
          const y1 = ty - slope * span;
          const x2 = tx + span;
          const y2 = ty + slope * span;
          return (
            <g>
              <line
                x1={toSvgX(x1)}
                y1={toSvgY(y1)}
                x2={toSvgX(x2)}
                y2={toSvgY(y2)}
                stroke="#f59e0b"
                strokeWidth={1.75}
                strokeDasharray="5 3"
              />
              <circle
                cx={toSvgX(tx)}
                cy={toSvgY(ty)}
                r={4.2}
                fill="#f59e0b"
                stroke={bgFill}
                strokeWidth={1.5}
              />
              <text
                x={toSvgX(tx) + 7}
                y={toSvgY(ty) - 7}
                fill="#f59e0b"
                fontSize="10"
                fontWeight="700"
                fontFamily="monospace"
              >
                f&apos;({formatChartNumber(tx)})={formatChartNumber(slope)}
              </text>
            </g>
          );
        })()}

        {/* Hover Crosshair */}
        {hoverMathPos && (
          <g pointerEvents="none" opacity={0.45}>
            <line
              x1={toSvgX(hoverMathPos[0])}
              y1={0}
              x2={toSvgX(hoverMathPos[0])}
              y2={VIEW_H}
              stroke={axisStroke}
              strokeDasharray="3 3"
              strokeWidth={0.9}
            />
            <line
              x1={0}
              y1={toSvgY(hoverMathPos[1])}
              x2={VIEW_W}
              y2={toSvgY(hoverMathPos[1])}
              stroke={axisStroke}
              strokeDasharray="3 3"
              strokeWidth={0.9}
            />
          </g>
        )}
      </svg>

      {integralViz && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded border text-[11px] font-mono tabular-nums ${
            isDark ? 'border-zinc-800 bg-zinc-900/60 text-zinc-200' : 'border-zinc-200 bg-zinc-50 text-zinc-800'
          }`}
        >
          <span>
            ∫[{formatChartNumber(integralViz.a)}, {formatChartNumber(integralViz.b)}] ={' '}
            <strong className={isDark ? 'text-sky-400' : 'text-blue-600'}>
              {integralViz.definiteIntegral.toFixed(4)}
            </strong>
          </span>
          <span>
            |S| = <strong>{integralViz.absArea.toFixed(4)}</strong>
          </span>
          {integralSpec?.method !== 'continuous' && (
            <>
              <span>
                Riemann({integralSpec?.slices}) ={' '}
                <strong className={isDark ? 'text-emerald-400' : 'text-emerald-700'}>
                  {integralViz.riemannSum.toFixed(4)}
                </strong>
              </span>
              <span className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>
                Δ = {integralViz.errorEstimate.toFixed(4)}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
