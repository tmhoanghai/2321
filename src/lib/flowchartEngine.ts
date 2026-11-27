import type { ChartPayload } from './chartData';

export type FlowchartNodeKind = 'start' | 'end' | 'process' | 'decision' | 'io';

export interface FlowchartNodeSpec {
  id: string;
  label: string;
  kind: FlowchartNodeKind;
  description: string;
  codeHint?: string;
  complexity?: string;
}

export interface FlowchartEdgeSpec {
  id: string;
  from: string;
  to: string;
  label?: string;
  isBackEdge?: boolean;
}

export interface FlowchartLayoutNode extends FlowchartNodeSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
}

export interface FlowchartLayoutEdge extends FlowchartEdgeSpec {
  pathD: string;
  labelX: number;
  labelY: number;
}

export interface FlowchartGraphLayout {
  nodes: FlowchartLayoutNode[];
  edges: FlowchartLayoutEdge[];
  width: number;
  height: number;
  stepsOrder: string[];
}

function normalizeNodeKind(raw?: string): FlowchartNodeKind {
  const k = String(raw || 'process').trim().toLowerCase();
  if (k === 'start' || k === 'begin' || k === 'bat_dau') return 'start';
  if (k === 'end' || k === 'stop' || k === 'finish' || k === 'ket_thuc' || k === 'return') return 'end';
  if (k === 'decision' || k === 'condition' || k === 'branch' || k === 'if' || k === 'while' || k === 'diamond') {
    return 'decision';
  }
  if (k === 'io' || k === 'input' || k === 'output' || k === 'read' || k === 'print') return 'io';
  return 'process';
}

export function normalizeFlowchartPayload(payload?: ChartPayload | null): {
  nodes: FlowchartNodeSpec[];
  edges: FlowchartEdgeSpec[];
} {
  const source: any = (payload as any)?.flowchart || payload || {};
  const rawNodes: any[] = Array.isArray(source.nodes)
    ? source.nodes
    : Array.isArray(source.steps)
    ? source.steps
    : [];
  const rawEdges: any[] = Array.isArray(source.edges)
    ? source.edges
    : Array.isArray(source.links)
    ? source.links
    : [];

  const nodes: FlowchartNodeSpec[] = rawNodes
    .map((n, idx): FlowchartNodeSpec | null => {
      if (typeof n === 'string') {
        const kind: FlowchartNodeKind =
          idx === 0 ? 'start' : idx === rawNodes.length - 1 ? 'end' : 'process';
        return {
          id: `n${idx + 1}`,
          label: n,
          kind,
          description: `Bước xử lý: ${n}.`,
        };
      }
      if (n && typeof n === 'object') {
        const id = String(n.id ?? `n${idx + 1}`).trim();
        const label = String(n.label ?? n.title ?? n.name ?? n.text ?? id).trim();
        const kind = normalizeNodeKind(n.kind || n.type || n.shape);
        const description = String(
          n.description || n.explanation || n.detail || n.note || `Thực thi khối "${label}".`
        ).trim();
        return {
          id,
          label,
          kind,
          description,
          codeHint: typeof n.code === 'string' ? n.code : typeof n.codeHint === 'string' ? n.codeHint : undefined,
          complexity: typeof n.complexity === 'string' ? n.complexity : undefined,
        };
      }
      return null;
    })
    .filter((n): n is FlowchartNodeSpec => Boolean(n));

  if (nodes.length === 0) {
    return {
      nodes: [
        {
          id: 'start',
          label: 'Bắt đầu: Nhập mảng & target',
          kind: 'start',
          description: 'Khởi tạo dữ liệu đầu vào đã sắp xếp tăng dần cùng giá trị cần tìm.',
        },
        {
          id: 'init',
          label: 'left = 0, right = n - 1',
          kind: 'process',
          description: 'Đặt hai con trỏ giới hạn khoảng tìm kiếm toàn mảng [0, n - 1].',
          codeHint: 'let left = 0, right = arr.length - 1;',
        },
        {
          id: 'cond',
          label: 'left <= right ?',
          kind: 'decision',
          description: 'Kiểm tra khoảng tìm kiếm còn hợp lệ hay đã thu hẹp về rỗng.',
        },
        {
          id: 'mid',
          label: 'mid = floor((left + right)/2)',
          kind: 'process',
          description: 'Chia đôi đoạn hiện tại để lấy phần tử giữa cần so sánh.',
          codeHint: 'const mid = left + ((right - left) >> 1);',
        },
        {
          id: 'match',
          label: 'arr[mid] == target ?',
          kind: 'decision',
          description: 'Nếu bằng target thì trả về vị trí mid ngay; ngược lại thu hẹp một nửa khoảng.',
        },
        {
          id: 'narrow',
          label: 'Cập nhật left hoặc right',
          kind: 'io',
          description: 'Nếu arr[mid] < target đặt left = mid + 1; nếu lớn hơn đặt right = mid - 1.',
        },
        {
          id: 'end_ok',
          label: 'Trả về mid / -1',
          kind: 'end',
          description: 'Kết thúc thuật toán với độ phức tạp thời gian O(log n).',
          complexity: 'O(log n)',
        },
      ],
      edges: [
        { id: 'e1', from: 'start', to: 'init' },
        { id: 'e2', from: 'init', to: 'cond' },
        { id: 'e3', from: 'cond', to: 'mid', label: 'Đúng' },
        { id: 'e4', from: 'cond', to: 'end_ok', label: 'Sai' },
        { id: 'e5', from: 'mid', to: 'match' },
        { id: 'e6', from: 'match', to: 'end_ok', label: 'Đúng' },
        { id: 'e7', from: 'match', to: 'narrow', label: 'Sai' },
        { id: 'e8', from: 'narrow', to: 'cond', label: 'Lặp lại', isBackEdge: true },
      ],
    };
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: FlowchartEdgeSpec[] = [];

  if (rawEdges.length > 0) {
    rawEdges.forEach((e, idx) => {
      if (Array.isArray(e) && e.length >= 2) {
        const from = String(e[0]).trim();
        const to = String(e[1]).trim();
        if (nodeIds.has(from) && nodeIds.has(to)) {
          edges.push({
            id: `e-${idx}`,
            from,
            to,
            label: e[2] !== undefined ? String(e[2]) : undefined,
          });
        }
      } else if (e && typeof e === 'object') {
        const from = String(e.from ?? e.source ?? '').trim();
        const to = String(e.to ?? e.target ?? '').trim();
        if (nodeIds.has(from) && nodeIds.has(to)) {
          edges.push({
            id: String(e.id || `e-${idx}`),
            from,
            to,
            label: e.label !== undefined ? String(e.label) : undefined,
            isBackEdge: Boolean(e.isBackEdge || e.loop),
          });
        }
      }
    });
  } else {
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: `e-seq-${i}`,
        from: nodes[i].id,
        to: nodes[i + 1].id,
      });
    }
  }

  return { nodes, edges };
}

export function layoutFlowchartGraph(
  nodes: FlowchartNodeSpec[],
  edges: FlowchartEdgeSpec[]
): FlowchartGraphLayout {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 520, height: 240, stepsOrder: [] };
  }

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  nodes.forEach((n) => {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  edges.forEach((e) => {
    if (e.isBackEdge) return;
    adj.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
  });

  // Assign topological layers ignoring back-edges via BFS while breaking accidental cycles safely
  const startNode =
    nodes.find((n) => n.kind === 'start') ||
    nodes.find((n) => (inDegree.get(n.id) || 0) === 0) ||
    nodes[0];

  const layerMap = new Map<string, number>();
  const visitedOrder: string[] = [];
  const queue: Array<{ id: string; layer: number }> = [{ id: startNode.id, layer: 0 }];
  const inStack = new Set<string>();

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (inStack.has(cur.id)) continue;
    inStack.add(cur.id);
    layerMap.set(cur.id, Math.max(layerMap.get(cur.id) ?? 0, cur.layer));
    visitedOrder.push(cur.id);
    for (const nxt of adj.get(cur.id) || []) {
      const prevLayer = layerMap.get(nxt);
      if (prevLayer === undefined) {
        queue.push({ id: nxt, layer: cur.layer + 1 });
      } else if (!inStack.has(nxt) && prevLayer < cur.layer + 1) {
        layerMap.set(nxt, cur.layer + 1);
      }
    }
  }

  // Ensure disconnected nodes receive sequential layers
  let maxAssigned = Math.max(0, ...Array.from(layerMap.values()));
  nodes.forEach((n) => {
    if (!layerMap.has(n.id)) {
      maxAssigned += 1;
      layerMap.set(n.id, maxAssigned);
      visitedOrder.push(n.id);
    }
  });

  const layers = new Map<number, FlowchartNodeSpec[]>();
  nodes.forEach((n) => {
    const l = layerMap.get(n.id) ?? 0;
    const arr = layers.get(l) || [];
    arr.push(n);
    layers.set(l, arr);
  });

  const sortedLayerKeys = Array.from(layers.keys()).sort((a, b) => a - b);
  const maxCols = Math.max(1, ...sortedLayerKeys.map((k) => (layers.get(k) || []).length));

  const nodeW = 196;
  const decisionSize = 156;
  const colGap = 64;
  const rowGap = 54;
  const baseRowH = 74;
  const padX = 56;
  const padY = 34;

  const contentW = Math.max(460, maxCols * (nodeW + colGap) - colGap);
  const width = contentW + padX * 2;
  const height = sortedLayerKeys.length * (baseRowH + rowGap) - rowGap + padY * 2 + 24;

  const laidOutNodes: FlowchartLayoutNode[] = [];
  const nodeById = new Map<string, FlowchartLayoutNode>();

  sortedLayerKeys.forEach((layerKey, rowIdx) => {
    const items = layers.get(layerKey) || [];
    const totalRowW = items.length * nodeW + Math.max(0, items.length - 1) * colGap;
    const startX = (width - totalRowW) / 2;
    const cy = padY + rowIdx * (baseRowH + rowGap) + baseRowH / 2;

    items.forEach((spec, colIdx) => {
      const cx = startX + colIdx * (nodeW + colGap) + nodeW / 2;
      const w = spec.kind === 'decision' ? decisionSize : nodeW;
      const h = spec.kind === 'decision' ? 84 : 54;
      const laid: FlowchartLayoutNode = {
        ...spec,
        x: cx,
        y: cy,
        width: w,
        height: h,
        layer: layerKey,
      };
      laidOutNodes.push(laid);
      nodeById.set(spec.id, laid);
    });
  });

  const laidOutEdges: FlowchartLayoutEdge[] = [];
  let backEdgeCounter = 0;

  edges.forEach((edge) => {
    const src = nodeById.get(edge.from);
    const dst = nodeById.get(edge.to);
    if (!src || !dst) return;

    const goesBackward = edge.isBackEdge || dst.layer <= src.layer;
    if (goesBackward) {
      backEdgeCounter += 1;
      const side = backEdgeCounter % 2 === 1 ? -1 : 1;
      const gutterX =
        side < 0
          ? Math.min(src.x - src.width / 2, dst.x - dst.width / 2) - 42 - (backEdgeCounter - 1) * 18
          : Math.max(src.x + src.width / 2, dst.x + dst.width / 2) + 42 + (backEdgeCounter - 1) * 18;
      const sx = side < 0 ? src.x - src.width / 2 : src.x + src.width / 2;
      const sy = src.y;
      const tx = side < 0 ? dst.x - dst.width / 2 : dst.x + dst.width / 2;
      const ty = dst.y;
      const pathD = `M ${sx} ${sy} C ${gutterX} ${sy}, ${gutterX} ${ty}, ${tx} ${ty}`;
      laidOutEdges.push({
        ...edge,
        isBackEdge: true,
        pathD,
        labelX: gutterX + (side < 0 ? -6 : 6),
        labelY: (sy + ty) / 2,
      });
    } else {
      const sx = src.x;
      const sy = src.y + src.height / 2;
      const tx = dst.x;
      const ty = dst.y - dst.height / 2;
      const midY = (sy + ty) / 2;
      const pathD =
        Math.abs(sx - tx) < 2
          ? `M ${sx} ${sy} L ${tx} ${ty}`
          : `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
      laidOutEdges.push({
        ...edge,
        isBackEdge: false,
        pathD,
        labelX: (sx + tx) / 2 + (sx === tx ? 14 : 0),
        labelY: midY - 4,
      });
    }
  });

  return {
    nodes: laidOutNodes,
    edges: laidOutEdges,
    width,
    height,
    stepsOrder: visitedOrder,
  };
}
