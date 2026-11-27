import { describe, it, expect } from 'vitest';
import {
  extractFileOperationsFromMarkdown,
  extractFilesFromMarkdown,
  stripFileOperationMarkers,
} from '../src/lib/fileGenerator';
import {
  evaluateSpreadsheetGrid,
  exportGridToCsv,
  exportGridToMarkdown,
  parseSpreadsheetInput,
} from '../src/lib/spreadsheetEngine';
import { getSystemPrompt } from '../src/lib/neuralBridge';
import { AIMode, Language } from '../src/types';

describe('File Workflow Tracking & Interactive Spreadsheet Engine', () => {
  it('extracts create, edit, delete, and live streaming file operations cleanly', () => {
    const existing = ['src/App.tsx', 'src/oldHelper.ts'];
    const md = [
      'Đang tiến hành sửa lỗi dự án:',
      '',
      'FILENAME: src/App.tsx',
      '```tsx',
      'export default function App() { return null; }',
      '```',
      '',
      'FILENAME: src/newUtil.ts',
      '```ts',
      'export const x = 1;',
      '```',
      '',
      'DELETE_FILE: src/oldHelper.ts',
      '',
      'FILENAME: src/streamingFile.ts',
      '```ts',
      'export const pending = true;',
    ].join('\n');

    const liveOps = extractFileOperationsFromMarkdown(md, existing, true);
    expect(liveOps).toEqual([
      { path: 'src/oldHelper.ts', action: 'delete', status: 'done' },
      { path: 'src/App.tsx', action: 'edit', status: 'done' },
      { path: 'src/newUtil.ts', action: 'create', status: 'done' },
      { path: 'src/streamingFile.ts', action: 'create', status: 'running' },
    ]);

    const cleaned = stripFileOperationMarkers(md);
    expect(cleaned).not.toContain('DELETE_FILE:');

    // Spreadsheet blocks should NOT be extracted as downloadable code files
    const withSheet = '```spreadsheet\n{"title":"T","columns":["A"],"rows":[["1"]]}\n```';
    expect(extractFilesFromMarkdown(withSheet).length).toBe(0);
    expect(extractFileOperationsFromMarkdown(withSheet, [], false).length).toBe(0);
  });

  it('evaluates spreadsheet formulas safely including ranges, IF, ROUND, and cycle detection', () => {
    const grid = parseSpreadsheetInput(
      JSON.stringify({
        title: 'Doanh thu',
        columns: ['Mục', 'SL', 'Đơn giá', 'Thành tiền', 'Đánh giá'],
        rows: [
          ['SP A', '2', '100', '=B1*C1', '=IF(D1>=200,"Đạt","Thấp")'],
          ['SP B', '3', '150', '=B2*C2', '=IF(D2>=200,"Đạt","Thấp")'],
          ['Tổng', '=SUM(B1:B2)', '=ROUND(AVERAGE(C1:C2),1)', '=SUM(D1:D2)', ''],
        ],
      })
    );

    const evaluated = evaluateSpreadsheetGrid(grid.rows);
    expect(evaluated[0][3].value).toBe(200);
    expect(evaluated[0][4].value).toBe('Đạt');
    expect(evaluated[1][3].value).toBe(450);
    expect(evaluated[2][1].value).toBe(5);
    expect(evaluated[2][2].value).toBe(125);
    expect(evaluated[2][3].value).toBe(650);

    const csv = exportGridToCsv(grid.columns, evaluated);
    expect(csv).toContain('Mục,SL,Đơn giá,Thành tiền,Đánh giá');
    expect(csv).toContain('Tổng,5,125,650,');

    const md = exportGridToMarkdown(grid.columns, evaluated);
    expect(md).toContain('| Tổng | 5 | 125 | 650 |');
  });

  it('guards against circular references and division by zero cleanly', () => {
    const evalErr = evaluateSpreadsheetGrid([
      ['=B1+1', '=A1+1', '=10/0'],
    ]);
    expect(evalErr[0][0].error).toBe('#CYCLE!');
    expect(evalErr[0][1].error).toBe('#CYCLE!');
    expect(evalErr[0][2].error).toBe('#DIV/0!');
  });

  it('parses Markdown tables into spreadsheet grids and documents DELETE_FILE & spreadsheet in system prompt', () => {
    const mdTable = [
      '| Tên | Điểm |',
      '| --- | --- |',
      '| An | 8 |',
      '| Bình | 9 |',
      '| TB | =AVERAGE(B1:B2) |',
    ].join('\n');

    const grid = parseSpreadsheetInput(mdTable);
    expect(grid.columns).toEqual(['Tên', 'Điểm']);
    const evalMd = evaluateSpreadsheetGrid(grid.rows);
    expect(evalMd[2][1].value).toBe(8.5);

    const prompt = getSystemPrompt(AIMode.CODE, Language.VIETNAMESE, '', '', false, 1);
    expect(prompt).toContain('DELETE_FILE:');
    expect(prompt).toContain('```spreadsheet');
  });
});
