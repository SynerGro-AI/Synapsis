import type { Lesson } from "../api";

type MathVisual = NonNullable<NonNullable<Lesson["math"]>["visual"]>;

function CounterRow({ count, label }: { count: number; label: string }) {
  return (
    <div className="math-model-group">
      <span className="math-model-label">{label}</span>
      <div className="math-counters" aria-label={`${count} ${label.toLowerCase()}`}>
        {Array.from({ length: Math.min(count, 40) }, (_, index) => (
          <span className="math-counter" key={index} aria-hidden="true" />
        ))}
      </div>
    </div>
  );
}

function PlaceValue({ value }: { value: number }) {
  const places = [
    { name: "Hundreds", digit: Math.floor(value / 100) % 10 },
    { name: "Tens", digit: Math.floor(value / 10) % 10 },
    { name: "Ones", digit: value % 10 },
  ].filter((place, index) => index === 2 || place.digit > 0 || value >= 100);

  return (
    <div className="math-place-values" aria-label={`${value} represented by place value`}>
      {places.map(({ name, digit }) => (
        <div className="math-place-value" key={name}>
          <strong>{digit}</strong>
          <span>{name}</span>
        </div>
      ))}
    </div>
  );
}

function FractionBar({ numerator, denominator, label }: {
  numerator: number;
  denominator: number;
  label: string;
}) {
  return (
    <div className="math-fraction-model">
      <span className="math-model-label">{label}</span>
      <div
        className="math-fraction-bar"
        role="img"
        aria-label={`${numerator} of ${denominator} equal parts`}
      >
        {Array.from({ length: denominator }, (_, index) => (
          <span className={index < numerator ? "filled" : ""} key={index} />
        ))}
      </div>
      <span>{numerator}/{denominator}</span>
    </div>
  );
}

function ModelContent({ visual }: { visual: MathVisual }) {
  const [first = 0, second = 0, third = 0, fourth = 0] = visual.values;
  const unit = visual.unit ?? "";

  switch (visual.kind) {
    case "count":
      return <CounterRow count={first} label={unit} />;
    case "combine":
    case "compare":
      return (
        <div className="math-model-pair">
          <CounterRow count={first} label={`Group A · ${first}`} />
          <span className="math-model-operator">{visual.kind === "combine" ? "+" : "vs."}</span>
          <CounterRow count={second} label={`Group B · ${second}`} />
        </div>
      );
    case "place-value":
      return <PlaceValue value={first} />;
    case "groups":
      return (
        <div className="math-equal-groups">
          {Array.from({ length: Math.min(first, 12) }, (_, index) => (
            <CounterRow count={second} label={`Group ${index + 1}`} key={index} />
          ))}
        </div>
      );
    case "length":
      return (
        <div className="math-length-model">
          {[first, second].map((length, index) => (
            <div className="math-length-row" key={`${length}-${index}`}>
              <span>{index === 0 ? "Longer" : "Shorter"} · {length} {unit}</span>
              <div className="math-length-track">
                <span style={{ width: `${(length / Math.max(first, second, 1)) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      );
    case "share":
      return (
        <div className="math-equal-groups">
          {Array.from({ length: Math.min(second, 12) }, (_, index) => (
            <CounterRow
              count={Math.floor(first / second) + (index < first % second ? 1 : 0)}
              label={`Box ${index + 1}`}
              key={index}
            />
          ))}
        </div>
      );
    case "fraction":
      return (
        <div className="math-fraction-pair">
          <FractionBar numerator={first} denominator={second} label="Starting fraction" />
          <span className="math-model-operator">× {third}</span>
          <FractionBar numerator={first * third} denominator={second * third} label="Same-sized parts" />
        </div>
      );
    case "convert":
      return (
        <div className="math-conversion-model">
          <strong>{first} m</strong>
          <span>× 100 cm in each metre</span>
          <strong>{first * second} {unit}</strong>
        </div>
      );
    case "rectangle":
      return (
        <div className="math-rectangle-model">
          <div
            className="math-rectangle-grid"
            role="img"
            aria-label={`Rectangle grid, ${first} columns by ${second} rows`}
            style={{ gridTemplateColumns: `repeat(${Math.min(first, 12)}, 1fr)` }}
          >
            {Array.from({ length: Math.min(first * second, 144) }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <span>{first} units × {second} units</span>
        </div>
      );
    case "mean":
      return (
        <div className="math-mean-model">
          {[first, second, third, fourth].map((value, index) => (
            <div className="math-mean-bar" key={index}>
              <span className="math-model-label">{["Mon", "Tue", "Wed", "Thu"][index]}</span>
              <div className="math-length-track">
                <span style={{ width: `${(value / Math.max(first, second, third, fourth, 1)) * 100}%` }} />
              </div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      );
  }
}

export default function MathVisualModel({ visual }: { visual?: MathVisual }) {
  if (!visual) return null;

  return (
    <details className="math-visual-model">
      <summary>Explore a visual model</summary>
      <ModelContent visual={visual} />
    </details>
  );
}
