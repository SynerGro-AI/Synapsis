import { useEffect, useState } from "react";
import { parseKicadSymbol, type ParsedSymbol } from "../kicad/symbol";

const cache = new Map<string, Promise<ParsedSymbol>>();

function load(src: string): Promise<ParsedSymbol> {
  let entry = cache.get(src);
  if (!entry) {
    entry = fetch("/" + src)
      .then((res) => {
        if (!res.ok) throw new Error(`GET /${src} → ${res.status}`);
        return res.text();
      })
      .then(parseKicadSymbol);
    cache.set(src, entry);
  }
  return entry;
}

export default function SchematicSymbol({ src }: { src: string }) {
  const [result, setResult] = useState<
    { src: string; symbol: ParsedSymbol } | { src: string; failed: true } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    load(src)
      .then((symbol) => !cancelled && setResult({ src, symbol }))
      .catch(() => !cancelled && setResult({ src, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [src]);

  const currentResult = result?.src === src ? result : null;
  if (currentResult && "failed" in currentResult) return null;
  if (!currentResult) return <div className="schematic" />;
  const { symbol } = currentResult;

  return (
    <div className="schematic" title={`KiCad symbol: ${symbol.name}`}>
      <svg viewBox={symbol.viewBox} preserveAspectRatio="xMidYMid meet">
        {symbol.shapes.map((shape, i) => (
          <path
            key={i}
            d={shape.path}
            fill={shape.fill === "none" ? "none" : "currentColor"}
            fillOpacity={shape.fill === "background" ? 0.12 : 1}
            stroke="currentColor"
            strokeWidth={shape.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  );
}
