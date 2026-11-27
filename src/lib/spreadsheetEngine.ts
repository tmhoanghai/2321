export interface SpreadsheetGridData {
  title: string;
  columns: string[];
  rows: string[][];
}

export interface CellEvalResult {
  raw: string;
  value: string | number;
  numericValue: number | null;
  isFormula: boolean;
  error?: string;
}

export function colIndexToLetter(index: number): string {
  let n = index;
  let result = '';
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

export function letterToColIndex(letters: string): number {
  const upper = letters.toUpperCase().trim();
  let col = 0;
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code < 65 || code > 90) return -1;
    col = col * 26 + (code - 64);
  }
  return col - 1;
}

export function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = ref.trim().toUpperCase().match(/^\$?([A-Z]{1,3})\$?(\d{1,5})$/);
  if (!m) return null;
  const col = letterToColIndex(m[1]);
  const row = Number(m[2]) - 1;
  if (col < 0 || row < 0) return null;
  return { col, row };
}

export function expandRangeRefs(startRef: string, endRef: string): Array<{ col: number; row: number }> {
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef);
  if (!start || !end) return [];
  const rMin = Math.min(start.row, end.row);
  const rMax = Math.max(start.row, end.row);
  const cMin = Math.min(start.col, end.col);
  const cMax = Math.max(start.col, end.col);
  if ((rMax - rMin + 1) * (cMax - cMin + 1) > 2500) return [];
  const out: Array<{ col: number; row: number }> = [];
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      out.push({ col: c, row: r });
    }
  }
  return out;
}

function toNumberLoose(val: string | number | null | undefined): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  const cleaned = s.replace(/,/g, '').replace(/%$/, '');
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return s.endsWith('%') ? num / 100 : num;
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'ref'; col: number; row: number }
  | { type: 'range'; cells: Array<{ col: number; row: number }> }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

function tokenizeFormula(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = expr.length;

  while (i < n) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if (ch === ',' || ch === ';') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = '';
      while (i < n && expr[i] !== quote) {
        str += expr[i++];
      }
      if (i < n && expr[i] === quote) i++;
      tokens.push({ type: 'str', value: str });
      continue;
    }
    // Two-char comparison operators
    const two = expr.slice(i, i + 2);
    if (['>=', '<=', '<>', '!='].includes(two)) {
      tokens.push({ type: 'op', value: two === '<>' ? '!=' : two });
      i += 2;
      continue;
    }
    if ('+-*/^%><='.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    // Number
    if (/\d/.test(ch) || (ch === '.' && i + 1 < n && /\d/.test(expr[i + 1]))) {
      let numStr = '';
      while (i < n && /[\d.]/.test(expr[i])) {
        numStr += expr[i++];
      }
      const parsed = Number(numStr);
      if (Number.isNaN(parsed)) throw new Error('#ERR!');
      tokens.push({ type: 'num', value: parsed });
      continue;
    }
    // Range A1:B5, Cell Ref A1, or Identifier/Function SUM
    if (/[$A-Za-z_]/.test(ch)) {
      let word = '';
      while (i < n && /[$A-Za-z0-9_:]/.test(expr[i])) {
        word += expr[i++];
      }
      if (word.includes(':')) {
        const [a, b] = word.split(':');
        const cells = expandRangeRefs(a || '', b || '');
        if (cells.length === 0) throw new Error('#REF!');
        tokens.push({ type: 'range', cells });
        continue;
      }
      const ref = parseCellRef(word);
      if (ref) {
        tokens.push({ type: 'ref', col: ref.col, row: ref.row });
        continue;
      }
      tokens.push({ type: 'ident', value: word.toUpperCase() });
      continue;
    }
    throw new Error('#ERR!');
  }

  return tokens;
}

type EvalValue = number | string | Array<number | string>;

export function evaluateSpreadsheetGrid(rows: string[][]): CellEvalResult[][] {
  const rowCount = rows.length;
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const cache = new Map<string, CellEvalResult>();
  const visiting = new Set<string>();

  const getCellRaw = (r: number, c: number): string => {
    if (r < 0 || r >= rowCount || c < 0 || c >= colCount) return '';
    return String(rows[r]?.[c] ?? '');
  };

  const evalCell = (r: number, c: number): CellEvalResult => {
    const key = `${r}:${c}`;
    if (cache.has(key)) return cache.get(key)!;

    const raw = getCellRaw(r, c);
    const trimmed = raw.trim();
    if (!trimmed.startsWith('=')) {
      const num = toNumberLoose(trimmed);
      const res: CellEvalResult = {
        raw,
        value: num !== null && !/^0\d+$/.test(trimmed) ? num : trimmed,
        numericValue: num,
        isFormula: false,
      };
      cache.set(key, res);
      return res;
    }

    if (visiting.has(key)) {
      return { raw, value: '#CYCLE!', numericValue: null, isFormula: true, error: '#CYCLE!' };
    }
    visiting.add(key);

    try {
      const tokens = tokenizeFormula(trimmed.slice(1));
      let pos = 0;

      const peek = () => tokens[pos];
      const consume = () => tokens[pos++];

      const flattenNumbers = (args: EvalValue[]): number[] => {
        const nums: number[] = [];
        for (const arg of args) {
          if (Array.isArray(arg)) {
            for (const item of arg) {
              const n = toNumberLoose(item);
              if (n !== null) nums.push(n);
            }
          } else {
            const n = toNumberLoose(arg);
            if (n !== null) nums.push(n);
          }
        }
        return nums;
      };

      const callFn = (fnName: string, args: EvalValue[]): EvalValue => {
        const nums = flattenNumbers(args);
        switch (fnName) {
          case 'SUM':
          case 'TONG':
            return nums.reduce((acc, v) => acc + v, 0);
          case 'AVERAGE':
          case 'AVG':
          case 'TRUNGBINH':
            return nums.length > 0 ? nums.reduce((acc, v) => acc + v, 0) / nums.length : 0;
          case 'MIN':
            return nums.length > 0 ? Math.min(...nums) : 0;
          case 'MAX':
            return nums.length > 0 ? Math.max(...nums) : 0;
          case 'COUNT':
            return nums.length;
          case 'COUNTA': {
            let cnt = 0;
            for (const arg of args) {
              if (Array.isArray(arg)) {
                cnt += arg.filter((x) => String(x).trim() !== '').length;
              } else if (String(arg).trim() !== '') {
                cnt++;
              }
            }
            return cnt;
          }
          case 'MEDIAN': {
            if (nums.length === 0) return 0;
            const s = [...nums].sort((a, b) => a - b);
            const mid = Math.floor(s.length / 2);
            return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
          }
          case 'STDEV':
          case 'STDEV.S': {
            if (nums.length < 2) return 0;
            const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
            const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (nums.length - 1);
            return Math.sqrt(variance);
          }
          case 'ROUND': {
            const val = toNumberLoose(args[0] as any) ?? 0;
            const digits = Math.max(0, Math.min(10, Math.trunc(toNumberLoose(args[1] as any) ?? 0)));
            const factor = 10 ** digits;
            return Math.round(val * factor) / factor;
          }
          case 'ABS':
            return Math.abs(toNumberLoose(args[0] as any) ?? 0);
          case 'SQRT': {
            const val = toNumberLoose(args[0] as any) ?? 0;
            if (val < 0) throw new Error('#NUM!');
            return Math.sqrt(val);
          }
          case 'IF': {
            const condRaw = args[0];
            const truthy = typeof condRaw === 'number' ? condRaw !== 0 : Boolean(String(condRaw || '').trim() && String(condRaw).toUpperCase() !== 'FALSE');
            return truthy ? (args[1] ?? '') : (args[2] ?? '');
          }
          default:
            throw new Error('#NAME?');
        }
      };

      const parseComparison = (): EvalValue => {
        let left = parseAdditive();
        while (peek()?.type === 'op' && ['>', '<', '>=', '<=', '=', '!='].includes((peek() as any).value)) {
          const op = (consume() as any).value;
          const right = parseAdditive();
          const lNum = toNumberLoose(left as any);
          const rNum = toNumberLoose(right as any);
          const lVal = lNum !== null ? lNum : String(left);
          const rVal = rNum !== null ? rNum : String(right);
          let boolRes = false;
          if (op === '>') boolRes = lVal > rVal;
          else if (op === '<') boolRes = lVal < rVal;
          else if (op === '>=') boolRes = lVal >= rVal;
          else if (op === '<=') boolRes = lVal <= rVal;
          else if (op === '=') boolRes = lVal === rVal;
          else if (op === '!=') boolRes = lVal !== rVal;
          left = boolRes ? 1 : 0;
        }
        return left;
      };

      const parseAdditive = (): EvalValue => {
        let left = parseMultiplicative();
        while (peek()?.type === 'op' && ['+', '-'].includes((peek() as any).value)) {
          const op = (consume() as any).value;
          const right = parseMultiplicative();
          const a = toNumberLoose(left as any);
          const b = toNumberLoose(right as any);
          if (a === null || b === null) throw new Error('#VALUE!');
          left = op === '+' ? a + b : a - b;
        }
        return left;
      };

      const parseMultiplicative = (): EvalValue => {
        let left = parsePower();
        while (peek()?.type === 'op' && ['*', '/'].includes((peek() as any).value)) {
          const op = (consume() as any).value;
          const right = parsePower();
          const a = toNumberLoose(left as any);
          const b = toNumberLoose(right as any);
          if (a === null || b === null) throw new Error('#VALUE!');
          if (op === '/') {
            if (b === 0) throw new Error('#DIV/0!');
            left = a / b;
          } else {
            left = a * b;
          }
        }
        return left;
      };

      const parsePower = (): EvalValue => {
        let left = parseUnary();
        if (peek()?.type === 'op' && (peek() as any).value === '^') {
          consume();
          const right = parsePower();
          const a = toNumberLoose(left as any);
          const b = toNumberLoose(right as any);
          if (a === null || b === null) throw new Error('#VALUE!');
          left = Math.pow(a, b);
        }
        return left;
      };

      const parseUnary = (): EvalValue => {
        if (peek()?.type === 'op' && ['+', '-'].includes((peek() as any).value)) {
          const op = (consume() as any).value;
          const val = parseUnary();
          const num = toNumberLoose(val as any);
          if (num === null) throw new Error('#VALUE!');
          return op === '-' ? -num : num;
        }
        let val = parsePrimary();
        if (peek()?.type === 'op' && (peek() as any).value === '%') {
          consume();
          const num = toNumberLoose(val as any);
          if (num === null) throw new Error('#VALUE!');
          val = num / 100;
        }
        return val;
      };

      const parsePrimary = (): EvalValue => {
        const tok = peek();
        if (!tok) throw new Error('#ERR!');

        if (tok.type === 'num') {
          consume();
          return tok.value;
        }
        if (tok.type === 'str') {
          consume();
          return tok.value;
        }
        if (tok.type === 'ref') {
          consume();
          if (tok.row >= rowCount || tok.col >= colCount) throw new Error('#REF!');
          const dep = evalCell(tok.row, tok.col);
          if (dep.error) throw new Error(dep.error);
          return dep.numericValue !== null ? dep.numericValue : String(dep.value ?? '');
        }
        if (tok.type === 'range') {
          consume();
          const vals: Array<number | string> = [];
          for (const cell of tok.cells) {
            if (cell.row >= rowCount || cell.col >= colCount) continue;
            const dep = evalCell(cell.row, cell.col);
            if (dep.error) throw new Error(dep.error);
            vals.push(dep.numericValue !== null ? dep.numericValue : String(dep.value ?? ''));
          }
          return vals;
        }
        if (tok.type === 'ident') {
          consume();
          if (peek()?.type === 'lparen') {
            consume(); // '('
            const args: EvalValue[] = [];
            if (peek()?.type !== 'rparen') {
              while (true) {
                args.push(parseComparison());
                if (peek()?.type === 'comma') {
                  consume();
                  continue;
                }
                break;
              }
            }
            if (peek()?.type !== 'rparen') throw new Error('#ERR!');
            consume(); // ')'
            return callFn(tok.value, args);
          }
          if (tok.value === 'TRUE') return 1;
          if (tok.value === 'FALSE') return 0;
          if (tok.value === 'PI') return Math.PI;
          throw new Error('#NAME?');
        }
        if (tok.type === 'lparen') {
          consume();
          const inner = parseComparison();
          if (peek()?.type !== 'rparen') throw new Error('#ERR!');
          consume();
          return inner;
        }
        throw new Error('#ERR!');
      };

      const resultVal = parseComparison();
      if (pos < tokens.length) throw new Error('#ERR!');

      const scalar = Array.isArray(resultVal) ? (resultVal[0] ?? '') : resultVal;
      const numeric = typeof scalar === 'number' && Number.isFinite(scalar) ? scalar : toNumberLoose(scalar);
      const out: CellEvalResult = {
        raw,
        value: numeric !== null ? Math.round(numeric * 1e8) / 1e8 : String(scalar),
        numericValue: numeric,
        isFormula: true,
      };
      cache.set(key, out);
      visiting.delete(key);
      return out;
    } catch (err: any) {
      visiting.delete(key);
      const code = err?.message && String(err.message).startsWith('#') ? String(err.message) : '#ERR!';
      const out: CellEvalResult = {
        raw,
        value: code,
        numericValue: null,
        isFormula: true,
        error: code,
      };
      cache.set(key, out);
      return out;
    }
  };

  const matrix: CellEvalResult[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const rowOut: CellEvalResult[] = [];
    for (let c = 0; c < colCount; c++) {
      rowOut.push(evalCell(r, c));
    }
    matrix.push(rowOut);
  }
  return matrix;
}

export function parseCsvToGrid(text: string, defaultTitle = 'Bảng dữ liệu'): SpreadsheetGridData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return {
      title: defaultTitle,
      columns: ['Cột A', 'Cột B', 'Cột C'],
      rows: [['', '', ''], ['', '', '']],
    };
  }

  const splitLine = (line: string): string[] => {
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  };

  const parsed = lines.map(splitLine);
  const colCount = Math.max(1, ...parsed.map((r) => r.length));
  const columns = Array.from({ length: colCount }, (_, i) => parsed[0]?.[i] || `Cột ${colIndexToLetter(i)}`);
  const rows = parsed.slice(1).map((r) => Array.from({ length: colCount }, (_, i) => r[i] ?? ''));
  return {
    title: defaultTitle,
    columns,
    rows: rows.length > 0 ? rows : [Array(colCount).fill('')],
  };
}

export function parseSpreadsheetInput(raw: string): SpreadsheetGridData {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return {
      title: 'Bảng tính mới',
      columns: ['Hạng mục', 'Số lượng', 'Đơn giá', 'Thành tiền'],
      rows: [
        ['Mục 1', '2', '150000', '=B1*C1'],
        ['Mục 2', '3', '200000', '=B2*C2'],
        ['Tổng cộng', '=SUM(B1:B2)', '', '=SUM(D1:D2)'],
      ],
    };
  }

  // JSON format
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json)) {
        if (json.length > 0 && typeof json[0] === 'object' && !Array.isArray(json[0])) {
          const cols = Array.from(new Set(json.flatMap((row) => Object.keys(row || {}))));
          const rows = json.map((row) => cols.map((k) => String(row?.[k] ?? '')));
          return { title: 'Bảng dữ liệu', columns: cols, rows };
        }
        if (Array.isArray(json[0])) {
          const cols = (json[0] as any[]).map((c, idx) => String(c || `Cột ${colIndexToLetter(idx)}`));
          const rows = json.slice(1).map((r: any[]) => cols.map((_, idx) => String(r?.[idx] ?? '')));
          return { title: 'Bảng tính', columns: cols, rows };
        }
      } else if (json && typeof json === 'object') {
        const title = typeof json.title === 'string' && json.title.trim() ? json.title.trim() : 'Bảng tính';
        if (Array.isArray(json.columns) && Array.isArray(json.rows)) {
          const cols = json.columns.map((c: any, idx: number) => String(c || `Cột ${colIndexToLetter(idx)}`));
          const rows = json.rows.map((r: any) =>
            Array.isArray(r)
              ? cols.map((_: string, idx: number) => String(r[idx] ?? ''))
              : cols.map((colName: string) => String(r?.[colName] ?? ''))
          );
          return { title, columns: cols, rows: rows.length > 0 ? rows : [cols.map(() => '')] };
        }
        if (Array.isArray(json.headers) && Array.isArray(json.rows)) {
          const cols = json.headers.map((c: any, idx: number) => String(c || `Cột ${colIndexToLetter(idx)}`));
          const rows = json.rows.map((r: any[]) => cols.map((_, idx) => String(r?.[idx] ?? '')));
          return { title, columns: cols, rows: rows.length > 0 ? rows : [cols.map(() => '')] };
        }
        if (Array.isArray(json.data) && json.data.length > 0 && typeof json.data[0] === 'object') {
          const cols: string[] = Array.from(new Set<string>(json.data.flatMap((row: any) => Object.keys(row || {}))));
          const rows = json.data.map((row: any) => cols.map((k: string) => String(row?.[k] ?? '')));
          return { title, columns: cols, rows };
        }
      }
    } catch {
      // Fall through to Markdown / CSV parser
    }
  }

  // Markdown pipe table format
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pipeLines = lines.filter((l) => l.includes('|'));
  if (pipeLines.length >= 2) {
    const parsePipeRow = (line: string): string[] => {
      const stripped = line.replace(/^\|/, '').replace(/\|$/, '');
      return stripped.split('|').map((c) => c.trim());
    };
    const isAlignRow = (line: string) => /^[\s|:-]+$/.test(line) && line.includes('-');
    const cleanRows = pipeLines.filter((l) => !isAlignRow(l)).map(parsePipeRow);
    if (cleanRows.length >= 1) {
      const colCount = Math.max(1, ...cleanRows.map((r) => r.length));
      const columns = Array.from({ length: colCount }, (_, i) => cleanRows[0]?.[i] || `Cột ${colIndexToLetter(i)}`);
      const rows = cleanRows.slice(1).map((r) => Array.from({ length: colCount }, (_, i) => r[i] ?? ''));
      return {
        title: 'Bảng dữ liệu',
        columns,
        rows: rows.length > 0 ? rows : [columns.map(() => '')],
      };
    }
  }

  return parseCsvToGrid(trimmed, 'Bảng tính');
}

export function exportGridToCsv(columns: string[], evaluated: CellEvalResult[][]): string {
  const escape = (val: string) => {
    if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
    return val;
  };
  const headerLine = columns.map(escape).join(',');
  const dataLines = evaluated.map((row) =>
    columns.map((_, cIdx) => escape(String(row[cIdx]?.value ?? ''))).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

export function exportGridToMarkdown(columns: string[], evaluated: CellEvalResult[][], useRawFormulas = false): string {
  const cleanCell = (v: string) => v.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
  const header = `| ${columns.map(cleanCell).join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = evaluated.map((row) =>
    `| ${columns
      .map((_, cIdx) => {
        const cell = row[cIdx];
        const txt = useRawFormulas ? cell?.raw ?? '' : String(cell?.value ?? '');
        return cleanCell(txt);
      })
      .join(' | ')} |`
  );
  return [header, sep, ...body].join('\n');
}
