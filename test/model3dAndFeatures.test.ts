import { describe, expect, it } from 'vitest';
import {
  computePhysicsSummary,
  extractHeightmapGeometryFromPixels,
  generate4DPolytopeFrame,
  normalize4DShape,
  parseModel3DPayload,
} from '../src/lib/model3dEngine';
import { extractFilesFromMarkdown } from '../src/lib/fileGenerator';
import { verifyWorkspaceExecution } from '../src/lib/workspaceRuntimeVerifier';
import * as CANNON from 'cannon-es';
import { classifyImplicitVisualIntent, detectDetectiveIntent } from '../src/lib/neuralBridge';

describe('Model 3D / 4D / Image-to-3D & Physics Inspector engine', () => {
  it('parses composite 3D design models without requiring coordinate axes', () => {
    const spec = parseModel3DPayload(
      JSON.stringify({
        title: 'Bàn làm việc tối giản',
        category: 'design_3d',
        parts: [
          {
            id: 'top',
            label: 'Mặt bàn',
            type: 'box',
            position: [0, 0.75, 0],
            size: [1.8, 0.08, 0.8],
            color: '#e2e8f0',
            metalness: 0.2,
            roughness: 0.4,
            mass: 8,
            velocity: [1.5, 0, 0],
          },
          {
            id: 'leg1',
            label: 'Chân trái',
            type: 'cylinder',
            position: [-0.75, 0.37, 0],
            size: [0.05, 0.05, 0.74],
            mass: 2,
            velocity: [0, 0, 0],
          },
        ],
      })
    );

    expect(spec.category).toBe('design_3d');
    expect(spec.parts).toHaveLength(2);
    expect(spec.parts[0].mass).toBe(8);
    expect(spec.parts[0].velocity).toEqual([1.5, 0, 0]);

    const phys = computePhysicsSummary(spec.parts);
    expect(phys.totalMassKg).toBe(10);
    expect(phys.partCount).toBe(2);
    expect(phys.dimensions[0]).toBeGreaterThan(1.5);
    expect(phys.parts[0].speed).toBe(1.5);
    expect(phys.momentOfInertia[0]).toBeGreaterThan(0);
  });

  it('parses 4D polytopes and projects tesseract, 16-cell, 5-cell geometries', () => {
    expect(normalize4DShape('Khối hypercube 4d')).toBe('tesseract');
    expect(normalize4DShape('16-cell')).toBe('16cell');
    expect(normalize4DShape('5-cell simplex')).toBe('5cell');

    const spec = parseModel3DPayload(
      JSON.stringify({
        title: 'Tesseract 4D',
        category: 'shape_4d',
        model4d: { shape: 'tesseract', size: 1.5, distance4d: 3.0 },
      })
    );
    expect(spec.category).toBe('shape_4d');
    expect(spec.model4d).toBeDefined();

    const f1 = generate4DPolytopeFrame(spec.model4d!, { xw: 0, yw: 0, zw: 0 });
    expect(f1.vertices).toHaveLength(16);
    expect(f1.edges).toHaveLength(32);

    const f2 = generate4DPolytopeFrame(spec.model4d!, { xw: 1.1, yw: 0.4, zw: 0.3 });
    expect(f2.vertices[0]).not.toEqual(f1.vertices[0]);

    const f16 = generate4DPolytopeFrame(
      { ...spec.model4d!, shape: '16cell' },
      { xw: 0.2, yw: 0.1, zw: 0 }
    );
    expect(f16.vertices).toHaveLength(8);
    expect(f16.edges).toHaveLength(24);

    const f5 = generate4DPolytopeFrame(
      { ...spec.model4d!, shape: '5cell' },
      { xw: 0.2, yw: 0.1, zw: 0 }
    );
    expect(f5.vertices).toHaveLength(5);
    expect(f5.edges).toHaveLength(10);
  });

  it('extracts 3D relief solid/wireframe geometry and mass from image pixel data', () => {
    const w = 16;
    const h = 16;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const bright = x >= 4 && x <= 11 && y >= 4 && y <= 11 ? 240 : 20;
        pixels[idx] = bright;
        pixels[idx + 1] = bright;
        pixels[idx + 2] = 255;
        pixels[idx + 3] = 255;
      }
    }

    const relief = extractHeightmapGeometryFromPixels(pixels, w, h, 16, 16, 1.0, 3.0);
    expect(relief.positions.length).toBe(16 * 16 * 3);
    expect(relief.colors.length).toBe(16 * 16 * 3);
    expect(relief.indices.length).toBe(15 * 15 * 6);
    expect(relief.boundsMax[2]).toBeGreaterThan(relief.boundsMin[2]);
    expect(relief.estimatedMassKg).toBeGreaterThan(0);
  });
});

describe('File extraction & runtime verifier', () => {
  it('extracts filenames from headers/labels and excludes model3d/4d fences from workspace files', () => {
    const md = [
      '### Cập nhật tệp `src/utils/calc.ts`',
      '```ts',
      'export function add(a: number, b: number) { return a + b; }',
      '```',
      '',
      'Đây là mô hình 3D minh họa:',
      '```model3d',
      '{"title":"Khối lập phương","category":"design_3d","parts":[{"type":"box"}]}',
      '```',
      '',
      '```4d',
      '{"title":"Tesseract","shape":"tesseract"}',
      '```',
    ].join('\n');

    const extracted = extractFilesFromMarkdown(md);
    expect(extracted).toHaveLength(1);
    expect(extracted[0].filename).toBe('src/utils/calc.ts');
  });

  it('verifies broken imports/runtime vs valid workspaces cleanly', async () => {
    const broken = await verifyWorkspaceExecution(
      [
        {
          path: 'src/App.tsx',
          name: 'App.tsx',
          mimeType: 'text/typescript',
          size: 80,
          content: `import { doesNotExist } from './helper';\nexport default function App() { return <div>{doesNotExist()}</div>; }`,
        },
        {
          path: 'src/helper.ts',
          name: 'helper.ts',
          mimeType: 'text/typescript',
          size: 40,
          content: `export function realFn() { return 42; }`,
        },
      ],
      'broken-app'
    );
    expect(broken.ok).toBe(false);
    expect(broken.stage).toBe('static');
    expect(broken.errors.some((e) => e.includes('doesNotExist'))).toBe(true);

    const validCpp = await verifyWorkspaceExecution(
      [
        {
          path: 'main.cpp',
          name: 'main.cpp',
          mimeType: 'text/x-c++src',
          size: 90,
          content: `#include <iostream>\nint main() { std::cout << "OK"; return 0; }`,
        },
      ],
      'cpp-ok'
    );
    expect(validCpp.ok).toBe(true);
    expect(validCpp.stage).toBe('passed');
  });
});

describe('Implicit visual routing (3D/4D vs Charts/Roadmaps vs Code)', () => {
  it('routes standalone 3D, 4D, and image-to-3D prompts to Model3D without math plot confusion', () => {
    const res3d = classifyImplicitVisualIntent('vẽ mô hình thiết kế ngôi nhà 3d hiện đại');
    expect(res3d.reason).toBe('explicit_or_implicit_3d_4d');
    expect(res3d.preferModel3D).toBe(true);
    expect(res3d.preferChart).toBe(false);

    const res4d = classifyImplicitVisualIntent('vẽ khối tesseract 4d xoay');
    expect(res4d.reason).toBe('explicit_or_implicit_3d_4d');
    expect(res4d.preferModel3D).toBe(true);

    const resImg = classifyImplicitVisualIntent('vẽ mô hình theo cái ảnh này thành wireframe 3d');
    expect(resImg.reason).toBe('explicit_or_implicit_3d_4d');
    expect(resImg.preferModel3D).toBe(true);

    const resRoadmap = classifyImplicitVisualIntent('vẽ lộ trình học lập trình web 6 tháng');
    expect(resRoadmap.reason).toBe('explicit_or_implicit_math_data');
    expect(resRoadmap.preferChart).toBe(true);
    expect(resRoadmap.preferModel3D).toBe(false);

    const resFix = classifyImplicitVisualIntent('fix lỗi runtime TypeError is not a function trong folder');
    expect(resFix.suppressVisuals).toBe(true);

    const resCandle = classifyImplicitVisualIntent('vẽ sơ đồ nến BTC 14 ngày qua');
    expect(resCandle.preferChart).toBe(true);
    expect(resCandle.preferModel3D).toBe(false);
  });

  it('simulates Cannon.js gravity and rigid-body object-to-object collisions accurately', () => {
    const world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);

    const groundMat = new CANNON.Material('ground');
    const bodyMat = new CANNON.Material('part');
    world.addContactMaterial(
      new CANNON.ContactMaterial(groundMat, bodyMat, { restitution: 0.45, friction: 0.35 })
    );
    world.addContactMaterial(
      new CANNON.ContactMaterial(bodyMat, bodyMat, { restitution: 0.5, friction: 0.3 })
    );

    const floor = new CANNON.Body({ mass: 0, material: groundMat, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floor);

    const boxA = new CANNON.Body({
      mass: 2,
      material: bodyMat,
      shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
      position: new CANNON.Vec3(0, 0.5, 0),
    });
    const boxB = new CANNON.Body({
      mass: 2,
      material: bodyMat,
      shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
      position: new CANNON.Vec3(0, 2.1, 0),
    });
    world.addBody(boxA);
    world.addBody(boxB);

    let collisionDetected = false;
    for (let i = 0; i < 60; i++) {
      world.step(1 / 60);
      for (const c of world.contacts) {
        if ((c.bi === boxA && c.bj === boxB) || (c.bi === boxB && c.bj === boxA)) {
          collisionDetected = true;
        }
      }
    }

    expect(boxB.position.y).toBeLessThan(2.1);
    expect(collisionDetected).toBe(true);
  });

  it('activates detective reasoning strictly on explicit investigation requests', () => {
    expect(detectDetectiveIntent('điều tra vụ án mất trộm đồng hồ trong phòng kín')).toBe(true);
    expect(detectDetectiveIntent('Suy luận trinh thám tìm hung thủ qua lời khai và manh mối')).toBe(true);
    expect(detectDetectiveIntent('Investigate this murder mystery alibi timeline')).toBe(true);

    expect(detectDetectiveIntent('vẽ sơ đồ nến VNINDEX')).toBe(false);
    expect(detectDetectiveIntent('tính tích phân x^2 từ 0 đến 3')).toBe(false);
    expect(detectDetectiveIntent('viết component React hiển thị bảng giá')).toBe(false);
  });
});

