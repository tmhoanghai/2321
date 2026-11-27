import { describe, expect, it } from 'vitest';
import {
  inferMediaMimeType,
  isAudioMedia,
  isNativeMultimodalMedia,
  isVideoMedia,
} from '../src/lib/mediaUtils';
import {
  findFunctionIntersections2D,
  normalizeMathText,
  sampleFunction2D,
} from '../src/lib/mathGraphEngine';
import { buildKinematicsTimeGraph } from '../src/lib/kinematicsEngine';
import { buildAlgorithmTrace } from '../src/lib/algorithmVisualizer';

describe('mediaUtils MP3/MP4 MIME normalization', () => {
  it('normalizes missing, uppercase, and alias audio/video MIME types accurately', () => {
    expect(inferMediaMimeType('song.mp3', '')).toBe('audio/mpeg');
    expect(inferMediaMimeType('TRACK.MP3', 'audio/mp3')).toBe('audio/mpeg');
    expect(inferMediaMimeType('clip.mp4', 'application/octet-stream')).toBe('video/mp4');
    expect(inferMediaMimeType('lecture.mov', '')).toBe('video/quicktime');
    expect(inferMediaMimeType('voice.m4a', 'audio/x-m4a; codecs=mp4a')).toBe('audio/mp4');

    expect(isAudioMedia('', 'podcast.mp3')).toBe(true);
    expect(isVideoMedia('application/octet-stream', 'demo.MP4')).toBe(true);
    expect(isNativeMultimodalMedia('', 'clip.mp4')).toBe(true);
    expect(isNativeMultimodalMedia('', 'audio.mp3')).toBe(true);
    expect(isNativeMultimodalMedia('text/plain', 'notes.txt')).toBe(false);
  });
});

describe('multi-variable math & time graph precision', () => {
  it('evaluates time-variable t equations and finds exact multi-function intersections', () => {
    expect(normalizeMathText('s(t) = 40*t + 10')).toBe('40*t + 10');
    expect(normalizeMathText('v(t) = 12 - 2t')).toBe('12 - 2t');

    const segs = sampleFunction2D('s(t) = 40*t', {}, 0, 5, 50, 500);
    expect(segs.length).toBeGreaterThan(0);
    const lastPt = segs[0].points[segs[0].points.length - 1];
    expect(lastPt[0]).toBeCloseTo(5, 4);
    expect(lastPt[1]).toBeCloseTo(200, 4);

    const intersections = findFunctionIntersections2D(
      [
        { id: 'a', expr: '40*t', label: 'Xe A', color: '#2563eb', visible: true },
        { id: 'b', expr: '60*(t - 1)', label: 'Xe B', color: '#059669', visible: true },
      ],
      {},
      0,
      6,
      120
    );
    expect(intersections.length).toBe(1);
    expect(intersections[0].x).toBeCloseTo(3, 3);
    expect(intersections[0].y).toBeCloseTo(120, 2);
  });

  it('builds Mode C multi-function kinematics time_graph with exact crossing point', () => {
    const res = buildKinematicsTimeGraph({
      type: 'time_graph',
      timeUnit: 'h',
      speedUnit: 'km/h',
      distanceUnit: 'km',
      tRange: [0, 5],
      functions: [
        { label: 's_A (km)', expr: '40*t', kind: 'distance' },
        { label: 's_B (km)', expr: '60*(t - 1)', kind: 'distance' },
      ],
    });

    expect(res.rows.length).toBe(49);
    expect(res.distanceSeries).toEqual(['s_A (km)', 's_B (km)']);
    expect(res.meetings.length).toBe(1);
    expect(res.meetings[0].t).toBeCloseTo(3, 3);
    expect(res.meetings[0].distance).toBeCloseTo(120, 2);
  });

  it('supports switching graph traversal mode between BFS, DFS, and BFS vs DFS', () => {
    const basePayload = {
      type: 'algorithm_trace',
      start: 'A',
      nodes: ['A', 'B', 'C', 'D'],
      edges: [
        ['A', 'B'],
        ['A', 'C'],
        ['B', 'D'],
      ],
    };
    const bfs = buildAlgorithmTrace({ ...basePayload, algorithm: 'bfs' });
    const dfs = buildAlgorithmTrace({ ...basePayload, algorithm: 'dfs' });
    const cmp = buildAlgorithmTrace({ ...basePayload, algorithm: 'bfs_vs_dfs' });

    expect(bfs.kind).toBe('bfs');
    expect(dfs.kind).toBe('dfs');
    expect(cmp.kind).toBe('bfs_vs_dfs');
    expect(bfs.steps[bfs.steps.length - 1].visited).toEqual(['A', 'B', 'C', 'D']);
    expect(dfs.steps[dfs.steps.length - 1].visited).toEqual(['A', 'B', 'D', 'C']);
  });
});
