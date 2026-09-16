import { useCallback, useEffect, useRef, useState } from "react";
import "@wokwi/elements";
import {
  PART_LABELS,
  type CircuitState,
  type PartType,
  type Terminal,
} from "../circuit/engine";

const SCALE: Record<string, number> = {
  uno: 0.62,
  led: 1.3,
  resistor: 1.1,
  potentiometer: 0.85,
  pushbutton: 1.0,
  photoresistor: 0.85,
  ntc: 0.85,
  ultrasonic: 0.7,
};

const ID_PREFIX: Record<PartType, string> = {
  led: "LED",
  resistor: "R",
  potentiometer: "POT",
  pushbutton: "BTN",
  photoresistor: "LDR",
  ntc: "TMP",
  ultrasonic: "SONAR",
};

interface PinAnchor {
  x: number;
  y: number;
  name: string;
}

interface WokwiPinInfo {
  name: string;
  x: number;
  y: number;
}

interface CircuitCanvasProps {
  palette: PartType[];
  circuit: CircuitState;
  onCircuitChange: (next: CircuitState) => void;
  litLeds: Set<string>;
  currentWires: Map<number, boolean>;
  selected: string | null;
  onSelect: (partId: string | null) => void;
  onButtonChange: (partId: string, pressed: boolean) => void;
  boardLed: boolean;
}

const UNO_POS = { x: 16, y: 10 };

export default function CircuitCanvas({
  palette,
  circuit,
  onCircuitChange,
  litLeds,
  currentWires,
  selected,
  onSelect,
  onButtonChange,
  boardLed,
}: CircuitCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [anchors, setAnchors] = useState<Record<string, PinAnchor[]>>({});
  const [dragWire, setDragWire] = useState<{ from: Terminal; x: number; y: number } | null>(null);
  const [dragPart, setDragPart] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [selectedWire, setSelectedWire] = useState<number | null>(null);

  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;

  // ---- Pin anchor measurement (wokwi elements expose pinInfo after upgrade) ----
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const next: Record<string, PinAnchor[]> = {};
    let missing = false;
    container.querySelectorAll<HTMLElement>("[data-part-id]").forEach((wrapper) => {
      const id = wrapper.dataset.partId!;
      const el = wrapper.firstElementChild as (HTMLElement & { pinInfo?: WokwiPinInfo[] }) | null;
      const pinInfo = el?.pinInfo;
      if (!pinInfo || !pinInfo.length) {
        missing = true;
        return;
      }
      const scale = Number(wrapper.dataset.scale ?? 1);
      const x0 = wrapper.offsetLeft;
      const y0 = wrapper.offsetTop;
      next[id] = pinInfo.map((p) => ({ name: p.name, x: x0 + p.x * scale, y: y0 + p.y * scale }));
    });
    setAnchors(next);
    return !missing;
  }, []);

  useEffect(() => {
    let tries = 0;
    let raf = 0;
    const tick = () => {
      const done = measure();
      if (!done && tries++ < 40) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [measure, circuit.parts]);

  const anchorOf = useCallback(
    (t: Terminal): PinAnchor | null =>
      anchors[t.part]?.find((a) => a.name === t.pin) ?? null,
    [anchors],
  );

  // ---- Adding parts ----
  function addPart(type: PartType) {
    let n = 1;
    while (circuit.parts.some((p) => p.id === `${ID_PREFIX[type]}${n}`)) n++;
    const id = `${ID_PREFIX[type]}${n}`;
    const count = circuit.parts.length;
    onCircuitChange({
      ...circuit,
      parts: [
        ...circuit.parts,
        { id, type, x: 240 + (count % 3) * 130, y: 40 + Math.floor(count / 3) * 110 },
      ],
    });
    onSelect(id);
  }

  function removeSelected() {
    if (selectedWire !== null) {
      onCircuitChange({
        ...circuit,
        wires: circuit.wires.filter((_, i) => i !== selectedWire),
      });
      setSelectedWire(null);
      return;
    }
    if (selected && selected !== "uno") {
      onCircuitChange({
        parts: circuit.parts.filter((p) => p.id !== selected),
        wires: circuit.wires.filter((w) => w.from.part !== selected && w.to.part !== selected),
      });
      onSelect(null);
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA" && !(e.target as HTMLElement).closest(".monaco-editor")) {
          removeSelected();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // ---- Part dragging + wire drawing (pointer events on container) ----
  function containerPoint(e: { clientX: number; clientY: number }) {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPartPointerDown(e: React.PointerEvent, partId: string) {
    if (partId === "uno") {
      onSelect("uno");
      return;
    }
    const part = circuit.parts.find((p) => p.id === partId)!;
    const pt = containerPoint(e);
    setDragPart({ id: partId, dx: pt.x - part.x, dy: pt.y - part.y });
    onSelect(partId);
    setSelectedWire(null);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPinPointerDown(e: React.PointerEvent, t: Terminal) {
    e.stopPropagation();
    const pt = containerPoint(e);
    setDragWire({ from: t, x: pt.x, y: pt.y });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragPart) {
      const pt = containerPoint(e);
      onCircuitChange({
        ...circuitRef.current,
        parts: circuitRef.current.parts.map((p) =>
          p.id === dragPart.id
            ? { ...p, x: Math.max(0, pt.x - dragPart.dx), y: Math.max(0, pt.y - dragPart.dy) }
            : p,
        ),
      });
    } else if (dragWire) {
      const pt = containerPoint(e);
      setDragWire({ ...dragWire, x: pt.x, y: pt.y });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragWire) {
      // Did we land on a pin?
      const pt = containerPoint(e);
      let best: { t: Terminal; d: number } | null = null;
      for (const [part, pins] of Object.entries(anchors))
        for (const pin of pins) {
          const d = Math.hypot(pin.x - pt.x, pin.y - pt.y);
          if (d < 14 && (!best || d < best.d)) best = { t: { part, pin: pin.name }, d };
        }
      if (
        best &&
        !(best.t.part === dragWire.from.part && best.t.pin === dragWire.from.pin)
      ) {
        onCircuitChange({
          ...circuit,
          wires: [...circuit.wires, { from: dragWire.from, to: best.t }],
        });
      }
      setDragWire(null);
    }
    setDragPart(null);
  }

  // ---- Pushbutton press events from the wokwi element ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const cleanups: (() => void)[] = [];
    container.querySelectorAll<HTMLElement>("[data-part-id]").forEach((wrapper) => {
      const id = wrapper.dataset.partId!;
      const part = circuit.parts.find((p) => p.id === id);
      if (part?.type !== "pushbutton") return;
      const el = wrapper.firstElementChild as HTMLElement;
      const press = () => onButtonChange(id, true);
      const release = () => onButtonChange(id, false);
      el.addEventListener("button-press", press);
      el.addEventListener("button-release", release);
      cleanups.push(() => {
        el.removeEventListener("button-press", press);
        el.removeEventListener("button-release", release);
      });
    });
    return () => cleanups.forEach((fn) => fn());
  }, [circuit.parts, onButtonChange]);

  // ---- Wire path rendering ----
  function wirePath(a: PinAnchor, b: PinAnchor): string {
    const bend = Math.min(60, Math.max(20, Math.abs(a.x - b.x) / 3 + Math.abs(a.y - b.y) / 3));
    return `M ${a.x} ${a.y} C ${a.x} ${a.y + bend}, ${b.x} ${b.y + bend}, ${b.x} ${b.y}`;
  }
  function midOf(a: PinAnchor, b: PinAnchor) {
    const bend = Math.min(60, Math.max(20, Math.abs(a.x - b.x) / 3 + Math.abs(a.y - b.y) / 3));
    // Bezier midpoint at t=0.5 and tangent direction
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 + bend * 0.75;
    const angle = (Math.atan2(b.y + bend - (a.y + bend), b.x - a.x) * 180) / Math.PI;
    return { mx, my, angle };
  }

  const renderPart = (id: string, type: PartType | "uno", x: number, y: number) => {
    const scale = SCALE[type] ?? 1;
    const isSelected = selected === id;
    return (
      <div
        key={id}
        data-part-id={id}
        data-scale={scale}
        className={`part${isSelected ? " selected" : ""}`}
        style={{ left: x, top: y, transform: `scale(${scale})` }}
        onPointerDown={(e) => onPartPointerDown(e, id)}
      >
        {type === "uno" && <wokwi-arduino-uno led13={boardLed} ledPower={true} />}
        {type === "led" && <wokwi-led color="red" value={litLeds.has(id)} label={id} />}
        {type === "resistor" && <wokwi-resistor value="220" />}
        {type === "potentiometer" && <wokwi-potentiometer />}
        {type === "pushbutton" && <wokwi-pushbutton color="green" />}
        {type === "photoresistor" && <wokwi-photoresistor-sensor />}
        {type === "ntc" && <wokwi-ntc-temperature-sensor />}
        {type === "ultrasonic" && <wokwi-hc-sr04 />}
        {isSelected && id !== "uno" && <span className="part-tag">{id}</span>}
      </div>
    );
  };

  return (
    <div className="circuit-area">
      {/* Parts tray */}
      <div className="tray">
        <span className="tray-label">Parts tray:</span>
        {palette.map((type) => (
          <button key={type} className="tray-part" onClick={() => addPart(type)}>
            + {PART_LABELS[type]}
          </button>
        ))}
        {(selected && selected !== "uno") || selectedWire !== null ? (
          <button className="tray-part danger" onClick={removeSelected}>
            ✕ Delete {selectedWire !== null ? "wire" : selected}
          </button>
        ) : null}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="wokwi-canvas"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerDown={() => {
          onSelect(null);
          setSelectedWire(null);
        }}
      >
        {renderPart("uno", "uno", UNO_POS.x, UNO_POS.y)}
        {circuit.parts.map((p) => renderPart(p.id, p.type, p.x, p.y))}

        {/* Wires + pins overlay */}
        <svg className="wire-layer">
          {circuit.wires.map((w, i) => {
            const a = anchorOf(w.from);
            const b = anchorOf(w.to);
            if (!a || !b) return null;
            const flowing = currentWires.has(i);
            const forward = currentWires.get(i) ?? true;
            const d = wirePath(a, b);
            const { mx, my, angle } = midOf(a, b);
            return (
              <g key={i}>
                <path
                  d={d}
                  className="wire-hit"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedWire(i);
                    onSelect(null);
                  }}
                />
                <path
                  d={d}
                  className={`wire${flowing ? " flowing" : ""}${selectedWire === i ? " wire-selected" : ""}${flowing && !forward ? " reverse" : ""}`}
                />
                {flowing && (
                  <polygon
                    points="-5,-4 5,0 -5,4"
                    className="current-arrow"
                    transform={`translate(${mx} ${my}) rotate(${forward ? angle : angle + 180})`}
                  />
                )}
              </g>
            );
          })}
          {dragWire && anchorOf(dragWire.from) && (
            <path
              d={wirePath(anchorOf(dragWire.from)!, { x: dragWire.x, y: dragWire.y, name: "" })}
              className="wire dragging"
            />
          )}
          {/* Pin hit targets */}
          {Object.entries(anchors).map(([part, pins]) =>
            pins.map((pin) => (
              <circle
                key={`${part}:${pin.name}`}
                cx={pin.x}
                cy={pin.y}
                r={5}
                className={`pin${dragWire ? " pin-active" : ""}`}
                onPointerDown={(e) => onPinPointerDown(e, { part, pin: pin.name })}
              >
                <title>{part === "uno" ? pin.name : `${part}.${pin.name}`}</title>
              </circle>
            )),
          )}
        </svg>
      </div>
    </div>
  );
}
