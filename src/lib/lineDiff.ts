export interface DiffLine {
  type: 'context' | 'add' | 'remove' | 'hunk';
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface LineDiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
  hasChanges: boolean;
}

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n/g, '\n').split('\n');
}

export function computeLineDiff(
  oldText: string,
  newText: string,
  contextLines = 3
): LineDiffResult {
  const a = splitLines(oldText);
  const b = splitLines(newText);

  if (oldText === newText) {
    return { lines: [], added: 0, removed: 0, hasChanges: false };
  }

  // Fast bounded path when files are very large (> 800 lines each): trim common prefix & suffix first
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);

  const rawOps: Array<{ type: 'context' | 'add' | 'remove'; oldLine?: number; newLine?: number; text: string }> = [];

  for (let i = 0; i < prefix; i++) {
    rawOps.push({ type: 'context', oldLine: i + 1, newLine: i + 1, text: a[i] });
  }

  const m = midA.length;
  const n = midB.length;

  if (m === 0) {
    for (let j = 0; j < n; j++) {
      rawOps.push({ type: 'add', newLine: prefix + j + 1, text: midB[j] });
    }
  } else if (n === 0) {
    for (let i = 0; i < m; i++) {
      rawOps.push({ type: 'remove', oldLine: prefix + i + 1, text: midA[i] });
    }
  } else if (m * n <= 160000) {
    // Standard LCS dynamic programming table
    const stride = n + 1;
    const dp = new Int32Array((m + 1) * (n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          dp[i * stride + j] = dp[(i + 1) * stride + (j + 1)] + 1;
        } else {
          const down = dp[(i + 1) * stride + j];
          const right = dp[i * stride + (j + 1)];
          dp[i * stride + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        rawOps.push({
          type: 'context',
          oldLine: prefix + i + 1,
          newLine: prefix + j + 1,
          text: midA[i],
        });
        i++;
        j++;
      } else if (dp[(i + 1) * stride + j] >= dp[i * stride + (j + 1)]) {
        rawOps.push({ type: 'remove', oldLine: prefix + i + 1, text: midA[i] });
        i++;
      } else {
        rawOps.push({ type: 'add', newLine: prefix + j + 1, text: midB[j] });
        j++;
      }
    }
    while (i < m) {
      rawOps.push({ type: 'remove', oldLine: prefix + i + 1, text: midA[i] });
      i++;
    }
    while (j < n) {
      rawOps.push({ type: 'add', newLine: prefix + j + 1, text: midB[j] });
      j++;
    }
  } else {
    // Fallback for huge diffs: show middle block cleanly without O(N*M) memory blowup
    for (let i = 0; i < m; i++) {
      rawOps.push({ type: 'remove', oldLine: prefix + i + 1, text: midA[i] });
    }
    for (let j = 0; j < n; j++) {
      rawOps.push({ type: 'add', newLine: prefix + j + 1, text: midB[j] });
    }
  }

  for (let s = 0; s < suffix; s++) {
    const oldIdx = a.length - suffix + s;
    const newIdx = b.length - suffix + s;
    rawOps.push({ type: 'context', oldLine: oldIdx + 1, newLine: newIdx + 1, text: a[oldIdx] });
  }

  let added = 0;
  let removed = 0;
  const changedIndices: number[] = [];
  for (let idx = 0; idx < rawOps.length; idx++) {
    if (rawOps[idx].type === 'add') {
      added++;
      changedIndices.push(idx);
    } else if (rawOps[idx].type === 'remove') {
      removed++;
      changedIndices.push(idx);
    }
  }

  if (changedIndices.length === 0) {
    return { lines: [], added: 0, removed: 0, hasChanges: false };
  }

  // Group into compact hunks with `contextLines` around edits
  const include = new Uint8Array(rawOps.length);
  for (const cIdx of changedIndices) {
    const start = Math.max(0, cIdx - contextLines);
    const end = Math.min(rawOps.length - 1, cIdx + contextLines);
    for (let k = start; k <= end; k++) include[k] = 1;
  }

  const compactLines: DiffLine[] = [];
  let inGap = false;
  for (let idx = 0; idx < rawOps.length; idx++) {
    if (include[idx]) {
      if (inGap && compactLines.length > 0) {
        const op = rawOps[idx];
        compactLines.push({
          type: 'hunk',
          text: `@@ -${op.oldLine ?? '?'} +${op.newLine ?? '?'} @@`,
        });
      }
      inGap = false;
      compactLines.push(rawOps[idx]);
    } else {
      inGap = true;
    }
  }

  return {
    lines: compactLines,
    added,
    removed,
    hasChanges: added > 0 || removed > 0,
  };
}
