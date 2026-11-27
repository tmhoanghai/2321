import * as d3 from 'd3';

export type AlgorithmKind =
  | 'bfs'
  | 'dfs'
  | 'bfs_vs_dfs'
  | 'binary_search'
  | 'dijkstra'
  | 'two_pointers';

export interface AlgoNode {
  id: string;
  label: string;
  x: number;
  y: number;
  level?: number;
}

export interface AlgoEdge {
  source: string;
  target: string;
  weight?: number;
  directed?: boolean;
}

export interface AlgorithmStep {
  stepIndex: number;
  title: string;
  description: string;
  activeNode?: string;
  visited: string[];
  frontier: string[];
  frontierLabel: string; // 'Queue' | 'Stack' | 'PQ' | 'Window'
  activeEdge?: [string, string];
  treeEdges: Array<[string, string]>;
  distances?: Record<string, number>;
  // For array algorithms (Binary Search / Two Pointers)
  arrayPointers?: {
    low?: number;
    high?: number;
    mid?: number;
    left?: number;
    right?: number;
    foundIdx?: number;
    eliminated?: number[];
  };
  // Dual-algorithm comparison (e.g., BFS vs DFS simultaneously in 1 view)
  secondaryActiveNode?: string;
  secondaryVisited?: string[];
  secondaryFrontier?: string[];
  secondaryFrontierLabel?: string;
  secondaryTreeEdges?: Array<[string, string]>;
}

export interface AlgorithmTraceResult {
  kind: AlgorithmKind;
  title: string;
  nodes: AlgoNode[];
  edges: AlgoEdge[];
  directed: boolean;
  startNode?: string;
  targetNode?: string;
  array?: number[];
  targetValue?: number;
  steps: AlgorithmStep[];
  finalOrder: string[];
  secondaryOrder?: string[];
  foundIndex?: number | null;
}

export function normalizeAlgorithmKind(raw?: string): AlgorithmKind {
  const s = String(raw || 'bfs')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (s.includes('bfs_vs_dfs') || s.includes('bfs_dfs') || s.includes('so_sanh_bfs')) return 'bfs_vs_dfs';
  if (s.includes('binary') || s.includes('nhi_phan') || s === 'bs') return 'binary_search';
  if (s.includes('dijkstra') || s.includes('shortest')) return 'dijkstra';
  if (s.includes('two_pointer') || s.includes('2_pointer') || s.includes('hai_con_tro')) return 'two_pointers';
  if (s.includes('dfs') || s.includes('chieu_sau')) return 'dfs';
  return 'bfs';
}

function parseNodesAndEdges(payload: any): {
  nodeIds: string[];
  labelById: Map<string, string>;
  edges: AlgoEdge[];
  directed: boolean;
  startNode: string;
  targetNode?: string;
} {
  const directed = Boolean(payload?.directed);
  const rawNodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
  const rawEdges = Array.isArray(payload?.edges)
    ? payload.edges
    : Array.isArray(payload?.links)
    ? payload.links
    : [];

  const labelById = new Map<string, string>();
  const orderedIds: string[] = [];
  const addNode = (idRaw: unknown, labelRaw?: unknown) => {
    const id = String(idRaw ?? '').trim();
    if (!id) return;
    if (!labelById.has(id)) {
      orderedIds.push(id);
      labelById.set(id, String(labelRaw ?? id));
    }
  };

  for (const n of rawNodes) {
    if (typeof n === 'string' || typeof n === 'number') {
      addNode(n, n);
    } else if (n && typeof n === 'object') {
      addNode(n.id ?? n.name ?? n.label, n.label ?? n.name ?? n.id);
    }
  }

  const edges: AlgoEdge[] = [];
  for (const e of rawEdges) {
    let src = '';
    let tgt = '';
    let weight: number | undefined;
    if (Array.isArray(e) && e.length >= 2) {
      src = String(e[0]).trim();
      tgt = String(e[1]).trim();
      if (e[2] !== undefined && Number.isFinite(Number(e[2]))) {
        weight = Number(e[2]);
      }
    } else if (e && typeof e === 'object') {
      src = String(e.source ?? e.from ?? e.u ?? '').trim();
      tgt = String(e.target ?? e.to ?? e.v ?? '').trim();
      if (e.weight !== undefined || e.w !== undefined || e.cost !== undefined) {
        const w = Number(e.weight ?? e.w ?? e.cost);
        if (Number.isFinite(w)) weight = w;
      }
    }
    if (!src || !tgt) continue;
    addNode(src);
    addNode(tgt);
    edges.push({ source: src, target: tgt, weight, directed });
  }

  // Fallback clean 7-node example graph if payload omitted nodes/edges
  if (orderedIds.length === 0) {
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((id) => addNode(id, id));
    [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'D'],
      ['B', 'E'],
      ['C', 'F'],
      ['C', 'G'],
    ].forEach(([u, v]) => edges.push({ source: u, target: v, directed }));
  }

  const startCandidate = payload?.start ?? payload?.source ?? payload?.root ?? orderedIds[0];
  const startNode = labelById.has(String(startCandidate)) ? String(startCandidate) : orderedIds[0];
  const targetCandidate = payload?.target ?? payload?.end ?? payload?.goal;
  const targetNode =
    targetCandidate !== undefined && labelById.has(String(targetCandidate))
      ? String(targetCandidate)
      : undefined;

  return { nodeIds: orderedIds, labelById, edges, directed, startNode, targetNode };
}

function buildAdjacency(nodeIds: string[], edges: AlgoEdge[], directed: boolean): Map<string, Array<{ to: string; weight: number }>> {
  const adj = new Map<string, Array<{ to: string; weight: number }>>();
  nodeIds.forEach((id) => adj.set(id, []));
  for (const e of edges) {
    const w = e.weight ?? 1;
    adj.get(e.source)?.push({ to: e.target, weight: w });
    if (!directed) {
      adj.get(e.target)?.push({ to: e.source, weight: w });
    }
  }
  return adj;
}

export function computeAlgoGraphLayout(
  nodeIds: string[],
  labelById: Map<string, string>,
  edges: AlgoEdge[],
  startNode: string,
  directed: boolean,
  width = 600,
  height = 290
): AlgoNode[] {
  if (nodeIds.length === 0) return [];
  const adj = buildAdjacency(nodeIds, edges, directed);

  // Compute BFS levels from startNode for clean hierarchical tree/DAG placement
  const levelMap = new Map<string, number>();
  const queue: string[] = [startNode];
  levelMap.set(startNode, 0);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const lv = levelMap.get(cur)!;
    for (const nb of adj.get(cur) || []) {
      if (!levelMap.has(nb.to)) {
        levelMap.set(nb.to, lv + 1);
        queue.push(nb.to);
      }
    }
  }

  // Assign disconnected components cleanly at maxLevel + 1
  let maxLv = Math.max(0, ...Array.from(levelMap.values()));
  nodeIds.forEach((id) => {
    if (!levelMap.has(id)) {
      maxLv = Math.max(maxLv, 1);
      levelMap.set(id, maxLv);
    }
  });

  const maxLevel = Math.max(1, ...Array.from(levelMap.values()));
  const byLevel = new Map<number, string[]>();
  nodeIds.forEach((id) => {
    const lv = levelMap.get(id) ?? 0;
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(id);
  });

  const padX = 54;
  const padY = 40;
  const innerW = Math.max(180, width - padX * 2);
  const innerH = Math.max(140, height - padY * 2);

  // Initial layered coordinates
  const simNodes: any[] = nodeIds.map((id) => {
    const lv = levelMap.get(id) ?? 0;
    const bucket = byLevel.get(lv) || [id];
    const idxInBucket = bucket.indexOf(id);
    const x = padX + ((idxInBucket + 1) / (bucket.length + 1)) * innerW;
    const y = maxLevel === 0 ? height / 2 : padY + (lv / maxLevel) * innerH;
    return {
      id,
      label: labelById.get(id) || id,
      level: lv,
      x,
      y,
      fy: maxLevel >= 1 && byLevel.size >= 2 ? y : undefined,
    };
  });

  // Light horizontal force relaxation within layers to untangle crossing edges
  const simLinks = edges.map((e) => ({ source: e.source, target: e.target }));
  const sim = d3
    .forceSimulation(simNodes)
    .force('link', d3.forceLink(simLinks).id((d: any) => d.id).distance(72).strength(0.35))
    .force('charge', d3.forceManyBody().strength(-140))
    .force('collide', d3.forceCollide().radius(26))
    .stop();

  for (let i = 0; i < 65; i++) sim.tick();

  return simNodes.map((n) => ({
    id: n.id,
    label: n.label,
    level: n.level,
    x: Math.max(padX - 16, Math.min(width - padX + 16, Number.isFinite(n.x) ? n.x : width / 2)),
    y: Math.max(padY - 10, Math.min(height - padY + 10, Number.isFinite(n.y) ? n.y : height / 2)),
  }));
}

export function runBfsTrace(
  nodeIds: string[],
  edges: AlgoEdge[],
  startNode: string,
  directed = false
): { steps: AlgorithmStep[]; finalOrder: string[] } {
  const adj = buildAdjacency(nodeIds, edges, directed);
  const visited = new Set<string>([startNode]);
  const queue: string[] = [startNode];
  const dist: Record<string, number> = { [startNode]: 0 };
  const visitedOrder: string[] = [];
  const treeEdges: Array<[string, string]> = [];
  const steps: AlgorithmStep[] = [];

  steps.push({
    stepIndex: 0,
    title: `Khởi tạo BFS từ đỉnh ${startNode}`,
    description: `Đánh dấu ${startNode} đã thăm (d=0) và đẩy vào Queue: [${queue.join(', ')}]`,
    activeNode: startNode,
    visited: [],
    frontier: [...queue],
    frontierLabel: 'Queue',
    treeEdges: [],
    distances: { ...dist },
  });

  while (queue.length > 0) {
    const u = queue.shift()!;
    visitedOrder.push(u);

    const newlyAdded: string[] = [];
    for (const { to: v } of adj.get(u) || []) {
      if (!visited.has(v)) {
        visited.add(v);
        dist[v] = dist[u] + 1;
        queue.push(v);
        treeEdges.push([u, v]);
        newlyAdded.push(v);
      }
    }

    steps.push({
      stepIndex: steps.length,
      title: `Pop ${u} từ Queue (d=${dist[u]})`,
      description:
        newlyAdded.length > 0
          ? `Xét ${u} → thêm kề [${newlyAdded.join(', ')}] (d=${dist[u] + 1}) vào Queue.`
          : `Xét ${u} → không có đỉnh kề chưa thăm.`,
      activeNode: u,
      visited: [...visitedOrder],
      frontier: [...queue],
      frontierLabel: 'Queue',
      activeEdge: newlyAdded.length > 0 ? [u, newlyAdded[newlyAdded.length - 1]] : undefined,
      treeEdges: [...treeEdges],
      distances: { ...dist },
    });
  }

  return { steps, finalOrder: visitedOrder };
}

export function runDfsTrace(
  nodeIds: string[],
  edges: AlgoEdge[],
  startNode: string,
  directed = false
): { steps: AlgorithmStep[]; finalOrder: string[] } {
  const adj = buildAdjacency(nodeIds, edges, directed);
  const visited = new Set<string>();
  const visitedOrder: string[] = [];
  const treeEdges: Array<[string, string]> = [];
  const callStack: string[] = [];
  const steps: AlgorithmStep[] = [];

  const dfs = (u: string, parent?: string) => {
    visited.add(u);
    visitedOrder.push(u);
    callStack.push(u);
    if (parent) {
      treeEdges.push([parent, u]);
    }

    steps.push({
      stepIndex: steps.length,
      title: `Thăm đỉnh ${u} (độ sâu ${callStack.length - 1})`,
      description: parent
        ? `Đi sâu từ ${parent} → ${u}. Stack hiện tại: [${callStack.join(' → ')}]`
        : `Bắt đầu DFS tại ${u}. Stack: [${u}]`,
      activeNode: u,
      visited: [...visitedOrder],
      frontier: [...callStack],
      frontierLabel: 'Stack',
      activeEdge: parent ? [parent, u] : undefined,
      treeEdges: [...treeEdges],
    });

    for (const { to: v } of adj.get(u) || []) {
      if (!visited.has(v)) {
        dfs(v, u);
      }
    }

    callStack.pop();
    if (callStack.length > 0) {
      const top = callStack[callStack.length - 1];
      steps.push({
        stepIndex: steps.length,
        title: `Backtrack từ ${u} → ${top}`,
        description: `Đã duyệt hết nhánh ${u}, quay lui về ${top}. Stack: [${callStack.join(' → ')}]`,
        activeNode: top,
        visited: [...visitedOrder],
        frontier: [...callStack],
        frontierLabel: 'Stack',
        treeEdges: [...treeEdges],
      });
    }
  };

  dfs(startNode);
  return { steps, finalOrder: visitedOrder };
}

export function runDijkstraTrace(
  nodeIds: string[],
  edges: AlgoEdge[],
  startNode: string,
  targetNode?: string,
  directed = false
): { steps: AlgorithmStep[]; finalOrder: string[] } {
  const adj = buildAdjacency(nodeIds, edges, directed);
  const dist: Record<string, number> = {};
  nodeIds.forEach((id) => {
    dist[id] = id === startNode ? 0 : Infinity;
  });
  const settled = new Set<string>();
  const settledOrder: string[] = [];
  const parentEdge = new Map<string, [string, string]>();
  const steps: AlgorithmStep[] = [];

  steps.push({
    stepIndex: 0,
    title: `Khởi tạo Dijkstra từ ${startNode}`,
    description: `dist[${startNode}] = 0, các đỉnh khác = ∞.`,
    activeNode: startNode,
    visited: [],
    frontier: [startNode],
    frontierLabel: 'PQ',
    treeEdges: [],
    distances: { ...dist },
  });

  while (settled.size < nodeIds.length) {
    let bestNode: string | null = null;
    let bestDist = Infinity;
    for (const id of nodeIds) {
      if (!settled.has(id) && dist[id] < bestDist) {
        bestDist = dist[id];
        bestNode = id;
      }
    }
    if (!bestNode || !Number.isFinite(bestDist)) break;

    settled.add(bestNode);
    settledOrder.push(bestNode);

    const relaxed: string[] = [];
    for (const { to: v, weight: w } of adj.get(bestNode) || []) {
      if (settled.has(v)) continue;
      const cand = dist[bestNode] + w;
      if (cand < dist[v]) {
        dist[v] = cand;
        parentEdge.set(v, [bestNode, v]);
        relaxed.push(`${v}=${cand}`);
      }
    }

    const pqList = nodeIds
      .filter((id) => !settled.has(id) && Number.isFinite(dist[id]))
      .sort((a, b) => dist[a] - dist[b])
      .map((id) => `${id}:${dist[id]}`);

    steps.push({
      stepIndex: steps.length,
      title: `Chốt đỉnh ${bestNode} (dist = ${bestDist})`,
      description:
        relaxed.length > 0
          ? `Thư giãn cạnh từ ${bestNode}: cập nhật ${relaxed.join(', ')}.`
          : `Chốt ${bestNode}; không có cạnh nào giảm được thêm chi phí.`,
      activeNode: bestNode,
      visited: [...settledOrder],
      frontier: pqList,
      frontierLabel: 'PQ',
      activeEdge: parentEdge.get(bestNode),
      treeEdges: Array.from(parentEdge.values()),
      distances: { ...dist },
    });

    if (targetNode && bestNode === targetNode) break;
  }

  return { steps, finalOrder: settledOrder };
}

export function runBinarySearchTrace(
  rawArray: number[],
  target: number
): { sortedArray: number[]; steps: AlgorithmStep[]; foundIndex: number | null } {
  const arr = [...(rawArray.length > 0 ? rawArray : [2, 5, 8, 12, 16, 23, 38, 56, 72, 91])]
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const steps: AlgorithmStep[] = [];
  let low = 0;
  let high = arr.length - 1;
  let foundIdx: number | null = null;
  const eliminatedSet = new Set<number>();

  while (low <= high) {
    const mid = (low + high) >> 1;
    const midVal = arr[mid];
    const cmpText =
      midVal === target
        ? `arr[${mid}] = ${midVal} == ${target} → TÌM THẤY tại chỉ số ${mid}!`
        : midVal < target
        ? `arr[${mid}] = ${midVal} < ${target} → bỏ nửa trái [0..${mid}], dời L = ${mid + 1}`
        : `arr[${mid}] = ${midVal} > ${target} → bỏ nửa phải [${mid}..${arr.length - 1}], dời R = ${mid - 1}`;

    steps.push({
      stepIndex: steps.length,
      title: `Bước ${steps.length + 1}: L=${low}, mid=${mid}, R=${high}`,
      description: cmpText,
      visited: [],
      frontier: [`L=${low}`, `mid=${mid}`, `R=${high}`],
      frontierLabel: 'Pointers',
      treeEdges: [],
      arrayPointers: {
        low,
        high,
        mid,
        foundIdx: midVal === target ? mid : undefined,
        eliminated: Array.from(eliminatedSet),
      },
    });

    if (midVal === target) {
      foundIdx = mid;
      break;
    } else if (midVal < target) {
      for (let i = low; i <= mid; i++) eliminatedSet.add(i);
      low = mid + 1;
    } else {
      for (let i = mid; i <= high; i++) eliminatedSet.add(i);
      high = mid - 1;
    }
  }

  if (foundIdx === null) {
    steps.push({
      stepIndex: steps.length,
      title: `Kết thúc: L=${low} > R=${high}`,
      description: `Không tìm thấy giá trị ${target} trong mảng.`,
      visited: [],
      frontier: ['Not found (-1)'],
      frontierLabel: 'Result',
      treeEdges: [],
      arrayPointers: {
        low,
        high,
        eliminated: arr.map((_, i) => i),
      },
    });
  }

  return { sortedArray: arr, steps, foundIndex: foundIdx };
}

export function runTwoPointersTrace(
  rawArray: number[],
  targetSum: number
): { sortedArray: number[]; steps: AlgorithmStep[]; foundPair: [number, number] | null } {
  const arr = [...(rawArray.length > 0 ? rawArray : [1, 3, 4, 6, 8, 11, 14, 18])]
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const steps: AlgorithmStep[] = [];
  let left = 0;
  let right = arr.length - 1;
  let foundPair: [number, number] | null = null;
  const eliminated = new Set<number>();

  while (left < right) {
    const sum = arr[left] + arr[right];
    const desc =
      sum === targetSum
        ? `arr[${left}] + arr[${right}] = ${arr[left]} + ${arr[right]} = ${targetSum} → TÌM THẤY cặp (${left}, ${right})!`
        : sum < targetSum
        ? `Tổng = ${sum} < ${targetSum} → tăng L từ ${left} lên ${left + 1}`
        : `Tổng = ${sum} > ${targetSum} → giảm R từ ${right} xuống ${right - 1}`;

    steps.push({
      stepIndex: steps.length,
      title: `Bước ${steps.length + 1}: L=${left} (${arr[left]}), R=${right} (${arr[right]})`,
      description: desc,
      visited: [],
      frontier: [`L=${left}`, `R=${right}`, `Sum=${sum}`],
      frontierLabel: 'Window',
      treeEdges: [],
      arrayPointers: {
        left,
        right,
        foundIdx: sum === targetSum ? left : undefined,
        eliminated: Array.from(eliminated),
      },
    });

    if (sum === targetSum) {
      foundPair = [left, right];
      break;
    } else if (sum < targetSum) {
      eliminated.add(left);
      left++;
    } else {
      eliminated.add(right);
      right--;
    }
  }

  return { sortedArray: arr, steps, foundPair };
}

export function buildAlgorithmTrace(payload: any): AlgorithmTraceResult {
  const explicitAlgo = payload?.algorithm ?? payload?.algo ?? payload?.method ?? payload?.mode;
  const fallbackType =
    !explicitAlgo && payload?.type && !['algorithm_trace', 'algorithm', 'algo', 'cp_trace', 'graph_trace', 'thuat_toan'].includes(String(payload.type).toLowerCase())
      ? payload.type
      : undefined;
  const kind = normalizeAlgorithmKind(
    explicitAlgo ?? fallbackType ?? (Array.isArray(payload?.array) && !Array.isArray(payload?.nodes) ? 'binary_search' : 'bfs')
  );
  const title = String(
    payload?.title ||
      (kind === 'binary_search'
        ? 'Minh họa thuật toán Binary Search'
        : kind === 'two_pointers'
        ? 'Minh họa Two Pointers (Tổng hai phần tử)'
        : kind === 'dijkstra'
        ? 'Minh họa đường đi ngắn nhất Dijkstra'
        : kind === 'bfs_vs_dfs'
        ? 'So sánh BFS & DFS trên cùng đồ thị'
        : kind === 'dfs'
        ? 'Minh họa duyệt đồ thị DFS'
        : 'Minh họa duyệt đồ thị BFS')
  );

  if (kind === 'binary_search') {
    const rawArr = Array.isArray(payload?.array)
      ? payload.array
      : Array.isArray(payload?.values)
      ? payload.values
      : [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
    const targetVal = Number(payload?.target ?? rawArr[Math.floor(rawArr.length * 0.6)] ?? 23);
    const { sortedArray, steps, foundIndex } = runBinarySearchTrace(rawArr, targetVal);
    return {
      kind,
      title,
      nodes: [],
      edges: [],
      directed: false,
      array: sortedArray,
      targetValue: targetVal,
      steps,
      finalOrder: foundIndex !== null ? [String(foundIndex)] : [],
      foundIndex,
    };
  }

  if (kind === 'two_pointers') {
    const rawArr = Array.isArray(payload?.array)
      ? payload.array
      : Array.isArray(payload?.values)
      ? payload.values
      : [1, 3, 4, 6, 8, 11, 14, 18];
    const targetVal = Number(payload?.target ?? 17);
    const { sortedArray, steps, foundPair } = runTwoPointersTrace(rawArr, targetVal);
    return {
      kind,
      title,
      nodes: [],
      edges: [],
      directed: false,
      array: sortedArray,
      targetValue: targetVal,
      steps,
      finalOrder: foundPair ? [String(foundPair[0]), String(foundPair[1])] : [],
      foundIndex: foundPair ? foundPair[0] : null,
    };
  }

  const { nodeIds, labelById, edges, directed, startNode, targetNode } = parseNodesAndEdges(payload);
  const layoutNodes = computeAlgoGraphLayout(nodeIds, labelById, edges, startNode, directed);

  if (kind === 'dfs') {
    const { steps, finalOrder } = runDfsTrace(nodeIds, edges, startNode, directed);
    return {
      kind,
      title,
      nodes: layoutNodes,
      edges,
      directed,
      startNode,
      targetNode,
      steps,
      finalOrder,
    };
  }

  if (kind === 'dijkstra') {
    const { steps, finalOrder } = runDijkstraTrace(nodeIds, edges, startNode, targetNode, directed);
    return {
      kind,
      title,
      nodes: layoutNodes,
      edges,
      directed,
      startNode,
      targetNode,
      steps,
      finalOrder,
    };
  }

  if (kind === 'bfs_vs_dfs') {
    const bfs = runBfsTrace(nodeIds, edges, startNode, directed);
    const dfs = runDfsTrace(nodeIds, edges, startNode, directed);
    const maxLen = Math.max(bfs.steps.length, dfs.steps.length);
    const mergedSteps: AlgorithmStep[] = [];
    for (let i = 0; i < maxLen; i++) {
      const b = bfs.steps[Math.min(i, bfs.steps.length - 1)];
      const d = dfs.steps[Math.min(i, dfs.steps.length - 1)];
      mergedSteps.push({
        stepIndex: i,
        title: `Bước ${i}: BFS (${b.activeNode ?? '—'}) · DFS (${d.activeNode ?? '—'})`,
        description: `BFS Queue=[${b.frontier.join(',')}] | DFS Stack=[${d.frontier.join(',')}]`,
        activeNode: b.activeNode,
        visited: b.visited,
        frontier: b.frontier,
        frontierLabel: 'BFS Queue',
        treeEdges: b.treeEdges,
        distances: b.distances,
        secondaryActiveNode: d.activeNode,
        secondaryVisited: d.visited,
        secondaryFrontier: d.frontier,
        secondaryFrontierLabel: 'DFS Stack',
        secondaryTreeEdges: d.treeEdges,
      });
    }
    return {
      kind,
      title,
      nodes: layoutNodes,
      edges,
      directed,
      startNode,
      targetNode,
      steps: mergedSteps,
      finalOrder: bfs.finalOrder,
      secondaryOrder: dfs.finalOrder,
    };
  }

  const { steps, finalOrder } = runBfsTrace(nodeIds, edges, startNode, directed);
  return {
    kind: 'bfs',
    title,
    nodes: layoutNodes,
    edges,
    directed,
    startNode,
    targetNode,
    steps,
    finalOrder,
  };
}
