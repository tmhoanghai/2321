export interface ProbabilityDataPoint {
  name: string;
  x: number;
  probability: number;
  cumulative: number;
  percent: number;
}

export interface ProbabilitySummary {
  distribution: 'binomial' | 'poisson' | 'normal' | 'hypergeometric';
  mean: number;
  variance: number;
  stdDev: number;
  points: ProbabilityDataPoint[];
}

export function factorialLog(n: number): number {
  if (n <= 1) return 0;
  let sum = 0;
  for (let i = 2; i <= n; i++) {
    sum += Math.log(i);
  }
  return sum;
}

export function combinations(n: number, k: number): number {
  if (k < 0 || k > n || !Number.isInteger(n) || !Number.isInteger(k)) return 0;
  if (k === 0 || k === n) return 1;
  const r = Math.min(k, n - k);
  return Math.round(Math.exp(factorialLog(n) - factorialLog(r) - factorialLog(n - r)));
}

export function permutations(n: number, k: number): number {
  if (k < 0 || k > n || !Number.isInteger(n) || !Number.isInteger(k)) return 0;
  return Math.round(Math.exp(factorialLog(n) - factorialLog(n - k)));
}

export function binomialPmf(n: number, p: number, k: number): number {
  if (k < 0 || k > n || p < 0 || p > 1) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  const logProb =
    factorialLog(n) -
    factorialLog(k) -
    factorialLog(n - k) +
    k * Math.log(p) +
    (n - k) * Math.log(1 - p);
  return Math.exp(logProb);
}

export function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0 || k < 0 || !Number.isInteger(k)) return 0;
  return Math.exp(k * Math.log(lambda) - lambda - factorialLog(k));
}

export function normalPdf(x: number, mean = 0, stdDev = 1): number {
  if (stdDev <= 0) return 0;
  const z = (x - mean) / stdDev;
  return Math.exp(-0.5 * z * z) / (stdDev * Math.sqrt(2 * Math.PI));
}

export function normalCdf(x: number, mean = 0, stdDev = 1): number {
  if (stdDev <= 0) return x >= mean ? 1 : 0;
  const z = (x - mean) / (stdDev * Math.SQRT2);
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const poly =
    t *
    (0.254829592 +
      t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

export function bayesTheorem(pA: number, pBGivenA: number, pBGivenNotA: number): {
  pB: number;
  pAGivenB: number;
} {
  const pNotA = 1 - pA;
  const pB = pBGivenA * pA + pBGivenNotA * pNotA;
  if (pB <= 0) return { pB: 0, pAGivenB: 0 };
  return {
    pB,
    pAGivenB: (pBGivenA * pA) / pB,
  };
}

export function generateBinomialDistribution(n: number, p: number): ProbabilitySummary {
  const safeN = Math.max(1, Math.min(60, Math.round(n)));
  const safeP = Math.max(0, Math.min(1, p));
  const points: ProbabilityDataPoint[] = [];
  let cumulative = 0;
  for (let k = 0; k <= safeN; k++) {
    const prob = binomialPmf(safeN, safeP, k);
    cumulative = Math.min(1, cumulative + prob);
    points.push({
      name: `k=${k}`,
      x: k,
      probability: Number(prob.toFixed(6)),
      cumulative: Number(cumulative.toFixed(6)),
      percent: Number((prob * 100).toFixed(2)),
    });
  }
  const variance = safeN * safeP * (1 - safeP);
  return {
    distribution: 'binomial',
    mean: Number((safeN * safeP).toFixed(4)),
    variance: Number(variance.toFixed(4)),
    stdDev: Number(Math.sqrt(variance).toFixed(4)),
    points,
  };
}

export function generatePoissonDistribution(lambda: number, maxK?: number): ProbabilitySummary {
  const safeLambda = Math.max(0.1, Math.min(50, lambda));
  const limit = maxK ? Math.max(1, Math.min(60, maxK)) : Math.min(60, Math.ceil(safeLambda + 4 * Math.sqrt(safeLambda) + 3));
  const points: ProbabilityDataPoint[] = [];
  let cumulative = 0;
  for (let k = 0; k <= limit; k++) {
    const prob = poissonPmf(safeLambda, k);
    cumulative = Math.min(1, cumulative + prob);
    points.push({
      name: `k=${k}`,
      x: k,
      probability: Number(prob.toFixed(6)),
      cumulative: Number(cumulative.toFixed(6)),
      percent: Number((prob * 100).toFixed(2)),
    });
  }
  return {
    distribution: 'poisson',
    mean: Number(safeLambda.toFixed(4)),
    variance: Number(safeLambda.toFixed(4)),
    stdDev: Number(Math.sqrt(safeLambda).toFixed(4)),
    points,
  };
}

export function generateNormalDistribution(mean = 0, stdDev = 1, steps = 25): ProbabilitySummary {
  const safeStd = Math.max(0.05, stdDev);
  const count = Math.max(9, Math.min(61, steps));
  const minX = mean - 3.5 * safeStd;
  const maxX = mean + 3.5 * safeStd;
  const stepSize = (maxX - minX) / (count - 1);
  const points: ProbabilityDataPoint[] = [];
  for (let i = 0; i < count; i++) {
    const x = minX + i * stepSize;
    const pdf = normalPdf(x, mean, safeStd);
    const cdf = normalCdf(x, mean, safeStd);
    points.push({
      name: x.toFixed(2),
      x: Number(x.toFixed(4)),
      probability: Number(pdf.toFixed(6)),
      cumulative: Number(cdf.toFixed(6)),
      percent: Number((cdf * 100).toFixed(2)),
    });
  }
  return {
    distribution: 'normal',
    mean: Number(mean.toFixed(4)),
    variance: Number((safeStd * safeStd).toFixed(4)),
    stdDev: Number(safeStd.toFixed(4)),
    points,
  };
}

export function toRechartsConfigJson(
  summary: ProbabilitySummary,
  title: string,
  chartType: 'bar' | 'area' | 'line' = summary.distribution === 'normal' ? 'area' : 'bar'
): string {
  return JSON.stringify(
    {
      type: chartType,
      title,
      xAxis: 'name',
      yAxis: 'percent',
      series: ['percent'],
      data: summary.points,
    },
    null,
    2
  );
}
