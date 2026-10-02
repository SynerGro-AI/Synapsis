interface MathGraphProps {
  values: number[];
}

const WIDTH = 840;
const HEIGHT = 480;
const PLOT = { left: 78, right: 28, top: 26, bottom: 54 };
const MAX_POINTS = 20;

function formatTick(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

export default function MathGraph({ values }: MathGraphProps) {
  const points = values.slice(-MAX_POINTS);
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const rawMin = Math.min(0, ...points);
  const rawMax = Math.max(0, ...points);
  const rawSpan = rawMax - rawMin || 2;
  const min = rawMin - rawSpan * 0.08;
  const max = rawMax + rawSpan * 0.08;
  const x = (index: number) =>
    PLOT.left + (points.length < 2 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => PLOT.top + ((max - value) / (max - min)) * plotHeight;
  const ticks = Array.from({ length: 5 }, (_, index) => max - ((max - min) * index) / 4);
  const plotted = points.map((value, index) => `${x(index)},${y(value)}`).join(" ");

  return (
    <div className="math-graph">
      <header className="math-graph-heading">
        <strong>Python result graph</strong>
        <span>x: printed value order <b>·</b> y: numeric result</span>
      </header>
      <svg
        className="math-graph-plot"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          points.length
            ? `Graph of ${points.length} numeric value${points.length === 1 ? "" : "s"} printed by the Python program.`
            : "Empty graph. Run a Python program that prints numbers to plot its results."
        }
      >
        {ticks.map((tick, index) => (
          <g key={index}>
            <line
              x1={PLOT.left}
              x2={WIDTH - PLOT.right}
              y1={y(tick)}
              y2={y(tick)}
              className="math-graph-grid"
            />
            <text x={PLOT.left - 12} y={y(tick) + 4} textAnchor="end" className="math-graph-tick">
              {formatTick(tick)}
            </text>
          </g>
        ))}
        <line
          x1={PLOT.left}
          x2={WIDTH - PLOT.right}
          y1={y(0)}
          y2={y(0)}
          className="math-graph-zero"
        />
        <line
          x1={PLOT.left}
          x2={PLOT.left}
          y1={PLOT.top}
          y2={HEIGHT - PLOT.bottom}
          className="math-graph-axis"
        />
        {points.length > 0 && (
          <>
            <text x={x(0)} y={HEIGHT - 16} textAnchor="middle" className="math-graph-tick">
              1
            </text>
            {points.length > 1 && (
              <text
                x={x(points.length - 1)}
                y={HEIGHT - 16}
                textAnchor="end"
                className="math-graph-tick"
              >
                {points.length}
              </text>
            )}
          </>
        )}
        {points.length > 1 && <polyline points={plotted} className="math-graph-line" />}
        {points.map((value, index) => (
          <g key={`${index}-${value}`}>
            <circle cx={x(index)} cy={y(value)} r={7} className="math-graph-point" />
            <text x={x(index)} y={y(value) - 14} textAnchor="middle" className="math-graph-value">
              {formatTick(value)}
            </text>
          </g>
        ))}
        {points.length === 0 && (
          <text
            x={PLOT.left + plotWidth / 2}
            y={PLOT.top + plotHeight / 2}
            textAnchor="middle"
            className="math-graph-empty"
          >
            Run Python to plot its numeric results
          </text>
        )}
      </svg>
      <p className="math-graph-caption">
        {points.length
          ? `Showing ${points.length} numeric value${points.length === 1 ? "" : "s"} from the latest run.`
          : "The graph updates from numbers your Python program prints."}
      </p>
    </div>
  );
}
