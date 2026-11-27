import { FileOperationRecord, WorkspaceFile } from '../types';
import { computeLineDiff } from './lineDiff';
import { ParsedFileBlock } from './fileGenerator';

export function cleanWorkspacePath(rawPath: string): string {
  return String(rawPath || '')
    .trim()
    .replace(/^[*_`"'<]+|[*_`"'<>]+$/g, '')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .trim();
}

export function resolveWorkspaceFilePath(files: WorkspaceFile[], rawPath: string): string {
  const clean = cleanWorkspacePath(rawPath);
  if (!clean) return '';

  // 1. Exact path match
  const exact = files.find((f) => f.path === clean);
  if (exact) return exact.path;

  // 2. Case-insensitive exact path match
  const lower = clean.toLowerCase();
  const ciExact = files.find((f) => f.path.toLowerCase() === lower);
  if (ciExact) return ciExact.path;

  // 3. Unique suffix match (e.g. App.tsx -> src/App.tsx ONLY when unambiguous)
  const suffixMatches = files.filter((f) => f.path.toLowerCase().endsWith('/' + lower));
  if (suffixMatches.length === 1) {
    return suffixMatches[0].path;
  }

  // 4. Unique basename match (ONLY when requested path is bare filename without '/')
  if (!clean.includes('/')) {
    const nameMatches = files.filter((f) => f.name.toLowerCase() === lower);
    if (nameMatches.length === 1) {
      return nameMatches[0].path;
    }
  }

  return clean;
}

export interface AppliedWorkspaceChangeSet {
  nextFiles: WorkspaceFile[];
  updatedPaths: string[];
  operations: FileOperationRecord[];
}

export function applyWorkspaceFileChanges(
  prevFiles: WorkspaceFile[],
  filesToApply: Array<{ path: string; content: string }>,
  deletePaths: string[] = []
): AppliedWorkspaceChangeSet {
  const next = prevFiles.map((f) => ({ ...f }));
  const opsByKey = new Map<string, FileOperationRecord>();
  const updatedPaths: string[] = [];

  for (const item of filesToApply) {
    const resolvedPath = resolveWorkspaceFilePath(next, item.path);
    if (!resolvedPath) continue;

    const key = resolvedPath.toLowerCase();
    const idx = next.findIndex((f) => f.path.toLowerCase() === key);
    const oldContent = idx >= 0 && !next[idx].isBinary ? (next[idx].content ?? '') : undefined;
    const action: 'create' | 'edit' = idx >= 0 ? 'edit' : 'create';
    const newContent = item.content ?? '';

    const diff =
      action === 'edit' && oldContent !== undefined
        ? computeLineDiff(oldContent, newContent, 2)
        : {
            added: newContent ? newContent.replace(/\r\n/g, '\n').split('\n').length : 0,
            removed: 0,
          };

    if (idx >= 0) {
      next[idx] = {
        ...next[idx],
        content: newContent,
        size: typeof Blob !== 'undefined' ? new Blob([newContent]).size : newContent.length,
        isBinary: false,
      };
    } else {
      next.push({
        path: resolvedPath,
        name: resolvedPath.split('/').pop() || resolvedPath,
        mimeType: 'text/plain',
        size: typeof Blob !== 'undefined' ? new Blob([newContent]).size : newContent.length,
        content: newContent,
        isBinary: false,
      });
    }

    if (!updatedPaths.includes(resolvedPath)) {
      updatedPaths.push(resolvedPath);
    }

    const prevOp = opsByKey.get(key);
    const originalOld = prevOp?.oldContent ?? oldContent;
    const finalAction: 'create' | 'edit' = prevOp?.action === 'create' ? 'create' : action;
    const finalDiff =
      finalAction === 'edit' && originalOld !== undefined
        ? computeLineDiff(originalOld, newContent, 2)
        : {
            added: newContent ? newContent.replace(/\r\n/g, '\n').split('\n').length : 0,
            removed: 0,
          };

    opsByKey.set(key, {
      path: resolvedPath,
      action: finalAction,
      status: 'done',
      oldContent: originalOld,
      newContent,
      addedLines: finalDiff.added,
      removedLines: finalDiff.removed,
    });
  }

  for (const rawDel of deletePaths) {
    const resolvedDel = resolveWorkspaceFilePath(next, rawDel);
    if (!resolvedDel) continue;
    const key = resolvedDel.toLowerCase();
    const idx = next.findIndex((f) => f.path.toLowerCase() === key);
    if (idx >= 0) {
      const removedContent = !next[idx].isBinary ? (next[idx].content ?? '') : undefined;
      next.splice(idx, 1);
      opsByKey.set(key, {
        path: resolvedDel,
        action: 'delete',
        status: 'done',
        oldContent: removedContent,
        newContent: '',
        addedLines: 0,
        removedLines: removedContent ? removedContent.replace(/\r\n/g, '\n').split('\n').length : 0,
      });
    } else if (!opsByKey.has(key)) {
      opsByKey.set(key, {
        path: resolvedDel,
        action: 'delete',
        status: 'done',
        addedLines: 0,
        removedLines: 0,
      });
    }
  }

  return {
    nextFiles: next,
    updatedPaths,
    operations: Array.from(opsByKey.values()),
  };
}

export function mergeOperationsForChat(
  appliedOps: FileOperationRecord[],
  parsedOps: FileOperationRecord[],
  extractedBlocks: ParsedFileBlock[] = []
): FileOperationRecord[] {
  const merged = new Map<string, FileOperationRecord>();

  for (const op of appliedOps) {
    merged.set(op.path.toLowerCase(), op);
  }

  for (const op of parsedOps) {
    const clean = cleanWorkspacePath(op.path);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (merged.has(key)) continue;

    // Also match if clean was a basename/suffix of an already-applied file
    const suffixMatch = Array.from(merged.values()).find(
      (m) => m.path.toLowerCase().endsWith('/' + key) || m.path.toLowerCase() === key
    );
    if (suffixMatch) continue;

    const matchedBlock = extractedBlocks.find(
      (b) => cleanWorkspacePath(b.filename).toLowerCase() === key
    );
    const newContent = matchedBlock?.content;
    merged.set(key, {
      ...op,
      path: clean,
      newContent: op.newContent ?? newContent,
      addedLines:
        op.addedLines ??
        (newContent ? newContent.replace(/\r\n/g, '\n').split('\n').length : undefined),
    });
  }

  return Array.from(merged.values());
}
