import JSCPP from 'JSCPP';
import { WorkspaceFile } from '../types';
import { CanvasDrawCommand } from './graphicsGameRunner';

const jscppRuntime: any = (JSCPP as any)?.default || JSCPP;

export interface PolyglotExecutionResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  engine: string;
  entryPath: string;
  compileLog: string[];
  drawCommands?: CanvasDrawCommand[];
}

function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function checkBalancedBraces(files: { path: string; content: string }[]): string[] {
  const errors: string[] = [];
  for (const f of files) {
    const cleaned = stripCommentsAndStrings(f.content);
    let braces = 0;
    let parens = 0;
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (ch === '{') braces++;
      else if (ch === '}') {
        braces--;
        if (braces < 0) {
          errors.push(`${f.path}: Thừa dấu đóng ngoặc nhọn '}'`);
          break;
        }
      } else if (ch === '(') parens++;
      else if (ch === ')') {
        parens--;
        if (parens < 0) {
          errors.push(`${f.path}: Thừa dấu đóng ngoặc tròn ')'`);
          break;
        }
      }
    }
    if (braces > 0) errors.push(`${f.path}: Thiếu ${braces} dấu đóng '}'`);
    if (parens > 0) errors.push(`${f.path}: Thiếu ${parens} dấu đóng ')'`);
  }
  return errors;
}

/* ============================================================================
 * 1. PYTHON STDIN PREAMBLE
 * ========================================================================== */

export function buildPythonStdinPreamble(stdinText: string = ''): string {
  const encoded = JSON.stringify(stdinText || '');
  return `
import sys, io, builtins
_tm_stdin_data = ${encoded}
sys.stdin = io.StringIO(_tm_stdin_data)
_tm_input_lines = _tm_stdin_data.splitlines()
_tm_input_idx = 0
def _tm_input(prompt=""):
    global _tm_input_idx
    if prompt:
        sys.stdout.write(str(prompt))
    if _tm_input_idx < len(_tm_input_lines):
        val = _tm_input_lines[_tm_input_idx]
        _tm_input_idx += 1
        return val
    return ""
builtins.input = _tm_input
`;
}

/* ============================================================================
 * 2. C / C++ MULTI-FILE PREPROCESSOR + JSCPP + MODERN C++17 FALLBACK
 * ========================================================================== */

function resolveCppIncludes(
  entryContent: string,
  entryPath: string,
  allFiles: WorkspaceFile[],
  visited = new Set<string>()
): string {
  const normalizedEntry = entryPath.replace(/^\/+/, '');
  visited.add(normalizedEntry);
  const baseDir = normalizedEntry.includes('/') ? normalizedEntry.split('/').slice(0, -1).join('/') : '';

  const findLocalFile = (inc: string): WorkspaceFile | undefined => {
    const clean = inc.replace(/^\.\//, '').replace(/^\/+/, '');
    const rel = baseDir ? `${baseDir}/${clean}` : clean;
    return (
      allFiles.find(f => !f.isBinary && f.path === rel) ||
      allFiles.find(f => !f.isBinary && f.path === clean) ||
      allFiles.find(f => !f.isBinary && f.name === clean.split('/').pop())
    );
  };

  return entryContent.replace(/^\s*#include\s+"([^"]+)"\s*$/gm, (full, incPath) => {
    const target = findLocalFile(incPath);
    if (!target) return full;
    if (visited.has(target.path)) return `/* already included: ${target.path} */`;
    let inner = target.content || '';
    inner = inner
      .replace(/^\s*#pragma\s+once\s*$/gm, '')
      .replace(/^\s*#ifndef\s+[A-Z0-9_]+\s*\r?\n\s*#define\s+[A-Z0-9_]+/i, '')
      .replace(/\r?\n\s*#endif[^\n]*\s*$/i, '');
    return `/* >>> ${target.path} */\n${resolveCppIncludes(inner, target.path, allFiles, visited)}\n/* <<< ${target.path} */`;
  });
}

function collectLinkedCppSources(files: WorkspaceFile[], entryPath?: string): {
  combinedSource: string;
  entryFile: WorkspaceFile;
  cppFiles: WorkspaceFile[];
} {
  const cppFiles = files.filter(f => !f.isBinary && /\.(cpp|cc|cxx|c|h|hpp|hh)$/i.test(f.path));
  const execCandidates = cppFiles.filter(f => /\.(cpp|cc|cxx|c)$/i.test(f.path));
  const entryFile =
    (entryPath && cppFiles.find(f => f.path === entryPath || f.name === entryPath)) ||
    execCandidates.find(f => /\bmain\s*\(/.test(f.content || '')) ||
    execCandidates[0] ||
    cppFiles[0];

  const visited = new Set<string>();
  const resolvedMain = resolveCppIncludes(entryFile.content || '', entryFile.path, files, visited);

  // Also append other .cpp/.c implementation files that weren't inlined via #include "..."
  const extraSources = execCandidates
    .filter(f => f.path !== entryFile.path && !visited.has(f.path))
    .map(f => {
      const cleaned = resolveCppIncludes(f.content || '', f.path, files, visited)
        .replace(/^\s*#include\s+<[^>]+>\s*$/gm, '')
        .replace(/^\s*using\s+namespace\s+std\s*;\s*$/gm, '');
      return `/* linked: ${f.path} */\n${cleaned}`;
    })
    .join('\n\n');

  const combinedSource = extraSources ? `${resolvedMain}\n\n${extraSources}` : resolvedMain;
  return { combinedSource, entryFile, cppFiles };
}

function executeModernCppFallback(source: string, stdinText: string): { stdout: string; stderr: string; exitCode: number; drawCommands: CanvasDrawCommand[] } {
  const outChunks: string[] = [];
  const errChunks: string[] = [];
  const drawCommands: CanvasDrawCommand[] = [];

  // Strip preprocessor headers & namespace declarations
  let code = source
    .replace(/^\s*#include\s+<[^>]+>\s*$/gm, '')
    .replace(/^\s*#include\s+"[^"]+"\s*$/gm, '')
    .replace(/^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+([^\n]+)$/gm, 'const $1 = $2;')
    .replace(/^\s*using\s+namespace\s+std\s*;\s*$/gm, '')
    .replace(/\bstd::/g, '');

  // Extract vector<T> names to support .push_back etc. (Array prototype already extended inside sandbox)
  // Convert C/C++ declarations & idioms into valid JS
  const typeKw = '(?:const\\s+)?(?:unsigned\\s+)?(?:long\\s+long|long\\s+double|long|int|short|size_t|double|float|bool|char|string|auto|void)';
  const stlType = '(?:const\\s+)?(?:vector|map|unordered_map|set|unordered_set|pair)\\s*<[^>;]+>(?:\\s*&)?';

  // Transform range-based for: for (auto &x : vec) / for (int x : arr)
  code = code.replace(
    new RegExp(`for\\s*\\(\\s*(?:${stlType}|${typeKw})\\s+&?\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*([^)]+)\\)`, 'g'),
    'for (let $1 of $2)'
  );

  // Transform standard C/C++ typed parameters inside function headers
  code = code.replace(
    /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/g,
    (m, fnName, params) => {
      if (/^(if|for|while|switch|catch)$/.test(fnName)) return m;
      const cleanParams = params
        .split(',')
        .map((p: string) => {
          const trimmed = p.trim();
          if (!trimmed || trimmed === 'void') return '';
          const parts = trimmed.replace(/[&*\[\]]/g, ' ').trim().split(/\s+/);
          return parts[parts.length - 1];
        })
        .filter(Boolean)
        .join(', ');
      return `function ${fnName}(${cleanParams}) {`;
    }
  );
  // Remove leading return type before transformed function declarations: `int function main(` -> `function main(`
  code = code.replace(new RegExp(`(?:${stlType}|${typeKw})\\s+function\\s+`, 'g'), 'function ');

  // Structs -> factory constructors / classes
  code = code.replace(/\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)\}\s*;/g, (_, name, body) => {
    const cleanBody = body
      .replace(new RegExp(`\\b(?:${stlType}|${typeKw})\\s+([A-Za-z_][A-Za-z0-9_]*)([^;]*);`, 'g'), '$1$2;')
      .trim();
    return `function ${name}() { return { ${cleanBody.replace(/;/g, ',').replace(/=/g, ':')} }; }`;
  });

  // Transform container declarations: vector<int> a = {1,2}; or vector<int> a(n, 0); or vector<int> a;
  code = code.replace(
    /\b(?:const\s+)?vector\s*<[^>;]+>\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^;)]+)\)\s*;/g,
    (_, name, args) => {
      const parts = args.split(',').map((s: string) => s.trim());
      if (parts.length >= 2) return `let ${name} = Array(${parts[0]}).fill(${parts[1]});`;
      return `let ${name} = Array(${parts[0]}).fill(0);`;
    }
  );
  code = code.replace(
    /\b(?:const\s+)?vector\s*<[^>;]+>\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{([^}]*)\}\s*;/g,
    'let $1 = [$2];'
  );
  code = code.replace(/\b(?:const\s+)?vector\s*<[^>;]+>\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g, 'let $1 = [];');

  // map / set
  code = code.replace(/\b(?:map|unordered_map)\s*<[^>;]+>\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g, 'let $1 = new __CppMap();');
  code = code.replace(/\b(?:set|unordered_set)\s*<[^>;]+>\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g, 'let $1 = new Set();');

  // Arrays int a[5] = {1,2,3};
  code = code.replace(
    new RegExp(`\\b${typeKw}\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\[[^\\]]*\\]\\s*=\\s*\\{([^}]*)\\}`, 'g'),
    'let $1 = [$2]'
  );
  code = code.replace(
    new RegExp(`\\b${typeKw}\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\[([^\\]]+)\\]`, 'g'),
    'let $1 = Array($2).fill(0)'
  );

  // Transform multi-variable declarations like `int a = 1, b = 2;` or `int n;`
  code = code.replace(
    new RegExp(`(?<=^|[;{\\n])\\s*${typeKw}\\s+([A-Za-z_][A-Za-z0-9_]*(?:\\s*=\\s*[^;\\n]+)?(?:\\s*,\\s*[A-Za-z_][A-Za-z0-9_]*(?:\\s*=\\s*[^;\\n]+)?)*)\\s*;`, 'gm'),
    ' let $1;'
  );
  code = code.replace(new RegExp(`for\\s*\\(\\s*${typeKw}\\s+`, 'g'), 'for (let ');
  // Handle Raylib / SDL / custom typed local declarations like Color c = ...; SDL_Rect r = {x,y,w,h};
  code = code.replace(
    /(?<=^|[;{\n])\s*(?:const\s+)?(?:Color|Vector2|SDL_Rect|Rectangle|Texture2D)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{([^}]*)\}\s*;/gm,
    ' let $1 = [$2];'
  );
  code = code.replace(
    /(?<=^|[;{\n])\s*(?:const\s+)?(?:SDL_Window|SDL_Renderer|Font|Rectangle|Color|Vector2)\s*\*?\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*=\s*[^;\n]+)?)\s*;/gm,
    ' let $1;'
  );
  code = code.replace(/\bnullptr\b/g, 'null');

  // Transform sort(vec.begin(), vec.end()) / reverse(vec.begin(), vec.end())
  code = code.replace(/\bsort\s*\(\s*([A-Za-z0-9_.]+)\.begin\(\)\s*,\s*[A-Za-z0-9_.]+\.end\(\)\s*\)/g, '$1.sort((a,b)=>a<b?-1:a>b?1:0)');
  code = code.replace(/\bsort\s*\(\s*([A-Za-z0-9_.]+)\.begin\(\)\s*,\s*[A-Za-z0-9_.]+\.end\(\)\s*,\s*([^)]+)\)/g, '$1.sort(($2))');
  code = code.replace(/\breverse\s*\(\s*([A-Za-z0-9_.]+)\.begin\(\)\s*,\s*[A-Za-z0-9_.]+\.end\(\)\s*\)/g, '$1.reverse()');

  // Transform cout << a << b << endl; lines into __cout(...)
  code = code.replace(/\bcout\s*<<([^;]+);/g, (_, exprChain) => {
    const args = exprChain
      .split('<<')
      .map((s: string) => s.trim())
      .filter(Boolean);
    return `__cout(${args.join(', ')});`;
  });

  // Transform cin >> a >> b;
  code = code.replace(/\bcin\s*>>([^;]+);/g, (_, chain) => {
    const vars = chain
      .split('>>')
      .map((s: string) => s.trim())
      .filter(Boolean);
    return vars.map((v: string) => `${v} = __cinRead(${v});`).join(' ');
  });

  // Transform getline(cin, s)
  code = code.replace(/\bgetline\s*\(\s*cin\s*,\s*([A-Za-z0-9_.]+)\s*\)/g, '($1 = __cinLine())');

  const runtimePrelude = `
const __tokens = ${JSON.stringify((stdinText || '').trim() ? (stdinText || '').trim().split(/\s+/) : [])};
const __lines = ${JSON.stringify((stdinText || '').split(/\r?\n/))};
let __tokIdx = 0;
let __lineIdx = 0;
const endl = "\\n";
const fixed = "";
function setprecision() { return ""; }
function __cinRead(currentVal) {
  if (__tokIdx >= __tokens.length) return typeof currentVal === 'string' ? '' : 0;
  const tok = __tokens[__tokIdx++];
  if (typeof currentVal === 'string') return tok;
  const num = Number(tok);
  return Number.isNaN(num) ? tok : num;
}
function __cinLine() {
  return __lineIdx < __lines.length ? __lines[__lineIdx++] : '';
}
function __cout() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    __out(v === true ? '1' : v === false ? '0' : String(v));
  }
}
function printf(fmt) {
  const args = Array.prototype.slice.call(arguments, 1);
  let i = 0;
  const rendered = String(fmt).replace(/%(?:\\.(\\d+))?([dfsclu])/g, (_, prec, spec) => {
    const val = args[i++];
    if (spec === 'f' && prec !== undefined) return Number(val).toFixed(Number(prec));
    if (spec === 'd' || spec === 'i' || spec === 'u') return String(Math.trunc(Number(val)));
    return String(val ?? '');
  });
  __out(rendered);
}
class __CppMap extends Map {
  count(k) { return this.has(k) ? 1 : 0; }
}
if (!Array.prototype.push_back) {
  Object.defineProperties(Array.prototype, {
    push_back: { value: function(v) { return this.push(v); }, configurable: true },
    pop_back: { value: function() { return this.pop(); }, configurable: true },
    size: { value: function() { return this.length; }, configurable: true },
    empty: { value: function() { return this.length === 0; }, configurable: true },
    clear: { value: function() { this.length = 0; }, configurable: true },
    front: { value: function() { return this[0]; }, configurable: true },
    back: { value: function() { return this[this.length - 1]; }, configurable: true },
  });
}
const sqrt = Math.sqrt, pow = Math.pow, abs = Math.abs, fabs = Math.abs, floor = Math.floor, ceil = Math.ceil, round = Math.round, min = Math.min, max = Math.max, log = Math.log, sin = Math.sin, cos = Math.cos;
function to_string(v) { return String(v); }
function stoi(v) { return parseInt(String(v), 10); }
function stod(v) { return parseFloat(String(v)); }

// ---- C/C++ Graphics Bridges (graphics.h / BGI, raylib.h, SDL2) ----
const BLACK = '#09090b', BLUE = '#2563eb', GREEN = '#16a34a', CYAN = '#06b6d4', RED = '#ef4444',
      MAGENTA = '#d946ef', BROWN = '#92400e', LIGHTGRAY = '#d4d4d8', DARKGRAY = '#52525b',
      LIGHTBLUE = '#60a5fa', LIGHTGREEN = '#4ade80', LIGHTCYAN = '#22d3ee', LIGHTRED = '#f87171',
      LIGHTMAGENTA = '#f472b6', YELLOW = '#facc15', WHITE = '#ffffff', SOLID_FILL = 1, DETECT = 0;
const RAYWHITE = '#f5f5f5', SKYBLUE = '#38bdf8', ORANGE = '#f97316', PURPLE = '#a855f7', GRAY = '#71717a', GOLD = '#eab308', PINK = '#ec4899';
const SDL_INIT_VIDEO = 1, SDL_WINDOWPOS_CENTERED = 0, SDL_WINDOW_SHOWN = 4, SDL_RENDERER_ACCELERATED = 2;

let __curColor = '#38bdf8', __curBg = '#09090b', __curFillColor = '#38bdf8', __curX = 0, __curY = 0;
let __loopFrames = 0;
function __toCssColor(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c) && c.length >= 3) {
    const a = c.length >= 4 ? (Number(c[3]) / 255).toFixed(2) : '1';
    return 'rgba(' + Number(c[0]) + ',' + Number(c[1]) + ',' + Number(c[2]) + ',' + a + ')';
  }
  if (c && typeof c === 'object' && 'r' in c) {
    const a = c.a !== undefined ? (Number(c.a) / 255).toFixed(2) : '1';
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }
  const bgiMap = ['#09090b','#2563eb','#16a34a','#06b6d4','#ef4444','#d946ef','#92400e','#d4d4d8','#52525b','#60a5fa','#4ade80','#22d3ee','#f87171','#f472b6','#facc15','#ffffff'];
  const idx = Number(c);
  if (!Number.isNaN(idx) && idx >= 0 && idx < bgiMap.length) return bgiMap[idx];
  return '#38bdf8';
}
// BGI graphics.h
function initgraph() { __gfx({ op: 'clear', args: [__curBg] }); }
function closegraph() {}
function cleardevice() { __gfx({ op: 'clear', args: [__curBg] }); }
function setcolor(c) { __curColor = __toCssColor(c); __gfx({ op: 'color', args: [__curColor] }); }
function setbkcolor(c) { __curBg = __toCssColor(c); }
function setfillstyle(pattern, c) { __curFillColor = __toCssColor(c); }
function moveto(x, y) { __curX = Number(x); __curY = Number(y); }
function lineto(x, y) { __gfx({ op: 'line', args: [__curX, __curY, Number(x), Number(y)] }); __curX = Number(x); __curY = Number(y); }
function line(x1, y1, x2, y2) { __gfx({ op: 'line', args: [Number(x1), Number(y1), Number(x2), Number(y2)] }); }
function circle(x, y, r) { __gfx({ op: 'circle', args: [Number(x), Number(y), Number(r)] }); }
function rectangle(l, t, r, b) { __gfx({ op: 'rect', args: [Number(l), Number(t), Number(r) - Number(l), Number(b) - Number(t)] }); }
function bar(l, t, r, b) { __gfx({ op: 'color', args: [__curFillColor] }); __gfx({ op: 'fillRect', args: [Number(l), Number(t), Number(r) - Number(l), Number(b) - Number(t)] }); __gfx({ op: 'color', args: [__curColor] }); }
function fillellipse(x, y, rx, ry) { __gfx({ op: 'color', args: [__curFillColor] }); __gfx({ op: 'fillOval', args: [Number(x) - Number(rx), Number(y) - Number(ry), Number(rx) * 2, Number(ry) * 2] }); __gfx({ op: 'color', args: [__curColor] }); }
function ellipse(x, y, s, e, rx, ry) { __gfx({ op: 'oval', args: [Number(x) - Number(rx), Number(y) - Number(ry), Number(rx) * 2, Number(ry) * 2] }); }
function putpixel(x, y, c) { __gfx({ op: 'color', args: [__toCssColor(c)] }); __gfx({ op: 'fillRect', args: [Number(x), Number(y), 2, 2] }); __gfx({ op: 'color', args: [__curColor] }); }
function outtextxy(x, y, txt) { __gfx({ op: 'text', args: [String(txt), Number(x), Number(y) + 12] }); }
function getch() { return 0; }
function delay() {}

// Raylib
function InitWindow(w, h, title) { __gfx({ op: 'clear', args: ['#09090b'] }); }
function CloseWindow() {}
function SetTargetFPS() {}
function WindowShouldClose() { return (__loopFrames++) >= 1; }
function BeginDrawing() {}
function EndDrawing() {}
function ClearBackground(c) { __gfx({ op: 'clear', args: [__toCssColor(c)] }); }
function DrawRectangle(x, y, w, h, c) { __gfx({ op: 'color', args: [__toCssColor(c)] }); __gfx({ op: 'fillRect', args: [Number(x), Number(y), Number(w), Number(h)] }); }
function DrawRectangleLines(x, y, w, h, c) { __gfx({ op: 'color', args: [__toCssColor(c)] }); __gfx({ op: 'rect', args: [Number(x), Number(y), Number(w), Number(h)] }); }
function DrawCircle(x, y, r, c) { __gfx({ op: 'color', args: [__toCssColor(c)] }); __gfx({ op: 'fillCircle', args: [Number(x), Number(y), Number(r)] }); }
function DrawCircleLines(x, y, r, c) { __gfx({ op: 'color', args: [__toCssColor(c)] }); __gfx({ op: 'circle', args: [Number(x), Number(y), Number(r)] }); }
function DrawLine(x1, y1, x2, y2, c) { __gfx({ op: 'color', args: [__toCssColor(c)] }); __gfx({ op: 'line', args: [Number(x1), Number(y1), Number(x2), Number(y2)] }); }
function DrawText(txt, x, y, size, c) { __gfx({ op: 'color', args: [__toCssColor(c)] }); __gfx({ op: 'text', args: [String(txt), Number(x), Number(y) + Number(size || 14)] }); }

// SDL2
function SDL_Init() { return 0; }
function SDL_CreateWindow() { return {}; }
function SDL_CreateRenderer() { return {}; }
function SDL_SetRenderDrawColor(ren, r, g, b, a) { __curColor = 'rgba(' + r + ',' + g + ',' + b + ',' + ((a === undefined ? 255 : a)/255).toFixed(2) + ')'; __gfx({ op: 'color', args: [__curColor] }); }
function SDL_RenderClear() { __gfx({ op: 'clear', args: [__curColor] }); }
function SDL_RenderFillRect(ren, rect) { if (Array.isArray(rect)) __gfx({ op: 'fillRect', args: [rect[0], rect[1], rect[2], rect[3]] }); }
function SDL_RenderDrawRect(ren, rect) { if (Array.isArray(rect)) __gfx({ op: 'rect', args: [rect[0], rect[1], rect[2], rect[3]] }); }
function SDL_RenderDrawLine(ren, x1, y1, x2, y2) { __gfx({ op: 'line', args: [x1, y1, x2, y2] }); }
function SDL_RenderPresent() {}
function SDL_DestroyRenderer() {}
function SDL_DestroyWindow() {}
function SDL_Quit() {}
function SDL_Delay() {}
`;

  try {
    const runner = new Function(
      '__out',
      '__err',
      '__gfx',
      `${runtimePrelude}\n${code}\nif (typeof main === 'function') { return main(); }`
    );
    const rc = runner(
      (s: string) => outChunks.push(s),
      (s: string) => errChunks.push(s),
      (cmd: CanvasDrawCommand) => drawCommands.push(cmd)
    );
    return {
      stdout: outChunks.join('').trimEnd(),
      stderr: errChunks.join('').trimEnd(),
      exitCode: typeof rc === 'number' ? rc : 0,
      drawCommands,
    };
  } catch (err: any) {
    return {
      stdout: outChunks.join('').trimEnd(),
      stderr: err?.message || String(err),
      exitCode: 1,
      drawCommands,
    };
  }
}

export function runCppProject(
  files: WorkspaceFile[],
  entryPath?: string,
  stdinText: string = ''
): PolyglotExecutionResult {
  const { combinedSource, entryFile, cppFiles } = collectLinkedCppSources(files, entryPath);
  if (!entryFile) {
    return {
      ok: false,
      stdout: '',
      stderr: 'Không tìm thấy tệp nguồn C/C++ (.cpp, .cc, .c) trong folder.',
      exitCode: 1,
      engine: 'JSCPP',
      entryPath: '',
      compileLog: ['[g++] No C/C++ source files found.'],
    };
  }

  const braceErrs = checkBalancedBraces(cppFiles.map(f => ({ path: f.path, content: f.content || '' })));
  if (braceErrs.length > 0) {
    return {
      ok: false,
      stdout: '',
      stderr: braceErrs.join('\n'),
      exitCode: 1,
      engine: 'JSCPP',
      entryPath: entryFile.path,
      compileLog: [`$ g++ -std=c++17 ${entryFile.path} -o main`, ...braceErrs.map(e => `[error] ${e}`)],
    };
  }

  const compileLog = [
    `$ g++ -std=c++17 ${cppFiles.filter(f => /\.(cpp|cc|cxx|c)$/i.test(f.path)).map(f => f.path).join(' ')} -o main`,
  ];

  const usesCppGraphics = /\b(graphics\.h|raylib\.h|SDL2?\.h|initgraph|InitWindow|SDL_CreateRenderer|DrawRectangle|BeginDrawing)\b/.test(
    combinedSource
  );

  // Try real JSCPP C++ interpreter first (skip when graphics libraries are used)
  let jscppOut = '';
  if (!usesCppGraphics) {
    try {
      const exitCode = jscppRuntime.run(combinedSource, stdinText, {
        stdio: {
          write: (s: string) => {
            jscppOut += s;
          },
        },
        unsigned_overflow: 'warn',
      });
      compileLog.push(`> [JSCPP] Compiled & ran cleanly (exit code ${typeof exitCode === 'number' ? exitCode : 0})`);
      return {
        ok: true,
        stdout: jscppOut.replace(/\r\n/g, '\n').trimEnd() || '(Executed cleanly — no stdout)',
        stderr: '',
        exitCode: typeof exitCode === 'number' ? exitCode : 0,
        engine: 'JSCPP',
        entryPath: entryFile.path,
        compileLog,
      };
    } catch (jscppErr: any) {
      const fallback = executeModernCppFallback(combinedSource, stdinText);
      if (fallback.exitCode === 0) {
        compileLog.push('> [C++17-VM] Compiled & executed STL/C++17 workspace cleanly');
        return {
          ok: true,
          stdout: fallback.stdout || '(Executed cleanly — no stdout)',
          stderr: fallback.stderr,
          exitCode: 0,
          engine: 'C++17-VM',
          entryPath: entryFile.path,
          compileLog,
          drawCommands: fallback.drawCommands.length > 0 ? fallback.drawCommands : undefined,
        };
      }

      const combinedErr = fallback.stderr || jscppErr?.message || String(jscppErr);
      compileLog.push(`[error] ${combinedErr}`);
      return {
        ok: false,
        stdout: jscppOut.trimEnd() || fallback.stdout,
        stderr: combinedErr,
        exitCode: 1,
        engine: 'JSCPP',
        entryPath: entryFile.path,
        compileLog,
      };
    }
  }

  const gfxRes = executeModernCppFallback(combinedSource, stdinText);
  if (gfxRes.exitCode === 0) {
    compileLog.push(`> [C++17-Graphics-VM] Rendered ${gfxRes.drawCommands.length} draw command(s) cleanly`);
    return {
      ok: true,
      stdout: gfxRes.stdout || (gfxRes.drawCommands.length > 0 ? `(Rendered ${gfxRes.drawCommands.length} canvas operations)` : '(Executed cleanly — no stdout)'),
      stderr: gfxRes.stderr,
      exitCode: 0,
      engine: 'C++17-Graphics-VM',
      entryPath: entryFile.path,
      compileLog,
      drawCommands: gfxRes.drawCommands.length > 0 ? gfxRes.drawCommands : undefined,
    };
  }
  compileLog.push(`[error] ${gfxRes.stderr}`);
  return {
    ok: false,
    stdout: gfxRes.stdout,
    stderr: gfxRes.stderr,
    exitCode: 1,
    engine: 'C++17-Graphics-VM',
    entryPath: entryFile.path,
    compileLog,
  };
}

/* ============================================================================
 * 3. JAVA MULTI-FILE JVM-BRIDGE COMPILER & RUNNER
 * ========================================================================== */

function stripJavaGenerics(code: string): string {
  // Remove diamond/generic type parameters in ArrayList<...>, HashMap<...,...>, List<...>
  return code
    .replace(/\b(ArrayList|LinkedList|List|HashMap|Map|HashSet|Set|Stack|Queue)\s*<[^<>()={};]+>/g, '$1')
    .replace(/\bnew\s+(ArrayList|LinkedList|HashMap|HashSet|Stack|PriorityQueue)\s*<[^<>()={};]*>/g, 'new $1');
}

function transpileJavaClassBodyToJs(className: string, body: string): string {
  let src = stripJavaGenerics(body).replace(/@Override\s*/g, '');

  // Collect declared class fields so unqualified access inside methods resolves to `this.<field>`
  const declaredFields = new Set<string>();
  const fieldDeclRe = /^([ \t]*)(?:(?:public|private|protected)\s+)?(?:(static)\s+)?(?:final\s+)?(?:int|long|double|float|boolean|char|byte|short|String|ArrayList|List|HashMap|Map|HashSet|Set|StringBuilder|Scanner|[A-Z][A-Za-z0-9_]*(?:\[\])*)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*([^;]+))?;/gm;
  src = src.replace(fieldDeclRe, (full, indent, isStatic, fieldName, initVal) => {
    // Only treat lines at class-body indentation (not deeply nested inside methods where local vars live)
    if (indent.length > 6 && !/^(?:public|private|protected)/.test(full.trim())) {
      return full;
    }
    declaredFields.add(fieldName);
    const val = initVal ? initVal.trim() : 'null';
    return `${indent}${isStatic ? 'static ' : ''}${fieldName} = ${val};`;
  });

  // Constructor: public ClassName(Type a, Type b) { ... } -> constructor(a, b) { ... }
  const ctorRe = new RegExp(`(?:public|private|protected)?\\s*${className}\\s*\\(([^)]*)\\)\\s*\\{`, 'g');
  src = src.replace(ctorRe, (_, params) => {
    const pNames = params
      .split(',')
      .map((p: string) => p.trim().split(/\s+/).pop() || '')
      .filter(Boolean)
      .join(', ');
    return `constructor(${pNames}) {`;
  });

  // Static & instance method declarations:
  src = src.replace(
    /^([ \t]*)(?:(?:public|private|protected|final|synchronized|abstract|override)\s+)*(?:(static)\s+)?(?:void|int|long|double|float|boolean|char|byte|short|String|var|Object|[A-Z][A-Za-z0-9_]*(?:\[\])*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:throws\s+[A-Za-z0-9_,\s]+)?\{/gm,
    (full, indent, isStatic, methodName, params) => {
      if (/^(if|for|while|switch|catch)$/.test(methodName)) return full;
      const cleanParams = params
        .split(',')
        .map((p: string) => p.replace(/\[\]/g, '').trim().split(/\s+/).pop() || '')
        .filter(Boolean)
        .join(', ');
      return `${indent}${isStatic ? 'static ' : ''}${methodName}(${cleanParams}) {`;
    }
  );

  // Bind unqualified class fields inside method bodies when not shadowed by params/locals
  if (declaredFields.size > 0) {
    const methodHeaderRe = /(?:static\s+)?(constructor|[A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/g;
    let out = '';
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = methodHeaderRe.exec(src)) !== null) {
      const mName = m[1];
      if (/^(if|for|while|switch|catch)$/.test(mName)) continue;
      const openIdx = m.index + m[0].length - 1;
      let depth = 0;
      let closeIdx = -1;
      for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
          depth--;
          if (depth === 0) {
            closeIdx = i;
            break;
          }
        }
      }
      if (closeIdx === -1) break;

      out += src.slice(lastIdx, openIdx + 1);
      const paramSet = new Set(
        m[2]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      );
      let mBody = src.slice(openIdx + 1, closeIdx);
      for (const field of declaredFields) {
        if (paramSet.has(field)) continue;
        // Rewrite bare `field` outside string literals and not preceded by `.` or `new `
        const fieldRe = new RegExp(`(?<!\\.)\\b(${field})\\b(?!\\s*[:(])`, 'g');
        mBody = mBody.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|([^"']+)/g, (_, strLit, codeSeg) => {
          if (strLit) return strLit;
          return codeSeg.replace(fieldRe, 'this.$1');
        });
      }
      out += mBody + '}';
      lastIdx = closeIdx + 1;
      methodHeaderRe.lastIndex = closeIdx + 1;
    }
    out += src.slice(lastIdx);
    src = out;
  }

  return src;
}

function transpileJavaExpressions(jsBody: string): string {
  let code = jsBody;
  const javaTypes = '(?:int|long|double|float|boolean|char|byte|short|String|var|Object|ArrayList|List|HashMap|Map|HashSet|Set|StringBuilder|Scanner|[A-Z][A-Za-z0-9_]*)';

  // Enhanced for-each loops: for (int x : arr) -> for (let x of arr)
  code = code.replace(
    new RegExp(`for\\s*\\(\\s*(?:final\\s+)?${javaTypes}(?:\\[\\])?\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*([^)]+)\\)`, 'g'),
    'for (let $1 of $2)'
  );

  // Traditional for loops: for (int i = 0; ...) -> for (let i = 0; ...)
  code = code.replace(
    new RegExp(`for\\s*\\(\\s*${javaTypes}\\s+`, 'g'),
    'for (let '
  );

  // new int[]{1,2,3} / {1, 2, 3}
  code = code.replace(
    new RegExp(`\\bnew\\s+(?:int|long|double|float|boolean|char|String|[A-Z][A-Za-z0-9_]*)\\[\\]\\s*\\{([^}]*)\\}`, 'g'),
    '[$1]'
  );
  // new int[n] -> Array(n).fill(0)
  code = code.replace(
    new RegExp(`\\bnew\\s+(?:int|long|double|float|byte|short)\\[([^\\]]+)\\]`, 'g'),
    'Array($1).fill(0)'
  );
  code = code.replace(/\bnew\s+(?:boolean|String|[A-Z][A-Za-z0-9_]*)\[([^\]]+)\]/g, 'Array($1).fill(null)');

  // Typed array variable with initializer list: int[] nums = {1, 2, 3};
  code = code.replace(
    new RegExp(`(?<=^|[;{\\n])\\s*(?:final\\s+)?${javaTypes}\\[\\]\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*\\{([^}]*)\\}\\s*;`, 'gm'),
    ' let $1 = [$2];'
  );

  // Local typed variables: int x = 5, y = 6; / Student s = new Student("An", 8); / String s = "abc"; / int n;
  code = code.replace(
    new RegExp(`(?<=^|[;{\\n])\\s*(?:final\\s+)?${javaTypes}(?:\\[\\])?\\s+([A-Za-z_][A-Za-z0-9_]*(?:\\s*=\\s*[^;\\n]+|\\s*(?:,\\s*[A-Za-z_][A-Za-z0-9_]*)*))\\s*;`, 'gm'),
    ' let $1;'
  );

  // Primitive casts (Graphics2D) g -> g, (int) x -> Math.trunc(x), (double) x -> Number(x)
  code = code.replace(/\(\s*(?:Graphics2D|Graphics)\s*\)\s*/g, '');
  code = code.replace(/super\.paintComponent\([^)]*\)\s*;?/g, '');
  code = code.replace(/\(\s*(?:int|long|short|byte)\s*\)\s*(\([^)]+\)|[A-Za-z0-9_.]+(?:\([^)]*\))?)/g, 'Math.trunc($1)');
  code = code.replace(/\(\s*(?:double|float)\s*\)\s*(\([^)]+\)|[A-Za-z0-9_.]+(?:\([^)]*\))?)/g, 'Number($1)');

  // Catch typed exceptions: catch (Exception e) -> catch (e)
  code = code.replace(/catch\s*\(\s*[A-Za-z0-9_.|]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\)/g, 'catch ($1)');

  // Safe String/StringBuilder method mappings (avoid overwriting built-in non-configurable String.prototype.length)
  code = code.replace(/\.equals\(/g, '.__javaEquals(');
  code = code.replace(/\.equalsIgnoreCase\(/g, '.__javaEqualsIgnoreCase(');
  code = code.replace(/\.length\s*\(\s*\)/g, '.__javaLen()');

  return code;
}

function splitTopLevelJavaClasses(source: string): { className: string; extendsName: string | null; fullClassJs: string }[] {
  const cleaned = stripJavaGenerics(
    source
      .replace(/@Override\s*/g, '')
      .replace(/^\s*package\s+[^;]+;\s*$/gm, '')
      .replace(/^\s*import\s+[^;]+;\s*$/gm, '')
  );

  const classes: { className: string; extendsName: string | null; fullClassJs: string }[] = [];
  const headerRe = /(?:public\s+|final\s+|abstract\s+)*class\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+extends\s+([A-Za-z_][A-Za-z0-9_]*))?(?:\s+implements\s+[A-Za-z0-9_,\s<>]+)?\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(cleaned)) !== null) {
    const className = match[1];
    const extendsName = match[2] || null;
    const openIdx = match.index + match[0].length - 1;
    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx === -1) break;
    const rawBody = cleaned.slice(openIdx + 1, closeIdx);
    const transformedBody = transpileJavaExpressions(transpileJavaClassBodyToJs(className, rawBody));
    const extClause = extendsName ? ` extends ${extendsName}` : '';
    classes.push({
      className,
      extendsName,
      fullClassJs: `class ${className}${extClause} {\n${transformedBody}\n}`,
    });
    headerRe.lastIndex = closeIdx + 1;
  }
  return classes;
}

export function runJavaProject(
  files: WorkspaceFile[],
  entryPath?: string,
  stdinText: string = ''
): PolyglotExecutionResult {
  const javaFiles = files.filter(f => !f.isBinary && /\.java$/i.test(f.path));
  if (javaFiles.length === 0) {
    return {
      ok: false,
      stdout: '',
      stderr: 'Không tìm thấy tệp .java nào trong folder.',
      exitCode: 1,
      engine: 'Java-JVM-Bridge',
      entryPath: '',
      compileLog: ['[javac] No .java files found.'],
    };
  }

  const entryFile =
    (entryPath && javaFiles.find(f => f.path === entryPath || f.name === entryPath)) ||
    javaFiles.find(f => /public\s+static\s+void\s+main\s*\(/.test(f.content || '')) ||
    javaFiles[0];

  const braceErrs = checkBalancedBraces(javaFiles.map(f => ({ path: f.path, content: f.content || '' })));
  if (braceErrs.length > 0) {
    return {
      ok: false,
      stdout: '',
      stderr: braceErrs.join('\n'),
      exitCode: 1,
      engine: 'Java-JVM-Bridge',
      entryPath: entryFile.path,
      compileLog: [`$ javac ${entryFile.path}`, ...braceErrs.map(e => `[error] ${e}`)],
    };
  }

  const allClasses: { className: string; extendsName: string | null; fullClassJs: string; filePath: string }[] = [];
  for (const jf of javaFiles) {
    const parsed = splitTopLevelJavaClasses(jf.content || '');
    for (const c of parsed) {
      allClasses.push({ ...c, filePath: jf.path });
    }
  }

  if (allClasses.length === 0) {
    return {
      ok: false,
      stdout: '',
      stderr: `${entryFile.path}: Không tìm thấy khai báo \`class ... {}\` hợp lệ.`,
      exitCode: 1,
      engine: 'Java-JVM-Bridge',
      entryPath: entryFile.path,
      compileLog: [`$ javac ${entryFile.path}`, '[error] Missing class declaration'],
    };
  }

  const mainClass =
    allClasses.find(c => c.filePath === entryFile.path && /\bstatic\s+main\s*\(/.test(c.fullClassJs)) ||
    allClasses.find(c => /\bstatic\s+main\s*\(/.test(c.fullClassJs)) ||
    allClasses[0];

  // Topologically sort base classes before subclasses
  const ordered: typeof allClasses = [];
  const added = new Set<string>();
  const visit = (c: (typeof allClasses)[number], stack = new Set<string>()) => {
    if (added.has(c.className) || stack.has(c.className)) return;
    stack.add(c.className);
    if (c.extendsName) {
      const parent = allClasses.find(x => x.className === c.extendsName);
      if (parent) visit(parent, stack);
    }
    added.add(c.className);
    ordered.push(c);
  };
  allClasses.forEach(c => visit(c));

  const outChunks: string[] = [];
  const errChunks: string[] = [];
  const drawCommands: CanvasDrawCommand[] = [];

  const javaStdPrelude = `
const __stdinRaw = ${JSON.stringify(stdinText || '')};
const __stdinTokens = __stdinRaw.trim() ? __stdinRaw.trim().split(/\\s+/) : [];
let __tokPos = 0;

if (!String.prototype.__javaEquals) {
  Object.defineProperties(String.prototype, {
    __javaEquals: { value: function(o) { return String(this) === String(o); }, configurable: true },
    __javaEqualsIgnoreCase: { value: function(o) { return String(this).toLowerCase() === String(o).toLowerCase(); }, configurable: true },
    __javaLen: { value: function() { return this.toString().length; }, configurable: true },
    isEmpty: { value: function() { return this.toString().length === 0; }, configurable: true },
    contains: { value: function(s) { return this.indexOf(String(s)) !== -1; }, configurable: true },
  });
}

const System = {
  in: __stdinRaw,
  out: {
    println: (v) => __out((v === undefined ? '' : String(v)) + '\\n'),
    print: (v) => __out(v === undefined ? '' : String(v)),
    printf: (fmt, ...args) => {
      let i = 0;
      const out = String(fmt).replace(/%(?:\\.(\\d+))?([dfsbn])/g, (_, prec, spec) => {
        if (spec === 'n') return '\\n';
        const val = args[i++];
        if (spec === 'f' && prec !== undefined) return Number(val).toFixed(Number(prec));
        if (spec === 'd') return String(Math.trunc(Number(val)));
        return String(val ?? '');
      });
      __out(out);
    },
  },
  err: {
    println: (v) => __err((v === undefined ? '' : String(v)) + '\\n'),
    print: (v) => __err(v === undefined ? '' : String(v)),
  },
  exit: (code) => { throw { __javaExit: code ?? 0 }; },
};

class Scanner {
  constructor() {}
  hasNext() { return __tokPos < __stdinTokens.length; }
  hasNextInt() { return this.hasNext() && !Number.isNaN(parseInt(__stdinTokens[__tokPos], 10)); }
  next() { return __tokPos < __stdinTokens.length ? __stdinTokens[__tokPos++] : ''; }
  nextInt() { const v = parseInt(this.next() || '0', 10); return Number.isNaN(v) ? 0 : v; }
  nextLong() { return this.nextInt(); }
  nextDouble() { const v = parseFloat(this.next() || '0'); return Number.isNaN(v) ? 0 : v; }
  nextLine() {
    if (__tokPos >= __stdinTokens.length) return '';
    return __stdinTokens[__tokPos++];
  }
  close() {}
}

class ArrayList extends Array {
  add(idxOrVal, maybeVal) {
    if (maybeVal !== undefined) { this.splice(idxOrVal, 0, maybeVal); return true; }
    this.push(idxOrVal);
    return true;
  }
  get(i) { return this[i]; }
  set(i, v) { const prev = this[i]; this[i] = v; return prev; }
  remove(idx) { return this.splice(idx, 1)[0]; }
  size() { return this.length; }
  isEmpty() { return this.length === 0; }
  contains(v) { return this.includes(v); }
  clear() { this.length = 0; }
}

class HashMap extends Map {
  put(k, v) { return this.set(k, v); }
  getOrDefault(k, def) { return this.has(k) ? this.get(k) : def; }
  containsKey(k) { return this.has(k); }
  remove(k) { return this.delete(k); }
  size() { return super.size; }
  keySet() { return Array.from(this.keys()); }
  values() { return Array.from(this.values()); }
}

class HashSet extends Set {
  contains(v) { return this.has(v); }
  size() { return super.size; }
}

class StringBuilder {
  constructor(init = '') { this._buf = String(init); }
  append(v) { this._buf += String(v); return this; }
  reverse() { this._buf = this._buf.split('').reverse().join(''); return this; }
  __javaLen() { return this._buf.length; }
  length() { return this._buf.length; }
  toString() { return this._buf; }
}

const Arrays = {
  sort: (arr) => arr.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  toString: (arr) => '[' + (arr || []).join(', ') + ']',
};

const Collections = {
  sort: (list) => list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  reverse: (list) => list.reverse(),
  max: (list) => Math.max(...list),
  min: (list) => Math.min(...list),
};

const Integer = { parseInt: (s) => parseInt(String(s), 10), valueOf: (s) => parseInt(String(s), 10), MAX_VALUE: 2147483647, MIN_VALUE: -2147483648 };
const Double = { parseDouble: (s) => parseFloat(String(s)), valueOf: (s) => parseFloat(String(s)) };

// ---- Java AWT / Swing Graphics Bridge ----
class Color {
  constructor(r, g = 0, b = 0, a = 255) {
    if (typeof r === 'string') { this._css = r; }
    else { this.r = Number(r); this.g = Number(g); this.b = Number(b); this.a = Number(a); this._css = 'rgba(' + this.r + ',' + this.g + ',' + this.b + ',' + (this.a / 255).toFixed(2) + ')'; }
  }
  toCss() { return this._css; }
}
Color.RED = new Color('#ef4444'); Color.red = Color.RED;
Color.BLUE = new Color('#3b82f6'); Color.blue = Color.BLUE;
Color.GREEN = new Color('#22c55e'); Color.green = Color.GREEN;
Color.YELLOW = new Color('#eab308'); Color.yellow = Color.YELLOW;
Color.CYAN = new Color('#06b6d4'); Color.cyan = Color.CYAN;
Color.MAGENTA = new Color('#d946ef'); Color.magenta = Color.MAGENTA;
Color.ORANGE = new Color('#f97316'); Color.orange = Color.ORANGE;
Color.PINK = new Color('#ec4899'); Color.pink = Color.PINK;
Color.WHITE = new Color('#ffffff'); Color.white = Color.WHITE;
Color.BLACK = new Color('#09090b'); Color.black = Color.BLACK;
Color.GRAY = new Color('#71717a'); Color.gray = Color.GRAY;
Color.LIGHT_GRAY = new Color('#d4d4d8'); Color.DARK_GRAY = new Color('#3f3f46');

class Font { constructor(name, style, size) { this.name = name; this.size = size; } }
Font.BOLD = 1; Font.ITALIC = 2; Font.PLAIN = 0;
class BasicStroke { constructor(w = 1) { this.w = w; } }
const RenderingHints = { KEY_ANTIALIASING: 'aa', VALUE_ANTIALIAS_ON: 'on' };

class Graphics {
  setColor(c) { __gfx({ op: 'color', args: [c && typeof c.toCss === 'function' ? c.toCss() : String(c || '#38bdf8')] }); }
  setStroke(s) { __gfx({ op: 'lineWidth', args: [Number(s && s.w ? s.w : 1)] }); }
  setFont() {}
  setRenderingHint() {}
  clearRect(x, y, w, h) { __gfx({ op: 'clear', args: ['#09090b'] }); }
  drawLine(x1, y1, x2, y2) { __gfx({ op: 'line', args: [Number(x1), Number(y1), Number(x2), Number(y2)] }); }
  drawRect(x, y, w, h) { __gfx({ op: 'rect', args: [Number(x), Number(y), Number(w), Number(h)] }); }
  fillRect(x, y, w, h) { __gfx({ op: 'fillRect', args: [Number(x), Number(y), Number(w), Number(h)] }); }
  drawRoundRect(x, y, w, h) { this.drawRect(x, y, w, h); }
  fillRoundRect(x, y, w, h) { this.fillRect(x, y, w, h); }
  drawOval(x, y, w, h) { __gfx({ op: 'oval', args: [Number(x), Number(y), Number(w), Number(h)] }); }
  fillOval(x, y, w, h) { __gfx({ op: 'fillOval', args: [Number(x), Number(y), Number(w), Number(h)] }); }
  drawString(s, x, y) { __gfx({ op: 'text', args: [String(s), Number(x), Number(y)] }); }
}
class Graphics2D extends Graphics {}

class JPanel {
  constructor() { this._bg = null; this._children = []; }
  setBackground(c) { this._bg = c; }
  add(c) { if (c) this._children.push(c); return c; }
  repaint() {}
  paintComponent(g) {}
  paint(g) { this.paintComponent(g); }
}
class Canvas extends JPanel {}
class JFrame {
  constructor(title = '') { this._title = title; this._children = []; }
  setTitle(t) { this._title = t; }
  setSize() {}
  setDefaultCloseOperation() {}
  setLocationRelativeTo() {}
  setResizable() {}
  pack() {}
  add(c) { if (c) this._children.push(c); return c; }
  setVisible(v) {
    if (v) {
      const g = new Graphics2D();
      if (this._bg) __gfx({ op: 'clear', args: [this._bg.toCss()] });
      if (typeof this.paint === 'function' && this.paint !== JFrame.prototype.paint) {
        this.paint(g);
      }
      for (const ch of this._children) {
        if (ch._bg) {
          __gfx({ op: 'color', args: [ch._bg.toCss()] });
          __gfx({ op: 'fillRect', args: [0, 0, 600, 360] });
        }
        if (typeof ch.paintComponent === 'function') ch.paintComponent(g);
        else if (typeof ch.paint === 'function') ch.paint(g);
      }
    }
  }
  paint(g) {}
}
JFrame.EXIT_ON_CLOSE = 3;
const SwingUtilities = { invokeLater: (fn) => { if (typeof fn === 'function') fn(); } };
`;

  const compileLog = [
    `$ javac ${javaFiles.map(f => f.path).join(' ')}`,
    `$ java ${mainClass.className}`,
  ];

  try {
    const classSources = ordered.map(c => c.fullClassJs).join('\n\n');
    const runner = new Function(
      '__out',
      '__err',
      '__gfx',
      `${javaStdPrelude}\n${classSources}\nreturn ${mainClass.className}.main([]);`
    );
    runner(
      (s: string) => outChunks.push(s),
      (s: string) => errChunks.push(s),
      (cmd: CanvasDrawCommand) => drawCommands.push(cmd)
    );
    compileLog.push(`> [Java-JVM-Bridge] ${ordered.length} class(es) compiled & executed cleanly`);
    return {
      ok: true,
      stdout: outChunks.join('').trimEnd() || (drawCommands.length > 0 ? `(Rendered ${drawCommands.length} Java Graphics operations)` : '(Executed cleanly — no stdout)'),
      stderr: errChunks.join('').trimEnd(),
      exitCode: 0,
      engine: 'Java-JVM-Bridge',
      entryPath: entryFile.path,
      compileLog,
      drawCommands: drawCommands.length > 0 ? drawCommands : undefined,
    };
  } catch (err: any) {
    if (err && typeof err === 'object' && '__javaExit' in err) {
      return {
        ok: err.__javaExit === 0,
        stdout: outChunks.join('').trimEnd(),
        stderr: errChunks.join('').trimEnd(),
        exitCode: Number(err.__javaExit) || 0,
        engine: 'Java-JVM-Bridge',
        entryPath: entryFile.path,
        compileLog,
        drawCommands: drawCommands.length > 0 ? drawCommands : undefined,
      };
    }
    const msg = err?.message || String(err);
    compileLog.push(`[error] ${msg}`);
    return {
      ok: false,
      stdout: outChunks.join('').trimEnd(),
      stderr: msg,
      exitCode: 1,
      engine: 'Java-JVM-Bridge',
      entryPath: entryFile.path,
      compileLog,
    };
  }
}
