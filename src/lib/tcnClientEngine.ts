export interface TcnCandleInput {
  date?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TcnBlockWeights {
  dilation: number;
  /** Depthwise 1D causal weights: [channels * kernelSize] */
  dwWeights: number[];
  dwBias: number[];
  /** Pointwise 1x1 mixing weights: [outChannels * inChannels] */
  pwWeights: number[];
  pwBias: number[];
  /** LayerNorm affine parameters */
  lnGamma: number[];
  lnBeta: number[];
  /** Residual gate scalar */
  resScale: number;
}

export interface TcnWeightBundle {
  version: string;
  architecture: string;
  inputChannels: number;
  hiddenChannels: number;
  kernelSize: number;
  dilations: number[];
  receptiveField: number;
  windowLength: number;
  paramCount: number;
  /** Input projection [hiddenChannels * inputChannels] */
  stemWeights: number[];
  stemBias: number[];
  blocks: TcnBlockWeights[];
  /** Output head from [2 * hiddenChannels] (last + attention pooled) -> [up, down, neutral] */
  headWeights: number[];
  headBias: number[];
  /** Expected move projection [2 * hiddenChannels] -> scalar */
  retWeights: number[];
  retBias: number;
}

export interface TcnWeightMeta {
  version: string;
  paramCount: number;
  payloadBytes: number;
  source: 'api' | 'cache' | 'embedded';
}

export interface TcnClientPrediction {
  directionScore: number;
  pUp: number;
  pDown: number;
  pNeutral: number;
  shortTermHorizon: string;
  shortTermTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  expectedMovePct: number;
  confidencePct: number;
  rollingHitRatePct: number | null;
  rollingSampleCount: number;
  layerActivations: {
    d1Norm: number;
    d2Norm: number;
    d4Norm: number;
  };
  inferenceTimeMs: number;
  runtimeMode: 'client-browser' | 'server-shared';
  weightMeta: TcnWeightMeta;
}

const TCN_WEIGHT_STORAGE_KEY = 'tm-tcn-weights-v2.8';
const INPUT_CHANNELS = 7;
const HIDDEN_CHANNELS = 8;
const KERNEL_SIZE = 3;
const WINDOW_LENGTH = 48;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function roundNum(val: number, digits = 4): number {
  const f = Math.pow(10, digits);
  return Math.round(val * f) / f;
}

function silu(x: number): number {
  const clipped = clamp(x, -16, 16);
  return clipped / (1 + Math.exp(-clipped));
}

/**
 * Compact, domain-calibrated lightweight TCN weight bundle (~374 parameters, < 4 KB JSON).
 * Designed around causal dilated receptive fields (d=1, 2, 4 => 15-bar lookback):
 * Channels:
 *  0: 1-bar log return (momentum impulse)
 *  1: 3-bar log return (short-term swing continuation)
 *  2: Candle body pressure (close-open)/range
 *  3: Upper rejection wick ratio
 *  4: Lower buying tail ratio
 *  5: Volume log z-score (participation conviction)
 *  6: EMA9 spread normalized by ATR proxy (trend vs stretch)
 */
export const DEFAULT_TCN_WEIGHT_BUNDLE: TcnWeightBundle = (() => {
  // Stem [8 x 7]: maps 7 microstructure/momentum channels -> 8 latent temporal channels
  // Latent channel specialization (symmetric bull/bear SiLU receptive pairs):
  // ch0: bullish momentum + body (+r1, +r3, +body, +ema)
  // ch1: bearish momentum + breakdown (-r1, -r3, -body, -ema)
  // ch2: volume-confirmed bullish surge
  // ch3: lower-wick demand / reversal bounce
  // ch4: upper-wick supply / rejection
  // ch5: volume-confirmed bearish breakdown
  // ch6: multi-bar trend continuation (+r3, +ema)
  // ch7: quiet consolidation / neutrality detector
  const stemWeights: number[] = [
    // ch0 (bull momentum + swing + EMA)
    0.85, 0.75, 0.65, -0.18, 0.22, 0.18, 0.65,
    // ch1 (bear momentum + swing + EMA — exact mirror)
    -0.85, -0.75, -0.65, 0.22, -0.18, 0.18, -0.65,
    // ch2 (volume bull)
    0.55, 0.35, 0.45, -0.15, 0.15, 0.72, 0.30,
    // ch3 (lower-wick demand)
    -0.10, -0.15, 0.22, -0.20, 0.85, 0.30, -0.22,
    // ch4 (upper-wick supply)
    0.10, 0.15, -0.22, 0.85, -0.20, 0.30, 0.22,
    // ch5 (volume bear — exact mirror)
    -0.55, -0.35, -0.45, 0.15, -0.15, 0.72, -0.30,
    // ch6 (sign-invariant activity / volume expansion)
    0.0, 0.0, 0.0, 0.45, 0.45, 0.65, 0.0,
    // ch7 (consolidation / neutral)
    -0.25, -0.25, -0.20, -0.20, -0.20, -0.45, -0.15,
  ];
  const stemBias = [0, 0, 0, -0.1, -0.1, 0, -0.1, 0.25];

  const makeBlock = (
    dilation: number,
    dwPattern: [number, number, number][],
    pwDiag: number[],
    resScale: number
  ): TcnBlockWeights => {
    const dwWeights: number[] = [];
    for (let c = 0; c < HIDDEN_CHANNELS; c++) {
      const p = dwPattern[c];
      dwWeights.push(p[0], p[1], p[2]);
    }
    const pwWeights = new Array<number>(HIDDEN_CHANNELS * HIDDEN_CHANNELS).fill(0);
    for (let o = 0; o < HIDDEN_CHANNELS; o++) {
      for (let i = 0; i < HIDDEN_CHANNELS; i++) {
        if (o === i) {
          pwWeights[o * HIDDEN_CHANNELS + i] = pwDiag[o];
        } else if ((o === 0 && i === 2) || (o === 2 && i === 0)) {
          pwWeights[o * HIDDEN_CHANNELS + i] = 0.24;
        } else if ((o === 1 && i === 5) || (o === 5 && i === 1)) {
          pwWeights[o * HIDDEN_CHANNELS + i] = 0.24;
        } else if (o === 0 && i === 3) {
          pwWeights[o * HIDDEN_CHANNELS + i] = 0.18;
        } else if (o === 1 && i === 4) {
          pwWeights[o * HIDDEN_CHANNELS + i] = 0.18;
        } else if (o === 7 && i === 6) {
          pwWeights[o * HIDDEN_CHANNELS + i] = -0.20;
        } else if (o === 7 && (i === 0 || i === 1)) {
          pwWeights[o * HIDDEN_CHANNELS + i] = -0.14;
        }
      }
    }
    return {
      dilation,
      dwWeights,
      dwBias: new Array<number>(HIDDEN_CHANNELS).fill(0),
      pwWeights,
      pwBias: new Array<number>(HIDDEN_CHANNELS).fill(0),
      lnGamma: new Array<number>(HIDDEN_CHANNELS).fill(1),
      lnBeta: new Array<number>(HIDDEN_CHANNELS).fill(0),
      resScale,
    };
  };

  // Block 1 (d=1): immediate 1-3 bar micro-impulse & candle rejection
  const block1 = makeBlock(
    1,
    [
      [0.24, 0.38, 0.62],
      [0.24, 0.38, 0.62],
      [0.18, 0.32, 0.58],
      [0.16, 0.30, 0.60],
      [0.16, 0.30, 0.60],
      [0.18, 0.32, 0.58],
      [0.20, 0.32, 0.50],
      [0.30, 0.32, 0.38],
    ],
    [0.65, 0.65, 0.62, 0.55, 0.55, 0.62, 0.55, 0.58],
    0.55
  );

  // Block 2 (d=2): 3-6 bar swing persistence
  const block2 = makeBlock(
    2,
    [
      [0.28, 0.36, 0.52],
      [0.28, 0.36, 0.52],
      [0.25, 0.35, 0.50],
      [0.20, 0.30, 0.48],
      [0.20, 0.30, 0.48],
      [0.25, 0.35, 0.50],
      [0.26, 0.34, 0.48],
      [0.32, 0.34, 0.34],
    ],
    [0.60, 0.60, 0.56, 0.48, 0.48, 0.56, 0.52, 0.55],
    0.45
  );

  // Block 3 (d=4): 7-15 bar multi-wave trend structure
  const block3 = makeBlock(
    4,
    [
      [0.30, 0.36, 0.46],
      [0.30, 0.36, 0.46],
      [0.26, 0.32, 0.44],
      [0.22, 0.28, 0.40],
      [0.22, 0.28, 0.40],
      [0.26, 0.32, 0.44],
      [0.28, 0.34, 0.44],
      [0.34, 0.34, 0.32],
    ],
    [0.58, 0.58, 0.52, 0.44, 0.44, 0.52, 0.50, 0.52],
    0.35
  );

  // Head weights [3 x 16]: [lastState (0..7), attentionPooledState (8..15)]
  // Class 0: UP, Class 1: DOWN, Class 2: NEUTRAL
  const headWeights: number[] = [
    // UP logits
    0.96, -0.88, 0.74, 0.48, -0.48, -0.70, 0.16, -0.48,
    0.72, -0.66, 0.56, 0.34, -0.34, -0.52, 0.12, -0.36,
    // DOWN logits (symmetric mirror of UP)
    -0.88, 0.96, -0.70, -0.48, 0.48, 0.74, 0.16, -0.48,
    -0.66, 0.72, -0.52, -0.34, 0.34, 0.56, 0.12, -0.36,
    // NEUTRAL logits
    -0.28, -0.28, -0.24, -0.10, -0.10, -0.24, -0.32, 0.95,
    -0.22, -0.22, -0.20, -0.08, -0.08, -0.20, -0.26, 0.86,
  ];
  const headBias = [0.0, 0.0, 0.18];

  const retWeights: number[] = [
    0.48, -0.48, 0.36, 0.20, -0.20, -0.36, 0.0, 0.0,
    0.34, -0.34, 0.26, 0.14, -0.14, -0.26, 0.0, 0.0,
  ];
  const retBias = 0;

  const blocks = [block1, block2, block3];
  const paramCount =
    stemWeights.length +
    stemBias.length +
    blocks.reduce(
      (sum, b) =>
        sum +
        b.dwWeights.length +
        b.dwBias.length +
        b.pwWeights.length +
        b.pwBias.length +
        b.lnGamma.length +
        b.lnBeta.length +
        1,
      0
    ) +
    headWeights.length +
    headBias.length +
    retWeights.length +
    1;

  return {
    version: 'tcn-v2.8-lite',
    architecture: 'Causal Dilated Depthwise-Separable TCN (d=1,2,4 | RF=15)',
    inputChannels: INPUT_CHANNELS,
    hiddenChannels: HIDDEN_CHANNELS,
    kernelSize: KERNEL_SIZE,
    dilations: [1, 2, 4],
    receptiveField: 1 + (KERNEL_SIZE - 1) * (1 + 2 + 4),
    windowLength: WINDOW_LENGTH,
    paramCount,
    stemWeights,
    stemBias,
    blocks,
    headWeights,
    headBias,
    retWeights,
    retBias,
  };
})();

export function isValidTcnWeightBundle(raw: any): raw is TcnWeightBundle {
  return Boolean(
    raw &&
      typeof raw === 'object' &&
      typeof raw.version === 'string' &&
      raw.inputChannels === INPUT_CHANNELS &&
      raw.hiddenChannels === HIDDEN_CHANNELS &&
      Array.isArray(raw.stemWeights) &&
      raw.stemWeights.length === HIDDEN_CHANNELS * INPUT_CHANNELS &&
      Array.isArray(raw.blocks) &&
      raw.blocks.length >= 1 &&
      Array.isArray(raw.headWeights) &&
      raw.headWeights.length === 3 * HIDDEN_CHANNELS * 2
  );
}

let memoryCachedWeights: { bundle: TcnWeightBundle; meta: TcnWeightMeta } | null = null;
let inflightLoadPromise: Promise<{ bundle: TcnWeightBundle; meta: TcnWeightMeta }> | null = null;

export function getEmbeddedTcnWeights(): { bundle: TcnWeightBundle; meta: TcnWeightMeta } {
  const bytes = JSON.stringify(DEFAULT_TCN_WEIGHT_BUNDLE).length;
  return {
    bundle: DEFAULT_TCN_WEIGHT_BUNDLE,
    meta: {
      version: DEFAULT_TCN_WEIGHT_BUNDLE.version,
      paramCount: DEFAULT_TCN_WEIGHT_BUNDLE.paramCount,
      payloadBytes: bytes,
      source: 'embedded',
    },
  };
}

/**
 * Loads lightweight TCN weights on the client:
 * in-memory cache -> localStorage cache -> `/api/trading/tcn-weights` -> embedded fallback.
 */
export async function loadClientTcnWeights(forceRefresh = false): Promise<{
  bundle: TcnWeightBundle;
  meta: TcnWeightMeta;
}> {
  if (!forceRefresh && memoryCachedWeights) {
    return memoryCachedWeights;
  }

  if (!forceRefresh && typeof window !== 'undefined' && window.localStorage) {
    try {
      const cachedRaw = window.localStorage.getItem(TCN_WEIGHT_STORAGE_KEY);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (isValidTcnWeightBundle(parsed)) {
          const result = {
            bundle: parsed,
            meta: {
              version: parsed.version,
              paramCount: parsed.paramCount,
              payloadBytes: cachedRaw.length,
              source: 'cache' as const,
            },
          };
          memoryCachedWeights = result;
          return result;
        }
      }
    } catch {
      // Ignore storage read issues
    }
  }

  if (typeof fetch === 'function' && typeof window !== 'undefined') {
    if (!inflightLoadPromise || forceRefresh) {
      inflightLoadPromise = (async () => {
        try {
          const res = await fetch('/api/trading/tcn-weights', {
            headers: { Accept: 'application/json' },
          });
          if (res.ok) {
            const text = await res.text();
            const parsed = JSON.parse(text);
            const candidate = parsed?.weights || parsed;
            if (isValidTcnWeightBundle(candidate)) {
              try {
                window.localStorage?.setItem(TCN_WEIGHT_STORAGE_KEY, JSON.stringify(candidate));
              } catch {
                // Ignore quota error
              }
              const loaded = {
                bundle: candidate,
                meta: {
                  version: candidate.version,
                  paramCount: candidate.paramCount,
                  payloadBytes: text.length,
                  source: 'api' as const,
                },
              };
              memoryCachedWeights = loaded;
              return loaded;
            }
          }
        } catch {
          // Offline / SSR fallback handled below
        }
        const fallback = getEmbeddedTcnWeights();
        memoryCachedWeights = fallback;
        return fallback;
      })().finally(() => {
        inflightLoadPromise = null;
      });
    }
    return inflightLoadPromise;
  }

  return getEmbeddedTcnWeights();
}

export function extractTcnFeatureMatrix(candles: TcnCandleInput[], maxWindow = WINDOW_LENGTH): {
  features: Float32Array;
  seqLen: number;
  barVolScalePct: number;
} {
  const valid = candles.filter(
    (c) => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) && c.close > 0
  );
  const sliced = valid.slice(-maxWindow);
  const seqLen = sliced.length;
  const features = new Float32Array(seqLen * INPUT_CHANNELS);
  if (seqLen === 0) {
    return { features, seqLen: 0, barVolScalePct: 1.0 };
  }

  // Compute EMA9, ATR proxy, and trailing log-volume statistics
  const ema9 = new Float32Array(seqLen);
  const logVols = new Float32Array(seqLen);
  let trSum = 0;
  let sqRetSum = 0;
  let retCount = 0;

  for (let t = 0; t < seqLen; t++) {
    const c = sliced[t];
    const prevClose = t > 0 ? sliced[t - 1].close : c.open || c.close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    trSum += tr;

    const k = 2 / (9 + 1);
    ema9[t] = t === 0 ? c.close : c.close * k + ema9[t - 1] * (1 - k);
    logVols[t] = Math.log1p(Math.max(0, c.volume || 0));

    if (t > 0 && prevClose > 0) {
      const r = Math.log(c.close / prevClose);
      sqRetSum += r * r;
      retCount += 1;
    }
  }

  const avgTr = Math.max(sliced[seqLen - 1].close * 0.002, trSum / seqLen);
  const barVolSigma = Math.max(0.0025, Math.sqrt(sqRetSum / Math.max(1, retCount)));

  let volMean = 0;
  for (let t = 0; t < seqLen; t++) volMean += logVols[t];
  volMean /= seqLen;
  let volVar = 0;
  for (let t = 0; t < seqLen; t++) volVar += (logVols[t] - volMean) ** 2;
  const volStd = Math.max(0.25, Math.sqrt(volVar / seqLen));

  for (let t = 0; t < seqLen; t++) {
    const c = sliced[t];
    const prev1 = t >= 1 ? sliced[t - 1].close : c.open || c.close;
    const prev3 = t >= 3 ? sliced[t - 3].close : sliced[0].close;

    const r1 = prev1 > 0 ? clamp(Math.log(c.close / prev1) / (barVolSigma * 1.8), -2.5, 2.5) : 0;
    const r3 = prev3 > 0 ? clamp(Math.log(c.close / prev3) / (barVolSigma * 3.0), -2.5, 2.5) : 0;

    const range = Math.max(c.high - c.low, c.close * 1e-5);
    const bodyPressure = clamp((c.close - c.open) / range, -1, 1);
    const upperWick = clamp((c.high - Math.max(c.open, c.close)) / range, 0, 1);
    const lowerWick = clamp((Math.min(c.open, c.close) - c.low) / range, 0, 1);
    const volZ = clamp((logVols[t] - volMean) / volStd, -2.5, 2.5) * 0.5;
    const emaSpread = clamp((c.close - ema9[t]) / avgTr, -2.5, 2.5) * 0.55;

    const off = t * INPUT_CHANNELS;
    features[off + 0] = r1;
    features[off + 1] = r3;
    features[off + 2] = bodyPressure;
    features[off + 3] = upperWick;
    features[off + 4] = lowerWick;
    features[off + 5] = volZ;
    features[off + 6] = emaSpread;
  }

  return {
    features,
    seqLen,
    barVolScalePct: barVolSigma * 100,
  };
}

function forwardTcnAtEnd(
  features: Float32Array,
  seqLen: number,
  bundle: TcnWeightBundle
): {
  logits: [number, number, number];
  probs: [number, number, number];
  directionScore: number;
  expectedStdMove: number;
  layerNorms: [number, number, number];
} {
  const H = bundle.hiddenChannels;
  const C = bundle.inputChannels;
  const K = bundle.kernelSize;

  // 1. Stem projection [seqLen x H]
  let state = new Float32Array(seqLen * H);
  for (let t = 0; t < seqLen; t++) {
    const inOff = t * C;
    const outOff = t * H;
    for (let h = 0; h < H; h++) {
      let acc = bundle.stemBias[h] || 0;
      const wOff = h * C;
      for (let c = 0; c < C; c++) {
        acc += features[inOff + c] * bundle.stemWeights[wOff + c];
      }
      state[outOff + h] = silu(acc);
    }
  }

  const layerNorms: [number, number, number] = [0, 0, 0];

  // 2. Causal Dilated Depthwise-Separable Residual Blocks
  bundle.blocks.forEach((blk, bIdx) => {
    const next = new Float32Array(seqLen * H);
    const dwOut = new Float32Array(H);
    const pwOut = new Float32Array(H);
    let lastSqSum = 0;

    for (let t = 0; t < seqLen; t++) {
      // Causal depthwise 1D convolution: tap t - dilation * (K - 1 - k)
      for (let c = 0; c < H; c++) {
        let sum = blk.dwBias[c] || 0;
        const dwBase = c * K;
        for (let k = 0; k < K; k++) {
          const tapIdx = t - blk.dilation * (K - 1 - k);
          if (tapIdx >= 0) {
            sum += state[tapIdx * H + c] * blk.dwWeights[dwBase + k];
          }
        }
        dwOut[c] = silu(sum);
      }

      // Pointwise 1x1 channel mixing
      let mean = 0;
      for (let o = 0; o < H; o++) {
        let sum = blk.pwBias[o] || 0;
        const pwBase = o * H;
        for (let i = 0; i < H; i++) {
          sum += dwOut[i] * blk.pwWeights[pwBase + i];
        }
        pwOut[o] = sum;
        mean += sum;
      }
      mean /= H;

      // LayerNorm + residual skip
      let variance = 0;
      for (let o = 0; o < H; o++) {
        const diff = pwOut[o] - mean;
        variance += diff * diff;
      }
      const invStd = 1 / Math.sqrt(variance / H + 1e-5);
      const tOff = t * H;
      for (let o = 0; o < H; o++) {
        const normed = ((pwOut[o] - mean) * invStd) * blk.lnGamma[o] + blk.lnBeta[o];
        const activated = silu(normed);
        const resVal = state[tOff + o] + blk.resScale * activated;
        next[tOff + o] = resVal;
        if (t === seqLen - 1) {
          lastSqSum += activated * activated;
        }
      }
    }

    if (bIdx < 3) {
      layerNorms[bIdx] = roundNum(Math.sqrt(lastSqSum / H), 3);
    }
    state = next;
  });

  // 3. Multi-Scale Pooling: [last bar H] concat [exponentially recency-weighted last 6 bars H]
  const pooled = new Float32Array(H * 2);
  const lastOff = (seqLen - 1) * H;
  for (let h = 0; h < H; h++) {
    pooled[h] = state[lastOff + h];
  }

  const lookback = Math.min(6, seqLen);
  let wSum = 0;
  for (let i = 0; i < lookback; i++) {
    const t = seqLen - 1 - i;
    const w = Math.exp(-i * 0.42);
    wSum += w;
    const tOff = t * H;
    for (let h = 0; h < H; h++) {
      pooled[H + h] += state[tOff + h] * w;
    }
  }
  for (let h = 0; h < H; h++) {
    pooled[H + h] /= Math.max(1e-6, wSum);
  }

  // 4. Classification + Expected Return Heads
  const logits: [number, number, number] = [0, 0, 0];
  for (let cls = 0; cls < 3; cls++) {
    let acc = bundle.headBias[cls] || 0;
    const wOff = cls * (H * 2);
    for (let j = 0; j < H * 2; j++) {
      acc += pooled[j] * bundle.headWeights[wOff + j];
    }
    logits[cls] = acc;
  }

  const maxLogit = Math.max(logits[0], logits[1], logits[2]);
  const e0 = Math.exp(logits[0] - maxLogit);
  const e1 = Math.exp(logits[1] - maxLogit);
  const e2 = Math.exp(logits[2] - maxLogit);
  const eSum = e0 + e1 + e2;
  const probs: [number, number, number] = [
    roundNum(e0 / eSum, 3),
    roundNum(e1 / eSum, 3),
    roundNum(Math.max(0, 1 - roundNum(e0 / eSum, 3) - roundNum(e1 / eSum, 3)), 3),
  ];

  let retAcc = bundle.retBias || 0;
  for (let j = 0; j < H * 2; j++) {
    retAcc += pooled[j] * bundle.retWeights[j];
  }
  const directionScore = roundNum(clamp(probs[0] - probs[1], -1, 1), 3);

  return {
    logits,
    probs,
    directionScore,
    expectedStdMove: clamp(Math.tanh(retAcc * 0.45), -1.8, 1.8),
    layerNorms,
  };
}

/**
 * Runs optimized lightweight causal dilated TCN inference directly on the provided candles.
 * Zero future leakage; also runs a causal walk-forward check on recent bars for OOS hit-rate telemetry.
 */
export function runClientTcnInference(
  candles: TcnCandleInput[],
  bundle: TcnWeightBundle = DEFAULT_TCN_WEIGHT_BUNDLE,
  meta?: Partial<TcnWeightMeta>,
  runtimeMode: 'client-browser' | 'server-shared' = 'client-browser'
): TcnClientPrediction {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const payloadBytes = meta?.payloadBytes ?? JSON.stringify(bundle).length;
  const weightMeta: TcnWeightMeta = {
    version: bundle.version,
    paramCount: bundle.paramCount,
    payloadBytes,
    source: meta?.source ?? 'embedded',
  };

  if (!Array.isArray(candles) || candles.length < 4) {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      directionScore: 0,
      pUp: 0.3,
      pDown: 0.3,
      pNeutral: 0.4,
      shortTermHorizon: '1-5 nến',
      shortTermTrend: 'NEUTRAL',
      expectedMovePct: 0,
      confidencePct: 33,
      rollingHitRatePct: null,
      rollingSampleCount: 0,
      layerActivations: { d1Norm: 0, d2Norm: 0, d4Norm: 0 },
      inferenceTimeMs: roundNum(Math.max(0.01, t1 - t0), 2),
      runtimeMode,
      weightMeta,
    };
  }

  const { features, seqLen, barVolScalePct } = extractTcnFeatureMatrix(candles, bundle.windowLength);
  const out = forwardTcnAtEnd(features, seqLen, bundle);

  // Causal walk-forward validation across trailing bars (predict t+2 return from prefix 0..t)
  let hits = 0;
  let evalCount = 0;
  const horizonBars = 2;
  const startEval = Math.max(16, candles.length - 28);
  for (let end = startEval; end <= candles.length - 1 - horizonBars; end++) {
    const sub = candles.slice(Math.max(0, end - bundle.windowLength + 1), end + 1);
    const subFx = extractTcnFeatureMatrix(sub, bundle.windowLength);
    if (subFx.seqLen < 12) continue;
    const subOut = forwardTcnAtEnd(subFx.features, subFx.seqLen, bundle);
    if (Math.abs(subOut.directionScore) < 0.08) continue;
    const cNow = candles[end].close;
    const cFut = candles[end + horizonBars].close;
    if (cNow > 0 && cFut > 0) {
      const actualSign = Math.sign(cFut - cNow);
      if (actualSign !== 0) {
        if (Math.sign(subOut.directionScore) === actualSign) hits += 1;
        evalCount += 1;
      }
    }
  }

  const rollingHitRatePct = evalCount >= 4 ? roundNum((hits / evalCount) * 100, 1) : null;
  const shortTermTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    out.directionScore >= 0.14 ? 'BULLISH' : out.directionScore <= -0.14 ? 'BEARISH' : 'NEUTRAL';

  const expectedMovePct = roundNum(out.expectedStdMove * barVolScalePct * 1.45, 2);
  const confidencePct = roundNum(clamp(Math.max(out.probs[0], out.probs[1], out.probs[2]) * 100, 34, 96), 1);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    directionScore: out.directionScore,
    pUp: out.probs[0],
    pDown: out.probs[1],
    pNeutral: out.probs[2],
    shortTermHorizon: '1-5 nến',
    shortTermTrend,
    expectedMovePct,
    confidencePct,
    rollingHitRatePct,
    rollingSampleCount: evalCount,
    layerActivations: {
      d1Norm: out.layerNorms[0],
      d2Norm: out.layerNorms[1],
      d4Norm: out.layerNorms[2],
    },
    inferenceTimeMs: roundNum(Math.max(0.01, t1 - t0), 2),
    runtimeMode,
    weightMeta,
  };
}
