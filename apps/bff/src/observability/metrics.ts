function labelsKey(labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return entries.length === 0
    ? '_'
    : entries.map(([key, value]) => `${key}=${value}`).join(',');
}

class Counter {
  private readonly byLabels = new Map<string, number>();

  inc(labels: Record<string, string> = {}, value = 1): void {
    const key = labelsKey(labels);
    this.byLabels.set(key, (this.byLabels.get(key) ?? 0) + value);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.byLabels);
  }

  reset(): void {
    this.byLabels.clear();
  }
}

interface HistogramSnapshot {
  count: number;
  sum: number;
  p50: number;
  p95: number;
  p99: number;
}

class Histogram {
  private observations: number[] = [];

  observe(valueMs: number): void {
    this.observations.push(valueMs);
  }

  snapshot(): HistogramSnapshot {
    const sorted = [...this.observations].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((total, value) => total + value, 0);
    const percentile = (q: number): number =>
      count === 0 ? 0 : (sorted[Math.min(count - 1, Math.floor(q * count))] ?? 0);

    return {
      count,
      sum,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
    };
  }

  reset(): void {
    this.observations = [];
  }
}

/** In-memory metrics for the signals the acceptance checklist calls out. */
export const metrics = {
  streamInterrupted: new Counter(),
  rateLimited: new Counter(),
  upstreamErrors: new Counter(),
  feedbackFailures: new Counter(),
  firstEventLatencyMs: new Histogram(),
};

export function metricsSnapshot() {
  return {
    stream_interrupted_total: metrics.streamInterrupted.snapshot(),
    rate_limited_total: metrics.rateLimited.snapshot(),
    upstream_errors_total: metrics.upstreamErrors.snapshot(),
    feedback_failures_total: metrics.feedbackFailures.snapshot(),
    first_event_latency_ms: metrics.firstEventLatencyMs.snapshot(),
  };
}

/** Test-only: avoids cross-test leakage of the module-level counters. */
export function resetMetrics(): void {
  metrics.streamInterrupted.reset();
  metrics.rateLimited.reset();
  metrics.upstreamErrors.reset();
  metrics.feedbackFailures.reset();
  metrics.firstEventLatencyMs.reset();
}
