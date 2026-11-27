import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BigOComplexitySpec,
  buildBigODataset,
  formatBigOOps,
  parseBigOSpecsFromPayload,
} from '../lib/bigOEngine';
import type { ChartPayload } from '../lib/chartData';

interface BigOComplexityViewProps {
  payload: ChartPayload;
  isDark: boolean;
  isFullscreen: boolean;
  onSelectInfo?: (info: string | null) => void;
}

const N_PRESETS = [50, 100, 1000, 10000];

export const BigOComplexityView: React.FC<BigOComplexityViewProps> = ({
  payload,
  isDark,
  isFullscreen,
  onSelectInfo,
}) => {
  const parsed = useMemo(() => parseBigOSpecsFromPayload(payload), [payload]);
  const [nMax, setNMax] = useState<number>(parsed.nMax);
  const [sampleN, setSampleN] = useState<number>(Math.max(10, Math.round(parsed.nMax * 0.6)));
  const [useLogY, setUseLogY] = useState<boolean>((payload as any)?.yScale === 'log');
  const [hiddenMap, setHiddenMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setNMax(parsed.nMax);
    setSampleN(Math.max(8, Math.round(parsed.nMax * 0.6)));
    setUseLogY((payload as any)?.yScale === 'log');
    setHiddenMap({});
  }, [parsed, payload]);

  const specs: BigOComplexitySpec[] = useMemo(
    () =>
      parsed.specs.map((sp) => ({
        ...sp,
        visible: hiddenMap[sp.id] !== undefined ? !hiddenMap[sp.id] : sp.visible,
      })),
    [parsed.specs, hiddenMap]
  );

  const visibleSpecs = useMemo(() => specs.filter((s) => s.visible), [specs]);

  const dataset = useMemo(
    () => buildBigODataset(specs, nMax, sampleN, useLogY, 40),
    [specs, nMax, sampleN, useLogY]
  );

  const gridStroke = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const axisStroke = isDark ? '#94a3b8' : '#64748b';
  const textColor = isDark ? '#e2e8f0' : '#0f172a';

  const toggleSpec = (id: string) => {
    setHiddenMap((prev) => {
      const nextHidden = !(prev[id] ?? false);
      const remaining = specs.filter((s) => (s.id === id ? !nextHidden : !(prev[s.id] ?? !s.visible)));
      if (remaining.length === 0) return prev;
      return { ...prev, [id]: nextHidden };
    });
  };

  return (
    <div className="space-y-3">
      {/* Minimalist Toolbar: Scale + nMax presets + n inspector */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-1">
          <div className="flex items-center p-0.5 rounded-lg border border-border-color bg-primary/40">
            <button
              type="button"
              onClick={() => setUseLogY(false)}
              className={`px-2 py-0.5 rounded-md transition-colors whitespace-nowrap ${
                !useLogY
                  ? isDark
                    ? 'bg-white text-zinc-950 font-medium'
                    : 'bg-zinc-900 text-white font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Tuyến tính
            </button>
            <button
              type="button"
              onClick={() => setUseLogY(true)}
              className={`px-2 py-0.5 rounded-md transition-colors whitespace-nowrap ${
                useLogY
                  ? isDark
                    ? 'bg-white text-zinc-950 font-medium'
                    : 'bg-zinc-900 text-white font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Thang Log₁₀
            </button>
          </div>

          <div className="flex items-center gap-1 ml-1">
            <span className="text-text-secondary">Giới hạn n:</span>
            {N_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setNMax(preset);
                  setSampleN(Math.max(1, Math.round(preset * 0.6)));
                }}
                className={`px-2 py-0.5 rounded border font-mono tabular-nums transition-colors ${
                  nMax === preset
                    ? 'border-blue-500/60 bg-blue-500/10 text-text-primary font-medium'
                    : 'border-border-color text-text-secondary hover:text-text-primary'
                }`}
              >
                {preset.toLocaleString('en-US')}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 font-mono tabular-nums">
          <span className="text-text-secondary">Kiểm tra tại n =</span>
          <input
            type="range"
            min={1}
            max={nMax}
            step={Math.max(1, Math.floor(nMax / 100))}
            value={sampleN}
            onChange={(e) => setSampleN(Number(e.target.value))}
            className="w-28 accent-blue-600 cursor-pointer"
          />
          <input
            type="number"
            min={1}
            max={100000}
            value={sampleN}
            onChange={(e) => {
              const v = Math.max(1, Math.min(100000, Math.round(Number(e.target.value) || 1)));
              if (v > nMax) setNMax(v);
              setSampleN(v);
            }}
            className={`w-16 text-right px-1.5 py-0.5 rounded border text-[11px] tabular-nums outline-none ${
              isDark ? 'border-zinc-700 bg-zinc-900 text-zinc-100' : 'border-slate-200 bg-white text-slate-900'
            }`}
          />
        </label>
      </div>

      {/* Curve Visibility Toggles */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {specs.map((sp) => (
          <button
            key={sp.id}
            type="button"
            onClick={() => toggleSpec(sp.id)}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono transition-colors ${
              sp.visible
                ? 'border-border-color text-text-primary bg-primary/35'
                : 'border-border-color/50 text-text-secondary opacity-45'
            }`}
            title="Ẩn/hiện đường độ phức tạp"
          >
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: sp.color }} />
            <span>{sp.notation}</span>
          </button>
        ))}
      </div>

      {/* Growth Curves */}
      <div className={`${isFullscreen ? 'h-[calc(100dvh-340px)] min-h-[300px]' : 'h-[270px]'} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={dataset.rows}
            margin={{ top: 10, right: 16, left: 6, bottom: 16 }}
            onClick={(d: any) => {
              const p = d?.activePayload?.[0]?.payload;
              if (p && onSelectInfo) {
                const nClicked = Number(p.n);
                setSampleN(nClicked);
                onSelectInfo(
                  `n = ${nClicked.toLocaleString('en-US')}: ${visibleSpecs
                    .map((sp) => `${sp.notation} ≈ ${formatBigOOps(sp.evalOps(nClicked))} ops`)
                    .join(' · ')}`
                );
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis
              dataKey="n"
              type="number"
              domain={[1, nMax]}
              stroke={axisStroke}
              fontSize={11}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v))}
              label={{
                value: 'Kích thước đầu vào (n)',
                position: 'insideBottomRight',
                offset: -6,
                fill: axisStroke,
                fontSize: 10,
              }}
            />
            <YAxis
              stroke={axisStroke}
              fontSize={11}
              width={60}
              tickFormatter={(v) =>
                useLogY ? `10^${Number(v).toFixed(1)}` : formatBigOOps(Number(v))
              }
              label={{
                value: useLogY ? 'log₁₀(Số phép tính)' : 'Số phép tính',
                angle: -90,
                position: 'insideLeft',
                fill: axisStroke,
                fontSize: 10,
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#09090b' : '#ffffff',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)'}`,
                borderRadius: '8px',
                fontSize: '11px',
                color: textColor,
                fontVariantNumeric: 'tabular-nums',
              }}
              labelFormatter={(nVal) => `n = ${Number(nVal).toLocaleString('en-US')}`}
              formatter={(_val: any, name: string, item: any) => {
                const nVal = Number(item?.payload?.n || sampleN);
                const spec = specs.find((s) => s.id === name);
                const exactOps = spec ? spec.evalOps(nVal) : Number(_val);
                return [formatBigOOps(exactOps) + ' ops', spec?.notation || name];
              }}
            />
            <ReferenceLine
              x={sampleN}
              stroke={axisStroke}
              strokeDasharray="4 3"
              label={{
                value: `n=${sampleN}`,
                position: 'top',
                fill: axisStroke,
                fontSize: 10,
              }}
            />
            {visibleSpecs.map((sp) => (
              <Line
                key={sp.id}
                type="monotone"
                dataKey={sp.id}
                name={sp.id}
                stroke={sp.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Exact Operation & Runtime Table at sampleN */}
      <div className="rounded-lg border border-border-color overflow-x-auto">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead>
            <tr className={`border-b border-border-color text-text-secondary ${isDark ? 'bg-zinc-900/50' : 'bg-slate-50'}`}>
              <th className="py-1.5 px-2.5 font-medium">Độ phức tạp</th>
              <th className="py-1.5 px-2.5 font-medium text-right font-mono tabular-nums">
                Số phép tính (n={sampleN.toLocaleString('en-US')})
              </th>
              <th className="py-1.5 px-2.5 font-medium text-right font-mono tabular-nums">
                Thời gian ước tính (10⁸ ops/s)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-color/60">
            {dataset.summaries
              .filter((s) => s.visible)
              .map((row) => (
                <tr
                  key={row.id}
                  onClick={() =>
                    onSelectInfo?.(
                      `${row.label} tại n = ${sampleN.toLocaleString('en-US')}: ${row.formattedOps} phép tính (${row.estimatedRuntime})`
                    )
                  }
                  className="cursor-pointer hover:bg-tertiary/35 transition-colors"
                >
                  <td className="py-1.5 px-2.5 font-mono flex items-center gap-2 text-text-primary">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: row.color }} />
                    <span>{row.label}</span>
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-text-primary">
                    {row.formattedOps}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-text-secondary">
                    {row.estimatedRuntime}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
