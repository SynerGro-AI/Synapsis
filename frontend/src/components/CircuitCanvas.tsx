import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  rgbled: 1.2,
  servo: 0.75,
  motor: 1,
  buzzer: 0.9,
  lcd: 0.75,
  dht: 0.85,
  irrecv: 0.9,
  irremote: 0.7,
  stepper: 0.7,
  shiftreg: 0.8,
  imu: 0.8,
  pi: 0.8,
  pc: 1,
};

const ID_PREFIX: Record<PartType, string> = {
  led: "LED",
  resistor: "R",
  potentiometer: "POT",
  pushbutton: "BTN",
  photoresistor: "LDR",
  ntc: "TMP",
  ultrasonic: "SONAR",
  rgbled: "RGB",
  servo: "SERVO",
  motor: "MOTOR",
  buzzer: "BUZZ",
  lcd: "LCD",
  dht: "DHT",
  irrecv: "IR",
  irremote: "REMOTE",
  stepper: "STEP",
  shiftreg: "SR",
  imu: "IMU",
  pi: "PI",
  pc: "PC",
};

/**
 * Raspberry Pi 40-pin GPIO header, in physical pin order 1..40 (matches
 * PART_PINS.pi in engine.ts). Even indices = odd physical pins (top row),
 * odd indices = even physical pins (bottom row). Shared by the wire-anchor
 * table and the on-board drawing so wires land on the gold pins.
 */
const PI_HEADER = [
  "3V3.1", "5V.2", "GPIO2", "5V.4", "GPIO3", "GND.6", "GPIO4", "GPIO14",
  "GND.9", "GPIO15", "GPIO17", "GPIO18", "GPIO27", "GND.14", "GPIO22", "GPIO23",
  "3V3.17", "GPIO24", "GPIO10", "GND.20", "GPIO9", "GPIO25", "GPIO11", "GPIO8",
  "GND.25", "GPIO7", "GPIO0", "GPIO1", "GPIO5", "GND.30", "GPIO6", "GPIO12",
  "GPIO13", "GND.34", "GPIO19", "GPIO16", "GPIO26", "GPIO20", "GND.39", "GPIO21",
];
const PI_HEADER_X0 = 40;
const PI_HEADER_DX = 13;
const PI_ROW_TOP = 30;
const PI_ROW_BOT = 46;

function piHeaderAnchors(): WokwiPinInfo[] {
  return PI_HEADER.map((name, i) => {
    const col = Math.floor(i / 2);
    const top = i % 2 === 0;
    return { name, x: PI_HEADER_X0 + col * PI_HEADER_DX, y: top ? PI_ROW_TOP : PI_ROW_BOT };
  });
}


/** Custom parts without wokwi elements provide their own pin anchors. */
const FALLBACK_PINS: Partial<Record<PartType, WokwiPinInfo[]>> = {
  motor: [
    { name: "1", x: 14, y: 66 },
    { name: "2", x: 50, y: 66 },
  ],
  shiftreg: [
    { name: "DS", x: 20, y: 82 },
    { name: "SH_CP", x: 36, y: 82 },
    { name: "ST_CP", x: 52, y: 82 },
    { name: "MR", x: 68, y: 82 },
    { name: "OE", x: 84, y: 82 },
    { name: "VCC", x: 100, y: 82 },
    { name: "GND", x: 116, y: 82 },
  ],
  imu: [
    { name: "VIN", x: 30, y: 88 },
    { name: "GND", x: 55, y: 88 },
    { name: "SDA", x: 80, y: 88 },
    { name: "SCL", x: 105, y: 88 },
  ],
  pi: piHeaderAnchors(),
  pc: [{ name: "USB", x: 122, y: 70 }],
};

/**
 * 74HC595 shift register: a DIP chip whose eight Q outputs are shown as
 * on-board indicator LEDs that light per bit — teaching "3 pins drive 8
 * outputs" without wiring eight separate LEDs.
 */
function ShiftRegVisual({ bits }: { bits: number }) {
  const pins = ["DS", "SH", "ST", "MR", "OE", "5V", "G"];
  return (
    <svg width="130" height="96" viewBox="0 0 130 96">
      {pins.map((label, i) => {
        const x = 20 + i * 16;
        return (
          <g key={label}>
            <rect x={x - 2} y="64" width="4" height="20" fill="#9aa0a6" />
            <text x={x} y="94" textAnchor="middle" fontSize="7" fill="#cfd3d8">
              {label}
            </text>
          </g>
        );
      })}
      <rect x="10" y="8" width="110" height="58" rx="4" fill="#23272e" stroke="#111" strokeWidth="1.5" />
      <path d="M58 8 A7 7 0 0 0 72 8" fill="#111" />
      <text x="65" y="60" textAnchor="middle" fontSize="8" fill="#7a7f87" fontFamily="monospace">
        74HC595
      </text>
      {Array.from({ length: 8 }, (_, i) => {
        const on = (bits >> i) & 1;
        const x = 18 + i * 13.4;
        return (
          <g key={i}>
            {on ? <circle cx={x} cy="26" r="8" fill="#ffb02e" opacity="0.25" /> : null}
            <circle cx={x} cy="26" r="5" fill={on ? "#ffb02e" : "#3a3f47"} stroke="#111" strokeWidth="0.8" />
            <text x={x} y="42" textAnchor="middle" fontSize="6" fill="#8a8f97">
              Q{i}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Simple DC motor visual: a can with a fan that spins at PWM speed. */
function MotorVisual({ speed }: { speed: number }) {
  return (
    <svg width="64" height="70" viewBox="0 0 64 70">
      <circle cx="32" cy="32" r="28" fill="#8a8a8a" stroke="#555" strokeWidth="2" />
      <circle cx="32" cy="32" r="9" fill="#444" />
      <g
        style={{
          transformOrigin: "32px 32px",
          animation: speed > 0 ? `motor-spin ${Math.max(0.15, 1.3 - speed * 1.15)}s linear infinite` : "none",
        }}
      >
        {[0, 120, 240].map((deg) => (
          <ellipse
            key={deg}
            cx="32"
            cy="15"
            rx="6"
            ry="14"
            fill="#d8d2c0"
            stroke="#777"
            transform={`rotate(${deg} 32 32)`}
          />
        ))}
      </g>
      <rect x="10" y="60" width="8" height="10" fill="#c0392b" />
      <rect x="46" y="60" width="8" height="10" fill="#2c3e50" />
    </svg>
  );
}

/** Adafruit BNO055 breakout: an attitude disc whose bubble slides with roll and
 *  pitch and whose arrow swings to the heading — the board reacts to tilt live. */
function ImuVisual({ heading, pitch, roll }: { heading: number; pitch: number; roll: number }) {
  const rad = Math.PI / 180;
  const R = 22;
  const bx = 65 + Math.sin(roll * rad) * R;
  const by = 34 - Math.sin(pitch * rad) * R;
  return (
    <svg width="130" height="96" viewBox="0 0 130 96">
      {["VIN", "GND", "SDA", "SCL"].map((label, i) => {
        const x = 30 + i * 25;
        return (
          <g key={label}>
            <rect x={x - 2} y="78" width="4" height="14" fill="#c9a227" />
            <text x={x} y="94" textAnchor="middle" fontSize="6.5" fill="#cfd3d8">
              {label}
            </text>
          </g>
        );
      })}
      <rect x="8" y="6" width="114" height="72" rx="5" fill="#0f4a2f" stroke="#0a2e1d" strokeWidth="1.5" />
      <text x="114" y="16" textAnchor="end" fontSize="7" fill="#8fdcae" fontFamily="monospace">
        BNO055
      </text>
      <circle cx="65" cy="34" r={R + 3} fill="#0a3320" stroke="#1c6b45" strokeWidth="1.5" />
      <line x1="65" y1={34 - R} x2="65" y2={34 + R} stroke="#1c6b45" strokeWidth="0.7" />
      <line x1={65 - R} y1="34" x2={65 + R} y2="34" stroke="#1c6b45" strokeWidth="0.7" />
      <g transform={`rotate(${heading} 65 34)`}>
        <polygon points="65,15 61,34 69,34" fill="#ffb02e" />
        <rect x="63.5" y="34" width="3" height="15" fill="#c9862a" />
      </g>
      <circle cx={bx} cy={by} r="4" fill="#7fe0ff" stroke="#0a2e1d" strokeWidth="0.8" />
      <text x="65" y="74" textAnchor="middle" fontSize="6" fill="#9fe8c2" fontFamily="monospace">
        {`H${Math.round(heading)} P${Math.round(pitch)} R${Math.round(roll)}`}
      </text>
    </svg>
  );
}

/** The learner's laptop, linked to the Uno by the USB serial cable. Purely a
 *  visual anchor for the bridge lessons — the USB pin lets the canvas draw the
 *  cable, but the serial transport never depends on it being wired. */
function PcVisual() {
  return (
    <svg width="140" height="100" viewBox="0 0 140 100">
      {/* screen */}
      <rect x="18" y="8" width="90" height="58" rx="4" fill="#1a1d22" stroke="#0a0c0f" strokeWidth="2" />
      <rect x="24" y="14" width="78" height="46" rx="2" fill="#0d47a1" />
      <text x="63" y="42" textAnchor="middle" fontSize="10" fill="#8fd0ff" fontFamily="monospace">
        &gt;_
      </text>
      {/* hinge + keyboard base */}
      <path d="M8 78 L118 78 L108 66 L18 66 Z" fill="#2a2e35" stroke="#14161a" strokeWidth="1.5" />
      <rect x="52" y="70" width="22" height="4" rx="2" fill="#14161a" />
      {/* USB serial port + cable stub on the right, at FALLBACK_PINS.pc */}
      <rect x="112" y="66" width="14" height="8" rx="1" fill="#3a3f47" stroke="#20242a" />
      <rect x="119" y="67" width="9" height="6" fill="#c9a227" />
    </svg>
  );
}

/** Raspberry Pi 4 board: green PCB with the 40-pin GPIO header the learner wires
 *  into. Powered boards show a solid red PWR LED and a green ACT LED. The gold
 *  header pins are drawn at the same coordinates as FALLBACK_PINS.pi so dropped
 *  wires land exactly on them. */
function RaspberryPiVisual() {
  return (
    <svg width="320" height="200" viewBox="0 0 320 200">
      {/* PCB */}
      <rect x="6" y="6" width="308" height="188" rx="10" fill="#0f5a34" stroke="#0a3a22" strokeWidth="2" />
      {/* mounting holes */}
      {[[20, 20], [300, 20], [20, 180], [300, 180]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="#0a2e1d" stroke="#1c6b45" strokeWidth="1.5" />
      ))}
      {/* SoC */}
      <rect x="118" y="98" width="66" height="62" rx="4" fill="#1a1a1a" stroke="#000" strokeWidth="1.5" />
      <text x="151" y="133" textAnchor="middle" fontSize="9" fill="#8fdcae" fontFamily="monospace">
        BCM2711
      </text>
      {/* USB + ethernet ports */}
      <rect x="250" y="86" width="58" height="26" rx="2" fill="#3a3a3a" stroke="#222" />
      <rect x="250" y="118" width="58" height="26" rx="2" fill="#3a3a3a" stroke="#222" />
      <rect x="250" y="152" width="44" height="26" rx="2" fill="#b0b0b0" stroke="#777" />
      {/* PWR (solid red) + ACT (green) status LEDs — a powered Pi */}
      <circle cx="16" cy="74" r="4" fill="#ff4136" stroke="#7a0f0a" strokeWidth="0.8" />
      <text x="24" y="77" fontSize="6.5" fill="#cfd3d8" fontFamily="monospace">PWR</text>
      <circle cx="16" cy="88" r="4" fill="#2ecc40" stroke="#0a5a1c" strokeWidth="0.8" />
      <text x="24" y="91" fontSize="6.5" fill="#cfd3d8" fontFamily="monospace">ACT</text>
      {/* board name */}
      <text x="151" y="184" textAnchor="middle" fontSize="8" fill="#8fdcae" fontFamily="monospace">
        Raspberry Pi 4
      </text>
      {/* 40-pin GPIO header */}
      <rect x="28" y="18" width="272" height="42" rx="3" fill="#111" stroke="#000" strokeWidth="1" />
      {PI_HEADER.map((name, i) => {
        const col = Math.floor(i / 2);
        const top = i % 2 === 0;
        const x = PI_HEADER_X0 + col * PI_HEADER_DX;
        const y = top ? PI_ROW_TOP : PI_ROW_BOT;
        const isPwr = name.startsWith("3V3") || name.startsWith("5V");
        const isGnd = name.startsWith("GND");
        const fill = isGnd ? "#555" : isPwr ? "#c0392b" : "#d9b310";
        return (
          <rect key={name} x={x - 3} y={y - 3} width="6" height="6" rx="1" fill={fill} stroke="#7a5c00" strokeWidth="0.5" />
        );
      })}
      {/* pin-1 marker */}
      <text x={PI_HEADER_X0} y="14" textAnchor="middle" fontSize="6" fill="#ffd479" fontFamily="monospace">
        1
      </text>
    </svg>
  );
}

/** 16x2 character buffer for the wokwi LCD element. */
function lcdCharacters(lines: [string, string]): Uint8Array {
  const buf = new Uint8Array(32).fill(32);
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 16; col++) {
      const ch = lines[row]?.charCodeAt(col);
      if (ch && ch < 256) buf[row * 16 + col] = ch;
    }
  return buf;
}

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
  /** LED id -> brightness 0..1 */
  ledLevels: Map<string, number>;
  currentWires: Map<number, boolean>;
  rgbLevels: Map<string, { r: number; g: number; b: number }>;
  servoAngles: Map<string, number>;
  stepperAngles: Map<string, number>;
  shiftBits: Map<string, number>;
  motorSpeeds: Map<string, number>;
  /** Live IMU orientation (one shared tilt for all BNO055 parts). */
  imuOrient: { heading: number; pitch: number; roll: number };
  buzzerFreqs: Map<string, number>;
  lcdLines: [string, string] | null;
  selected: string | null;
  onSelect: (partId: string | null) => void;
  onButtonChange: (partId: string, pressed: boolean) => void;
  /** Fired when a remote button is pressed, carrying its NEC command byte. */
  onIrButton: (code: number) => void;
  boardLed: boolean;
}

const UNO_POS = { x: 16, y: 10 };

export default function CircuitCanvas({
  palette,
  circuit,
  onCircuitChange,
  ledLevels,
  currentWires,
  rgbLevels,
  servoAngles,
  stepperAngles,
  shiftBits,
  motorSpeeds,
  imuOrient,
  buzzerFreqs,
  lcdLines,
  selected,
  onSelect,
  onButtonChange,
  onIrButton,
  boardLed,
}: CircuitCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [anchors, setAnchors] = useState<Record<string, PinAnchor[]>>({});
  const [dragWire, setDragWire] = useState<{ from: Terminal; x: number; y: number } | null>(null);
  const [dragPart, setDragPart] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [selectedWire, setSelectedWire] = useState<number | null>(null);
  const [hoverPin, setHoverPin] = useState<{ t: Terminal; x: number; y: number } | null>(null);
  // Board headers are dense (Uno digital pins sit ~6px apart at base scale),
  // so let the learner zoom in to target one pin without hitting its neighbor.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const zoomFocusRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);

  // Zoom about a focal point: keep stage coords (sx,sy) under canvas point
  // (cx,cy). Defaults to the visible center (used by the +/- buttons).
  const applyZoom = useCallback((next: number, cx?: number, cy?: number) => {
    const el = containerRef.current;
    if (!el) return;
    const z = zoomRef.current;
    const nz = Math.min(3, Math.max(1, Math.round(next * 100) / 100));
    if (nz === z) return;
    const fx = cx ?? el.clientWidth / 2;
    const fy = cy ?? el.clientHeight / 2;
    zoomFocusRef.current = { sx: (el.scrollLeft + fx) / z, sy: (el.scrollTop + fy) / z, cx: fx, cy: fy };
    setZoom(nz);
  }, []);

  // After the zoom transform re-renders, pan so the focal point stays put.
  useLayoutEffect(() => {
    const f = zoomFocusRef.current;
    const el = containerRef.current;
    if (!f || !el) return;
    el.scrollLeft = f.sx * zoom - f.cx;
    el.scrollTop = f.sy * zoom - f.cy;
    zoomFocusRef.current = null;
  }, [zoom]);

  // Ctrl/⌘ + wheel zooms toward the cursor; plain wheel scrolls the canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      applyZoom(zoomRef.current - Math.sign(e.deltaY) * 0.25, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

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
      if (wrapper.dataset.partType === "irremote") return; // remote has no wiring pins
      const el = wrapper.firstElementChild as (HTMLElement & { pinInfo?: WokwiPinInfo[] }) | null;
      let pinInfo = el?.pinInfo;
      if (!pinInfo || !pinInfo.length)
        pinInfo = FALLBACK_PINS[wrapper.dataset.partType as PartType];
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

  /** Closest pin within radius — used for hover magnifier AND wire drop, so
   *  the pin shown in the magnifier is exactly the one a release connects. */
  const nearestPin = useCallback(
    (pt: { x: number; y: number }, radius = 16) => {
      let best: { t: Terminal; x: number; y: number; d: number } | null = null;
      for (const [part, pins] of Object.entries(anchors))
        for (const pin of pins) {
          const d = Math.hypot(pin.x - pt.x, pin.y - pt.y);
          if (d < radius && (!best || d < best.d))
            best = { t: { part, pin: pin.name }, x: pin.x, y: pin.y, d };
        }
      return best;
    },
    [anchors],
  );

  const pinLabelText = (t: Terminal) => {
    if (t.part !== "uno") return `${t.part} — ${t.pin}`;
    if (t.pin.startsWith("GND")) return "GND";
    if (/^\d+$/.test(t.pin)) return `pin ${t.pin}`;
    return t.pin;
  };

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

  // ---- Part dragging + wire drawing ----
  // Grabs are "global": pointerdown anywhere near a pin (even over a part
  // body) starts a wire, and moves/releases are tracked on window so the
  // drag survives leaving the canvas. While dragging, the wire end snaps
  // onto the candidate pin so it sits straight before you release.
  const GRAB_RADIUS = 14;
  const SNAP_RADIUS = 22;

  function containerPoint(e: { clientX: number; clientY: number }) {
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    const z = zoomRef.current;
    // Map screen point -> unscaled stage coords (anchors live in stage space,
    // which the zoom transform scales from the top-left; scroll pans it).
    return {
      x: (e.clientX - rect.left + el.scrollLeft) / z,
      y: (e.clientY - rect.top + el.scrollTop) / z,
    };
  }

  const dragWireRef = useRef(dragWire);
  dragWireRef.current = dragWire;
  const dragPartRef = useRef(dragPart);
  dragPartRef.current = dragPart;
  const nearestPinRef = useRef(nearestPin);
  nearestPinRef.current = nearestPin;

  function startWireAt(pt: { x: number; y: number }): boolean {
    const near = nearestPin(pt, GRAB_RADIUS);
    if (!near) return false;
    setDragWire({ from: near.t, x: near.x, y: near.y });
    setSelectedWire(null);
    setHoverPin({ t: near.t, x: near.x, y: near.y });
    return true;
  }

  function onPartPointerDown(e: React.PointerEvent, partId: string) {
    e.stopPropagation();
    const pt = containerPoint(e);
    if (startWireAt(pt)) return; // pins win over part-dragging
    if (partId === "uno") {
      onSelect("uno");
      return;
    }
    const part = circuit.parts.find((p) => p.id === partId)!;
    setDragPart({ id: partId, dx: pt.x - part.x, dy: pt.y - part.y });
    onSelect(partId);
    setSelectedWire(null);
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    const pt = containerPoint(e);
    if (startWireAt(pt)) return;
    onSelect(null);
    setSelectedWire(null);
  }

  // Hover magnifier while idle (drags are handled by the window listeners).
  function onPointerMove(e: React.PointerEvent) {
    if (dragWireRef.current || dragPartRef.current) return;
    const near = nearestPin(containerPoint(e), SNAP_RADIUS);
    setHoverPin(near ? { t: near.t, x: near.x, y: near.y } : null);
  }

  // Global move/up while a drag is active.
  useEffect(() => {
    if (!dragWire && !dragPart) return;

    const move = (e: PointerEvent) => {
      const pt = containerPoint(e);
      const part = dragPartRef.current;
      if (part) {
        onCircuitChange({
          ...circuitRef.current,
          parts: circuitRef.current.parts.map((p) =>
            p.id === part.id
              ? { ...p, x: Math.max(0, pt.x - part.dx), y: Math.max(0, pt.y - part.dy) }
              : p,
          ),
        });
        setHoverPin(null);
        return;
      }
      const wire = dragWireRef.current;
      if (wire) {
        const near = nearestPinRef.current(pt, SNAP_RADIUS);
        // Snap the wire end onto the candidate pin.
        setDragWire({ ...wire, x: near ? near.x : pt.x, y: near ? near.y : pt.y });
        setHoverPin(near ? { t: near.t, x: near.x, y: near.y } : null);
      }
    };

    const up = (e: PointerEvent) => {
      const wire = dragWireRef.current;
      if (wire) {
        const near = nearestPinRef.current(containerPoint(e), SNAP_RADIUS);
        if (
          near &&
          !(near.t.part === wire.from.part && near.t.pin === wire.from.pin)
        ) {
          onCircuitChange({
            ...circuitRef.current,
            wires: [...circuitRef.current.wires, { from: wire.from, to: near.t }],
          });
        }
        setDragWire(null);
      }
      setDragPart(null);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!dragWire, !!dragPart]);

  // ---- Pushbutton press + IR remote events from the wokwi elements ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const cleanups: (() => void)[] = [];
    container.querySelectorAll<HTMLElement>("[data-part-id]").forEach((wrapper) => {
      const id = wrapper.dataset.partId!;
      const part = circuit.parts.find((p) => p.id === id);
      const el = wrapper.firstElementChild as HTMLElement;
      if (part?.type === "pushbutton") {
        const press = () => onButtonChange(id, true);
        const release = () => onButtonChange(id, false);
        el.addEventListener("button-press", press);
        el.addEventListener("button-release", release);
        cleanups.push(() => {
          el.removeEventListener("button-press", press);
          el.removeEventListener("button-release", release);
        });
      } else if (part?.type === "irremote") {
        // wokwi-ir-remote fires button-press with detail.irCode = NEC command byte.
        const press = (e: Event) => {
          const code = (e as CustomEvent).detail?.irCode;
          if (typeof code === "number") onIrButton(code);
        };
        el.addEventListener("button-press", press);
        cleanups.push(() => el.removeEventListener("button-press", press));
      }
    });
    return () => cleanups.forEach((fn) => fn());
  }, [circuit.parts, onButtonChange, onIrButton]);

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
    const rgb = rgbLevels.get(id);
    return (
      <div
        key={id}
        data-part-id={id}
        data-part-type={type}
        data-scale={scale}
        draggable={false}
        className={`part${isSelected ? " selected" : ""}`}
        style={{ left: x, top: y, transform: `scale(${scale})` }}
        onPointerDown={(e) => onPartPointerDown(e, id)}
      >
        {type === "uno" && <wokwi-arduino-uno led13={boardLed} ledPower={true} />}
        {type === "led" && (
          <wokwi-led
            color="red"
            value={(ledLevels.get(id) ?? 0) > 0}
            brightness={ledLevels.get(id) ?? 0}
            label={id}
          />
        )}
        {type === "resistor" && <wokwi-resistor value="220" />}
        {type === "potentiometer" && <wokwi-potentiometer />}
        {type === "pushbutton" && <wokwi-pushbutton color="green" />}
        {type === "photoresistor" && <wokwi-photoresistor-sensor />}
        {type === "ntc" && <wokwi-ntc-temperature-sensor />}
        {type === "ultrasonic" && <wokwi-hc-sr04 />}
        {type === "rgbled" && (
          <wokwi-rgb-led ledRed={rgb?.r ?? 0} ledGreen={rgb?.g ?? 0} ledBlue={rgb?.b ?? 0} />
        )}
        {type === "servo" && <wokwi-servo angle={servoAngles.get(id) ?? 0} />}
        {type === "motor" && <MotorVisual speed={motorSpeeds.get(id) ?? 0} />}
        {type === "buzzer" && <wokwi-buzzer hasSignal={(buzzerFreqs.get(id) ?? 0) > 0} />}
        {type === "lcd" && (
          <wokwi-lcd1602
            pins="full"
            backlight={true}
            characters={lcdCharacters(lcdLines ?? ["", ""])}
          />
        )}
        {type === "dht" && <wokwi-dht22 />}
        {type === "irrecv" && <wokwi-ir-receiver />}
        {type === "irremote" && <wokwi-ir-remote />}
        {type === "stepper" && (
          <wokwi-stepper-motor angle={stepperAngles.get(id) ?? 0} />
        )}
        {type === "shiftreg" && <ShiftRegVisual bits={shiftBits.get(id) ?? 0} />}
        {type === "imu" && (
          <ImuVisual heading={imuOrient.heading} pitch={imuOrient.pitch} roll={imuOrient.roll} />
        )}
        {type === "pi" && <RaspberryPiVisual />}
        {type === "pc" && <PcVisual />}
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
        <span className="zoom-controls" title="Zoom in to separate closely-spaced pins (Ctrl + scroll)">
          <button className="zoom-btn" onClick={() => applyZoom(zoom - 0.25)} disabled={zoom <= 1} aria-label="Zoom out">−</button>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => applyZoom(zoom + 0.25)} disabled={zoom >= 3} aria-label="Zoom in">+</button>
          {zoom > 1 && (
            <button className="zoom-btn zoom-reset" onClick={() => applyZoom(1)} aria-label="Reset zoom">⤢</button>
          )}
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="wokwi-canvas"
        onPointerMove={onPointerMove}
        onPointerDown={onCanvasPointerDown}
        onPointerLeave={() => {
          if (!dragWireRef.current && !dragPartRef.current) setHoverPin(null);
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        <div
          className="wokwi-stage"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
        >
          {/* The Uno is the fixed board for Arduino lessons. Python/Pi lessons
              supply their own board from the tray, so hide it there. */}
          {!palette.includes("pi") && renderPart("uno", "uno", UNO_POS.x, UNO_POS.y)}
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
          {/* Pin markers (grabbing is global: pointerdown near any pin starts a wire) */}
          {Object.entries(anchors).map(([part, pins]) =>
            pins.map((pin) => (
              <circle
                key={`${part}:${pin.name}`}
                cx={pin.x}
                cy={pin.y}
                r={5}
                className={`pin${dragWire ? " pin-active" : ""}`}
              >
                <title>{part === "uno" ? pin.name : `${part}.${pin.name}`}</title>
              </circle>
            )),
          )}
          {/* Magnifier ring on the pin the cursor would connect to */}
          {hoverPin && (
            <circle cx={hoverPin.x} cy={hoverPin.y} r={9} className="pin-hover" />
          )}
        </svg>
        </div>

        {/* Magnifier label — readable pin name before you let go. Sits outside
            the scaled stage, so multiply the stage coords by the zoom. */}
        {hoverPin && (
          <div
            className="pin-tooltip"
            style={{ left: hoverPin.x * zoom, top: hoverPin.y * zoom - 16 }}
          >
            {pinLabelText(hoverPin.t)}
          </div>
        )}
      </div>
    </div>
  );
}
