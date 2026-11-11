/** Rolling performance metrics for the PoC: FPS of processed frames, latency percentiles. */

export class Metrics {
  private stamps: number[] = [];
  private latencies: number[] = [];
  private inference: number[] = [];
  private startedAt = performance.now();

  record(latencyMs: number, inferenceMs: number): void {
    const now = performance.now();
    this.stamps.push(now);
    this.latencies.push(latencyMs);
    this.inference.push(inferenceMs);
    while (this.stamps.length && now - this.stamps[0] > 1000) this.stamps.shift();
    if (this.latencies.length > 300) this.latencies.shift();
    if (this.inference.length > 300) this.inference.shift();
  }

  fps(): number {
    return this.stamps.length;
  }

  /** After 3 s of warm-up, fewer than 15 processed frames per second (NFR-02). */
  shouldFallBack(): boolean {
    return performance.now() - this.startedAt > 3000 && this.fps() < 15;
  }

  summary(model: string): string {
    return `מודל: ${model} · FPS: ${this.fps()} · השהיה חציונית: ${percentile(this.latencies, 50).toFixed(0)}ms · p95: ${percentile(this.latencies, 95).toFixed(0)}ms · הסקה: ${percentile(this.inference, 50).toFixed(0)}ms`;
  }

  reset(): void {
    this.stamps = [];
    this.latencies = [];
    this.inference = [];
    this.startedAt = performance.now();
  }
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
