// Circuit model + electrical rules engine.
// The canvas builds a CircuitState (parts + wires); this module turns it into
// nets, validates it, cross-checks it against the sketch, and answers runtime
// questions from the simulator (is this LED lit? what does analogRead see?).

export type PartType =
  | "led"
  | "resistor"
  | "potentiometer"
  | "pushbutton"
  | "photoresistor"
  | "ntc"
  | "ultrasonic";

export interface PlacedPart {
  id: string;
  type: PartType;
  x: number;
  y: number;
}

export interface Terminal {
  part: string; // part id, or "uno" for the board
  pin: string;
}

export interface Wire {
  from: Terminal;
  to: Terminal;
}

export interface CircuitState {
  parts: PlacedPart[];
  wires: Wire[];
}

export interface Diagnosis {
  level: "error" | "warn" | "ok" | "info";
  source: "circuit" | "code" | "both";
  message: string;
}

export interface SketchInfo {
  parseError?: string;
  digitalWrites: number[];
  digitalReads: number[];
  analogReads: number[];
  pulseIns: number[];
  pinModes: Map<number, string>;
}

export interface WorldState {
  pressed: Set<string>; // pushbutton part ids currently held
  potValue: number; // 0-1023
  lightPct: number; // 0-100
  tempC: number; // -24..80
  distanceCm: number; // 2..400
}

export const PART_PINS: Record<PartType, string[]> = {
  led: ["A", "C"],
  resistor: ["1", "2"],
  potentiometer: ["GND", "SIG", "VCC"],
  pushbutton: ["1.l", "2.l", "1.r", "2.r"],
  photoresistor: ["VCC", "GND", "DO", "AO"],
  ntc: ["GND", "VCC", "OUT"],
  ultrasonic: ["VCC", "TRIG", "ECHO", "GND"],
};

export const PART_LABELS: Record<PartType, string> = {
  led: "LED",
  resistor: "Resistor",
  potentiometer: "Potentiometer",
  pushbutton: "Pushbutton",
  photoresistor: "Light sensor",
  ntc: "Temp sensor",
  ultrasonic: "Ultrasonic",
};

export const UNO_DIGITAL = Array.from({ length: 14 }, (_, i) => String(i));
export const UNO_ANALOG = ["A0", "A1", "A2", "A3", "A4", "A5"];
export const UNO_PINS = [...UNO_DIGITAL, ...UNO_ANALOG, "5V", "3.3V", "GND.1", "GND.2", "GND.3"];

const key = (t: Terminal) => `${t.part}:${t.pin}`;

/** Pin number as used in sketches: 0-13 digital, 14-19 = A0-A5. */
export function pinNumber(pin: string): number | null {
  if (/^\d+$/.test(pin)) return Number(pin);
  const m = /^A([0-5])$/.exec(pin);
  if (m) return 14 + Number(m[1]);
  return null;
}

export function pinLabel(n: number): string {
  return n >= 14 ? `A${n - 14}` : String(n);
}

// ---------- Netlist (union-find) ----------

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    let root = this.parent.get(x) ?? x;
    if (root !== x) {
      root = this.find(root);
      this.parent.set(x, root);
    }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export class Circuit {
  readonly parts: Map<string, PlacedPart>;
  readonly wires: Wire[];
  private uf = new UnionFind();

  constructor(state: CircuitState) {
    this.parts = new Map(state.parts.map((p) => [p.id, p]));
    this.wires = state.wires;

    // Board ground pins are one node.
    this.uf.union("uno:GND.1", "uno:GND.2");
    this.uf.union("uno:GND.1", "uno:GND.3");
    // Pushbutton legs: each row's left/right legs are internally joined.
    for (const p of state.parts)
      if (p.type === "pushbutton") {
        this.uf.union(`${p.id}:1.l`, `${p.id}:1.r`);
        this.uf.union(`${p.id}:2.l`, `${p.id}:2.r`);
      }
    for (const w of state.wires) this.uf.union(key(w.from), key(w.to));
  }

  net(t: Terminal): string {
    return this.uf.find(key(t));
  }
  netOf(part: string, pin: string): string {
    return this.net({ part, pin });
  }
  get gnd(): string {
    return this.netOf("uno", "GND.1");
  }
  get v5(): string {
    return this.netOf("uno", "5V");
  }

  /** Which digital/analog pin numbers share a net with the given terminal. */
  unoPinsOnNet(net: string): number[] {
    const result: number[] = [];
    for (const pin of [...UNO_DIGITAL, ...UNO_ANALOG]) {
      const n = pinNumber(pin);
      if (n !== null && this.netOf("uno", pin) === net) result.push(n);
    }
    return result;
  }

  partsByType(type: PartType): PlacedPart[] {
    return [...this.parts.values()].filter((p) => p.type === type);
  }
}

// ---------- Conduction paths (for LED lighting + current arrows) ----------

interface PathResult {
  /** wires traversed, with direction: true = from->to order of the stored wire */
  wires: { index: number; forward: boolean }[];
  resistors: number;
  sourcePin: number | "5V" | null;
}

/**
 * Search from an LED's anode back to a source (digital pin or 5V) and from its
 * cathode to GND, moving across wires and through resistors/pressed buttons.
 */
function tracePath(
  circuit: Circuit,
  start: Terminal,
  isGoal: (t: Terminal) => boolean,
  pressed: Set<string>,
  buttonsConduct: boolean,
): { wires: { index: number; forward: boolean }[]; resistors: number; goal: Terminal } | null {
  interface Node {
    t: Terminal;
    wires: { index: number; forward: boolean }[];
    resistors: number;
  }
  const queue: Node[] = [{ t: start, wires: [], resistors: 0 }];
  const seen = new Set<string>([key(start)]);

  while (queue.length) {
    const node = queue.shift()!;
    if (isGoal(node.t)) return { wires: node.wires, resistors: node.resistors, goal: node.t };

    const push = (t: Terminal, wire: { index: number; forward: boolean } | null, resistors = 0) => {
      const k = key(t);
      if (seen.has(k)) return;
      seen.add(k);
      queue.push({
        t,
        wires: wire ? [...node.wires, wire] : node.wires,
        resistors: node.resistors + resistors,
      });
    };

    // Across wires attached to this exact terminal or its internally-tied legs
    circuit.wires.forEach((w, index) => {
      const sameNode = (a: Terminal, b: Terminal) =>
        a.part === b.part &&
        (a.pin === b.pin ||
          // pushbutton legs of the same row are one node
          (circuit.parts.get(a.part)?.type === "pushbutton" &&
            a.pin[0] === b.pin[0]));
      if (sameNode(w.from, node.t)) push(w.to, { index, forward: true });
      else if (sameNode(w.to, node.t)) push(w.from, { index, forward: false });
    });

    // Through components
    const part = circuit.parts.get(node.t.part);
    if (part) {
      if (part.type === "resistor") {
        const other = node.t.pin === "1" ? "2" : "1";
        push({ part: part.id, pin: other }, null, 1);
      } else if (part.type === "pushbutton") {
        if (buttonsConduct || pressed.has(part.id)) {
          const otherRow = node.t.pin[0] === "1" ? "2.l" : "1.l";
          push({ part: part.id, pin: otherRow }, null, 0);
        }
      }
    }
    // Uno GND pins are one node
    if (node.t.part === "uno" && node.t.pin.startsWith("GND.")) {
      for (const g of ["GND.1", "GND.2", "GND.3"])
        if (g !== node.t.pin) push({ part: "uno", pin: g }, null, 0);
    }
  }
  return null;
}

export function ledPath(
  circuit: Circuit,
  ledId: string,
  highPins: Set<number>,
  pressed: Set<string>,
  buttonsConduct: boolean,
): PathResult | null {
  const isSource = (t: Terminal) => {
    if (t.part !== "uno") return false;
    if (t.pin === "5V") return true;
    const n = pinNumber(t.pin);
    return n !== null && n <= 13 && highPins.has(n);
  };
  const isGnd = (t: Terminal) => t.part === "uno" && t.pin.startsWith("GND.");

  const up = tracePath(circuit, { part: ledId, pin: "A" }, isSource, pressed, buttonsConduct);
  if (!up) return null;
  const down = tracePath(circuit, { part: ledId, pin: "C" }, isGnd, pressed, buttonsConduct);
  if (!down) return null;

  // Current flows source -> anode (reverse the upward trace) -> cathode -> GND.
  const wires = [
    ...up.wires
      .slice()
      .reverse()
      .map((w) => ({ index: w.index, forward: !w.forward })),
    ...down.wires,
  ];
  const sourcePin =
    up.goal.pin === "5V" ? ("5V" as const) : pinNumber(up.goal.pin);
  return { wires, resistors: up.resistors + down.resistors, sourcePin };
}

// ---------- Validation + code cross-check ----------

export function validate(
  state: CircuitState,
  sketch: SketchInfo | null,
  required: PartType[],
): Diagnosis[] {
  const c = new Circuit(state);
  const out: Diagnosis[] = [];
  const err = (source: Diagnosis["source"], message: string) =>
    out.push({ level: "error", source, message });
  const warn = (source: Diagnosis["source"], message: string) =>
    out.push({ level: "warn", source, message });

  // Required parts present?
  for (const type of required)
    if (c.partsByType(type).length === 0)
      err("circuit", `This lesson needs a ${PART_LABELS[type]} — add one from the parts tray.`);

  // Direct short: 5V wired straight to GND
  if (c.v5 === c.gnd)
    err("circuit", "Short circuit! 5V is wired directly to GND — current would bypass everything and overheat the board.");

  // Floating essential terminals
  const essentials: Partial<Record<PartType, string[]>> = {
    led: ["A", "C"],
    resistor: ["1", "2"],
    potentiometer: ["VCC", "SIG", "GND"],
    photoresistor: ["VCC", "GND", "AO"],
    ntc: ["VCC", "GND", "OUT"],
    ultrasonic: ["VCC", "TRIG", "ECHO", "GND"],
  };
  const wiredTerminals = new Set<string>();
  for (const w of state.wires) {
    wiredTerminals.add(key(w.from));
    wiredTerminals.add(key(w.to));
  }
  const isTerminalWired = (part: string, pin: string, type: PartType) => {
    if (wiredTerminals.has(`${part}:${pin}`)) return true;
    if (type === "pushbutton")
      return wiredTerminals.has(`${part}:${pin[0]}.l`) || wiredTerminals.has(`${part}:${pin[0]}.r`);
    return false;
  };
  for (const p of c.parts.values()) {
    for (const pin of essentials[p.type] ?? [])
      if (!isTerminalWired(p.id, pin, p.type))
        err("circuit", `${p.id}: the ${pin} pin isn't connected to anything — current can't flow through an open circuit.`);
    if (p.type === "pushbutton") {
      const side1 = isTerminalWired(p.id, "1.l", p.type);
      const side2 = isTerminalWired(p.id, "2.l", p.type);
      if (!side1 || !side2)
        err("circuit", `${p.id}: both sides of the button need a wire (one side to a pin, the other side to GND).`);
    }
  }

  // Sensor power rails
  for (const p of c.parts.values()) {
    const powered: Partial<Record<PartType, [string, string]>> = {
      photoresistor: ["VCC", "GND"],
      ntc: ["VCC", "GND"],
      ultrasonic: ["VCC", "GND"],
    };
    const pins = powered[p.type];
    if (pins) {
      const [vcc, gnd] = pins;
      if (isTerminalWired(p.id, vcc, p.type) && c.netOf(p.id, vcc) !== c.v5)
        err("circuit", `${p.id}: VCC must be wired to the 5V pin — the sensor has no power.`);
      if (isTerminalWired(p.id, gnd, p.type) && c.netOf(p.id, gnd) !== c.gnd)
        err("circuit", `${p.id}: the sensor's GND must be wired to a GND pin to complete its circuit.`);
    }
    if (p.type === "potentiometer") {
      const vNet = c.netOf(p.id, "VCC");
      const gNet = c.netOf(p.id, "GND");
      const ok =
        (vNet === c.v5 && gNet === c.gnd) || (vNet === c.gnd && gNet === c.v5);
      if (isTerminalWired(p.id, "VCC", p.type) && isTerminalWired(p.id, "GND", p.type) && !ok)
        err("circuit", `${p.id}: the outer pins must go to 5V and GND to form a voltage divider.`);
    }
  }

  // LED wiring science
  for (const led of c.partsByType("led")) {
    const anodeOk = isTerminalWired(led.id, "A", "led");
    const cathodeOk = isTerminalWired(led.id, "C", "led");
    if (!anodeOk || !cathodeOk) continue; // already reported as floating

    const allHigh = new Set(Array.from({ length: 14 }, (_, i) => i));
    const forward = ledPath(c, led.id, allHigh, new Set(), true);
    if (forward) {
      if (forward.resistors === 0)
        err("circuit", `${led.id} has NO current-limiting resistor in its path! An LED barely resists current once conducting — Ohm's law says it would draw far over 20mA and burn out. Put a 220Ω resistor in series.`);
    } else {
      // Reversed? Try swapping anode/cathode roles.
      const isSource = (t: Terminal) =>
        t.part === "uno" && (t.pin === "5V" || (pinNumber(t.pin) ?? 99) <= 13);
      const isGnd = (t: Terminal) => t.part === "uno" && t.pin.startsWith("GND.");
      const revUp = tracePath(c, { part: led.id, pin: "C" }, isSource, new Set(), true);
      const revDown = tracePath(c, { part: led.id, pin: "A" }, isGnd, new Set(), true);
      if (revUp && revDown)
        err("circuit", `${led.id} is REVERSED. A diode only conducts one way: the anode (A, long leg) must face the pin/5V side and the cathode (C) must face GND. Flip the two wires.`);
      else
        err("circuit", `${led.id} has no complete path: the anode must reach a digital pin (through the resistor) and the cathode must reach GND. Current needs a closed loop.`);
    }
  }

  // ---- Code cross-checks ----
  if (sketch) {
    if (sketch.parseError) {
      err("code", `Sketch error: ${sketch.parseError}`);
    } else {
      // digitalWrite pins vs LED wiring
      const leds = c.partsByType("led");
      for (const led of leds) {
        const allHigh = new Set(Array.from({ length: 14 }, (_, i) => i));
        const p = ledPath(c, led.id, allHigh, new Set(), true);
        if (p && typeof p.sourcePin === "number") {
          const wanted = p.sourcePin;
          if (sketch.digitalWrites.length && !sketch.digitalWrites.includes(wanted))
            err("both", `${led.id} is wired to pin ${wanted}, but your code writes pin ${sketch.digitalWrites.map(pinLabel).join(", ")}. Match them: move the wire or change the code.`);
          if (sketch.digitalWrites.includes(wanted) && sketch.pinModes.get(wanted) !== "OUTPUT")
            err("code", `Pin ${wanted} drives the LED but is never set as an output — add pinMode(${wanted}, OUTPUT); in setup().`);
        }
      }
      for (const pin of sketch.digitalWrites) {
        const net = c.netOf("uno", pinLabel(pin));
        const attached = [...c.parts.values()].some((p) =>
          PART_PINS[p.type].some((pn) => c.netOf(p.id, pn) === net),
        );
        if (!attached && pin !== 13)
          warn("both", `Your code writes pin ${pinLabel(pin)}, but nothing is wired to it.`);
        if (net === c.gnd)
          err("circuit", `Pin ${pinLabel(pin)} is wired straight to GND — driving it HIGH is a short circuit through the chip!`);
      }

      // analogRead pins vs sensor outputs
      const sensorOut: [PartType, string, string][] = [
        ["potentiometer", "SIG", "the potentiometer's SIG (wiper) pin"],
        ["photoresistor", "AO", "the light sensor's AO pin"],
        ["ntc", "OUT", "the temp sensor's OUT pin"],
      ];
      for (const pin of sketch.analogReads) {
        const net = c.netOf("uno", pinLabel(pin));
        const found = sensorOut.some(([type, sp]) =>
          c.partsByType(type).some((p) => c.netOf(p.id, sp) === net),
        );
        if (!found) {
          // Is a sensor output wired to a DIFFERENT analog pin?
          let hint = "";
          for (const [type, sp, label] of sensorOut)
            for (const p of c.partsByType(type)) {
              const pins = c.unoPinsOnNet(c.netOf(p.id, sp)).filter((n) => n >= 14);
              if (pins.length) hint = ` (${label} is on ${pinLabel(pins[0])})`;
            }
          err("both", `Your code reads ${pinLabel(pin)}, but no sensor output is wired to it${hint}. analogRead measures the voltage on that exact pin.`);
        }
      }

      // digitalRead vs pushbutton
      for (const pin of sketch.digitalReads) {
        const net = c.netOf("uno", pinLabel(pin));
        const button = c.partsByType("pushbutton").find(
          (p) => c.netOf(p.id, "1.l") === net || c.netOf(p.id, "2.l") === net,
        );
        if (!button) {
          err("both", `Your code reads pin ${pinLabel(pin)}, but no button is wired to it.`);
        } else {
          const otherRow = c.netOf(button.id, "1.l") === net ? "2.l" : "1.l";
          const otherNet = c.netOf(button.id, otherRow);
          if (otherNet === c.gnd) {
            if (sketch.pinModes.get(pin) !== "INPUT_PULLUP")
              warn("code", `The button connects pin ${pinLabel(pin)} to GND — use pinMode(${pinLabel(pin)}, INPUT_PULLUP); or the pin will float and read random noise when the button is released.`);
          } else if (otherNet === c.v5) {
            warn("circuit", `The button's other side goes to 5V. Without an external pull-down resistor the pin floats when released — wiring the button to GND with INPUT_PULLUP is more reliable.`);
          } else {
            err("circuit", `${button.id}: the other side of the button must be wired to GND so pressing it pulls pin ${pinLabel(pin)} LOW.`);
          }
        }
      }

      // pulseIn / ultrasonic
      for (const pin of sketch.pulseIns) {
        const net = c.netOf("uno", pinLabel(pin));
        const sonar = c.partsByType("ultrasonic").find((p) => c.netOf(p.id, "ECHO") === net);
        if (!sonar) {
          err("both", `pulseIn(${pinLabel(pin)}) waits for an echo, but the sensor's ECHO pin isn't wired to pin ${pinLabel(pin)}.`);
        } else {
          const trigPins = c.unoPinsOnNet(c.netOf(sonar.id, "TRIG")).filter((n) => n <= 13);
          if (!trigPins.length)
            err("circuit", `${sonar.id}: TRIG must be wired to a digital pin so your code can send the ping.`);
          else if (sketch.digitalWrites.length && !trigPins.some((t) => sketch.digitalWrites.includes(t)))
            err("both", `${sonar.id}'s TRIG is on pin ${pinLabel(trigPins[0])}, but your code never pulses that pin — no ping means no echo.`);
        }
      }
      for (const sonar of c.partsByType("ultrasonic"))
        if (!sketch.pulseIns.length && sketch.digitalWrites.length)
          warn("code", `The ${sonar.id} sensor needs pulseIn(echoPin, HIGH) in your code to time the echo.`);
    }
  }

  if (!out.some((d) => d.level === "error"))
    out.unshift({
      level: "ok",
      source: "both",
      message: state.wires.length
        ? "✓ Circuit and code agree — press Run and interact with the circuit."
        : "Drag parts from the tray, then draw wires between pins. Diagnostics will guide you here.",
    });

  return out;
}

// ---------- Runtime bridge for the simulator ----------

export class CircuitRuntime {
  private circuit: Circuit;
  private world: WorldState;
  private highPins = new Set<number>();
  constructor(state: CircuitState, world: WorldState) {
    this.circuit = new Circuit(state);
    this.world = world;
  }

  setPin(pin: number, high: boolean): void {
    if (high) this.highPins.add(pin);
    else this.highPins.delete(pin);
  }

  /** Which LEDs are lit right now, and the wires carrying current. */
  outputs(): { lit: Set<string>; current: Map<number, boolean> } {
    const lit = new Set<string>();
    const current = new Map<number, boolean>(); // wire index -> forward?
    for (const led of this.circuit.partsByType("led")) {
      const p = ledPath(this.circuit, led.id, this.highPins, this.world.pressed, false);
      if (p && p.resistors > 0) {
        lit.add(led.id);
        for (const w of p.wires) current.set(w.index, w.forward);
      }
    }
    return { lit, current };
  }

  digitalRead(pin: number, mode: string | undefined): number {
    const net = this.circuit.netOf("uno", pinLabel(pin));
    for (const b of this.circuit.partsByType("pushbutton")) {
      const row = this.circuit.netOf(b.id, "1.l") === net ? "1" : this.circuit.netOf(b.id, "2.l") === net ? "2" : null;
      if (!row) continue;
      const otherNet = this.circuit.netOf(b.id, row === "1" ? "2.l" : "1.l");
      const pressed = this.world.pressed.has(b.id);
      if (otherNet === this.circuit.gnd)
        return pressed ? 0 : mode === "INPUT_PULLUP" ? 1 : Math.round(Math.random()); // floating!
      if (otherNet === this.circuit.v5) return pressed ? 1 : 0;
    }
    return mode === "INPUT_PULLUP" ? 1 : 0;
  }

  analogRead(pin: number): number {
    const net = this.circuit.netOf("uno", pinLabel(pin));
    for (const p of this.circuit.partsByType("potentiometer"))
      if (this.circuit.netOf(p.id, "SIG") === net) return this.world.potValue;
    for (const p of this.circuit.partsByType("photoresistor"))
      if (this.circuit.netOf(p.id, "AO") === net)
        return Math.round((this.world.lightPct / 100) * 1023);
    for (const p of this.circuit.partsByType("ntc"))
      if (this.circuit.netOf(p.id, "OUT") === net)
        return Math.round(((this.world.tempC + 24) / 104) * 1023);
    return 0;
  }

  pulseIn(pin: number): number {
    const net = this.circuit.netOf("uno", pinLabel(pin));
    for (const s of this.circuit.partsByType("ultrasonic")) {
      if (this.circuit.netOf(s.id, "ECHO") !== net) continue;
      const powered =
        this.circuit.netOf(s.id, "VCC") === this.circuit.v5 &&
        this.circuit.netOf(s.id, "GND") === this.circuit.gnd;
      if (!powered) return 0;
      return Math.round(this.world.distanceCm * 58);
    }
    return 0;
  }
}
