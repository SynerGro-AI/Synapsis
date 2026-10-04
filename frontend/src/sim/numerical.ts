// Genuine numerical methods for the lab. Each takes a real function
// f: (x: number) => number (built from the user's parsed expression + their
// named variables) and computes an actual result — no lookup tables, no stubs.

export type RealFn = (x: number) => number;

export interface PlotPoint {
  x: number;
  y: number;
}

/** Sample a function across [a, b]; non-finite outputs become gaps (null y). */
export function samplePlot(
  fn: RealFn,
  a: number,
  b: number,
  count = 240,
): { x: number; y: number | null }[] {
  const out: { x: number; y: number | null }[] = [];
  if (!(b > a) || count < 2) return out;
  const dx = (b - a) / (count - 1);
  for (let i = 0; i < count; i++) {
    const x = a + i * dx;
    const y = fn(x);
    out.push({ x, y: Number.isFinite(y) ? y : null });
  }
  return out;
}

export type RiemannRule = "left" | "right" | "midpoint" | "trapezoid";

export interface IntegralResult {
  value: number;
  rects: { x0: number; x1: number; height: number }[];
}

/** Approximate the definite integral of f over [a, b] with n subintervals. */
export function integrate(
  fn: RealFn,
  a: number,
  b: number,
  n: number,
  rule: RiemannRule = "midpoint",
): IntegralResult {
  const steps = Math.max(1, Math.floor(n));
  const dx = (b - a) / steps;
  let value = 0;
  const rects: { x0: number; x1: number; height: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const x0 = a + i * dx;
    const x1 = x0 + dx;
    let height: number;
    if (rule === "left") height = fn(x0);
    else if (rule === "right") height = fn(x1);
    else if (rule === "trapezoid") height = (fn(x0) + fn(x1)) / 2;
    else height = fn((x0 + x1) / 2);
    if (!Number.isFinite(height)) height = 0;
    value += height * dx;
    rects.push({ x0, x1, height });
  }
  return { value, rects };
}

/** Central-difference estimate of f'(x0). */
export function derivative(fn: RealFn, x0: number, h = 1e-5): number {
  return (fn(x0 + h) - fn(x0 - h)) / (2 * h);
}

export interface NewtonStep {
  x: number;
  fx: number;
}

/** Newton's method root finding using a numerical derivative. Returns every iterate. */
export function newton(fn: RealFn, x0: number, steps: number): NewtonStep[] {
  const out: NewtonStep[] = [{ x: x0, fx: fn(x0) }];
  let x = x0;
  for (let i = 0; i < steps; i++) {
    const slope = derivative(fn, x);
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-12) break;
    const next = x - fn(x) / slope;
    if (!Number.isFinite(next)) break;
    x = next;
    out.push({ x, fx: fn(x) });
  }
  return out;
}

/** Running partial sums of f(k) for integer k from `from` to `to` (inclusive). */
export function partialSums(fn: RealFn, from: number, to: number): number[] {
  const start = Math.floor(from);
  const end = Math.floor(to);
  const out: number[] = [];
  let total = 0;
  for (let k = start; k <= end; k++) {
    const term = fn(k);
    if (Number.isFinite(term)) total += term;
    out.push(total);
  }
  return out;
}

/** Format a number for compact, readable display. */
export function fmt(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e6 || abs < 1e-4)
    return value.toExponential(Math.min(digits, 6)).replace(/\.?0+e/, "e");
  return Number(value.toPrecision(digits)).toString();
}
