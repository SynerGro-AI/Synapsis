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
  const [symbol, setSymbol] = useState<ParsedSymbol | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSymbol(null);
    setFailed(false);
    load(src)
      .then((s) => !cancelled && setSymbol(s))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) return null;
  if (!symbol) return <div className="schematic" />;

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
