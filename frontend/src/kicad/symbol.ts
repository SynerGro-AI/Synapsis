// Minimal KiCad .kicad_sym parser: S-expressions -> drawing primitives -> SVG path data.
// Coordinates are millimeters with Y pointing up; we flip Y for SVG.

type SExpr = string | SExpr[];

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "(" || ch === ")") {
      tokens.push(ch);
      i++;
    } else if (ch === '"') {
      let j = i + 1;
      let value = "";
      while (j < text.length && text[j] !== '"') {
        if (text[j] === "\\") j++;
        value += text[j];
        j++;
      }
      tokens.push('"' + value);
      i = j + 1;
    } else if (/\s/.test(ch)) {
      i++;
    } else {
      let j = i;
      while (j < text.length && !/[\s()]/.test(text[j])) j++;
      tokens.push(text.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

function parse(tokens: string[]): SExpr {
  let pos = 0;
  function walk(): SExpr {
    const token = tokens[pos++];
    if (token === "(") {
      const list: SExpr[] = [];
      while (tokens[pos] !== ")") list.push(walk());
      pos++;
      return list;
    }
    return token.startsWith('"') ? token.slice(1) : token;
  }
  return walk();
}

const isList = (e: SExpr): e is SExpr[] => Array.isArray(e);
const tag = (e: SExpr): string => (isList(e) && typeof e[0] === "string" ? e[0] : "");

function child(e: SExpr[], name: string): SExpr[] | undefined {
  return e.find((c): c is SExpr[] => tag(c) === name);
}

function nums(e: SExpr[], from = 1): number[] {
  return e.slice(from).map(Number).filter((n) => !Number.isNaN(n));
}

export interface SymbolShape {
  path: string;
  fill: "none" | "background" | "outline";
  width: number;
}

export interface ParsedSymbol {
  name: string;
  shapes: SymbolShape[];
  viewBox: string;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function parseKicadSymbol(text: string): ParsedSymbol {
  const root = parse(tokenize(text));
  if (!isList(root) || tag(root) !== "kicad_symbol_lib")
    throw new Error("Not a kicad_symbol_lib file");

  const top = child(root, "symbol");
  if (!top) throw new Error("No symbol found");
  const name = String(top[1]);

  const shapes: SymbolShape[] = [];
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (x: number, y: number) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  };

  const fillOf = (e: SExpr[]): SymbolShape["fill"] => {
    const f = child(e, "fill");
    const t = f && child(f, "type");
    const v = t ? String(t[1]) : "none";
    return v === "background" || v === "outline" ? v : "none";
  };
  const widthOf = (e: SExpr[]): number => {
    const s = child(e, "stroke");
    const w = s && child(s, "width");
    const value = w ? Number(w[1]) : 0;
    return value > 0 ? value : 0.254;
  };

  // Y is flipped here so all emitted path data is already in SVG space.
  function visit(node: SExpr) {
    if (!isList(node)) return;
    const t = tag(node);

    if (t === "polyline") {
      const pts = child(node, "pts");
      if (pts) {
        const points = pts
          .filter((p): p is SExpr[] => tag(p) === "xy")
          .map((p) => nums(p))
          .map(([x, y]) => [x, -y] as const);
        if (points.length >= 2) {
          const d =
            `M ${points[0][0]} ${points[0][1]} ` +
            points.slice(1).map(([x, y]) => `L ${x} ${y}`).join(" ");
          shapes.push({ path: d, fill: fillOf(node), width: widthOf(node) });
          points.forEach(([x, y]) => grow(x, y));
        }
      }
    } else if (t === "rectangle") {
      const s = child(node, "start");
      const e = child(node, "end");
      if (s && e) {
        const [x1, y1r] = nums(s);
        const [x2, y2r] = nums(e);
        const y1 = -y1r;
        const y2 = -y2r;
        const d = `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
        shapes.push({ path: d, fill: fillOf(node), width: widthOf(node) });
        grow(x1, y1);
        grow(x2, y2);
      }
    } else if (t === "circle") {
      const c = child(node, "center");
      const r = child(node, "radius");
      if (c && r) {
        const [cx, cyr] = nums(c);
        const cy = -cyr;
        const radius = Number(r[1]);
        const d =
          `M ${cx - radius} ${cy} ` +
          `A ${radius} ${radius} 0 1 0 ${cx + radius} ${cy} ` +
          `A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy}`;
        shapes.push({ path: d, fill: fillOf(node), width: widthOf(node) });
        grow(cx - radius, cy - radius);
        grow(cx + radius, cy + radius);
      }
    } else if (t === "arc") {
      const s = child(node, "start");
      const m = child(node, "mid");
      const e = child(node, "end");
      if (s && m && e) {
        const [ax, ayr] = nums(s);
        const [mx, myr] = nums(m);
        const [bx, byr] = nums(e);
        const ay = -ayr, my = -myr, by = -byr;
        // Circumcenter of the three points.
        const d2 = 2 * (ax * (my - by) + mx * (by - ay) + bx * (ay - my));
        if (Math.abs(d2) > 1e-9) {
          const a2 = ax * ax + ay * ay;
          const m2 = mx * mx + my * my;
          const b2 = bx * bx + by * by;
          const cx = (a2 * (my - by) + m2 * (by - ay) + b2 * (ay - my)) / d2;
          const cy = (a2 * (bx - mx) + m2 * (ax - bx) + b2 * (mx - ax)) / d2;
          const radius = Math.hypot(ax - cx, ay - cy);
          const sweep =
            (mx - ax) * (by - my) - (my - ay) * (bx - mx) > 0 ? 1 : 0;
          // Large arc if the mid point is on the far side of the chord's midpoint.
          const chordMidX = (ax + bx) / 2;
          const chordMidY = (ay + by) / 2;
          const largeArc =
            Math.hypot(mx - chordMidX, my - chordMidY) > radius ? 1 : 0;
          const d = `M ${ax} ${ay} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${bx} ${by}`;
          shapes.push({ path: d, fill: fillOf(node), width: widthOf(node) });
          grow(ax, ay);
          grow(mx, my);
          grow(bx, by);
        }
      }
    } else if (t === "pin") {
      const at = child(node, "at");
      const len = child(node, "length");
      if (at && len) {
        const [x, yr, angle = 0] = nums(at);
        const y = -yr;
        const length = Number(len[1]);
        const rad = (angle * Math.PI) / 180;
        // Pin extends from its anchor toward the body; angle is in KiCad space (Y up).
        const ex = x + Math.cos(rad) * length;
        const ey = y - Math.sin(rad) * length;
        shapes.push({
          path: `M ${x} ${y} L ${ex} ${ey}`,
          fill: "none",
          width: 0.152,
        });
        grow(x, y);
        grow(ex, ey);
      }
    }

    node.forEach(visit);
  }

  visit(top);

  if (!shapes.length || !Number.isFinite(bounds.minX))
    throw new Error(`Symbol ${name} has no drawable shapes`);

  const pad = 1.3;
  const viewBox = [
    bounds.minX - pad,
    bounds.minY - pad,
    bounds.maxX - bounds.minX + pad * 2,
    bounds.maxY - bounds.minY + pad * 2,
  ]
    .map((n) => n.toFixed(2))
    .join(" ");

  return { name, shapes, viewBox };
}
