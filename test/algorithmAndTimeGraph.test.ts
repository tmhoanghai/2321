import { describe, expect, it } from 'vitest';
import {
  buildAlgorithmTrace,
  normalizeAlgorithmKind,
  runBfsTrace,
  runBinarySearchTrace,
  runDfsTrace,
  runDijkstraTrace,
  runTwoPointersTrace,
} from '../src/lib/algorithmVisualizer';
import { buildKinematicsTimeGraph, getKinematicsUnitFactor } from '../src/lib/kinematicsEngine';
import { getCompatibleChartDisplayTypes, normalizeChartType } from '../src/lib/chartData';
import { classifyImplicitVisualIntent } from '../src/lib/neuralBridge';

describe('Algorithm Visualizer Engine (BFS, DFS, Binary Search, Dijkstra, Two Pointers)', () => {
  const sampleNodes = ['1', '2', '3', '4', '5', '6'];
  const sampleEdges = [
    { source: '1', target: '2' },
    { source: '1', target: '3' },
    { source: '2', target: '4' },
    { source: '2', target: '5' },
    { source: '3', target: '6' },
  ];

  it('produces exact level-order BFS trace and distances', () => {
    const { steps, finalOrder } = runBfsTrace(sampleNodes, sampleEdges, '1', false);
    expect(finalOrder).toEqual(['1', '2', '3', '4', '5', '6']);
    const lastStep = steps[steps.length - 1];
    expect(lastStep.distances).toEqual({
      '1': 0,
      '2': 1,
      '3': 1,
      '4': 2,
      '5': 2,
      '6': 2,
    });
  });

  it('produces exact depth-first pre-order DFS trace', () => {
    const { finalOrder } = runDfsTrace(sampleNodes, sampleEdges, '1', false);
    expect(finalOrder).toEqual(['1', '2', '4', '5', '3', '6']);
  });

  it('computes synchronized dual BFS vs DFS comparison trace in one chart', () => {
    const res = buildAlgorithmTrace({
      type: 'algorithm_trace',
      algorithm: 'bfs_vs_dfs',
      start: '1',
      nodes: sampleNodes.map((id) => ({ id })),
      edges: sampleEdges.map((e) => [e.source, e.target]),
    });
    expect(res.kind).toBe('bfs_vs_dfs');
    expect(res.finalOrder).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(res.secondaryOrder).toEqual(['1', '2', '4', '5', '3', '6']);
    expect(res.steps[0].secondaryFrontierLabel).toBe('DFS Stack');
  });

  it('runs exact Binary Search trace for found and not-found targets', () => {
    const found = runBinarySearchTrace([23, 2, 56, 8, 12, 5, 38, 16, 72], 23);
    expect(found.sortedArray).toEqual([2, 5, 8, 12, 16, 23, 38, 56, 72]);
    expect(found.foundIndex).toBe(5);
    expect(found.steps[found.steps.length - 1].arrayPointers?.foundIdx).toBe(5);

    const missing = runBinarySearchTrace([2, 5, 8, 12, 16], 10);
    expect(missing.foundIndex).toBeNull();
    expect(missing.steps[missing.steps.length - 1].frontier).toContain('Not found (-1)');
  });

  it('computes exact shortest-path distances in Dijkstra', () => {
    const edges = [
      { source: 'A', target: 'B', weight: 4 },
      { source: 'A', target: 'C', weight: 2 },
      { source: 'C', target: 'B', weight: 1 },
      { source: 'B', target: 'D', weight: 5 },
      { source: 'C', target: 'D', weight: 8 },
    ];
    const { steps } = runDijkstraTrace(['A', 'B', 'C', 'D'], edges, 'A', undefined, true);
    const finalDist = steps[steps.length - 1].distances!;
    expect(finalDist['A']).toBe(0);
    expect(finalDist['C']).toBe(2);
    expect(finalDist['B']).toBe(3); // A -> C -> B = 3 (cheaper than A -> B = 4)
    expect(finalDist['D']).toBe(8); // A -> C -> B -> D = 8
  });

  it('finds exact pair in Two Pointers', () => {
    const { sortedArray, foundPair } = runTwoPointersTrace([14, 1, 8, 4, 6, 11], 15);
    expect(sortedArray).toEqual([1, 4, 6, 8, 11, 14]);
    expect(foundPair).not.toBeNull();
    const [l, r] = foundPair!;
    expect(sortedArray[l] + sortedArray[r]).toBe(15);
  });

  it('resolves algorithm aliases and payload fallback types accurately', () => {
    expect(normalizeAlgorithmKind('Tìm kiếm nhị phân')).toBe('binary_search');
    const trace = buildAlgorithmTrace({ type: 'binary_search', array: [10, 20, 30], target: 20 });
    expect(trace.kind).toBe('binary_search');
    expect(trace.foundIndex).toBe(1);
  });
});

describe('Kinematics & Time Graph Engine (Exact Time / Speed / Distance)', () => {
  it('computes exact unit conversion factor for km/h * min -> km', () => {
    expect(getKinematicsUnitFactor('min', 'km/h', 'km')).toBeCloseTo(1 / 60, 6);
    expect(getKinematicsUnitFactor('h', 'km/h', 'km')).toBeCloseTo(1, 6);
    expect(getKinematicsUnitFactor('s', 'm/s', 'm')).toBeCloseTo(1, 6);
  });

  it('computes exact uniform acceleration v(t) = v0 + a*t and s(t) = 0.5*a*t^2', () => {
    const res = buildKinematicsTimeGraph({
      type: 'time_graph',
      timeUnit: 's',
      speedUnit: 'm/s',
      distanceUnit: 'm',
      phases: [{ duration: 5, v0: 0, a: 4 }],
    });
    const last = res.rows[res.rows.length - 1];
    expect(last.time).toBe(5);
    expect(last['Vận tốc (m/s)']).toBeCloseTo(20, 4);
    expect(last['Quãng đường (m)']).toBeCloseTo(50, 4);
  });

  it('plots multiple objects in ONE time graph and finds exact overtaking/meeting time', () => {
    // Xe A starts at t=0 with v=40 km/h; Xe B starts at t=1h with v=60 km/h.
    // Meeting: 40*t = 60*(t - 1) => 20*t = 60 => t = 3h, s = 120 km.
    const res = buildKinematicsTimeGraph({
      type: 'time_graph',
      timeUnit: 'h',
      speedUnit: 'km/h',
      distanceUnit: 'km',
      objects: [
        { name: 'Xe A', startTime: 0, startDistance: 0, phases: [{ duration: 4, v0: 40, a: 0 }] },
        { name: 'Xe B', startTime: 1, startDistance: 0, phases: [{ duration: 3, v0: 60, a: 0 }] },
      ],
    });
    expect(res.distanceSeries).toEqual(['Xe A · s (km)', 'Xe B · s (km)']);
    expect(res.speedSeries).toEqual(['Xe A · v (km/h)', 'Xe B · v (km/h)']);
    expect(res.meetings.length).toBeGreaterThanOrEqual(1);
    expect(res.meetings[0].t).toBeCloseTo(3, 2);
    expect(res.meetings[0].distance).toBeCloseTo(120, 1);
  });

  it('reconciles inconsistent tabular distance rows using exact trapezoidal integral s = ∫v dt', () => {
    // Constant acceleration v(0)=0, v(2)=10, v(4)=20 (a=5 m/s^2) -> exact s(2)=10m, s(4)=40m
    const res = buildKinematicsTimeGraph({
      type: 'time_graph',
      timeUnit: 's',
      speedUnit: 'm/s',
      distanceUnit: 'm',
      data: [
        { time: 0, speed: 0, distance: 0 },
        { time: 2, speed: 10, distance: 999 }, // Wrong input distance
        { time: 4, speed: 20, distance: 999 }, // Wrong input distance
      ],
    });
    expect(res.rows[1].distance).toBeCloseTo(10, 4);
    expect(res.rows[2].distance).toBeCloseTo(40, 4);
    expect(res.verifiedPhysicsNote).toContain('s(t)');
  });
});

describe('Chart Type Normalization & Visual Intent Routing', () => {
  it('normalizes time_graph and algorithm_trace aliases', () => {
    expect(normalizeChartType('time_graph')).toBe('time_graph');
    expect(normalizeChartType('van_toc_quang_duong')).toBe('time_graph');
    expect(normalizeChartType('algorithm_trace')).toBe('algorithm_trace');
    expect(normalizeChartType('bfs_vs_dfs')).toBe('algorithm_trace');
    expect(getCompatibleChartDisplayTypes('time_graph', null)).toContain('line');
    expect(getCompatibleChartDisplayTypes('algorithm_trace', null)).toEqual(['algorithm_trace']);
  });

  it('routes teaching algorithm & kinematics time graph prompts to preferChart without hijacking debug tasks', () => {
    const timePrompt = classifyImplicitVisualIntent('vẽ time graph vận tốc quãng đường của 2 xe');
    expect(timePrompt.preferChart).toBe(true);
    expect(timePrompt.suppressVisuals).toBe(false);

    const algoTeach = classifyImplicitVisualIntent('dạy BFS và DFS trong lập trình thi đấu bằng ví dụ minh họa');
    expect(algoTeach.preferChart).toBe(true);
    expect(algoTeach.suppressVisuals).toBe(false);

    const binSearchTeach = classifyImplicitVisualIntent('vẽ ví dụ minh họa binary search từng bước');
    expect(binSearchTeach.preferChart).toBe(true);

    const debugPrompt = classifyImplicitVisualIntent('fix lỗi BFS trong main.cpp bị TLE');
    expect(debugPrompt.preferChart).toBe(false);
    expect(debugPrompt.suppressVisuals).toBe(true);
  });
});
