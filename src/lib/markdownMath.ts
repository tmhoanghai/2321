export interface ExtractedMathToken {
  math: string;
  block: boolean;
}

export const MATH_TOKEN_START = '\uE000TMMATH';
export const MATH_TOKEN_END = '\uE001';
export const MATH_TOKEN_REGEX = /\uE000TMMATH(BLK)?(\d+)\uE001/g;

/**
 * Replaces inline `$...$` and display `$$...$$` LaTeX spans with Markdown-safe tokens
 * so `remark-parse` and `remark-gfm` never split or break tables, bold markers, or lists.
 * Inline code backticks `` `...` `` are preserved verbatim.
 */
export function protectMarkdownMath(raw: string): {
  masked: string;
  tokens: ExtractedMathToken[];
} {
  if (!raw || !raw.includes('$')) {
    return { masked: raw || '', tokens: [] };
  }

  const tokens: ExtractedMathToken[] = [];
  let out = '';
  let i = 0;
  const n = raw.length;

  while (i < n) {
    // Preserve inline code spans `...` (or multi-backtick ``...``) untouched
    if (raw[i] === '`') {
      let tickCount = 0;
      while (i + tickCount < n && raw[i + tickCount] === '`') tickCount++;
      const fence = raw.slice(i, i + tickCount);
      const closeIdx = raw.indexOf(fence, i + tickCount);
      if (closeIdx !== -1) {
        out += raw.slice(i, closeIdx + tickCount);
        i = closeIdx + tickCount;
        continue;
      }
      out += fence;
      i += tickCount;
      continue;
    }

    // Preserve escaped \$ verbatim
    if (raw[i] === '\\' && raw[i + 1] === '$') {
      out += '\\$';
      i += 2;
      continue;
    }

    // Block display math $$...$$
    if (raw[i] === '$' && raw[i + 1] === '$') {
      let closeIdx = -1;
      let j = i + 2;
      while (j < n - 1) {
        if (raw[j] === '\\' && raw[j + 1] === '$') {
          j += 2;
          continue;
        }
        if (raw[j] === '$' && raw[j + 1] === '$') {
          closeIdx = j;
          break;
        }
        j++;
      }
      if (closeIdx !== -1) {
        const inner = raw.slice(i + 2, closeIdx).trim();
        if (inner.length > 0) {
          const idx = tokens.length;
          tokens.push({ math: inner, block: true });
          out += `${MATH_TOKEN_START}BLK${idx}${MATH_TOKEN_END}`;
          i = closeIdx + 2;
          continue;
        }
      }
      out += '$$';
      i += 2;
      continue;
    }

    // Inline math $...$ (single line, no leading/trailing space around $)
    if (raw[i] === '$') {
      const next = raw[i + 1];
      if (next && next !== ' ' && next !== '\t' && next !== '\n' && next !== '\r' && next !== '$') {
        let closeIdx = -1;
        let j = i + 1;
        while (j < n) {
          if (raw[j] === '\n' || raw[j] === '\r' || raw[j] === '`') break;
          if (raw[j] === '\\' && j + 1 < n) {
            j += 2;
            continue;
          }
          if (raw[j] === '$') {
            if (raw[j + 1] === '$') break;
            const prev = raw[j - 1];
            const after = raw[j + 1];
            const validClose =
              prev !== ' ' &&
              prev !== '\t' &&
              !(after && after >= '0' && after <= '9');
            if (validClose) {
              closeIdx = j;
            }
            break;
          }
          j++;
        }
        if (closeIdx !== -1) {
          const inner = raw.slice(i + 1, closeIdx).trim();
          if (inner.length > 0) {
            const idx = tokens.length;
            tokens.push({ math: inner, block: false });
            out += `${MATH_TOKEN_START}${idx}${MATH_TOKEN_END}`;
            i = closeIdx + 1;
            continue;
          }
        }
      }
    }

    out += raw[i];
    i++;
  }

  return { masked: out, tokens };
}
