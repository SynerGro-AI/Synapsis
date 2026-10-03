import type { Lesson } from "../api";

type MathVisual = NonNullable<NonNullable<Lesson["math"]>["visual"]>;

function UnitDot() {
  return <span className="math-result-unit" aria-hidden="true" />;
}

function NumberGeometry({ value }: { value: number }) {
  const whole = Math.floor(Math.abs(value));
  const hundreds = Math.floor(whole / 100);
  const tens = Math.floor((whole % 100) / 10);
  const ones = whole % 10;
  const fraction = Math.abs(value) - whole;

  if (!Number.isInteger(value) || Math.abs(value) >= 10000) {
    const scale = Math.max(10, Math.ceil(Math.abs(value) / 10) * 10);
    return (
      <div className="math-result-scale">
        <div className="math-result-track">
          <span style={{ width: `${Math.min(100, (Math.abs(value) / scale) * 100)}%` }} />
        </div>
        <span>0</span>
        <span>{scale}</span>
      </div>
    );
  }

  return (
    <div
      className="math-result-geometry"
      role="img"
      aria-label={`${value} shown as hundreds, tens, and ones`}
    >
      {hundreds > 0 && (
        <div className="math-result-place">
          <div className="math-result-hundreds">
            {Array.from({ length: hundreds }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <span>{hundreds} hundred{hundreds === 1 ? "" : "s"}</span>
        </div>
      )}
      {tens > 0 && (
        <div className="math-result-place">
          <div className="math-result-tens">
            {Array.from({ length: tens }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <span>{tens} ten{tens === 1 ? "" : "s"}</span>
        </div>
      )}
      {(ones > 0 || fraction > 0 || whole === 0) && (
        <div className="math-result-place">
          <div className="math-result-ones">
            {Array.from({ length: ones }, (_, index) => (
              <UnitDot key={index} />
            ))}
            {fraction > 0 && (
              <span
                className="math-result-unit math-result-fraction"
                style={{ opacity: fraction }}
                aria-hidden="true"
              />
            )}
            {whole === 0 && fraction === 0 && <span className="math-result-zero">0</span>}
          </div>
          <span>
            {ones + fraction} unit{ones + fraction === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </div>
  );
}

function RectangleGeometry({ area, perimeter }: { area: number; perimeter: number }) {
  const width = Math.floor(Math.sqrt(area));
  let height = width;
  while (height > 1 && (area % height !== 0 || 2 * (height + area / height) !== perimeter)) {
    height -= 1;
  }
  const hasMatchingSides =
    Number.isInteger(area) &&
    Number.isInteger(perimeter) &&
    height > 0 &&
    area % height === 0 &&
    2 * (height + area / height) === perimeter;

  if (!hasMatchingSides) {
    return (
      <div className="math-result-values">
        <ResultValue value={area} label="First value" />
        <ResultValue value={perimeter} label="Second value" />
      </div>
    );
  }

  const columns = area / height;
  return (
    <div className="math-result-rectangle">
      <div
        className="math-result-grid"
        role="img"
        aria-label={`${area} unit squares arranged ${columns} by ${height}; perimeter ${perimeter}`}
        style={{ gridTemplateColumns: `repeat(${Math.min(columns, 12)}, 1fr)` }}
      >
        {Array.from({ length: Math.min(area, 144) }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <span>{columns} × {height} = {area} square units · perimeter {perimeter} units</span>
    </div>
  );
}

function ResultValue({ value, label }: { value: number; label: string }) {
  return (
    <div className="math-result-value">
      <div className="math-result-value-label">{label}</div>
      <strong>{value}</strong>
      <NumberGeometry value={value} />
    </div>
  );
}

function ResultContent({
  visual,
  values,
  resultLabel,
}: {
  visual: MathVisual;
  values: number[];
  resultLabel: string;
}) {
  if (visual.kind === "fraction" && values.length >= 2) {
    return (
      <div className="math-result-fraction">
        <ResultValue value={values[0]} label="Numerator" />
        <span className="math-result-slash">/</span>
        <ResultValue value={values[1]} label="Denominator" />
      </div>
    );
  }

  if (visual.kind === "rectangle" && values.length >= 2) {
    return <RectangleGeometry area={values[0]} perimeter={values[1]} />;
  }

  const labels =
    visual.kind === "place-value"
      ? values.length === 3
        ? ["Hundreds digit", "Tens digit", "Ones digit"]
        : ["Tens digit", "Ones digit"]
      : visual.kind === "convert"
        ? [visual.unit ? `Converted length (${visual.unit})` : "Converted length"]
        : visual.kind === "mean"
          ? [visual.unit ? `Mean (${visual.unit})` : "Mean"]
          : values.length === 1
            ? [resultLabel]
            : values.map((_, index) => `Value ${index + 1}`);

  if (visual.kind === "place-value" && values.length > 1) {
    const value = values.length === 3
      ? values[0] * 100 + values[1] * 10 + values[2]
      : values[0] * 10 + values[1];
    return (
      <ResultValue value={value} label="Rebuilt from your values" />
    );
  }

  return (
    <div className="math-result-values">
      {values.map((value, index) => (
        <ResultValue value={value} label={labels[index] ?? `Value ${index + 1}`} key={index} />
      ))}
    </div>
  );
}

export default function MathVisualModel({
  visual,
  values,
  resultLabel = "Your printed result",
}: {
  visual?: MathVisual;
  values: number[];
  resultLabel?: string;
}) {
  if (!visual || !values.length) return null;

  return (
    <section className="math-result-animation" aria-live="polite" aria-label="Animated math result">
      <h5>Your result takes shape</h5>
      <ResultContent visual={visual} values={values} resultLabel={resultLabel} />
    </section>
  );
}
