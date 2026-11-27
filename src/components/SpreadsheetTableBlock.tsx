import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Check,
  Columns,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Send,
  Table2,
  Trash2,
} from 'lucide-react';
import {
  colIndexToLetter,
  evaluateSpreadsheetGrid,
  exportGridToCsv,
  exportGridToMarkdown,
  parseSpreadsheetInput,
  SpreadsheetGridData,
} from '../lib/spreadsheetEngine';
import { triggerBlobDownload } from '../lib/fileGenerator';

interface SpreadsheetTableBlockProps {
  rawInput?: string;
  initialGrid?: SpreadsheetGridData;
  theme: 'dark' | 'light';
  editableByDefault?: boolean;
  onInsertMarkdown?: (markdown: string) => void;
}

function formatEvaluatedDisplay(val: string | number): string {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Number.isInteger(val)
      ? val.toLocaleString('en-US')
      : val.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }
  return String(val ?? '');
}

export const SpreadsheetTableBlock: React.FC<SpreadsheetTableBlockProps> = React.memo(
  ({
    rawInput = '',
    initialGrid,
    theme,
    editableByDefault = true,
    onInsertMarkdown,
  }) => {
    const parsedInitial = useMemo(
      () => initialGrid || parseSpreadsheetInput(rawInput),
      [initialGrid, rawInput]
    );

    const [title, setTitle] = useState(parsedInitial.title);
    const [columns, setColumns] = useState<string[]>(parsedInitial.columns);
    const [rows, setRows] = useState<string[][]>(parsedInitial.rows);
    const [isEditingMode, setIsEditingMode] = useState(editableByDefault);
    const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>({
      row: 0,
      col: 0,
    });
    const [editingColIdx, setEditingColIdx] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortState, setSortState] = useState<{ col: number; dir: 'asc' | 'desc' } | null>(null);
    const [copiedMd, setCopiedMd] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
      if (!isFullscreen) return;
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsFullscreen(false);
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [isFullscreen]);

    const isLight = theme === 'light';
    const evaluated = useMemo(() => evaluateSpreadsheetGrid(rows), [rows]);

    const visibleRowIndices = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      let indices = rows.map((_, idx) => idx);
      if (q) {
        indices = indices.filter((rIdx) =>
          columns.some((_, cIdx) => {
            const rawCell = String(rows[rIdx]?.[cIdx] ?? '').toLowerCase();
            const valCell = String(evaluated[rIdx]?.[cIdx]?.value ?? '').toLowerCase();
            return rawCell.includes(q) || valCell.includes(q);
          })
        );
      }
      if (sortState) {
        const { col, dir } = sortState;
        indices = [...indices].sort((aIdx, bIdx) => {
          const aCell = evaluated[aIdx]?.[col];
          const bCell = evaluated[bIdx]?.[col];
          const aNum = aCell?.numericValue;
          const bNum = bCell?.numericValue;
          let cmp = 0;
          if (aNum !== null && aNum !== undefined && bNum !== null && bNum !== undefined) {
            cmp = aNum - bNum;
          } else {
            cmp = String(aCell?.value ?? '').localeCompare(String(bCell?.value ?? ''), 'vi');
          }
          return dir === 'asc' ? cmp : -cmp;
        });
      }
      return indices;
    }, [rows, columns, evaluated, searchQuery, sortState]);

    const selectedCoordLabel = selectedCell
      ? `${colIndexToLetter(selectedCell.col)}${selectedCell.row + 1}`
      : '—';
    const selectedRawValue =
      selectedCell && rows[selectedCell.row]
        ? rows[selectedCell.row][selectedCell.col] ?? ''
        : '';
    const selectedEval =
      selectedCell && evaluated[selectedCell.row]
        ? evaluated[selectedCell.row][selectedCell.col]
        : undefined;

    const updateCell = (rIdx: number, cIdx: number, value: string) => {
      setRows((prev) => {
        const next = prev.map((r) => [...r]);
        while (next.length <= rIdx) next.push(Array(columns.length).fill(''));
        while (next[rIdx].length < columns.length) next[rIdx].push('');
        next[rIdx][cIdx] = value;
        return next;
      });
    };

    const addRow = () => {
      setRows((prev) => {
        const next = [...prev, Array(columns.length).fill('')];
        setSelectedCell({ row: next.length - 1, col: 0 });
        return next;
      });
    };

    const deleteSelectedRow = () => {
      if (!selectedCell || rows.length <= 1) return;
      const targetRow = selectedCell.row;
      setRows((prev) => prev.filter((_, idx) => idx !== targetRow));
      setSelectedCell({ row: Math.max(0, targetRow - 1), col: selectedCell.col });
    };

    const addColumn = () => {
      const nextColIdx = columns.length;
      const nextLabel = `Cột ${colIndexToLetter(nextColIdx)}`;
      setColumns((prev) => [...prev, nextLabel]);
      setRows((prev) => prev.map((r) => [...r, '']));
      setSelectedCell({ row: selectedCell?.row ?? 0, col: nextColIdx });
    };

    const deleteSelectedCol = () => {
      if (!selectedCell || columns.length <= 1) return;
      const targetCol = selectedCell.col;
      setColumns((prev) => prev.filter((_, idx) => idx !== targetCol));
      setRows((prev) => prev.map((r) => r.filter((_, idx) => idx !== targetCol)));
      setSelectedCell({ row: selectedCell.row, col: Math.max(0, targetCol - 1) });
    };

    const insertQuickColumnFormula = (fn: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX') => {
      const targetCol = selectedCell?.col ?? Math.max(0, columns.length - 1);
      const colLetter = colIndexToLetter(targetCol);
      const dataEndRow = Math.max(1, rows.length);
      const formula = `=${fn}(${colLetter}1:${colLetter}${dataEndRow})`;
      setRows((prev) => {
        const newRow = Array(columns.length).fill('');
        newRow[0] = fn === 'SUM' ? 'Tổng' : fn === 'AVERAGE' ? 'Trung bình' : fn;
        newRow[targetCol] = formula;
        const next = [...prev, newRow];
        setSelectedCell({ row: next.length - 1, col: targetCol });
        return next;
      });
    };

    const handleCopyMarkdown = () => {
      const md = exportGridToMarkdown(columns, evaluated, false);
      navigator.clipboard?.writeText(md).then(() => {
        setCopiedMd(true);
        window.setTimeout(() => setCopiedMd(false), 1600);
      }).catch(() => {});
    };

    const handleDownloadCsv = () => {
      const csv = '\uFEFF' + exportGridToCsv(columns, evaluated);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bang-tinh';
      triggerBlobDownload(blob, `${slug}.csv`);
    };

    const handleInsertIntoChat = () => {
      if (!onInsertMarkdown) return;
      const payload = JSON.stringify({ title, columns, rows });
      onInsertMarkdown(`\`\`\`spreadsheet\n${payload}\n\`\`\``);
    };

    const borderCls = isLight ? 'border-gray-200' : 'border-white/10';
    const surfaceCls = isLight
      ? 'bg-white text-gray-900'
      : isFullscreen
      ? 'bg-zinc-950 text-zinc-100'
      : 'bg-secondary/45 text-zinc-100';
    const subSurfaceCls = isLight ? 'bg-gray-50' : 'bg-primary/40';

    return (
      <div
        className={`${
          isFullscreen
            ? 'fixed inset-0 z-[150] m-0 w-screen h-[100dvh] rounded-none border-0 flex flex-col'
            : 'my-3 rounded-xl border overflow-hidden'
        } ${borderCls} ${surfaceCls}`}
      >
        {/* Top Toolbar */}
        <div className={`px-3 py-2 border-b flex flex-wrap items-center justify-between gap-2 ${borderCls} ${subSurfaceCls}`}>
          <div className="flex items-center gap-2 min-w-0">
            <Table2 size={14} className="text-text-secondary shrink-0" />
            {isEditingMode ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="Tiêu đề bảng tính"
                className={`text-xs font-semibold bg-transparent border-b border-transparent focus:border-border-color outline-none min-w-[120px] max-w-[220px] truncate`}
              />
            ) : (
              <span className="text-xs font-semibold truncate">{title}</span>
            )}
            <span className="text-[11px] font-mono tabular-nums text-text-secondary whitespace-nowrap">
              {rows.length}×{columns.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] ${borderCls}`}>
              <Search size={11} className="text-text-secondary shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Lọc..."
                className="w-20 sm:w-28 bg-transparent outline-none text-[11px]"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsEditingMode((v) => !v)}
              className={`px-2.5 py-1 rounded-md border text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                isEditingMode
                  ? isLight
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-950 border-white'
                  : `${borderCls} text-text-secondary hover:text-text-primary`
              }`}
            >
              {isEditingMode ? 'Đang sửa' : 'Bảng tính'}
            </button>

            <button
              type="button"
              onClick={handleCopyMarkdown}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] whitespace-nowrap shrink-0 ${borderCls} text-text-secondary hover:text-text-primary`}
              title="Sao chép bảng Markdown"
            >
              {copiedMd ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
              <span>MD</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] whitespace-nowrap shrink-0 ${borderCls} text-text-secondary hover:text-text-primary`}
              title="Tải xuống CSV (Excel)"
            >
              <Download size={11} />
              <span>CSV</span>
            </button>

            {onInsertMarkdown && (
              <button
                type="button"
                onClick={handleInsertIntoChat}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-blue-500/40 bg-blue-600 text-white text-[11px] font-medium whitespace-nowrap shrink-0 hover:bg-blue-500 transition-colors"
              >
                <Send size={11} />
                <span>Chèn vào Chat</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              className={`p-1 rounded-md border transition-colors ${
                isFullscreen
                  ? isLight
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-950 border-white'
                  : `${borderCls} text-text-secondary hover:text-text-primary`
              }`}
              title={isFullscreen ? 'Thu nhỏ (Esc)' : 'Xem toàn màn hình'}
              aria-label={isFullscreen ? 'Thu nhỏ' : 'Xem toàn màn hình'}
            >
              {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
        </div>

        {/* Formula & Row/Col Action Bar (when editing) */}
        {isEditingMode && (
          <div className={`px-3 py-1.5 border-b flex flex-wrap items-center gap-2 text-[11px] ${borderCls}`}>
            <span className={`px-2 py-0.5 rounded border font-mono tabular-nums font-medium ${borderCls}`}>
              {selectedCoordLabel}
            </span>
            <span className="font-mono text-text-secondary">fx</span>
            <input
              type="text"
              value={selectedRawValue}
              onChange={(e) => {
                if (!selectedCell) return;
                updateCell(selectedCell.row, selectedCell.col, e.target.value);
              }}
              placeholder="Nhập giá trị hoặc công thức (=SUM(B1:B4), =B1*C1, =IF(...))"
              className={`flex-1 min-w-[180px] px-2 py-1 rounded border font-mono text-[11px] outline-none ${
                isLight
                  ? 'bg-white border-gray-300 text-gray-900 focus:border-gray-500'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-zinc-600'
              }`}
            />
            {selectedEval?.isFormula && (
              <span
                className={`font-mono tabular-nums text-[11px] whitespace-nowrap ${
                  selectedEval.error ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                = {formatEvaluatedDisplay(selectedEval.value)}
              </span>
            )}

            <div className="flex flex-wrap items-center gap-1 shrink-0">
              {(['SUM', 'AVERAGE', 'MIN', 'MAX'] as const).map((fn) => (
                <button
                  key={fn}
                  type="button"
                  onClick={() => insertQuickColumnFormula(fn)}
                  className={`px-1.5 py-0.5 rounded border font-mono text-[10px] whitespace-nowrap ${borderCls} text-text-secondary hover:text-text-primary`}
                  title={`Thêm hàng tính ${fn} cho cột đang chọn`}
                >
                  {fn === 'AVERAGE' ? 'AVG' : fn}
                </button>
              ))}
              <button
                type="button"
                onClick={addRow}
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded border text-[10px] whitespace-nowrap ${borderCls} hover:bg-secondary`}
                title="Thêm hàng"
              >
                <Plus size={10} /> Hàng
              </button>
              <button
                type="button"
                onClick={addColumn}
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded border text-[10px] whitespace-nowrap ${borderCls} hover:bg-secondary`}
                title="Thêm cột"
              >
                <Columns size={10} /> Cột
              </button>
              <button
                type="button"
                onClick={deleteSelectedRow}
                disabled={rows.length <= 1 || !selectedCell}
                className={`p-1 rounded border text-[10px] disabled:opacity-35 ${borderCls} text-text-secondary hover:text-rose-400`}
                title="Xóa hàng đang chọn"
              >
                <Trash2 size={11} />
              </button>
              <button
                type="button"
                onClick={deleteSelectedCol}
                disabled={columns.length <= 1 || !selectedCell}
                className={`px-1.5 py-0.5 rounded border text-[10px] disabled:opacity-35 ${borderCls} text-text-secondary hover:text-rose-400`}
                title="Xóa cột đang chọn"
              >
                -Cột
              </button>
            </div>
          </div>
        )}

        {/* Data Grid */}
        <div className={`overflow-x-auto ${isFullscreen ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-[380px]'}`}>
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead className={`sticky top-0 z-10 ${isLight ? 'bg-gray-100' : 'bg-zinc-900'}`}>
              <tr>
                <th
                  className={`w-10 px-2 py-2 text-center font-mono text-[10px] text-text-secondary border-b border-r ${borderCls}`}
                >
                  #
                </th>
                {columns.map((col, cIdx) => {
                  const sorted = sortState?.col === cIdx ? sortState.dir : null;
                  return (
                    <th
                      key={cIdx}
                      className={`min-w-[110px] px-2.5 py-2 text-left font-semibold border-b border-r last:border-r-0 ${borderCls}`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-text-secondary shrink-0">
                            {colIndexToLetter(cIdx)}
                          </span>
                          {isEditingMode && editingColIdx === cIdx ? (
                            <input
                              type="text"
                              autoFocus
                              value={col}
                              onChange={(e) =>
                                setColumns((prev) =>
                                  prev.map((name, i) => (i === cIdx ? e.target.value : name))
                                )
                              }
                              onBlur={() => setEditingColIdx(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Escape') setEditingColIdx(null);
                              }}
                              className="w-full bg-transparent border-b border-blue-500 outline-none text-xs font-semibold"
                            />
                          ) : (
                            <span
                              onDoubleClick={() => {
                                if (isEditingMode) setEditingColIdx(cIdx);
                              }}
                              title={isEditingMode ? 'Nhấp đúp để đổi tên cột' : col}
                              className="truncate cursor-text"
                            >
                              {col}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSortState((prev) =>
                              prev?.col === cIdx
                                ? prev.dir === 'asc'
                                  ? { col: cIdx, dir: 'desc' }
                                  : null
                                : { col: cIdx, dir: 'asc' }
                            )
                          }
                          className={`p-0.5 rounded transition-colors ${
                            sorted ? 'text-blue-400' : 'text-text-secondary/60 hover:text-text-primary'
                          }`}
                          title="Sắp xếp cột"
                        >
                          <ArrowDownUp size={11} />
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {visibleRowIndices.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-6 text-center text-xs text-text-secondary"
                  >
                    Không có dòng nào phù hợp bộ lọc &ldquo;{searchQuery}&rdquo;.
                  </td>
                </tr>
              ) : (
                visibleRowIndices.map((rIdx) => (
                  <tr
                    key={rIdx}
                    className={isLight ? 'hover:bg-gray-50' : 'hover:bg-white/[0.03]'}
                  >
                    <td
                      className={`px-2 py-1.5 text-center font-mono text-[10px] text-text-secondary border-b border-r select-none ${borderCls}`}
                    >
                      {rIdx + 1}
                    </td>
                    {columns.map((_, cIdx) => {
                      const isSel = selectedCell?.row === rIdx && selectedCell?.col === cIdx;
                      const cell = evaluated[rIdx]?.[cIdx];
                      const isNumeric = cell?.numericValue !== null && cell?.numericValue !== undefined;
                      const displayVal = cell
                        ? cell.error
                          ? cell.error
                          : formatEvaluatedDisplay(cell.value)
                        : '';

                      return (
                        <td
                          key={cIdx}
                          onClick={() => setSelectedCell({ row: rIdx, col: cIdx })}
                          className={`px-2.5 py-1.5 border-b border-r last:border-r-0 ${borderCls} ${
                            isSel ? 'ring-1 ring-inset ring-blue-500 bg-blue-500/5' : ''
                          } ${isNumeric ? 'text-right font-mono tabular-nums' : 'text-left'}`}
                        >
                          {isEditingMode && isSel ? (
                            <input
                              type="text"
                              value={rows[rIdx]?.[cIdx] ?? ''}
                              onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                              className={`w-full bg-transparent outline-none text-xs ${
                                isNumeric ? 'text-right font-mono' : 'text-left'
                              }`}
                            />
                          ) : (
                            <span
                              className={`block truncate ${
                                cell?.error
                                  ? 'text-rose-400 font-mono'
                                  : cell?.isFormula
                                  ? 'font-semibold'
                                  : ''
                              }`}
                              title={cell?.isFormula ? `${cell.raw} → ${displayVal}` : displayVal}
                            >
                              {displayVal || (isEditingMode ? ' ' : '—')}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
);
