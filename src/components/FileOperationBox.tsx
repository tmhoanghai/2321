import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, ChevronRight, Copy, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { FileOperationRecord, Theme } from '../types';
import { computeLineDiff } from '../lib/lineDiff';

interface FileOperationBoxProps {
  operations: FileOperationRecord[];
  theme: Theme;
  onSelectFile?: (path: string) => void;
  fallbackCodeByPath?: Record<string, string>;
}

function actionLabel(action: FileOperationRecord['action'], status: FileOperationRecord['status']): string {
  if (status === 'running') {
    if (action === 'delete') return 'Đang xóa';
    if (action === 'edit') return 'Đang sửa';
    return 'Đang tạo';
  }
  if (action === 'delete') return 'Đã xóa';
  if (action === 'edit') return 'Đã sửa';
  return 'Đã tạo';
}

export const FileOperationBox: React.FC<FileOperationBoxProps> = React.memo(
  ({ operations, theme, onSelectFile, fallbackCodeByPath = {} }) => {
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [activeTabByKey, setActiveTabByKey] = useState<Record<string, 'diff' | 'full'>>({});
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const diffCache = useMemo(() => {
      const map: Record<string, ReturnType<typeof computeLineDiff> | null> = {};
      for (const op of operations || []) {
        const key = `${op.action}-${op.path}`;
        const resolvedNew = op.newContent ?? fallbackCodeByPath[op.path.toLowerCase()];
        if (op.oldContent !== undefined && resolvedNew !== undefined) {
          map[key] = computeLineDiff(op.oldContent, resolvedNew, 3);
        } else {
          map[key] = null;
        }
      }
      return map;
    }, [operations, fallbackCodeByPath]);

    if (!operations || operations.length === 0) return null;

    const isLight = theme === Theme.LIGHT;

    const handleCopy = async (key: string, text: string) => {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
      } catch {
        // Ignore clipboard denial
      }
    };

    return (
      <div className="flex flex-col gap-1.5 my-1.5" aria-label="Quy trình tệp">
        {operations.map((op) => {
          const key = `${op.action}-${op.path}`;
          const resolvedNew = op.newContent ?? fallbackCodeByPath[op.path.toLowerCase()];
          const diff = diffCache[key];
          const hasDiffView = Boolean(diff && diff.hasChanges);
          const hasFullView = Boolean(resolvedNew !== undefined && op.action !== 'delete');
          const hasInspectableData =
            op.status === 'done' && (hasDiffView || hasFullView || op.oldContent !== undefined);
          const isExpanded = expandedKey === key && hasInspectableData;
          const activeTab = activeTabByKey[key] || (hasDiffView ? 'diff' : 'full');

          const addedCount = op.addedLines ?? diff?.added ?? 0;
          const removedCount = op.removedLines ?? diff?.removed ?? 0;
          const showCounts = op.status === 'done' && (addedCount > 0 || removedCount > 0);

          return (
            <div
              key={key}
              className={`w-full rounded-xl border overflow-hidden transition-colors ${
                isLight
                  ? 'bg-gray-50 border-gray-200 text-gray-800'
                  : 'bg-[#18181b] border-white/[0.09] text-zinc-200'
              }`}
            >
              <button
                type="button"
                disabled={!hasInspectableData}
                onClick={() => {
                  if (!hasInspectableData) return;
                  setExpandedKey((prev) => (prev === key ? null : key));
                }}
                aria-expanded={hasInspectableData ? isExpanded : undefined}
                className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                  hasInspectableData
                    ? isLight
                      ? 'cursor-pointer hover:bg-gray-100/70'
                      : 'cursor-pointer hover:bg-white/[0.03]'
                    : 'cursor-default'
                }`}
                title={hasInspectableData ? `Bấm để xem chỗ đã sửa và code của ${op.path}` : op.path}
              >
                <div className="min-w-0 flex items-center gap-2 text-[13px] leading-snug">
                  <span className="truncate font-normal text-text-primary/90">{op.path}</span>
                  <span className="text-[11px] text-text-secondary shrink-0 whitespace-nowrap">
                    · {actionLabel(op.action, op.status)}
                  </span>
                  {showCounts && (
                    <span className="text-[11px] font-mono tabular-nums shrink-0 whitespace-nowrap flex items-center gap-1.5">
                      {addedCount > 0 && (
                        <span className={isLight ? 'text-emerald-700' : 'text-emerald-400'}>+{addedCount}</span>
                      )}
                      {removedCount > 0 && (
                        <span className={isLight ? 'text-rose-700' : 'text-rose-400'}>-{removedCount}</span>
                      )}
                    </span>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {hasInspectableData && (
                    <span className="text-text-secondary/70">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  )}
                  {op.status === 'running' ? (
                    <Loader2 size={15} className="animate-spin text-text-secondary" />
                  ) : op.action === 'delete' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Trash2 size={13} className="text-rose-400" />
                      <CheckCircle2 size={16} className="text-emerald-500" />
                    </span>
                  ) : (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div
                  className={`border-t ${
                    isLight ? 'border-gray-200 bg-white' : 'border-white/[0.08] bg-[#111114]'
                  }`}
                >
                  <div
                    className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 text-[11px] ${
                      isLight ? 'border-gray-200 bg-gray-50/70' : 'border-white/[0.07] bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      {hasDiffView && (
                        <button
                          type="button"
                          onClick={() => setActiveTabByKey((prev) => ({ ...prev, [key]: 'diff' }))}
                          className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            activeTab === 'diff'
                              ? isLight
                                ? 'bg-zinc-900 text-white font-medium'
                                : 'bg-white text-zinc-950 font-medium'
                              : 'text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          Chỗ đã sửa
                        </button>
                      )}
                      {hasFullView && (
                        <button
                          type="button"
                          onClick={() => setActiveTabByKey((prev) => ({ ...prev, [key]: 'full' }))}
                          className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            activeTab === 'full' || !hasDiffView
                              ? isLight
                                ? 'bg-zinc-900 text-white font-medium'
                                : 'bg-white text-zinc-950 font-medium'
                              : 'text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {op.action === 'create' ? 'Code đã tạo' : 'Code đầy đủ'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {(resolvedNew || op.oldContent) && (
                        <button
                          type="button"
                          onClick={() => handleCopy(key, resolvedNew || op.oldContent || '')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border-color text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap shrink-0"
                        >
                          {copiedKey === key ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                          <span>{copiedKey === key ? 'Đã chép' : 'Sao chép'}</span>
                        </button>
                      )}
                      {onSelectFile && op.action !== 'delete' && (
                        <button
                          type="button"
                          onClick={() => onSelectFile(op.path)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border-color text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap shrink-0"
                        >
                          <ExternalLink size={11} />
                          <span>Mở file</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {activeTab === 'diff' && hasDiffView && diff ? (
                    <div className="max-h-80 overflow-auto font-mono text-[11.5px] leading-relaxed tabular-nums">
                      {diff.lines.map((dl, lineIdx) => {
                        if (dl.type === 'hunk') {
                          return (
                            <div
                              key={lineIdx}
                              className={`px-3 py-1 text-[10.5px] border-y select-none ${
                                isLight
                                  ? 'bg-gray-100 border-gray-200 text-gray-500'
                                  : 'bg-white/[0.03] border-white/[0.06] text-zinc-500'
                              }`}
                            >
                              {dl.text}
                            </div>
                          );
                        }
                        const rowCls =
                          dl.type === 'add'
                            ? isLight
                              ? 'bg-emerald-50 text-emerald-950'
                              : 'bg-emerald-500/12 text-emerald-200'
                            : dl.type === 'remove'
                            ? isLight
                              ? 'bg-rose-50 text-rose-950'
                              : 'bg-rose-500/12 text-rose-200'
                            : isLight
                            ? 'text-gray-600'
                            : 'text-zinc-400';
                        const sign = dl.type === 'add' ? '+' : dl.type === 'remove' ? '-' : ' ';
                        return (
                          <div key={lineIdx} className={`flex min-w-max ${rowCls}`}>
                            <span className="w-10 shrink-0 px-2 py-0.5 text-right select-none opacity-45">
                              {dl.oldLine ?? ''}
                            </span>
                            <span className="w-10 shrink-0 px-2 py-0.5 text-right select-none opacity-45">
                              {dl.newLine ?? ''}
                            </span>
                            <span className="w-5 shrink-0 py-0.5 text-center select-none font-semibold">
                              {sign}
                            </span>
                            <span className="pr-4 py-0.5 whitespace-pre">{dl.text || ' '}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : hasFullView && resolvedNew !== undefined ? (
                    <div className="max-h-80 overflow-auto font-mono text-[11.5px] leading-relaxed tabular-nums">
                      {resolvedNew.replace(/\r\n/g, '\n').split('\n').map((line, i) => (
                        <div
                          key={i}
                          className={`flex min-w-max ${
                            isLight ? 'text-gray-800 hover:bg-gray-50' : 'text-zinc-300 hover:bg-white/[0.02]'
                          }`}
                        >
                          <span className="w-11 shrink-0 px-2 py-0.5 text-right select-none opacity-40">
                            {i + 1}
                          </span>
                          <span className="pr-4 py-0.5 whitespace-pre">{line || ' '}</span>
                        </div>
                      ))}
                    </div>
                  ) : op.action === 'delete' && op.oldContent ? (
                    <div className="max-h-60 overflow-auto font-mono text-[11.5px] leading-relaxed tabular-nums">
                      {op.oldContent.replace(/\r\n/g, '\n').split('\n').slice(0, 80).map((line, i) => (
                        <div
                          key={i}
                          className={`flex min-w-max ${
                            isLight ? 'bg-rose-50 text-rose-900' : 'bg-rose-500/10 text-rose-200'
                          }`}
                        >
                          <span className="w-10 shrink-0 px-2 py-0.5 text-right select-none opacity-45">{i + 1}</span>
                          <span className="w-5 shrink-0 py-0.5 text-center select-none">-</span>
                          <span className="pr-4 py-0.5 whitespace-pre">{line || ' '}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3.5 py-2.5 text-xs text-text-secondary">
                      Không có dữ liệu thay đổi chi tiết cho thao tác này.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);
