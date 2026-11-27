import React, { useEffect, useMemo, useState } from 'react';
import { History, X } from 'lucide-react';
import {
  CURRENT_RELEASE_NAME,
  CURRENT_RELEASE_VERSION,
  UPDATE_CATEGORIES,
  UPDATE_LOG_ENTRIES,
  UpdateCategoryId,
} from '../lib/updateLogData';

interface UpdateLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLight: boolean;
}

export const UpdateLogModal: React.FC<UpdateLogModalProps> = ({
  isOpen,
  onClose,
  isLight,
}) => {
  const [category, setCategory] = useState<UpdateCategoryId>('all');

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    if (category === 'all') return UPDATE_LOG_ENTRIES;
    return UPDATE_LOG_ENTRIES.filter((item) => item.category === category);
  }, [category]);

  if (!isOpen) return null;

  const categoryLabel = (id: UpdateCategoryId) =>
    UPDATE_CATEGORIES.find((c) => c.id === id)?.label || id;

  return (
    <div
      className="fixed inset-0 z-[9995] bg-black/65 flex items-center justify-center p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Update Log"
        className={`w-full max-w-3xl max-h-[86vh] rounded-xl border flex flex-col overflow-hidden ${
          isLight
            ? 'bg-white border-gray-200 text-gray-900'
            : 'bg-zinc-950 border-zinc-800 text-zinc-100'
        }`}
      >
        <div
          className={`px-4 sm:px-5 py-3.5 border-b flex items-center justify-between gap-3 shrink-0 ${
            isLight ? 'border-gray-200' : 'border-zinc-800'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <History size={16} className="shrink-0 text-text-secondary" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight truncate">
                Update Log · {CURRENT_RELEASE_VERSION}
              </h2>
              <p className="text-[11px] text-text-secondary truncate font-mono tabular-nums">
                {CURRENT_RELEASE_NAME} · {UPDATE_LOG_ENTRIES.length} bản cập nhật gần nhất
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border-color text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Đóng Update Log"
          >
            <X size={15} />
          </button>
        </div>

        <div
          className={`px-4 sm:px-5 py-2.5 border-b flex flex-wrap items-center gap-1.5 shrink-0 ${
            isLight ? 'border-gray-200 bg-gray-50/70' : 'border-zinc-800 bg-zinc-900/40'
          }`}
        >
          {UPDATE_CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? isLight
                      ? 'bg-zinc-900 text-white font-medium'
                      : 'bg-white text-zinc-950 font-medium'
                    : isLight
                    ? 'text-gray-600 hover:bg-gray-200/70 hover:text-gray-900'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 divide-y divide-border-color/60">
          {filtered.map((entry) => (
            <article key={entry.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-secondary font-mono tabular-nums">
                <span>{entry.date}</span>
                {entry.version && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-text-primary/80">{entry.version}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-sans">{categoryLabel(entry.category)}</span>
              </div>
              <h3 className="text-sm font-semibold text-text-primary leading-snug">
                {entry.title}
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                {entry.summary}
              </p>
              <ul className="space-y-1 pt-0.5 text-xs text-text-primary/90">
                {entry.details.map((line, idx) => (
                  <li key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-text-secondary select-none">–</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UpdateLogModal;
