export type Model3DPrimitiveKind =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'torusKnot'
  | 'octahedron'
  | 'icosahedron'
  | 'dodecahedron'
  | 'capsule'
  | 'lathe'
  | 'tube'
  | 'plane';

export interface Model3DPart {
  id: string;
  label: string;
  type: Model3DPrimitiveKind;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  size: number[];
  points2d?: [number, number][];
  curvePoints?: [number, number, number][];
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
  emissive: string;
  emissiveIntensity: number;
  mass: number;
  velocity: [number, number, number];
}

export type Polytope4DShape =
  | 'tesseract'
  | '16cell'
  | '5cell'
  | 'duoprism'
  | 'clifford_torus';

export interface Model4DSpec {
  shape: Polytope4DShape;
  size: number;
  distance4d: number;
  xwAngle: number;
  ywAngle: number;
  zwAngle: number;
  edgeColor: string;
  vertexColor: string;
}

export type Polytope5DShape =
  | 'penteract'
  | '5orthoplex'
  | '5simplex'
  | 'demipenteract'
  | '5torus';

export interface Model5DSpec {
  shape: Polytope5DShape;
  size: number;
  distance5d: number;
  distance4d: number;
  xwAngle: number;
  ywAngle: number;
  xvAngle: number;
  wvAngle: number;
  edgeColor: string;
  vertexColor: string;
}

export interface Model3DSpec {
  title: string;
  subtitle?: string;
  category: 'design_3d' | 'object_3d' | 'architecture_3d' | 'shape_4d' | 'shape_5d' | 'image_3d';
  parts: Model3DPart[];
  model4d?: Model4DSpec;
  model5d?: Model5DSpec;
  imageSource?: string;
  wireframe?: boolean;
  showFloor?: boolean;
  autoRotate?: boolean;
}

export interface Polytope4DFrame {
  vertices: [number, number, number][];
  edges: [number, number][];
  faces: [number, number, number][];
  wDepths: number[];
}

export interface Polytope5DFrame {
  vertices: [number, number, number][];
  edges: [number, number][];
  faces: [number, number, number][];
  vDepths: number[];
  wDepths: number[];
}

export interface ExtractedImageReliefGeometry {
  cols: number;
  rows: number;
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
  estimatedMassKg: number;
}

export interface PartPhysicsSummary {
  id: string;
  label: string;
  mass: number;
  center: [number, number, number];
  halfExtents: [number, number, number];
  velocity: [number, number, number];
  speed: number;
}

export interface ModelPhysicsSummary {
  totalMassKg: number;
  centerOfMass: [number, number, number];
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
  dimensions: [number, number, number];
  momentOfInertia: [number, number, number];
  partCount: number;
  parts: PartPhysicsSummary[];
}

const DEFAULT_PALETTE = ['#3b82f6', '#94a3b8', '#e2e8f0', '#f59e0b', '#10b981', '#6366f1'];

function toVec3(val: any, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(val) && val.length >= 3) {
    const x = Number(val[0]);
    const y = Number(val[1]);
    const z = Number(val[2]);
    return [
      Number.isFinite(x) ? x : fallback[0],
      Number.isFinite(y) ? y : fallback[1],
      Number.isFinite(z) ? z : fallback[2],
    ];
  }
  return fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizePrimitiveKind(raw?: string): Model3DPrimitiveKind {
  const k = String(raw || 'box').toLowerCase().trim();
  if (k === 'cube' || k === 'rect' || k === 'beam' || k === 'wall') return 'box';
  if (k === 'ball' || k === 'orb') return 'sphere';
  if (k === 'tube_pipe' || k === 'pipe') return 'cylinder';
  if (k === 'pyramid' || k === 'tetrahedron') return 'cone';
  if (k === 'ring' || k === 'donut') return 'torus';
  if (k === 'torusknot' || k === 'knot') return 'torusKnot';
  if (k === 'diamond') return 'octahedron';
  const valid: Model3DPrimitiveKind[] = [
    'box', 'sphere', 'cylinder', 'cone', 'torus', 'torusKnot',
    'octahedron', 'icosahedron', 'dodecahedron', 'capsule', 'lathe', 'tube', 'plane',
  ];
  return (valid.find((v) => v.toLowerCase() === k) as Model3DPrimitiveKind) || 'box';
}

export function normalize4DShape(raw?: string): Polytope4DShape {
  const s = String(raw || '').toLowerCase();
  if (/16|octa|cross/.test(s)) return '16cell';
  if (/5|simplex|pentachoron|tetra/.test(s)) return '5cell';
  if (/duo|prism/.test(s)) return 'duoprism';
  if (/clifford|torus|hypersphere/.test(s)) return 'clifford_torus';
  return 'tesseract';
}

export function normalize5DShape(raw?: string): Polytope5DShape {
  const s = String(raw || '').toLowerCase();
  if (/orthoplex|pentacross|cross|32|10-?vertex/.test(s)) return '5orthoplex';
  if (/simplex|hexateron|6-?vertex/.test(s)) return '5simplex';
  if (/demi|half/.test(s)) return 'demipenteract';
  if (/torus|duotorus|5torus/.test(s)) return '5torus';
  return 'penteract';
}

function estimatePartMass(type: Model3DPrimitiveKind, size: number[], scale: [number, number, number]): number {
  const s = size.length ? size : [1, 1, 1];
  let vol = 1;
  if (type === 'box' || type === 'plane') {
    vol = (s[0] ?? 1) * (s[1] ?? 1) * (s[2] ?? 1);
  } else if (type === 'sphere' || type === 'icosahedron' || type === 'octahedron' || type === 'dodecahedron') {
    const r = s[0] ?? 0.6;
    vol = (4 / 3) * Math.PI * r * r * r;
  } else if (type === 'cylinder' || type === 'capsule') {
    const r = ((s[0] ?? 0.4) + (s[1] ?? s[0] ?? 0.4)) / 2;
    const h = s[2] ?? 1.2;
    vol = Math.PI * r * r * h;
  } else if (type === 'cone') {
    const r = s[0] ?? 0.6;
    const h = s[1] ?? 1.2;
    vol = (1 / 3) * Math.PI * r * r * h;
  } else if (type === 'torus' || type === 'torusKnot') {
    const R = s[0] ?? 0.8;
    const r = s[1] ?? 0.22;
    vol = 2 * Math.PI * Math.PI * R * r * r;
  }
  const scaled = Math.abs(vol * scale[0] * scale[1] * scale[2]);
  return Math.max(0.25, Number((scaled * 2.4).toFixed(2)));
}

function estimateHalfExtents(part: Model3DPart): [number, number, number] {
  const s = part.size;
  const sc = part.scale;
  switch (part.type) {
    case 'box':
    case 'plane':
      return [
        Math.abs(((s[0] ?? 1) * sc[0]) / 2),
        Math.abs(((s[1] ?? 1) * sc[1]) / 2),
        Math.abs(((s[2] ?? 1) * sc[2]) / 2),
      ];
    case 'cylinder':
    case 'capsule': {
      const r = Math.max(s[0] ?? 0.4, s[1] ?? 0.4);
      const h = s[2] ?? 1.2;
      return [Math.abs(r * sc[0]), Math.abs((h / 2) * sc[1]), Math.abs(r * sc[2])];
    }
    case 'cone': {
      const r = s[0] ?? 0.6;
      const h = s[1] ?? 1.2;
      return [Math.abs(r * sc[0]), Math.abs((h / 2) * sc[1]), Math.abs(r * sc[2])];
    }
    case 'torus':
    case 'torusKnot': {
      const outer = (s[0] ?? 0.8) + (s[1] ?? 0.22);
      return [Math.abs(outer * sc[0]), Math.abs(outer * sc[1]), Math.abs((s[1] ?? 0.25) * sc[2])];
    }
    default: {
      const r = s[0] ?? 0.7;
      return [Math.abs(r * sc[0]), Math.abs(r * sc[1]), Math.abs(r * sc[2])];
    }
  }
}

export function buildPreset3DParts(preset: string): Model3DPart[] {
  const p = preset.toLowerCase();
  if (/chair|ghế|furniture|nội thất/.test(p)) {
    return [
      { id: 'seat', label: 'Đệm ngồi', type: 'box', position: [0, 0.9, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [1.3, 0.14, 1.25], color: '#334155', metalness: 0.15, roughness: 0.65, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 3.2, velocity: [0, 0, 0] },
      { id: 'back', label: 'Tựa lưng', type: 'box', position: [0, 1.55, -0.55], rotation: [-0.08, 0, 0], scale: [1, 1, 1], size: [1.26, 1.15, 0.12], color: '#475569', metalness: 0.15, roughness: 0.6, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 2.8, velocity: [0, 0, 0] },
      { id: 'leg-fl', label: 'Chân trước trái', type: 'cylinder', position: [-0.52, 0.45, 0.48], rotation: [0, 0, 0], scale: [1, 1, 1], size: [0.05, 0.04, 0.9], color: '#94a3b8', metalness: 0.85, roughness: 0.25, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 0.9, velocity: [0, 0, 0] },
      { id: 'leg-fr', label: 'Chân trước phải', type: 'cylinder', position: [0.52, 0.45, 0.48], rotation: [0, 0, 0], scale: [1, 1, 1], size: [0.05, 0.04, 0.9], color: '#94a3b8', metalness: 0.85, roughness: 0.25, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 0.9, velocity: [0, 0, 0] },
      { id: 'leg-bl', label: 'Chân sau trái', type: 'cylinder', position: [-0.52, 0.45, -0.48], rotation: [0, 0, 0], scale: [1, 1, 1], size: [0.05, 0.04, 0.9], color: '#94a3b8', metalness: 0.85, roughness: 0.25, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 0.9, velocity: [0, 0, 0] },
      { id: 'leg-br', label: 'Chân sau phải', type: 'cylinder', position: [0.52, 0.45, -0.48], rotation: [0, 0, 0], scale: [1, 1, 1], size: [0.05, 0.04, 0.9], color: '#94a3b8', metalness: 0.85, roughness: 0.25, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 0.9, velocity: [0, 0, 0] },
    ];
  }

  if (/house|nhà|villa|building|kiến trúc|architecture/.test(p)) {
    return [
      { id: 'plinth', label: 'Nền móng', type: 'box', position: [0, 0.12, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [4.2, 0.24, 3.2], color: '#334155', metalness: 0.1, roughness: 0.85, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 12, velocity: [0, 0, 0] },
      { id: 'main-block', label: 'Khối nhà chính', type: 'box', position: [-0.35, 1.15, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [2.8, 1.8, 2.3], color: '#e2e8f0', metalness: 0.05, roughness: 0.72, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 18, velocity: [0, 0, 0] },
      { id: 'glass-wing', label: 'Mặt kính hiện đại', type: 'box', position: [1.15, 1.05, 0.15], rotation: [0, 0, 0], scale: [1, 1, 1], size: [0.95, 1.6, 1.85], color: '#38bdf8', metalness: 0.2, roughness: 0.12, opacity: 0.52, emissive: '#0284c7', emissiveIntensity: 0.15, mass: 4.5, velocity: [0, 0, 0] },
      { id: 'roof', label: 'Mái nghiêng', type: 'box', position: [-0.1, 2.15, 0], rotation: [0, 0, -0.09], scale: [1, 1, 1], size: [3.8, 0.18, 2.7], color: '#1e293b', metalness: 0.45, roughness: 0.4, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 7.4, velocity: [0, 0, 0] },
      { id: 'pillar', label: 'Cột đỡ hiên', type: 'cylinder', position: [1.52, 1.12, 0.95], rotation: [0, 0, 0], scale: [1, 1, 1], size: [0.08, 0.08, 1.95], color: '#94a3b8', metalness: 0.85, roughness: 0.25, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 2.1, velocity: [0, 0, 0] },
    ];
  }

  // Default mechanical / product design composite assembly
  return [
    { id: 'chassis', label: 'Thân máy chính', type: 'box', position: [0, 0.75, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [2.2, 0.7, 1.4], color: '#334155', metalness: 0.72, roughness: 0.28, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 6.4, velocity: [0.8, 0, 0] },
    { id: 'core', label: 'Lõi động cơ', type: 'cylinder', position: [0, 1.2, 0], rotation: [0, 0, Math.PI / 2], scale: [1, 1, 1], size: [0.42, 0.42, 1.6], color: '#3b82f6', metalness: 0.88, roughness: 0.18, opacity: 1, emissive: '#1d4ed8', emissiveIntensity: 0.25, mass: 4.1, velocity: [0, 0.35, 0] },
    { id: 'ring', label: 'Vành truyền động', type: 'torus', position: [0, 1.2, 0], rotation: [0, Math.PI / 2, 0], scale: [1, 1, 1], size: [0.68, 0.09], color: '#e2e8f0', metalness: 0.92, roughness: 0.15, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 1.9, velocity: [0, 0.4, 0.6] },
    { id: 'lens', label: 'Vỏ kính quang học', type: 'sphere', position: [0.95, 1.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [0.34], color: '#38bdf8', metalness: 0.15, roughness: 0.08, opacity: 0.58, emissive: '#0284c7', emissiveIntensity: 0.2, mass: 0.85, velocity: [1.1, 0.15, 0] },
    { id: 'stand', label: 'Chân đế', type: 'cylinder', position: [0, 0.22, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [0.75, 0.95, 0.44], color: '#1e293b', metalness: 0.5, roughness: 0.55, opacity: 1, emissive: '#000000', emissiveIntensity: 0, mass: 5.5, velocity: [0, 0, 0] },
  ];
}

export function parseModel3DPayload(raw: string): Model3DSpec {
  const trimmed = String(raw || '').trim();
  let parsed: any = null;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        parsed = null;
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    const looks5d = /\b(5d|penteract|5-?cube|hypercube\s*5|hexateron|5-?simplex|5-?orthoplex|pentacross|demipenteract|5torus|chiều\s*(?:thứ\s*)?5|5\s*chiều)\b/i.test(trimmed);
    if (looks5d) {
      const shape = normalize5DShape(trimmed);
      return {
        title: `Mô hình 5D (${shape})`,
        category: 'shape_5d',
        parts: [],
        model5d: {
          shape,
          size: 1.35,
          distance5d: 3.4,
          distance4d: 3.1,
          xwAngle: 0.4,
          ywAngle: 0.25,
          xvAngle: 0.35,
          wvAngle: 0.3,
          edgeColor: '#a78bfa',
          vertexColor: '#f8fafc',
        },
        showFloor: false,
        autoRotate: true,
      };
    }

    const looks4d = /\b(4d|tesseract|hypercube|16-?cell|5-?cell|duoprism|chiều\s*(?:thứ\s*)?4|4\s*chiều)\b/i.test(trimmed);
    if (looks4d) {
      const shape = normalize4DShape(trimmed);
      return {
        title: `Mô hình 4D (${shape})`,
        category: 'shape_4d',
        parts: [],
        model4d: {
          shape,
          size: 1.4,
          distance4d: 2.8,
          xwAngle: 0.45,
          ywAngle: 0.35,
          zwAngle: 0.2,
          edgeColor: '#38bdf8',
          vertexColor: '#f8fafc',
        },
        showFloor: false,
        autoRotate: true,
      };
    }

    return {
      title: trimmed.slice(0, 60) || 'Mô hình thiết kế 3D',
      category: 'design_3d',
      parts: buildPreset3DParts(trimmed),
      showFloor: true,
      autoRotate: false,
    };
  }

  const rawCat = String(parsed.category || parsed.type || '').toLowerCase();
  const shapeStr = String(parsed.shape || parsed.shape5d || parsed.shape4d || '');
  const is5d =
    Boolean(parsed.model5d) ||
    rawCat.includes('5d') ||
    /penteract|5orthoplex|5simplex|hexateron|pentacross|demipenteract|5torus|5_cube|5cube/i.test(shapeStr);
  const is4d =
    !is5d &&
    (Boolean(parsed.model4d) ||
      rawCat.includes('4d') ||
      /tesseract|hypercube|16cell|5cell|duoprism|clifford_torus/i.test(shapeStr));

  const category: Model3DSpec['category'] = is5d
    ? 'shape_5d'
    : is4d
    ? 'shape_4d'
    : rawCat.includes('image')
    ? 'image_3d'
    : rawCat.includes('arch')
    ? 'architecture_3d'
    : rawCat.includes('design')
    ? 'design_3d'
    : 'object_3d';

  const rawParts = Array.isArray(parsed.parts)
    ? parsed.parts
    : Array.isArray(parsed.objects)
    ? parsed.objects
    : Array.isArray(parsed.meshes)
    ? parsed.meshes
    : [];

  const parts: Model3DPart[] = rawParts.map((item: any, idx: number) => {
    const kind = normalizePrimitiveKind(item?.type || item?.geometry || item?.shape);
    const size = Array.isArray(item?.size)
      ? item.size.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) : 1))
      : Array.isArray(item?.args)
      ? item.args.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) : 1))
      : [
          Number(item?.width ?? item?.radius ?? 1),
          Number(item?.height ?? item?.tube ?? 1),
          Number(item?.depth ?? 1),
        ];
    const scale = toVec3(item?.scale, [1, 1, 1]);
    const mass = Number.isFinite(Number(item?.mass))
      ? Math.max(0.05, Number(item.mass))
      : estimatePartMass(kind, size, scale);

    return {
      id: String(item?.id || `part-${idx + 1}`),
      label: String(item?.label || item?.name || `Khối ${idx + 1}`),
      type: kind,
      position: toVec3(item?.position, [0, 0, 0]),
      rotation: toVec3(item?.rotation, [0, 0, 0]),
      scale,
      size,
      points2d: Array.isArray(item?.points2d) ? item.points2d : undefined,
      curvePoints: Array.isArray(item?.curvePoints) ? item.curvePoints : undefined,
      color: typeof item?.color === 'string' && item.color.trim() ? item.color.trim() : DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length],
      metalness: clamp(Number.isFinite(Number(item?.metalness)) ? Number(item.metalness) : 0.35, 0, 1),
      roughness: clamp(Number.isFinite(Number(item?.roughness)) ? Number(item.roughness) : 0.45, 0, 1),
      opacity: clamp(Number.isFinite(Number(item?.opacity)) ? Number(item.opacity) : 1, 0.05, 1),
      emissive: typeof item?.emissive === 'string' ? item.emissive : '#000000',
      emissiveIntensity: clamp(Number.isFinite(Number(item?.emissiveIntensity)) ? Number(item.emissiveIntensity) : 0, 0, 3),
      mass,
      velocity: toVec3(item?.velocity, [0, 0, 0]),
    };
  });

  const model4d: Model4DSpec | undefined = is4d
    ? {
        shape: normalize4DShape(parsed.model4d?.shape || parsed.shape || parsed.shape4d || parsed.title),
        size: clamp(Number(parsed.model4d?.size ?? parsed.size ?? 1.35) || 1.35, 0.4, 3.5),
        distance4d: clamp(Number(parsed.model4d?.distance4d ?? parsed.distance4d ?? 2.8) || 2.8, 1.8, 6),
        xwAngle: Number(parsed.model4d?.xwAngle ?? 0.45) || 0,
        ywAngle: Number(parsed.model4d?.ywAngle ?? 0.35) || 0,
        zwAngle: Number(parsed.model4d?.zwAngle ?? 0.2) || 0,
        edgeColor: typeof parsed.model4d?.edgeColor === 'string' ? parsed.model4d.edgeColor : '#38bdf8',
        vertexColor: typeof parsed.model4d?.vertexColor === 'string' ? parsed.model4d.vertexColor : '#f8fafc',
      }
    : undefined;

  const model5d: Model5DSpec | undefined = is5d
    ? {
        shape: normalize5DShape(parsed.model5d?.shape || parsed.shape || parsed.shape5d || parsed.title),
        size: clamp(Number(parsed.model5d?.size ?? parsed.size ?? 1.35) || 1.35, 0.4, 3.5),
        distance5d: clamp(Number(parsed.model5d?.distance5d ?? parsed.distance5d ?? 3.4) || 3.4, 2.0, 6.5),
        distance4d: clamp(Number(parsed.model5d?.distance4d ?? parsed.distance4d ?? 3.1) || 3.1, 2.0, 6.0),
        xwAngle: Number(parsed.model5d?.xwAngle ?? 0.4) || 0,
        ywAngle: Number(parsed.model5d?.ywAngle ?? 0.25) || 0,
        xvAngle: Number(parsed.model5d?.xvAngle ?? 0.35) || 0,
        wvAngle: Number(parsed.model5d?.wvAngle ?? 0.3) || 0,
        edgeColor: typeof parsed.model5d?.edgeColor === 'string' ? parsed.model5d.edgeColor : '#a78bfa',
        vertexColor: typeof parsed.model5d?.vertexColor === 'string' ? parsed.model5d.vertexColor : '#f8fafc',
      }
    : undefined;

  const finalParts =
    parts.length > 0
      ? parts
      : is4d || is5d || category === 'image_3d'
      ? []
      : buildPreset3DParts(String(parsed.preset || parsed.title || ''));

  return {
    title: String(
      parsed.title ||
        (is5d ? `Mô hình 5D (${model5d?.shape})` : is4d ? `Mô hình 4D (${model4d?.shape})` : 'Mô hình 3D tương tác')
    ),
    subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : undefined,
    category,
    parts: finalParts,
    model4d,
    model5d,
    imageSource: typeof parsed.image === 'string' ? parsed.image : typeof parsed.imageSource === 'string' ? parsed.imageSource : undefined,
    wireframe: Boolean(parsed.wireframe),
    showFloor: parsed.showFloor !== undefined ? Boolean(parsed.showFloor) : !(is4d || is5d),
    autoRotate: parsed.autoRotate !== undefined ? Boolean(parsed.autoRotate) : is4d || is5d,
  };
}

export function generate4DPolytopeFrame(
  spec: Model4DSpec,
  angles: { xw: number; yw: number; zw: number }
): Polytope4DFrame {
  const verts4: [number, number, number, number][] = [];
  const edges: [number, number][] = [];

  if (spec.shape === '16cell') {
    const r = spec.size;
    verts4.push(
      [r, 0, 0, 0], [-r, 0, 0, 0],
      [0, r, 0, 0], [0, -r, 0, 0],
      [0, 0, r, 0], [0, 0, -r, 0],
      [0, 0, 0, r], [0, 0, 0, -r]
    );
    for (let i = 0; i < verts4.length; i++) {
      for (let j = i + 1; j < verts4.length; j++) {
        // Connect all non-antipodal vertices
        const dot =
          verts4[i][0] * verts4[j][0] +
          verts4[i][1] * verts4[j][1] +
          verts4[i][2] * verts4[j][2] +
          verts4[i][3] * verts4[j][3];
        if (dot === 0) edges.push([i, j]);
      }
    }
  } else if (spec.shape === '5cell') {
    const s = spec.size * 0.85;
    verts4.push(
      [s, s, s, -s / Math.sqrt(5)],
      [s, -s, -s, -s / Math.sqrt(5)],
      [-s, s, -s, -s / Math.sqrt(5)],
      [-s, -s, s, -s / Math.sqrt(5)],
      [0, 0, 0, (4 * s) / Math.sqrt(5)]
    );
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) edges.push([i, j]);
    }
  } else if (spec.shape === 'duoprism') {
    const n1 = 6;
    const n2 = 6;
    const r1 = spec.size * 0.85;
    const r2 = spec.size * 0.85;
    for (let i = 0; i < n1; i++) {
      const a = (i / n1) * Math.PI * 2;
      for (let j = 0; j < n2; j++) {
        const b = (j / n2) * Math.PI * 2;
        verts4.push([r1 * Math.cos(a), r1 * Math.sin(a), r2 * Math.cos(b), r2 * Math.sin(b)]);
      }
    }
    for (let i = 0; i < n1; i++) {
      for (let j = 0; j < n2; j++) {
        const idx = i * n2 + j;
        const nextJ = i * n2 + ((j + 1) % n2);
        const nextI = ((i + 1) % n1) * n2 + j;
        edges.push([idx, nextJ], [idx, nextI]);
      }
    }
  } else if (spec.shape === 'clifford_torus') {
    const n1 = 12;
    const n2 = 12;
    const r = spec.size * 0.9;
    for (let i = 0; i < n1; i++) {
      const u = (i / n1) * Math.PI * 2;
      for (let j = 0; j < n2; j++) {
        const v = (j / n2) * Math.PI * 2;
        verts4.push([r * Math.cos(u), r * Math.sin(u), r * Math.cos(v), r * Math.sin(v)]);
      }
    }
    for (let i = 0; i < n1; i++) {
      for (let j = 0; j < n2; j++) {
        const idx = i * n2 + j;
        edges.push([idx, i * n2 + ((j + 1) % n2)], [idx, ((i + 1) % n1) * n2 + j]);
      }
    }
  } else {
    // 4D Tesseract (Hypercube): 16 vertices, 32 edges
    const h = spec.size * 0.72;
    for (let mask = 0; mask < 16; mask++) {
      verts4.push([
        mask & 1 ? h : -h,
        mask & 2 ? h : -h,
        mask & 4 ? h : -h,
        mask & 8 ? h : -h,
      ]);
    }
    for (let a = 0; a < 16; a++) {
      for (let bit = 0; bit < 4; bit++) {
        const b = a ^ (1 << bit);
        if (a < b) edges.push([a, b]);
      }
    }
  }

  // Generate 2D triangle faces for Solid rendering mode on 4D polytopes
  const faces: [number, number, number][] = [];
  if (spec.shape === 'tesseract') {
    for (let a = 0; a < 16; a++) {
      for (let b1 = 0; b1 < 4; b1++) {
        for (let b2 = b1 + 1; b2 < 4; b2++) {
          const v00 = a;
          const v10 = a ^ (1 << b1);
          const v01 = a ^ (1 << b2);
          const v11 = a ^ (1 << b1) ^ (1 << b2);
          if (v00 < v10 && v00 < v01 && v00 < v11) {
            faces.push([v00, v10, v11], [v00, v11, v01]);
          }
        }
      }
    }
  } else if (spec.shape === '5cell') {
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        for (let k = j + 1; k < 5; k++) {
          faces.push([i, j, k]);
        }
      }
    }
  } else if (spec.shape === '16cell') {
    for (let i = 0; i < 8; i++) {
      for (let j = i + 1; j < 8; j++) {
        if ((i ^ 1) === j) continue;
        for (let k = j + 1; k < 8; k++) {
          if ((i ^ 1) === k || (j ^ 1) === k) continue;
          faces.push([i, j, k]);
        }
      }
    }
  } else if (spec.shape === 'duoprism' || spec.shape === 'clifford_torus') {
    const n1 = spec.shape === 'duoprism' ? 6 : 12;
    const n2 = spec.shape === 'duoprism' ? 6 : 12;
    for (let i = 0; i < n1; i++) {
      for (let j = 0; j < n2; j++) {
        const a = i * n2 + j;
        const b = i * n2 + ((j + 1) % n2);
        const c = ((i + 1) % n1) * n2 + j;
        const d = ((i + 1) % n1) * n2 + ((j + 1) % n2);
        faces.push([a, b, d], [a, d, c]);
      }
    }
  }

  const cx = Math.cos(angles.xw), sx = Math.sin(angles.xw);
  const cy = Math.cos(angles.yw), sy = Math.sin(angles.yw);
  const cz = Math.cos(angles.zw), sz = Math.sin(angles.zw);

  const vertices: [number, number, number][] = [];
  const wDepths: number[] = [];

  for (const [vx, vy, vz, vw] of verts4) {
    // Rotate XW
    const x1 = vx * cx - vw * sx;
    const w1 = vx * sx + vw * cx;
    // Rotate YW
    const y2 = vy * cy - w1 * sy;
    const w2 = vy * sy + w1 * cy;
    // Rotate ZW
    const z3 = vz * cz - w2 * sz;
    const w3 = vz * sz + w2 * cz;

    const denom = Math.max(0.45, spec.distance4d - w3);
    const scale = spec.distance4d / denom;
    vertices.push([x1 * scale, y2 * scale, z3 * scale]);
    wDepths.push(w3);
  }

  return { vertices, edges, faces, wDepths };
}

export function generate5DPolytopeFrame(
  rawSpec: Partial<Model5DSpec> & { shape: Polytope5DShape },
  rawAngles?: { xw?: number; yw?: number; xv?: number; wv?: number }
): Polytope5DFrame {
  const spec = {
    shape: rawSpec.shape,
    size: rawSpec.size ?? 1.35,
    distance5d: rawSpec.distance5d ?? 3.4,
    distance4d: rawSpec.distance4d ?? 3.1,
    xwAngle: rawSpec.xwAngle ?? 0.42,
    ywAngle: rawSpec.ywAngle ?? 0.25,
    xvAngle: rawSpec.xvAngle ?? 0.36,
    wvAngle: rawSpec.wvAngle ?? 0.3,
  };
  const angles = {
    xw: rawAngles?.xw ?? spec.xwAngle,
    yw: rawAngles?.yw ?? spec.ywAngle,
    xv: rawAngles?.xv ?? spec.xvAngle,
    wv: rawAngles?.wv ?? spec.wvAngle,
  };
  const verts5: [number, number, number, number, number][] = [];
  const edges: [number, number][] = [];
  const faces: [number, number, number][] = [];

  if (spec.shape === '5orthoplex') {
    // 5-orthoplex (pentacross): 10 vertices, 40 edges
    const r = spec.size * 1.05;
    for (let axis = 0; axis < 5; axis++) {
      const pos: [number, number, number, number, number] = [0, 0, 0, 0, 0];
      const neg: [number, number, number, number, number] = [0, 0, 0, 0, 0];
      pos[axis] = r;
      neg[axis] = -r;
      verts5.push(pos, neg);
    }
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < 10; j++) {
        if ((i ^ 1) !== j) edges.push([i, j]);
      }
    }
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < 10; j++) {
        if ((i ^ 1) === j) continue;
        for (let k = j + 1; k < 10; k++) {
          if ((i ^ 1) === k || (j ^ 1) === k) continue;
          faces.push([i, j, k]);
        }
      }
    }
  } else if (spec.shape === '5simplex') {
    // 5-simplex (hexateron): 6 vertices, 15 edges, 20 triangular faces
    const s = spec.size * 0.95;
    const raw6: [number, number, number, number, number][] = [
      [1, 1, 1, 1, -1 / Math.sqrt(6)],
      [1, -1, -1, 1, -1 / Math.sqrt(6)],
      [-1, 1, -1, 1, -1 / Math.sqrt(6)],
      [-1, -1, 1, 1, -1 / Math.sqrt(6)],
      [0, 0, 0, -2, -1 / Math.sqrt(6)],
      [0, 0, 0, 0, 5 / Math.sqrt(6)],
    ];
    for (const v of raw6) {
      verts5.push([v[0] * s * 0.65, v[1] * s * 0.65, v[2] * s * 0.65, v[3] * s * 0.55, v[4] * s * 0.75]);
    }
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        edges.push([i, j]);
        for (let k = j + 1; k < 6; k++) {
          faces.push([i, j, k]);
        }
      }
    }
  } else if (spec.shape === 'demipenteract') {
    // Half-penteract (16 vertices, even parity of 5-cube, 80 edges)
    const h = spec.size * 0.72;
    const evenMasks: number[] = [];
    for (let mask = 0; mask < 32; mask++) {
      let bits = 0;
      for (let b = 0; b < 5; b++) if (mask & (1 << b)) bits++;
      if (bits % 2 === 0) {
        evenMasks.push(mask);
        verts5.push([
          mask & 1 ? h : -h,
          mask & 2 ? h : -h,
          mask & 4 ? h : -h,
          mask & 8 ? h : -h,
          mask & 16 ? h : -h,
        ]);
      }
    }
    for (let i = 0; i < evenMasks.length; i++) {
      for (let j = i + 1; j < evenMasks.length; j++) {
        const diff = evenMasks[i] ^ evenMasks[j];
        let diffBits = 0;
        for (let b = 0; b < 5; b++) if (diff & (1 << b)) diffBits++;
        if (diffBits === 2) edges.push([i, j]);
      }
    }
    // Triangles of vertices mutually separated by Hamming distance 2
    const edgeSet = new Set(edges.map(([a, b]) => `${a}:${b}`));
    for (let i = 0; i < evenMasks.length; i++) {
      for (let j = i + 1; j < evenMasks.length; j++) {
        if (!edgeSet.has(`${i}:${j}`)) continue;
        for (let k = j + 1; k < evenMasks.length; k++) {
          if (edgeSet.has(`${i}:${k}`) && edgeSet.has(`${j}:${k}`)) {
            faces.push([i, j, k]);
          }
        }
      }
    }
  } else if (spec.shape === '5torus') {
    // 5D Torus embedding (S1 x S1 embedded across 5 axes)
    const n1 = 10;
    const n2 = 10;
    const r = spec.size * 0.72;
    for (let i = 0; i < n1; i++) {
      const u = (i / n1) * Math.PI * 2;
      for (let j = 0; j < n2; j++) {
        const v = (j / n2) * Math.PI * 2;
        verts5.push([
          r * Math.cos(u),
          r * Math.sin(u),
          r * Math.cos(v),
          r * Math.sin(v),
          r * 0.55 * Math.cos(u + v),
        ]);
      }
    }
    for (let i = 0; i < n1; i++) {
      for (let j = 0; j < n2; j++) {
        const a = i * n2 + j;
        const b = i * n2 + ((j + 1) % n2);
        const c = ((i + 1) % n1) * n2 + j;
        const d = ((i + 1) % n1) * n2 + ((j + 1) % n2);
        edges.push([a, b], [a, c]);
        faces.push([a, b, d], [a, d, c]);
      }
    }
  } else {
    // Penteract (5-cube): 32 vertices, 80 edges, 80 square faces (160 triangles)
    const h = spec.size * 0.62;
    for (let mask = 0; mask < 32; mask++) {
      verts5.push([
        mask & 1 ? h : -h,
        mask & 2 ? h : -h,
        mask & 4 ? h : -h,
        mask & 8 ? h : -h,
        mask & 16 ? h : -h,
      ]);
    }
    for (let a = 0; a < 32; a++) {
      for (let bit = 0; bit < 5; bit++) {
        const b = a ^ (1 << bit);
        if (a < b) edges.push([a, b]);
      }
    }
    for (let a = 0; a < 32; a++) {
      for (let b1 = 0; b1 < 5; b1++) {
        for (let b2 = b1 + 1; b2 < 5; b2++) {
          const v00 = a;
          const v10 = a ^ (1 << b1);
          const v01 = a ^ (1 << b2);
          const v11 = a ^ (1 << b1) ^ (1 << b2);
          if (v00 < v10 && v00 < v01 && v00 < v11) {
            faces.push([v00, v10, v11], [v00, v11, v01]);
          }
        }
      }
    }
  }

  const cxw = Math.cos(angles.xw), sxw = Math.sin(angles.xw);
  const cyw = Math.cos(angles.yw), syw = Math.sin(angles.yw);
  const cxv = Math.cos(angles.xv), sxv = Math.sin(angles.xv);
  const cwv = Math.cos(angles.wv), swv = Math.sin(angles.wv);

  const vertices: [number, number, number][] = [];
  const vDepths: number[] = [];
  const wDepths: number[] = [];

  for (const [vx, vy, vz, vw, vv] of verts5) {
    // 1. Rotate XW
    const x1 = vx * cxw - vw * sxw;
    const w1 = vx * sxw + vw * cxw;
    // 2. Rotate YW
    const y2 = vy * cyw - w1 * syw;
    const w2 = vy * syw + w1 * cyw;
    // 3. Rotate XV
    const x3 = x1 * cxv - vv * sxv;
    const v3 = x1 * sxv + vv * cxv;
    // 4. Rotate WV
    const w4 = w2 * cwv - v3 * swv;
    const v4 = w2 * swv + v3 * cwv;

    // Perspective 5D -> 4D
    const denom5 = Math.max(0.55, spec.distance5d - v4);
    const scale5 = spec.distance5d / denom5;
    const x4d = x3 * scale5;
    const y4d = y2 * scale5;
    const z4d = vz * scale5;
    const w4d = w4 * scale5;

    // Perspective 4D -> 3D
    const denom4 = Math.max(0.55, spec.distance4d - w4d);
    const scale4 = spec.distance4d / denom4;
    vertices.push([x4d * scale4, y4d * scale4, z4d * scale4]);
    vDepths.push(v4);
    wDepths.push(w4d);
  }

  return { vertices, edges, faces, vDepths, wDepths };
}

export function extractHeightmapGeometryFromPixels(
  pixels: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  cols = 48,
  rows = 48,
  depthScale = 0.75,
  planeWidth = 3.2
): ExtractedImageReliefGeometry {
  const safeCols = Math.max(8, Math.min(96, Math.round(cols)));
  const safeRows = Math.max(8, Math.min(96, Math.round(rows)));
  const aspect = imgHeight > 0 && imgWidth > 0 ? imgHeight / imgWidth : 1;
  const planeHeight = planeWidth * clamp(aspect, 0.4, 2.2);

  const vertCount = safeCols * safeRows;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const heights = new Float32Array(vertCount);

  for (let r = 0; r < safeRows; r++) {
    const v = r / (safeRows - 1);
    const py = Math.min(imgHeight - 1, Math.floor(v * (imgHeight - 1)));
    for (let c = 0; c < safeCols; c++) {
      const u = c / (safeCols - 1);
      const px = Math.min(imgWidth - 1, Math.floor(u * (imgWidth - 1)));
      const pIdx = (py * imgWidth + px) * 4;
      const cr = (pixels[pIdx] ?? 128) / 255;
      const cg = (pixels[pIdx + 1] ?? 128) / 255;
      const cb = (pixels[pIdx + 2] ?? 128) / 255;
      const ca = (pixels[pIdx + 3] ?? 255) / 255;

      const luma = (0.299 * cr + 0.587 * cg + 0.114 * cb) * ca;
      const i = r * safeCols + c;
      heights[i] = luma;

      const x = (u - 0.5) * planeWidth;
      const y = (0.5 - v) * planeHeight;
      const z = luma * depthScale;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      colors[i * 3] = cr;
      colors[i * 3 + 1] = cg;
      colors[i * 3 + 2] = cb;
    }
  }

  // Subtle Laplacian edge boost to emphasize design contours
  for (let r = 1; r < safeRows - 1; r++) {
    for (let c = 1; c < safeCols - 1; c++) {
      const i = r * safeCols + c;
      const avg =
        (heights[i - 1] + heights[i + 1] + heights[i - safeCols] + heights[i + safeCols]) * 0.25;
      const edge = Math.abs(heights[i] - avg);
      positions[i * 3 + 2] += edge * depthScale * 0.55;
    }
  }

  const indices = new Uint32Array((safeCols - 1) * (safeRows - 1) * 6);
  let ptr = 0;
  for (let r = 0; r < safeRows - 1; r++) {
    for (let c = 0; c < safeCols - 1; c++) {
      const tl = r * safeCols + c;
      const tr = tl + 1;
      const bl = (r + 1) * safeCols + c;
      const br = bl + 1;
      indices[ptr++] = tl;
      indices[ptr++] = bl;
      indices[ptr++] = tr;
      indices[ptr++] = tr;
      indices[ptr++] = bl;
      indices[ptr++] = br;
    }
  }

  let minZ = Infinity;
  let maxZ = -Infinity;
  let sumH = 0;
  for (let i = 0; i < vertCount; i++) {
    const z = positions[i * 3 + 2];
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    sumH += Math.max(0.05, z + 0.08);
  }

  const avgThick = sumH / Math.max(1, vertCount);
  const estimatedMassKg = Number((planeWidth * planeHeight * avgThick * 1.8).toFixed(2));

  return {
    cols: safeCols,
    rows: safeRows,
    positions,
    colors,
    indices,
    boundsMin: [-planeWidth / 2, -planeHeight / 2, minZ],
    boundsMax: [planeWidth / 2, planeHeight / 2, maxZ],
    estimatedMassKg: Math.max(0.5, estimatedMassKg),
  };
}

export function computePhysicsSummary(parts: Model3DPart[]): ModelPhysicsSummary {
  if (!parts || parts.length === 0) {
    return {
      totalMassKg: 1.5,
      centerOfMass: [0, 0, 0],
      boundsMin: [-1, -1, -1],
      boundsMax: [1, 1, 1],
      dimensions: [2, 2, 2],
      momentOfInertia: [0.8, 0.8, 0.8],
      partCount: 0,
      parts: [],
    };
  }

  let totalMass = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const summaries: PartPhysicsSummary[] = [];

  for (const part of parts) {
    const m = Math.max(0.05, part.mass);
    const [px, py, pz] = part.position;
    const he = estimateHalfExtents(part);
    totalMass += m;
    cx += px * m;
    cy += py * m;
    cz += pz * m;

    min[0] = Math.min(min[0], px - he[0]);
    min[1] = Math.min(min[1], py - he[1]);
    min[2] = Math.min(min[2], pz - he[2]);
    max[0] = Math.max(max[0], px + he[0]);
    max[1] = Math.max(max[1], py + he[1]);
    max[2] = Math.max(max[2], pz + he[2]);

    const speed = Math.hypot(part.velocity[0], part.velocity[1], part.velocity[2]);
    summaries.push({
      id: part.id,
      label: part.label,
      mass: Number(m.toFixed(2)),
      center: [px, py, pz],
      halfExtents: he,
      velocity: part.velocity,
      speed: Number(speed.toFixed(2)),
    });
  }

  const com: [number, number, number] = [
    Number((cx / totalMass).toFixed(2)),
    Number((cy / totalMass).toFixed(2)),
    Number((cz / totalMass).toFixed(2)),
  ];

  let ix = 0;
  let iy = 0;
  let iz = 0;
  for (const ps of summaries) {
    const dx = ps.center[0] - com[0];
    const dy = ps.center[1] - com[1];
    const dz = ps.center[2] - com[2];
    const w = ps.halfExtents[0] * 2;
    const h = ps.halfExtents[1] * 2;
    const d = ps.halfExtents[2] * 2;
    ix += ps.mass * ((h * h + d * d) / 12 + dy * dy + dz * dz);
    iy += ps.mass * ((w * w + d * d) / 12 + dx * dx + dz * dz);
    iz += ps.mass * ((w * w + h * h) / 12 + dx * dx + dy * dy);
  }

  return {
    totalMassKg: Number(totalMass.toFixed(2)),
    centerOfMass: com,
    boundsMin: min.map((v) => Number(v.toFixed(2))) as [number, number, number],
    boundsMax: max.map((v) => Number(v.toFixed(2))) as [number, number, number],
    dimensions: [
      Number((max[0] - min[0]).toFixed(2)),
      Number((max[1] - min[1]).toFixed(2)),
      Number((max[2] - min[2]).toFixed(2)),
    ],
    momentOfInertia: [Number(ix.toFixed(2)), Number(iy.toFixed(2)), Number(iz.toFixed(2))],
    partCount: summaries.length,
    parts: summaries,
  };
}
