import { useEffect, useMemo, useState } from "react";
import type { Lesson } from "../api";
import { compileExpression } from "../sim/mathexpr";
import {
  integrate,
  derivative,
  newton,
  partialSums,
  samplePlot,
  fmt,
  type RiemannRule,
} from "../sim/numerical";

type Mode = "graph" | "integrate" | "derivative" | "root" | "sum";

type PlotPoints = { x: number; y: number | null }[];

type LabResult =
  | { kind: "error"; message: string }
  | { kind: "graph"; pts: PlotPoints }
  | {
      kind: "integrate";
      pts: PlotPoints;
      value: number;
      rects: { x0: number; x1: number; height: number }[];
      ruleLabel: string;
    }
  | { kind: "derivative"; pts: PlotPoints; x0: number; y0: number; slope: number }
  | { kind: "root"; pts: PlotPoints; iters: { x: number; fx: number }[] }
  | { kind: "sum"; partials: number[] };

interface LabVariable {
  name: string;
  value: string;
}

interface NumericalLabProps {
  lesson: Lesson;
  displayedLessonNumber: number;
  completed: boolean;
  onComplete: (id: number) => void;
}

const MODES: { id: Mode; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "integrate", label: "Integral" },
  { id: "derivative", label: "Derivative" },
  { id: "root", label: "Root (Newton)" },
  { id: "sum", label: "Series sum" },
];

const RULE_LABELS: Record<RiemannRule, string> = {
  left: "left",
  right: "right",
  midpoint: "midpoint",
  trapezoid: "trapezoid",
};

const W = 760;
const H = 430;
const M = { l: 56, r: 18, t: 18, b: 40 };

function num(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface Scales {
  sx: (x: number) => number;
  sy: (y: number) => number;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

function buildScales(xs: number[], ys: number[]): Scales {
  let xmin = Math.min(...xs);
  let xmax = Math.max(...xs);
  if (!Number.isFinite(xmin) || !Number.isFinite(xmax) || xmin === xmax) {
    xmin = (Number.isFinite(xmin) ? xmin : 0) - 1;
    xmax = (Number.isFinite(xmax) ? xmax : 0) + 1;
  }
  const finite = ys.filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  let ymin: number;
  let ymax: number;
  if (finite.length === 0) {
    ymin = -1;
    ymax = 1;
  } else {
    // Trim outliers so vertical asymptotes don't flatten the view, but keep 0 visible.
    const lo = finite[Math.floor((finite.length - 1) * 0.02)];
    const hi = finite[Math.ceil((finite.length - 1) * 0.98)];
    ymin = Math.min(0, lo);
    ymax = Math.max(0, hi);
  }
  if (ymin === ymax) {
    ymin -= 1;
    ymax += 1;
  }
  const pad = (ymax - ymin) * 0.08;
  ymin -= pad;
  ymax += pad;
  const sx = (x: number) => M.l + ((x - xmin) / (xmax - xmin)) * (W - M.l - M.r);
  const sy = (y: number) => M.t + ((ymax - y) / (ymax - ymin)) * (H - M.t - M.b);
  return { sx, sy, xmin, xmax, ymin, ymax };
}

function curvePath(pts: PlotPoints, s: Scales): string {
  let d = "";
  let pen = false;
  for (const p of pts) {
    if (p.y === null || !Number.isFinite(p.y)) {
      pen = false;
      continue;
    }
    const cy = s.sy(p.y);
    if (cy < M.t - 300 || cy > H - M.b + 300) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${s.sx(p.x).toFixed(2)},${cy.toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

function Axes({ s }: { s: Scales }) {
  const yTicks = Array.from({ length: 5 }, (_, i) => s.ymax - ((s.ymax - s.ymin) * i) / 4);
  const xTicks = Array.from({ length: 5 }, (_, i) => s.xmin + ((s.xmax - s.xmin) * i) / 4);
  const zeroY = s.ymin <= 0 && s.ymax >= 0 ? s.sy(0) : null;
  const zeroX = s.xmin <= 0 && s.xmax >= 0 ? s.sx(0) : null;
  return (
    <g>
      {yTicks.map((t, i) => (
        <g key={`y${i}`}>
          <line x1={M.l} x2={W - M.r} y1={s.sy(t)} y2={s.sy(t)} className="lab-grid" />
          <text x={M.l - 8} y={s.sy(t) + 4} textAnchor="end" className="lab-tick">
            {fmt(t, 3)}
          </text>
        </g>
      ))}
      {xTicks.map((t, i) => (
        <text key={`x${i}`} x={s.sx(t)} y={H - M.b + 20} textAnchor="middle" className="lab-tick">
          {fmt(t, 3)}
        </text>
      ))}
      {zeroY !== null && <line x1={M.l} x2={W - M.r} y1={zeroY} y2={zeroY} className="lab-axis" />}
      {zeroX !== null && <line x1={zeroX} x2={zeroX} y1={M.t} y2={H - M.b} className="lab-axis" />}
    </g>
  );
}

function computeResult(
  expression: string,
  scope: Record<string, number>,
  mode: Mode,
  params: {
    a: number;
    b: number;
    n: number;
    rule: RiemannRule;
    x0: number;
    steps: number;
    sumFrom: number;
    sumTo: number;
  },
): LabResult {
  let expr;
  try {
    expr = compileExpression(expression);
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "Invalid expression" };
  }
  const fx = (x: number) => expr.evalScope({ ...scope, x });
  const fk = (k: number) => expr.evalScope({ ...scope, k });
  try {
    if (mode === "sum") {
      return { kind: "sum", partials: partialSums(fk, params.sumFrom, params.sumTo) };
    }
    const lo = Math.min(params.a, params.b);
    const hi = Math.max(params.a, params.b);
    const pts = samplePlot(fx, lo, hi, 260);
    if (mode === "graph") return { kind: "graph", pts };
    if (mode === "integrate") {
      const integ = integrate(fx, params.a, params.b, params.n, params.rule);
      return {
        kind: "integrate",
        pts,
        value: integ.value,
        rects: integ.rects,
        ruleLabel: RULE_LABELS[params.rule],
      };
    }
    if (mode === "derivative") {
      return {
        kind: "derivative",
        pts,
        x0: params.x0,
        y0: fx(params.x0),
        slope: derivative(fx, params.x0),
      };
    }
    return { kind: "root", pts, iters: newton(fx, params.x0, Math.max(0, Math.floor(params.steps))) };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

export default function NumericalLab({
  lesson,
  displayedLessonNumber,
  completed,
  onComplete,
}: NumericalLabProps) {
  const [expression, setExpression] = useState(lesson.lab?.expression ?? "x^2");
  const [variables, setVariables] = useState<LabVariable[]>(
    (lesson.lab?.variables ?? []).map((v) => ({ name: v.name, value: String(v.value) })),
  );
  const [mode, setMode] = useState<Mode>("graph");
  const [aText, setAText] = useState("-4");
  const [bText, setBText] = useState("4");
  const [nText, setNText] = useState("20");
  const [rule, setRule] = useState<RiemannRule>("midpoint");
  const [x0Text, setX0Text] = useState("1");
  const [stepsText, setStepsText] = useState("5");
  const [sumFromText, setSumFromText] = useState("1");
  const [sumToText, setSumToText] = useState("20");

  const parseError = useMemo(() => {
    try {
      compileExpression(expression);
      return "";
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid expression";
    }
  }, [expression]);

  const scope = useMemo(() => {
    const s: Record<string, number> = {};
    for (const v of variables) {
      const value = Number(v.value);
      if (v.name.trim() && Number.isFinite(value)) s[v.name.trim()] = value;
    }
    return s;
  }, [variables]);

  const result = useMemo(
    () =>
      computeResult(expression, scope, mode, {
        a: num(aText, -4),
        b: num(bText, 4),
        n: num(nText, 20),
        rule,
        x0: num(x0Text, 1),
        steps: num(stepsText, 5),
        sumFrom: num(sumFromText, 1),
        sumTo: num(sumToText, 20),
      }),
    [expression, scope, mode, aText, bText, nText, rule, x0Text, stepsText, sumFromText, sumToText],
  );

  const computedOk = result.kind !== "error";
  useEffect(() => {
    if (computedOk && !completed) onComplete(lesson.id);
  }, [computedOk, completed, lesson.id, onComplete]);

  function updateVariable(index: number, patch: Partial<LabVariable>) {
    setVariables((vars) => vars.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  return (
    <section className="lab">
      <div className="lab-controls">
        <label className="lab-field lab-expression">
          <span>Function f(x)</span>
          <input
            value={expression}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setExpression(event.target.value)}
            placeholder="e.g. x^2 - 2*x + 1"
          />
        </label>
        {parseError && <p className="lab-error" role="alert">{parseError}</p>}

        <div className="lab-variables">
          <div className="lab-variables-head">
            <span>Variables</span>
            <button
              type="button"
              onClick={() => setVariables((vars) => [...vars, { name: "", value: "" }])}
            >
              + Add
            </button>
          </div>
          {variables.length === 0 && (
            <p className="lab-variables-hint">
              Define named values (like <code>a</code>, <code>n</code>) and use them in f(x).
            </p>
          )}
          {variables.map((v, index) => (
            <div className="lab-variable-row" key={index}>
              <input
                className="lab-variable-name"
                value={v.name}
                spellCheck={false}
                placeholder="name"
                onChange={(event) => updateVariable(index, { name: event.target.value })}
              />
              <span className="lab-variable-eq">=</span>
              <input
                className="lab-variable-value"
                value={v.value}
                inputMode="decimal"
                placeholder="0"
                onChange={(event) => updateVariable(index, { value: event.target.value })}
              />
              <button
                type="button"
                className="lab-variable-remove"
                aria-label={`Remove variable ${v.name || index + 1}`}
                onClick={() => setVariables((vars) => vars.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="lab-modes" role="tablist" aria-label="Lab tool">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={`lab-mode${mode === m.id ? " active" : ""}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="lab-params">
          {mode !== "sum" && (
            <>
              <label className="lab-field">
                <span>from a</span>
                <input value={aText} inputMode="decimal" onChange={(e) => setAText(e.target.value)} />
              </label>
              <label className="lab-field">
                <span>to b</span>
                <input value={bText} inputMode="decimal" onChange={(e) => setBText(e.target.value)} />
              </label>
            </>
          )}
          {mode === "integrate" && (
            <>
              <label className="lab-field">
                <span>rectangles n</span>
                <input value={nText} inputMode="numeric" onChange={(e) => setNText(e.target.value)} />
              </label>
              <label className="lab-field">
                <span>rule</span>
                <select value={rule} onChange={(e) => setRule(e.target.value as RiemannRule)}>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="midpoint">Midpoint</option>
                  <option value="trapezoid">Trapezoid</option>
                </select>
              </label>
            </>
          )}
          {(mode === "derivative" || mode === "root") && (
            <label className="lab-field">
              <span>{mode === "root" ? "start x0" : "at x0"}</span>
              <input value={x0Text} inputMode="decimal" onChange={(e) => setX0Text(e.target.value)} />
            </label>
          )}
          {mode === "root" && (
            <label className="lab-field">
              <span>steps</span>
              <input value={stepsText} inputMode="numeric" onChange={(e) => setStepsText(e.target.value)} />
            </label>
          )}
          {mode === "sum" && (
            <>
              <label className="lab-field">
                <span>k from</span>
                <input value={sumFromText} inputMode="numeric" onChange={(e) => setSumFromText(e.target.value)} />
              </label>
              <label className="lab-field">
                <span>k to</span>
                <input value={sumToText} inputMode="numeric" onChange={(e) => setSumToText(e.target.value)} />
              </label>
            </>
          )}
        </div>
      </div>

      <div className="lab-stage">
        <LabPlot result={result} />
        <LabReadout result={result} />
      </div>
      <p className="lab-source">
        Numerical Methods Lab · Lesson {displayedLessonNumber} · computed offline in your browser.
        {lesson.source ? ` ${lesson.source}` : ""}
      </p>
    </section>
  );
}

function LabPlot({ result }: { result: LabResult }) {
  if (result.kind === "error") {
    return <div className="lab-plot lab-plot-empty">{result.message}</div>;
  }

  if (result.kind === "sum") {
    const pts: PlotPoints = result.partials.map((y, i) => ({ x: i + 1, y }));
    const s = buildScales(pts.map((p) => p.x), result.partials);
    return (
      <svg className="lab-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Partial sums convergence">
        <Axes s={s} />
        <path d={curvePath(pts, s)} className="lab-curve" />
        {pts.slice(-60).map((p, i) => (
          <circle key={i} cx={s.sx(p.x)} cy={s.sy(p.y as number)} r={2.5} className="lab-dot" />
        ))}
      </svg>
    );
  }

  const pts = result.pts;
  const ys = pts.map((p) => p.y).filter((y): y is number => y !== null);
  const extra: number[] = [];
  if (result.kind === "integrate") result.rects.forEach((r) => extra.push(r.height));
  if (result.kind === "derivative") extra.push(result.y0);
  const s = buildScales(pts.map((p) => p.x), [...ys, ...extra]);

  return (
    <svg className="lab-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Function graph">
      <Axes s={s} />
      {result.kind === "integrate" &&
        result.rects.map((r, i) => {
          const top = Math.min(s.sy(0), s.sy(r.height));
          const height = Math.abs(s.sy(r.height) - s.sy(0));
          return (
            <rect
              key={i}
              x={s.sx(r.x0)}
              y={top}
              width={Math.max(0.5, s.sx(r.x1) - s.sx(r.x0) - 0.5)}
              height={height}
              className="lab-rect"
            />
          );
        })}
      <path d={curvePath(pts, s)} className="lab-curve" />
      {result.kind === "derivative" && (
        <TangentLine s={s} x0={result.x0} y0={result.y0} slope={result.slope} />
      )}
      {result.kind === "root" &&
        result.iters.map((step, i) => (
          <g key={i}>
            <line x1={s.sx(step.x)} x2={s.sx(step.x)} y1={s.sy(0)} y2={s.sy(step.fx)} className="lab-iter-line" />
            <circle
              cx={s.sx(step.x)}
              cy={s.sy(0)}
              r={i === result.iters.length - 1 ? 5 : 3}
              className={i === result.iters.length - 1 ? "lab-root" : "lab-iter"}
            />
          </g>
        ))}
    </svg>
  );
}

function TangentLine({ s, x0, y0, slope }: { s: Scales; x0: number; y0: number; slope: number }) {
  if (!Number.isFinite(slope) || !Number.isFinite(y0)) return null;
  const dx = (s.xmax - s.xmin) * 0.28;
  const x1 = x0 - dx;
  const x2 = x0 + dx;
  return (
    <g>
      <line
        x1={s.sx(x1)}
        y1={s.sy(y0 + slope * (x1 - x0))}
        x2={s.sx(x2)}
        y2={s.sy(y0 + slope * (x2 - x0))}
        className="lab-tangent"
      />
      <circle cx={s.sx(x0)} cy={s.sy(y0)} r={5} className="lab-root" />
    </g>
  );
}

function LabReadout({ result }: { result: LabResult }) {
  if (result.kind === "error") {
    return (
      <div className="lab-readout">
        <p className="lab-readout-hint">Fix the function to see results. Everything computes live, offline.</p>
      </div>
    );
  }
  if (result.kind === "integrate") {
    return (
      <div className="lab-readout">
        <h5>Definite integral (approx.)</h5>
        <p className="lab-big">{fmt(result.value, 7)}</p>
        <p className="lab-note">
          {result.rects.length} {result.ruleLabel} rectangle{result.rects.length === 1 ? "" : "s"}. Increase n
          to refine the estimate.
        </p>
      </div>
    );
  }
  if (result.kind === "derivative") {
    return (
      <div className="lab-readout">
        <h5>Slope f′(x0)</h5>
        <p className="lab-big">{fmt(result.slope, 7)}</p>
        <p className="lab-note">
          at x0 = {fmt(result.x0, 5)}, f(x0) = {fmt(result.y0, 5)} (central difference).
        </p>
      </div>
    );
  }
  if (result.kind === "root") {
    const last = result.iters[result.iters.length - 1];
    return (
      <div className="lab-readout">
        <h5>Newton root estimate</h5>
        <p className="lab-big">{fmt(last.x, 8)}</p>
        <p className="lab-note">
          f(root) = {fmt(last.fx, 3)} after {result.iters.length - 1} step
          {result.iters.length === 2 ? "" : "s"}.
        </p>
        <ol className="lab-iters">
          {result.iters.map((step, i) => (
            <li key={i}>x{i} = {fmt(step.x, 8)}</li>
          ))}
        </ol>
      </div>
    );
  }
  if (result.kind === "sum") {
    const last = result.partials[result.partials.length - 1];
    return (
      <div className="lab-readout">
        <h5>Partial sum</h5>
        <p className="lab-big">{fmt(last, 8)}</p>
        <p className="lab-note">
          after {result.partials.length} term{result.partials.length === 1 ? "" : "s"}. The graph shows the
          running total.
        </p>
      </div>
    );
  }
  return (
    <div className="lab-readout">
      <h5>Graphing</h5>
      <p className="lab-note">
        Showing f(x) across the chosen range. Switch tools to integrate, differentiate, find roots, or sum a
        series.
      </p>
    </div>
  );
}
