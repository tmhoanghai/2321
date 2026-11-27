import { describe, expect, it } from 'vitest';
import {
  generate5DPolytopeFrame,
  normalize5DShape,
  parseModel3DPayload,
} from '../src/lib/model3dEngine';
import {
  computeIntegralVisualization,
  integrateSimpson,
  numericalDerivative,
} from '../src/lib/mathGraphEngine';
import {
  parseChartJsonSafe,
  repairChartPayloadDeterministic,
} from '../src/lib/chartData';
import { classifyImplicitVisualIntent } from '../src/lib/neuralBridge';

describe('5D Polytope Engine & Intent', () => {
  it('generates exact 5D polytope topologies projected 5D -> 4D -> 3D with solid faces', () => {
    expect(normalize5DShape('Khối 5-cube penteract 5D')).toBe('penteract');
    expect(normalize5DShape('5-orthoplex pentacross')).toBe('5orthoplex');
    expect(normalize5DShape('5-simplex hexateron')).toBe('5simplex');
    expect(normalize5DShape('demipenteract half')).toBe('demipenteract');

    const penteract = generate5DPolytopeFrame({ shape: 'penteract', size: 1.2 });
    expect(penteract.vertices).toHaveLength(32);
    expect(penteract.edges).toHaveLength(80);
    expect(penteract.faces.length).toBeGreaterThan(0);

    const orthoplex = generate5DPolytopeFrame({ shape: '5orthoplex', size: 1.2 });
    expect(orthoplex.vertices).toHaveLength(10);
    expect(orthoplex.edges).toHaveLength(40);

    const simplex = generate5DPolytopeFrame({ shape: '5simplex', size: 1.2 });
    expect(simplex.vertices).toHaveLength(6);
    expect(simplex.edges).toHaveLength(15);

    const demi = generate5DPolytopeFrame({ shape: 'demipenteract', size: 1.2 });
    expect(demi.vertices).toHaveLength(16);
    expect(demi.edges).toHaveLength(80);

    const torus5 = generate5DPolytopeFrame({ shape: '5torus', size: 1.2 });
    expect(torus5.vertices).toHaveLength(100);
    expect(torus5.edges).toHaveLength(200);
  });

  it('parses shape_5d payloads and routes 5D natural prompts to model3d intent', () => {
    const parsed = parseModel3DPayload(
      JSON.stringify({
        title: 'Penteract 5D',
        category: 'shape_5d',
        model5d: { shape: 'penteract', distance5d: 3.6, distance4d: 3.1, xwAngle: 0.4, wvAngle: 0.3 },
      })
    );
    expect(parsed.category).toBe('shape_5d');
    expect(parsed.model5d?.shape).toBe('penteract');
    expect(parsed.model5d?.distance5d).toBe(3.6);

    const intent = classifyImplicitVisualIntent('vẽ hình 5 chiều penteract');
    expect(intent.preferModel3D).toBe(true);
    expect(intent.reason).toBe('explicit_or_implicit_3d_4d');
  });
});

describe('Integral & Calculus Visualization Engine', () => {
  it('computes definite integral via Composite Simpson and Riemann approximations accurately', () => {
    const resQuadratic = integrateSimpson('x^2', {}, 0, 3, 120);
    expect(resQuadratic.signed).toBeCloseTo(9, 4);
    expect(resQuadratic.abs).toBeCloseTo(9, 4);

    // Signed integral of sin(x) from 0 to 2*pi is ~0, geometric area |S| is ~4
    const resSin = integrateSimpson('sin(x)', {}, 0, Math.PI * 2, 160);
    expect(resSin.signed).toBeCloseTo(0, 3);
    expect(resSin.abs).toBeCloseTo(4, 3);

    // Area between g(x) = x and f(x) = x^2 on [0, 1] -> 1/2 - 1/3 = 1/6
    const between = integrateSimpson('x', {}, 0, 1, 120, 'x^2');
    expect(between.signed).toBeCloseTo(1 / 6, 4);

    const viz = computeIntegralVisualization('x^2', {}, 0, 3, 12, 'midpoint');
    expect(viz.slices).toHaveLength(12);
    expect(viz.definiteIntegral).toBeCloseTo(9, 3);
    expect(viz.riemannSum).toBeCloseTo(9, 1);

    const slope = numericalDerivative('x^2', {}, 2);
    expect(slope).toBeCloseTo(4, 3);
  });

  it('normalizes integral chart payloads and repairs malformed chart configs deterministically', () => {
    const integralIntent = classifyImplicitVisualIntent('vẽ biểu đồ tích phân x^2 từ 0 đến 3');
    expect(integralIntent.preferChart).toBe(true);

    const normalized = parseChartJsonSafe(
      JSON.stringify({
        type: 'tich_phan',
        title: 'Tích phân test',
        functions: [{ expr: 'x^2' }],
        bounds: [0, 3],
        slices: 10,
        riemannMethod: 'trapezoid',
      })
    );
    expect(normalized?.type).toBe('integral');
    expect(normalized?.bounds).toEqual([0, 3]);
    expect(normalized?.slices).toBe(10);

    // Unquoted keys, single quotes, Python True, missing final closing brace
    const brokenJson = `\`\`\`json\n{type: 'bar', title: 'Doanh thu', showLegend: True, data: [{name: 'Q1', value: 120}, {name: 'Q2', value: 185}]`;
    const repaired = parseChartJsonSafe(brokenJson);
    expect(repaired?.type).toBe('bar');
    expect(repaired?.data).toHaveLength(2);
    expect(repaired?.data?.[1].value).toBe(185);

    const kvText = 'Thang 1: 40\nThang 2: 75\nThang 3: 60';
    const kvRecovered = repairChartPayloadDeterministic(kvText);
    expect(kvRecovered).not.toBeNull();
    const parsedKv = parseChartJsonSafe(kvRecovered!);
    expect(parsedKv?.data?.length).toBeGreaterThanOrEqual(3);
  });
});
