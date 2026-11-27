import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeLineDiff } from '../src/lib/lineDiff';
import {
  applyWorkspaceFileChanges,
  mergeOperationsForChat,
  resolveWorkspaceFilePath,
} from '../src/lib/workspaceOps';
import { runWorkspaceBuildCheck } from '../src/lib/workspaceBuilder';
import { classifyImplicitVisualIntent } from '../src/lib/neuralBridge';
import { extractFileOperationsFromMarkdown, extractFilesFromMarkdown } from '../src/lib/fileGenerator';
import { WorkspaceFile } from '../src/types';

const mk = (filePath: string, content: string): WorkspaceFile => ({
  path: filePath,
  name: filePath.split('/').pop() || filePath,
  mimeType: 'text/plain',
  size: content.length,
  content,
  isBinary: false,
});

describe('Line Diff & Workspace Path Resolution', () => {
  it('computes accurate line additions, deletions, and hunk markers', () => {
    const oldText = ['line 1', 'line 2', 'const a = 1;', 'line 4', 'line 5'].join('\n');
    const newText = ['line 1', 'line 2', 'const a = 2;', 'const b = 3;', 'line 4', 'line 5'].join('\n');

    const diff = computeLineDiff(oldText, newText, 1);
    expect(diff.hasChanges).toBe(true);
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(1);
    expect(diff.lines.some((l) => l.type === 'remove' && l.text === 'const a = 1;')).toBe(true);
    expect(diff.lines.some((l) => l.type === 'add' && l.text === 'const b = 3;')).toBe(true);

    const same = computeLineDiff(oldText, oldText);
    expect(same.hasChanges).toBe(false);
    expect(same.added).toBe(0);
    expect(same.removed).toBe(0);
    expect(same.lines).toHaveLength(0);
  });

  it('resolves unambiguous paths without overwriting colliding basenames across directories', () => {
    const files: WorkspaceFile[] = [
      mk('src/App.tsx', 'export default function App() { return null; }'),
      mk('src/utils/index.ts', 'export const util = 1;'),
      mk('src/components/index.ts', 'export const comp = 2;'),
    ];

    // Unambiguous basename resolves to existing nested file
    expect(resolveWorkspaceFilePath(files, 'App.tsx')).toBe('src/App.tsx');
    expect(resolveWorkspaceFilePath(files, './src/App.tsx')).toBe('src/App.tsx');

    // Ambiguous basename across 2 folders MUST NOT silently pick one and overwrite it
    expect(resolveWorkspaceFilePath(files, 'index.ts')).toBe('index.ts');

    // Unambiguous subpath matches cleanly
    expect(resolveWorkspaceFilePath(files, 'components/index.ts')).toBe('src/components/index.ts');
  });

  it('snapshots pre-edit oldContent, newContent, line deltas, and deletions accurately', () => {
    const initial: WorkspaceFile[] = [
      mk('src/App.tsx', 'import React from "react";\nexport default function App() {\n  return <div>Old</div>;\n}'),
      mk('src/legacy.ts', 'export const oldFlag = true;'),
    ];

    const changeSet = applyWorkspaceFileChanges(
      initial,
      [
        {
          path: 'App.tsx',
          content: 'import React from "react";\nexport default function App() {\n  return <div>New</div>;\n  // ok\n}',
        },
        {
          path: 'src/helper.ts',
          content: 'export const sum = (a: number, b: number) => a + b;',
        },
      ],
      ['src/legacy.ts']
    );

    expect(changeSet.updatedPaths).toEqual(['src/App.tsx', 'src/helper.ts']);
    expect(changeSet.nextFiles.some((f) => f.path === 'src/legacy.ts')).toBe(false);

    const editOp = changeSet.operations.find((o) => o.path === 'src/App.tsx');
    expect(editOp?.action).toBe('edit');
    expect(editOp?.oldContent).toContain('Old');
    expect(editOp?.newContent).toContain('New');
    expect(editOp?.addedLines).toBeGreaterThanOrEqual(2);
    expect(editOp?.removedLines).toBeGreaterThanOrEqual(1);

    const createOp = changeSet.operations.find((o) => o.path === 'src/helper.ts');
    expect(createOp?.action).toBe('create');
    expect(createOp?.addedLines).toBe(1);

    const delOp = changeSet.operations.find((o) => o.path === 'src/legacy.ts');
    expect(delOp?.action).toBe('delete');
    expect(delOp?.removedLines).toBe(1);

    const md = 'FILENAME: src/App.tsx\n```tsx\nexport default function App() { return null; }\n```';
    const blocks = extractFilesFromMarkdown(md);
    const parsedOps = extractFileOperationsFromMarkdown(md, ['src/App.tsx'], false);
    const merged = mergeOperationsForChat(changeSet.operations, parsedOps, blocks);
    expect(merged.filter((m) => m.path === 'src/App.tsx')).toHaveLength(1);
    expect(merged.find((m) => m.path === 'src/App.tsx')?.oldContent).toContain('Old');
  });
});

describe('Enhanced Folder Static Build Verification', () => {
  it('flags missing relative/@ imports, wrong named export symbols, bare hooks, and missing default export on App', () => {
    const broken = runWorkspaceBuildCheck([
      mk(
        'src/utils/math.ts',
        'export const add = (a: number, b: number) => a + b;'
      ),
      mk(
        'src/App.tsx',
        [
          "import { add, nonExistentSymbol } from './utils/math';",
          "import missingThing from '@/components/Missing';",
          'export function App() {',
          '  const [count, setCount] = useState(0);',
          '  return <button onClick={() => setCount(add(count, 1))}>{count}</button>;',
          '}',
        ].join('\n')
      ),
    ]);

    expect(broken.ok).toBe(false);
    expect(broken.errors.some((e) => e.includes('nonExistentSymbol'))).toBe(true);
    expect(broken.errors.some((e) => e.includes('@/components/Missing'))).toBe(true);
    expect(broken.errors.some((e) => e.includes('useState()'))).toBe(true);
    expect(broken.errors.some((e) => e.includes('export default'))).toBe(true);
  });

  it('passes cleanly on valid modular React + TypeScript folders using @/ aliases', () => {
    const valid = runWorkspaceBuildCheck([
      mk('index.html', '<!DOCTYPE html><html><body><div id="root"></div></body></html>'),
      mk('src/utils/math.ts', 'export const add = (a: number, b: number) => a + b;'),
      mk(
        'src/App.tsx',
        [
          "import React, { useState } from 'react';",
          "import { add } from '@/utils/math';",
          'export default function App() {',
          '  const [count, setCount] = useState(0);',
          '  return (',
          '    <div>',
          '      <div onClick={() => setCount((c) => c + 1)} />',
          '      <button onClick={() => setCount(add(count, 1))}>{count}</button>',
          '    </div>',
          '  );',
          '}',
        ].join('\n')
      ),
    ]);

    expect(valid.errors).toEqual([]);
    expect(valid.ok).toBe(true);
  });
});

describe('Implicit Visual & Spreadsheet Intent Classification + Clean Minimal UI', () => {
  it('infers charts, spreadsheets, or plain text automatically without explicit trigger keywords', () => {
    const parabola = classifyImplicitVisualIntent('Khảo sát và tìm cực trị hàm số y = x^2 - 4x + 3');
    expect(parabola.preferChart).toBe(true);
    expect(parabola.suppressVisuals).toBe(false);

    const compare = classifyImplicitVisualIntent('So sánh doanh thu giữa quý 1 và quý 2');
    expect(compare.preferChart).toBe(true);

    const budget = classifyImplicitVisualIntent('Lập dự toán chi tiêu hàng tháng gồm tiền nhà, ăn uống, tiết kiệm');
    expect(budget.preferSpreadsheet).toBe(true);
    expect(budget.suppressVisuals).toBe(false);

    const debug = classifyImplicitVisualIntent('Fix lỗi TypeError trong file src/App.tsx giúp mình');
    expect(debug.suppressVisuals).toBe(true);
    expect(debug.preferChart).toBe(false);

    const qa = classifyImplicitVisualIntent('Thủ đô của Nhật Bản là gì?');
    expect(qa.suppressVisuals).toBe(true);
    expect(qa.preferChart).toBe(false);
    expect(qa.preferSpreadsheet).toBe(false);
  });

  it('keeps standalone table/spreadsheet launcher buttons removed while retaining ```spreadsheet block support', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf-8');
    const mdSource = fs.readFileSync(path.resolve(__dirname, '../src/components/MarkdownRenderer.tsx'), 'utf-8');

    expect(appSource).not.toContain('isSpreadsheetLabOpen');
    expect(appSource).not.toContain('<span>Bảng tính</span>');
    expect(mdSource).not.toContain('Mở Bảng tính');
    expect(mdSource).toContain('SpreadsheetTableBlock');
  });
});
