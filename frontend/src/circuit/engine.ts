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
  | "ultrasonic"
  | "rgbled"
  | "servo"
  | "motor"
  | "buzzer"
  | "lcd"
  | "dht"
  | "irrecv"
  | "irremote"
  | "stepper"
  | "shiftreg"
  | "imu"
  | "pi";

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
  analogWrites: number[];
  pulseIns: number[];
  servoPins: number[];
  tonePins: number[];
  lcdPins: number[];
  dhtPins: number[];
  irPins: number[];
  stepperPins: number[];
  shiftDataPins: number[];
  shiftClockPins: number[];
  usesImu: boolean;
  pinModes: Map<number, string>;
}

/** What a Python RPi.GPIO sketch does, from a static pass (see analyzePython). */
export interface PySketchInfo {
  parseError?: string;
  mode?: "BCM" | "BOARD";
  outPins: number[]; // BCM pins set up as GPIO.OUT
  inPins: number[]; // BCM pins set up as GPIO.IN
  writes: number[]; // BCM pins driven by GPIO.output(...) (incl. PWM starts)
  pwmPins: number[]; // BCM pins used with GPIO.PWM(...)
  reads: number[]; // BCM pins read via GPIO.input(...)
  pulls: Map<number, "UP" | "DOWN" | "OFF">;
}

export interface WorldState {
  pressed: Set<string>; // pushbutton part ids currently held
  potValue: number; // 0-1023
  lightPct: number; // 0-100
  tempC: number; // -24..80
  humidityPct: number; // 0..100 (DHT11)
  distanceCm: number; // 2..400
  irQueue: number[]; // pending IR command bytes from the remote (FIFO)
  heading: number; // IMU yaw / compass heading 0..360°
  pitch: number; // IMU pitch -90..90°
  roll: number; // IMU roll -90..90°
}

export const PART_PINS: Record<PartType, string[]> = {
  led: ["A", "C"],
  resistor: ["1", "2"],
  potentiometer: ["GND", "SIG", "VCC"],
  pushbutton: ["1.l", "2.l", "1.r", "2.r"],
  photoresistor: ["VCC", "GND", "DO", "AO"],
  ntc: ["GND", "VCC", "OUT"],
  ultrasonic: ["VCC", "TRIG", "ECHO", "GND"],
  rgbled: ["R", "COM", "G", "B"],
  servo: ["GND", "V+", "PWM"],
  motor: ["1", "2"],
  buzzer: ["1", "2"],
  lcd: ["VSS", "VDD", "V0", "RS", "RW", "E", "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "A", "K"],
  dht: ["VCC", "SDA", "NC", "GND"],
  irrecv: ["GND", "VCC", "DAT"],
  irremote: [],
  stepper: ["A-", "A+", "B+", "B-"],
  shiftreg: ["DS", "SH_CP", "ST_CP", "MR", "OE", "VCC", "GND"],
  imu: ["VIN", "GND", "SDA", "SCL"],
  // Raspberry Pi 40-pin header, listed in physical pin order (1..40). Power and
  // ground pins are disambiguated by physical position so every id is unique.
  pi: [
    "3V3.1", "5V.2",
    "GPIO2", "5V.4",
    "GPIO3", "GND.6",
    "GPIO4", "GPIO14",
    "GND.9", "GPIO15",
    "GPIO17", "GPIO18",
    "GPIO27", "GND.14",
    "GPIO22", "GPIO23",
    "3V3.17", "GPIO24",
    "GPIO10", "GND.20",
    "GPIO9", "GPIO25",
    "GPIO11", "GPIO8",
    "GND.25", "GPIO7",
    "GPIO0", "GPIO1",
    "GPIO5", "GND.30",
    "GPIO6", "GPIO12",
    "GPIO13", "GND.34",
    "GPIO19", "GPIO16",
    "GPIO26", "GPIO20",
    "GND.39", "GPIO21",
  ],
};

export const PART_LABELS: Record<PartType, string> = {
  led: "LED",
  resistor: "Resistor",
  potentiometer: "Potentiometer",
  pushbutton: "Pushbutton",
  photoresistor: "Light sensor",
  ntc: "Temp sensor",
  ultrasonic: "Ultrasonic",
  rgbled: "RGB LED",
  servo: "Servo",
  motor: "DC Motor",
  buzzer: "Buzzer",
  lcd: "LCD 16x2",
  dht: "DHT11 temp/humidity",
  irrecv: "IR receiver",
  irremote: "IR remote",
  stepper: "Stepper motor",
  shiftreg: "Shift register 74HC595",
  imu: "BNO055 9-axis IMU",
  pi: "Raspberry Pi 4",
};

export const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);

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

/** BCM GPIO number for a Pi header pin id like "GPIO18", else null (power/ground). */
export function piGpioNumber(pin: string): number | null {
  const m = /^GPIO(\d+)$/.exec(pin);
  return m ? Number(m[1]) : null;
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
    // Raspberry Pi header: all GND pins are one node, all 3V3 one node, all 5V one node.
    for (const p of state.parts)
      if (p.type === "pi") {
        const rails: Record<string, string[]> = { GND: [], "3V3": [], "5V": [] };
        for (const pin of PART_PINS.pi) {
          if (pin.startsWith("GND")) rails.GND.push(pin);
          else if (pin.startsWith("3V3")) rails["3V3"].push(pin);
          else if (pin.startsWith("5V")) rails["5V"].push(pin);
        }
        for (const group of Object.values(rails))
          for (let i = 1; i < group.length; i++)
            this.uf.union(`${p.id}:${group[0]}`, `${p.id}:${group[i]}`);
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

  /** Which Pi BCM GPIO numbers share a net with the given terminal. */
  piGpioPinsOnNet(net: string): number[] {
    const result: number[] = [];
    for (const pi of this.partsByType("pi"))
      for (const pin of PART_PINS.pi) {
        const n = piGpioNumber(pin);
        if (n !== null && this.netOf(pi.id, pin) === net) result.push(n);
      }
    return result;
  }

  /** The net a Pi header pin sits on (first Pi part), or null if no Pi placed. */
  piPinNet(pin: string): string | null {
    const pi = this.partsByType("pi")[0];
    return pi ? this.netOf(pi.id, pin) : null;
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
    // Raspberry Pi header: pins on the same power/ground rail are one node.
    if (part?.type === "pi") {
      const rail = node.t.pin.startsWith("GND")
        ? "GND"
        : node.t.pin.startsWith("3V3")
          ? "3V3"
          : node.t.pin.startsWith("5V")
            ? "5V"
            : null;
      if (rail)
        for (const pin of PART_PINS.pi)
          if (pin !== node.t.pin && pin.startsWith(rail))
            push({ part: part.id, pin }, null, 0);
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
    if (t.part === "uno") {
      if (t.pin === "5V") return true;
      const n = pinNumber(t.pin);
      return n !== null && n <= 13 && highPins.has(n);
    }
    if (circuit.parts.get(t.part)?.type === "pi") {
      if (t.pin.startsWith("3V3") || t.pin.startsWith("5V")) return true;
      const n = piGpioNumber(t.pin);
      return n !== null && highPins.has(n);
    }
    return false;
  };
  const isGnd = (t: Terminal) => {
    if (t.part === "uno") return t.pin.startsWith("GND.");
    return circuit.parts.get(t.part)?.type === "pi" && t.pin.startsWith("GND");
  };

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
    up.goal.part === "uno"
      ? up.goal.pin === "5V"
        ? ("5V" as const)
        : pinNumber(up.goal.pin)
      : up.goal.pin.startsWith("3V3") || up.goal.pin.startsWith("5V")
        ? ("5V" as const)
        : piGpioNumber(up.goal.pin);
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
    rgbled: ["COM"],
    servo: ["GND", "V+", "PWM"],
    motor: ["1", "2"],
    buzzer: ["1", "2"],
    lcd: ["VSS", "VDD", "RS", "E", "D4", "D5", "D6", "D7"],
    dht: ["VCC", "SDA", "GND"],
    irrecv: ["GND", "VCC", "DAT"],
    stepper: ["A-", "A+", "B+", "B-"],
    shiftreg: ["DS", "SH_CP", "ST_CP", "VCC", "GND"],
    imu: ["VIN", "GND", "SDA", "SCL"],
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
      servo: ["V+", "GND"],
      lcd: ["VDD", "VSS"],
      dht: ["VCC", "GND"],
      irrecv: ["VCC", "GND"],
      shiftreg: ["VCC", "GND"],
      imu: ["VIN", "GND"],
    };
    const pins = powered[p.type];
    if (pins) {
      const [vcc, gnd] = pins;
      if (isTerminalWired(p.id, vcc, p.type) && c.netOf(p.id, vcc) !== c.v5)
        err("circuit", `${p.id}: ${vcc} must be wired to the 5V pin — it has no power.`);
      if (isTerminalWired(p.id, gnd, p.type) && c.netOf(p.id, gnd) !== c.gnd)
        err("circuit", `${p.id}: ${gnd} must be wired to a GND pin to complete its circuit.`);
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
      const writes = [...new Set([...sketch.digitalWrites, ...sketch.analogWrites])];

      // analogWrite only works on PWM-capable pins
      for (const pin of sketch.analogWrites)
        if (pin <= 13 && !PWM_PINS.has(pin))
          err("code", `analogWrite needs a PWM pin — on the Uno those are 3, 5, 6, 9, 10, 11 (marked ~). Pin ${pinLabel(pin)} can't do PWM; digitalWrite would only give full on/off.`);

      // digitalWrite pins vs LED wiring
      const leds = c.partsByType("led");
      for (const led of leds) {
        const allHigh = new Set(Array.from({ length: 14 }, (_, i) => i));
        const p = ledPath(c, led.id, allHigh, new Set(), true);
        if (p && typeof p.sourcePin === "number") {
          const wanted = p.sourcePin;
          if (writes.length && !writes.includes(wanted))
            err("both", `${led.id} is wired to pin ${wanted}, but your code writes pin ${writes.map(pinLabel).join(", ")}. Match them: move the wire or change the code.`);
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

      // RGB LED: common cathode to GND, each used leg to a PWM pin
      for (const rgb of c.partsByType("rgbled")) {
        if (isTerminalWired(rgb.id, "COM", "rgbled") && c.netOf(rgb.id, "COM") !== c.gnd)
          err("circuit", `${rgb.id}: COM is the common cathode — wire it to GND so all three colors share a return path.`);
        const legs: [string, string][] = [["R", "red"], ["G", "green"], ["B", "blue"]];
        const isDigitalPin = (t: Terminal) =>
          t.part === "uno" && (pinNumber(t.pin) ?? 99) <= 13;
        let anyLeg = false;
        for (const [leg, color] of legs) {
          if (!isTerminalWired(rgb.id, leg, "rgbled")) continue;
          anyLeg = true;
          const trace = tracePath(c, { part: rgb.id, pin: leg }, isDigitalPin, new Set(), true);
          if (!trace)
            err("circuit", `${rgb.id}: the ${color} leg (${leg}) must reach a digital pin (directly or through a 220Ω resistor).`);
          else {
            const pin = pinNumber(trace.goal.pin)!;
            if (!PWM_PINS.has(pin))
              warn("circuit", `${rgb.id}: the ${color} leg is on pin ${pin}, which has no PWM (~) — you'll only get full on/off for that color.`);
            else if (writes.length && !writes.includes(pin))
              warn("both", `${rgb.id}: the ${color} leg is wired to pin ${pin} but your code never writes that pin.`);
          }
        }
        if (!anyLeg)
          err("circuit", `${rgb.id}: wire at least one color leg (R, G, or B) to a PWM pin.`);
      }

      // Servo: signal pin must match myServo.attach(pin)
      for (const servo of c.partsByType("servo")) {
        const sigPins = c.unoPinsOnNet(c.netOf(servo.id, "PWM")).filter((n) => n <= 13);
        if (isTerminalWired(servo.id, "PWM", "servo") && !sigPins.length)
          err("circuit", `${servo.id}: the PWM (signal) wire must go to a digital pin.`);
        if (sigPins.length && sketch.servoPins.length && !sketch.servoPins.includes(sigPins[0]))
          err("both", `${servo.id}'s signal is on pin ${sigPins[0]}, but your code attaches pin ${sketch.servoPins.map(pinLabel).join(", ")} — the pulses go to the wrong wire.`);
      }
      if (sketch.servoPins.length && !c.partsByType("servo").length && required.includes("servo"))
        err("circuit", "Your code attaches a servo, but there's no servo in the circuit yet.");

      // DC motor: one side driven, other side to GND — plus the real-world caveat
      for (const motor of c.partsByType("motor")) {
        const net1 = c.netOf(motor.id, "1");
        const net2 = c.netOf(motor.id, "2");
        if (!isTerminalWired(motor.id, "1", "motor") || !isTerminalWired(motor.id, "2", "motor"))
          continue; // floating already reported
        const side1Pins = c.unoPinsOnNet(net1).filter((n) => n <= 13);
        const side2Pins = c.unoPinsOnNet(net2).filter((n) => n <= 13);
        const driven = side1Pins.length || net1 === c.v5 ? 1 : side2Pins.length || net2 === c.v5 ? 2 : 0;
        const grounded = net2 === c.gnd ? 2 : net1 === c.gnd ? 1 : 0;
        if (!driven || !grounded || driven === grounded)
          err("circuit", `${motor.id}: one terminal needs a driven pin (or 5V) and the other needs GND — current must flow THROUGH the motor.`);
        else {
          const drivePin = driven === 1 ? side1Pins[0] : side2Pins[0];
          if (drivePin !== undefined && writes.length && !writes.includes(drivePin))
            err("both", `${motor.id} is wired to pin ${drivePin}, but your code writes pin ${writes.map(pinLabel).join(", ")}.`);
          if (drivePin !== undefined && sketch.analogWrites.includes(drivePin) && !PWM_PINS.has(drivePin))
            err("code", `Pin ${drivePin} has no PWM — speed control needs a ~ pin (3, 5, 6, 9, 10, 11).`);
          out.push({
            level: "info",
            source: "circuit",
            message: `${motor.id}: in a real build, a bare Uno pin can't supply motor current — you'd add a transistor driver and a flyback diode. The simulator forgives it so you can learn the code.`,
          });
        }
      }

      // Buzzer: one pin driven by a digital pin, the other to GND. tone()
      // and digitalWrite both work; the pin driving it must match the code.
      for (const buzzer of c.partsByType("buzzer")) {
        const net1 = c.netOf(buzzer.id, "1");
        const net2 = c.netOf(buzzer.id, "2");
        if (!isTerminalWired(buzzer.id, "1", "buzzer") || !isTerminalWired(buzzer.id, "2", "buzzer"))
          continue; // floating already reported
        const gndSide = net1 === c.gnd ? "1" : net2 === c.gnd ? "2" : null;
        if (!gndSide) {
          err("circuit", `${buzzer.id}: one pin must go to GND to complete the loop.`);
          continue;
        }
        const driveNet = gndSide === "1" ? net2 : net1;
        const drivePins = c.unoPinsOnNet(driveNet).filter((n) => n <= 13);
        const driven = [...new Set([...sketch.digitalWrites, ...sketch.tonePins])];
        if (driveNet === c.v5) {
          out.push({
            level: "info",
            source: "circuit",
            message: `${buzzer.id}: wired straight to 5V it just drones at one pitch. Drive it from a digital pin with tone(pin, frequency) to play notes.`,
          });
        } else if (!drivePins.length) {
          err("circuit", `${buzzer.id}: the + pin must reach a digital pin so your code can sound it.`);
        } else if (driven.length && !drivePins.some((p) => driven.includes(p))) {
          err("both", `${buzzer.id} is on pin ${pinLabel(drivePins[0])}, but your code never drives that pin — tone(${pinLabel(drivePins[0])}, ...) or digitalWrite(${pinLabel(drivePins[0])}, HIGH) will make it sound.`);
        }
      }
      if (sketch.tonePins.length && !c.partsByType("buzzer").length && required.includes("buzzer"))
        err("circuit", "Your code calls tone(), but there's no buzzer in the circuit yet.");

      // LCD: signal wires must match LiquidCrystal(rs, en, d4, d5, d6, d7)
      for (const lcd of c.partsByType("lcd")) {
        const signals: [string, number][] = [
          ["RS", 0],
          ["E", 1],
          ["D4", 2],
          ["D5", 3],
          ["D6", 4],
          ["D7", 5],
        ];
        if (sketch.lcdPins.length === 6) {
          for (const [pinName, idx] of signals) {
            if (!isTerminalWired(lcd.id, pinName, "lcd")) continue; // floating already reported
            const actual = c.unoPinsOnNet(c.netOf(lcd.id, pinName)).filter((n) => n <= 13);
            const expected = sketch.lcdPins[idx];
            if (!actual.length)
              err("circuit", `${lcd.id}: ${pinName} must go to a digital pin (your code expects pin ${expected}).`);
            else if (actual[0] !== expected)
              err("both", `${lcd.id}: ${pinName} is wired to pin ${actual[0]}, but LiquidCrystal(...) says pin ${expected}. The display can't decode scrambled wiring.`);
          }
        }
        if (isTerminalWired(lcd.id, "RW", "lcd") && c.netOf(lcd.id, "RW") !== c.gnd)
          warn("circuit", `${lcd.id}: tie RW to GND — we only ever WRITE to the display.`);
        if (isTerminalWired(lcd.id, "V0", "lcd") && c.netOf(lcd.id, "V0") !== c.gnd)
          warn("circuit", `${lcd.id}: V0 sets contrast — GND gives maximum contrast (a potentiometer would let you adjust it).`);
        if (isTerminalWired(lcd.id, "K", "lcd") && c.netOf(lcd.id, "K") !== c.gnd)
          warn("circuit", `${lcd.id}: K is the backlight cathode — wire it to GND.`);
        if (isTerminalWired(lcd.id, "A", "lcd") && c.netOf(lcd.id, "A") !== c.v5)
          warn("circuit", `${lcd.id}: A is the backlight anode — wire it to 5V.`);
      }

      // DHT11: the data (SDA) wire must go to the digital pin DHT dht(pin, DHT11)
      for (const dht of c.partsByType("dht")) {
        const dataPins = c.unoPinsOnNet(c.netOf(dht.id, "SDA")).filter((n) => n <= 13);
        if (isTerminalWired(dht.id, "SDA", "dht") && !dataPins.length)
          err("circuit", `${dht.id}: the SDA (data) pin must go to a digital pin so the Uno can read it.`);
        if (dataPins.length && sketch.dhtPins.length && !sketch.dhtPins.includes(dataPins[0]))
          err("both", `${dht.id}'s data line is on pin ${dataPins[0]}, but your code says DHT dht(${sketch.dhtPins.map(pinLabel).join(", ")}, ...). Match the pin numbers.`);
      }
      if (sketch.dhtPins.length && !c.partsByType("dht").length && required.includes("dht"))
        err("circuit", "Your code creates a DHT sensor, but there's no DHT11 in the circuit yet.");

      // BNO055 IMU: an I2C sensor — on the Uno, SDA is fixed to A4 and SCL to A5.
      for (const imu of c.partsByType("imu")) {
        if (isTerminalWired(imu.id, "SDA", "imu") && c.netOf(imu.id, "SDA") !== c.netOf("uno", "A4"))
          err("circuit", `${imu.id}: SDA is the I2C data line — on the Uno it must go to A4.`);
        if (isTerminalWired(imu.id, "SCL", "imu") && c.netOf(imu.id, "SCL") !== c.netOf("uno", "A5"))
          err("circuit", `${imu.id}: SCL is the I2C clock line — on the Uno it must go to A5.`);
      }
      if (sketch.usesImu && !c.partsByType("imu").length && required.includes("imu"))
        err("circuit", "Your code creates an Adafruit_BNO055, but there's no IMU in the circuit yet.");

      // IR receiver: the DAT (signal) wire must reach IrReceiver.begin(pin)
      for (const ir of c.partsByType("irrecv")) {
        const dataPins = c.unoPinsOnNet(c.netOf(ir.id, "DAT")).filter((n) => n <= 13);
        if (isTerminalWired(ir.id, "DAT", "irrecv") && !dataPins.length)
          err("circuit", `${ir.id}: the DAT (signal) pin must go to a digital pin so the Uno can read the remote.`);
        if (dataPins.length && sketch.irPins.length && !sketch.irPins.includes(dataPins[0]))
          err("both", `${ir.id}'s DAT line is on pin ${dataPins[0]}, but your code calls IrReceiver.begin(${sketch.irPins.map(pinLabel).join(", ")}, ...). Match the pin numbers.`);
      }
      if (sketch.irPins.length && !c.partsByType("irrecv").length && required.includes("irrecv"))
        err("circuit", "Your code starts IrReceiver, but there's no IR receiver in the circuit yet.");

      // Stepper: all four coil wires must reach digital pins, and those four
      // pins must match Stepper myStepper(steps, p1, p2, p3, p4).
      for (const step of c.partsByType("stepper")) {
        const coilPins: number[] = [];
        for (const pin of ["A-", "A+", "B+", "B-"]) {
          if (!isTerminalWired(step.id, pin, "stepper")) continue; // floating already reported
          const pins = c.unoPinsOnNet(c.netOf(step.id, pin)).filter((n) => n <= 13);
          if (!pins.length)
            err("circuit", `${step.id}: coil ${pin} must go to a digital pin so the Uno can energize it.`);
          else coilPins.push(pins[0]);
        }
        if (coilPins.length === 4 && sketch.stepperPins.length === 4) {
          const want = new Set(sketch.stepperPins);
          const wired = new Set(coilPins);
          const same = want.size === wired.size && [...want].every((p) => wired.has(p));
          if (!same)
            err("both", `${step.id} is wired to pins ${[...wired].sort((a, b) => a - b).join(", ")}, but Stepper myStepper(...) lists pins ${[...want].sort((a, b) => a - b).join(", ")}. The coil order must match.`);
        }
        if (coilPins.length)
          out.push({
            level: "info",
            source: "circuit",
            message: `${step.id}: a real stepper needs a driver board (ULN2003 or an H-bridge) between the Uno and the coils — the pins can't source coil current directly. The simulator drives it straight so you can focus on the code.`,
          });
      }
      if (sketch.stepperPins.length && !c.partsByType("stepper").length && required.includes("stepper"))
        err("circuit", "Your code creates a Stepper, but there's no stepper motor in the circuit yet.");

      // Shift register 74HC595: three control lines to digital pins (data,
      // shift clock, latch clock), OE tied low + MR tied high to enable it,
      // and shiftOut(dataPin, clockPin, ...) must target the wired pins.
      for (const sr of c.partsByType("shiftreg")) {
        const pinOnNet = (name: string) =>
          c.unoPinsOnNet(c.netOf(sr.id, name)).filter((n) => n <= 13);
        const dsPins = pinOnNet("DS");
        const shPins = pinOnNet("SH_CP");
        const stPins = pinOnNet("ST_CP");
        for (const [name, pins] of [
          ["DS", dsPins],
          ["SH_CP", shPins],
          ["ST_CP", stPins],
        ] as const) {
          if (isTerminalWired(sr.id, name, "shiftreg") && !pins.length)
            err("circuit", `${sr.id}: the ${name} pin must go to a digital pin so the Uno can clock data into it.`);
        }
        if (isTerminalWired(sr.id, "OE", "shiftreg") && c.netOf(sr.id, "OE") !== c.gnd)
          err("circuit", `${sr.id}: OE (output enable) is active-low — wire it to GND so the outputs turn on.`);
        if (isTerminalWired(sr.id, "MR", "shiftreg") && c.netOf(sr.id, "MR") !== c.v5)
          err("circuit", `${sr.id}: MR (master reset) is active-low — wire it to 5V so the register isn't held cleared.`);
        if (dsPins.length && sketch.shiftDataPins.length && !sketch.shiftDataPins.includes(dsPins[0]))
          err("both", `${sr.id}'s DS (data) line is on pin ${dsPins[0]}, but shiftOut(...) sends data on pin ${sketch.shiftDataPins.map(pinLabel).join(", ")}. Match the pin numbers.`);
        if (shPins.length && sketch.shiftClockPins.length && !sketch.shiftClockPins.includes(shPins[0]))
          err("both", `${sr.id}'s SH_CP (shift clock) is on pin ${shPins[0]}, but shiftOut(...) clocks on pin ${sketch.shiftClockPins.map(pinLabel).join(", ")}. Match the pin numbers.`);
      }
      if (sketch.shiftDataPins.length && !c.partsByType("shiftreg").length && required.includes("shiftreg"))
        err("circuit", "Your code calls shiftOut(), but there's no shift register in the circuit yet.");
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

// ---------- Validation for Python (RPi.GPIO) lessons ----------

/**
 * Pi-aware sibling of validate(): checks LED wiring science (resistor + a GND
 * return to a Pi GND pin, correct polarity) and cross-checks the Python sketch
 * (setmode present, driven GPIO matches the wired pin and is set up as OUT,
 * reads reach a button set up as IN). Leaves the Uno validate() untouched.
 */
export function validatePython(
  state: CircuitState,
  sketch: PySketchInfo | null,
  required: PartType[],
): Diagnosis[] {
  const c = new Circuit(state);
  const out: Diagnosis[] = [];
  const err = (source: Diagnosis["source"], message: string) =>
    out.push({ level: "error", source, message });
  const warn = (source: Diagnosis["source"], message: string) =>
    out.push({ level: "warn", source, message });

  for (const type of required)
    if (c.partsByType(type).length === 0)
      err("circuit", `This lesson needs a ${PART_LABELS[type]} — add one from the parts tray.`);

  const pi = c.partsByType("pi")[0];

  const wired = new Set<string>();
  for (const w of state.wires) {
    wired.add(`${w.from.part}:${w.from.pin}`);
    wired.add(`${w.to.part}:${w.to.pin}`);
  }
  const isWired = (part: string, pin: string, type: PartType) => {
    if (wired.has(`${part}:${pin}`)) return true;
    if (type === "pushbutton") return wired.has(`${part}:${pin[0]}.l`) || wired.has(`${part}:${pin[0]}.r`);
    return false;
  };

  // Every GPIO number treated as "high" so wiring is checked independent of
  // the code's runtime state (the code cross-check below adds the pin match).
  const allHigh = new Set<number>(Array.from({ length: 28 }, (_, i) => i));
  const piGndNet = pi ? c.netOf(pi.id, "GND.6") : null;

  for (const led of c.partsByType("led")) {
    if (!isWired(led.id, "A", "led") || !isWired(led.id, "C", "led")) {
      err("circuit", `${led.id} isn't fully wired — both its long leg (anode) and short leg (cathode) need connections.`);
      continue;
    }
    const fwd = ledPath(c, led.id, allHigh, new Set(), true);
    if (fwd) {
      if (fwd.resistors === 0)
        err("circuit", `${led.id} has no current-limiting resistor — wire one in series or you'll burn out the LED (and stress the Pi pin).`);
    } else {
      const isSrcAny = (t: Terminal) => {
        if (t.part === "uno") return t.pin === "5V" || (pinNumber(t.pin) ?? 99) <= 13;
        return (
          c.parts.get(t.part)?.type === "pi" &&
          (t.pin.startsWith("3V3") || t.pin.startsWith("5V") || piGpioNumber(t.pin) !== null)
        );
      };
      const isGndAny = (t: Terminal) =>
        (t.part === "uno" && t.pin.startsWith("GND.")) ||
        (c.parts.get(t.part)?.type === "pi" && t.pin.startsWith("GND"));
      const revUp = tracePath(c, { part: led.id, pin: "C" }, isSrcAny, new Set(), true);
      const revDn = tracePath(c, { part: led.id, pin: "A" }, isGndAny, new Set(), true);
      if (revUp && revDn)
        err("circuit", `${led.id} is backwards — the long leg (anode) faces the GPIO/3V3 side, the short leg (cathode) the GND side.`);
      else
        err("circuit", `${led.id} has no complete path — trace from a GPIO pin, through the LED and a resistor, back to a Pi GND pin.`);
    }
  }

  // Servo: all three leads must be wired, and the PWM (signal) lead must reach a
  // Pi GPIO. V+ belongs on 5V (a GPIO can't source enough current); GND returns to
  // a Pi GND. When code is present, the pin the code makes PWM on must be the one
  // the servo's signal is wired to.
  for (const servo of c.partsByType("servo")) {
    const sig = isWired(servo.id, "PWM", "servo");
    const vplus = isWired(servo.id, "V+", "servo");
    const gnd = isWired(servo.id, "GND", "servo");
    if (!sig || !vplus || !gnd) {
      err("circuit", `${servo.id} needs three wires: PWM (signal) → a GPIO pin, V+ → a 5V pin, and GND → a Pi GND pin.`);
      continue;
    }
    const sigGpios = c.piGpioPinsOnNet(c.netOf(servo.id, "PWM"));
    if (!sigGpios.length)
      err("circuit", `${servo.id}'s PWM (signal) wire must go to a GPIO pin on the Pi.`);
    if (pi) {
      const vNet = c.netOf(servo.id, "V+");
      const onFiveV = PART_PINS.pi.some((p) => p.startsWith("5V") && c.netOf(pi.id, p) === vNet);
      if (!onFiveV)
        warn("circuit", `${servo.id}'s V+ should go to a 5V pin — a servo draws more current than a 3.3V GPIO can safely give.`);
      const gNet = c.netOf(servo.id, "GND");
      const onGnd = PART_PINS.pi.some((p) => p.startsWith("GND") && c.netOf(pi.id, p) === gNet);
      if (!onGnd)
        err("circuit", `${servo.id}'s GND must return to a Pi GND pin.`);
    }
    if (
      sketch &&
      !sketch.parseError &&
      sigGpios.length &&
      sketch.pwmPins.length &&
      !sigGpios.some((g) => sketch.pwmPins.includes(g))
    )
      err(
        "both",
        `${servo.id}'s signal is on GPIO${sigGpios.join(", ")}, but your code makes PWM on GPIO ${[...new Set(sketch.pwmPins)].sort((a, b) => a - b).join(", ")}. Point GPIO.PWM at the servo's pin.`,
      );
  }

  if (sketch) {
    if (sketch.parseError) {
      err("code", sketch.parseError);
    } else {
      if (!sketch.mode)
        warn("code", "Call GPIO.setmode(GPIO.BCM) before GPIO.setup(), or RPi.GPIO raises a RuntimeError at runtime.");
      else if (sketch.mode === "BOARD")
        warn("code", "These lessons number pins in BCM — use GPIO.setmode(GPIO.BCM) so the GPIO numbers match the board.");

      // LEDs: the wired GPIO must be the one your code drives, set up as OUT.
      for (const led of c.partsByType("led")) {
        if (!isWired(led.id, "A", "led") || !isWired(led.id, "C", "led")) continue;
        const p = ledPath(c, led.id, allHigh, new Set(), true);
        if (p && typeof p.sourcePin === "number") {
          const gpio = p.sourcePin;
          if (sketch.writes.length && !sketch.writes.includes(gpio))
            err("both", `${led.id} is wired to GPIO${gpio}, but your code drives GPIO ${[...new Set(sketch.writes)].sort((a, b) => a - b).join(", ")}. Use pin ${gpio}.`);
          if (!sketch.outPins.includes(gpio))
            err("code", `GPIO${gpio} lights ${led.id}, but you never call GPIO.setup(${gpio}, GPIO.OUT).`);
        }
      }

      // Driving a pin that's shorted to GND is a mistake worth catching.
      for (const gpio of new Set(sketch.writes)) {
        if (!pi) continue;
        const net = c.netOf(pi.id, `GPIO${gpio}`);
        if (piGndNet && net === piGndNet)
          err("circuit", `GPIO${gpio} is wired straight to a GND pin — driving it HIGH would be a short.`);
      }

      // Reads must reach a button that's set up as an input.
      for (const gpio of new Set(sketch.reads)) {
        if (!pi) continue;
        const net = c.netOf(pi.id, `GPIO${gpio}`);
        let found = false;
        for (const b of c.partsByType("pushbutton")) {
          const row = c.netOf(b.id, "1.l") === net ? "1" : c.netOf(b.id, "2.l") === net ? "2" : null;
          if (!row) continue;
          found = true;
          const otherNet = c.netOf(b.id, row === "1" ? "2.l" : "1.l");
          const pull = sketch.pulls.get(gpio) ?? "OFF";
          if (piGndNet && otherNet === piGndNet && pull !== "UP")
            warn("both", `The button on GPIO${gpio} returns to GND — set it up with pull_up_down=GPIO.PUD_UP so it idles HIGH and reads LOW when pressed.`);
        }
        if (!found)
          err("both", `Your code reads GPIO${gpio}, but no button is wired to that pin yet.`);
        if (!sketch.inPins.includes(gpio))
          err("code", `GPIO${gpio} is read but never set up as an input — add GPIO.setup(${gpio}, GPIO.IN, ...).`);
      }
    }
  }

  if (!out.some((d) => d.level === "error"))
    out.unshift({
      level: "ok",
      source: "both",
      message: state.wires.length
        ? "✓ Circuit and code agree — press Run to drive the Pi."
        : "Place your Raspberry Pi and parts, then wire them up. Diagnostics will guide you here.",
    });

  return out;
}

// ---------- Runtime bridge for the simulator ----------

export interface CircuitOutputs {
  /** LED id -> brightness 0..1 (only LEDs with a valid conductive path) */
  led: Map<string, number>;
  /** wire index -> current direction (true = stored from->to order) */
  current: Map<number, boolean>;
  /** RGB LED id -> channel levels 0..1 */
  rgb: Map<string, { r: number; g: number; b: number }>;
  /** servo id -> angle 0..180 */
  servo: Map<string, number>;
  /** motor id -> speed 0..1 */
  motor: Map<string, number>;
  /** buzzer id -> tone frequency in Hz (0/absent = silent) */
  buzzer: Map<string, number>;
  /** stepper id -> accumulated shaft angle in degrees (can exceed 360) */
  stepper: Map<string, number>;
  /** shift register id -> latched 8-bit output byte (bit i drives Qi) */
  shiftreg: Map<string, number>;
  /** 16x2 text (two lines) when a powered LCD is present */
  lcd: { lines: [string, string] } | null;
}

export class CircuitRuntime {
  private circuit: Circuit;
  private world: WorldState;
  private duties = new Map<number, number>();
  private servoByPin = new Map<number, number>();
  /** Pi BCM pin -> live software-PWM {duty %, freq Hz}. A ~50 Hz signal is a
   *  servo command; other frequencies just dim an LED. */
  private piPwm = new Map<number, { duty: number; freq: number }>();
  private tonePins = new Map<number, number>();
  private lcdLines: [string, string] = ["", ""];
  private lcdCursor = { x: 0, y: 0 };
  private lcdUsed = false;
  private stepperAngle = new Map<string, number>();
  private shiftPending = new Map<string, number>();
  private shiftLatched = new Map<string, number>();
  private imuPrev: { heading: number; pitch: number; roll: number; t: number } | null = null;
  private imuRates = { heading: 0, pitch: 0, roll: 0 };

  constructor(state: CircuitState, world: WorldState) {
    this.circuit = new Circuit(state);
    this.world = world;
  }

  setPin(pin: number, high: boolean): void {
    this.duties.set(pin, high ? 255 : 0);
  }

  setDuty(pin: number, duty: number): void {
    this.duties.set(pin, duty);
  }

  servoWrite(pin: number, angle: number): void {
    this.servoByPin.set(pin, angle);
  }

  tone(pin: number, freq: number): void {
    this.tonePins.set(pin, Math.max(0, Math.round(freq)));
  }

  noTone(pin: number): void {
    this.tonePins.set(pin, 0);
  }

  /** Advance any stepper whose four coils are driven by the given Arduino pins
   *  by `steps` (signed) out of `stepsPerRev`, accumulating its shaft angle. */
  stepperStep(pins: number[], steps: number, stepsPerRev: number): void {
    const want = new Set(pins);
    for (const s of this.circuit.partsByType("stepper")) {
      const coilPins = ["A-", "A+", "B+", "B-"].flatMap((p) =>
        this.circuit.unoPinsOnNet(this.circuit.netOf(s.id, p)).filter((n) => n <= 13),
      );
      // Every constructor pin must reach one of this stepper's coils.
      if (!coilPins.length || !pins.every((p) => coilPins.includes(p))) continue;
      if (![...want].length) continue;
      const deg = (steps / (stepsPerRev || 200)) * 360;
      this.stepperAngle.set(s.id, (this.stepperAngle.get(s.id) ?? 0) + deg);
    }
  }

  /** shiftOut(dataPin, clockPin, value): load an 8-bit value into the shift
   *  register whose DS/SH_CP lines reach those pins. It becomes visible on the
   *  outputs only after the latch pin (ST_CP) is pulsed HIGH — see outputs(). */
  shiftOut(dataPin: number, clockPin: number, value: number): void {
    for (const sr of this.circuit.partsByType("shiftreg")) {
      const ds = this.circuit.unoPinsOnNet(this.circuit.netOf(sr.id, "DS"));
      const sh = this.circuit.unoPinsOnNet(this.circuit.netOf(sr.id, "SH_CP"));
      if (ds.includes(dataPin) && sh.includes(clockPin))
        this.shiftPending.set(sr.id, value & 0xff);
    }
  }

  lcdOp(op: "clear" | "setCursor" | "print", a?: number | string, b?: number): void {
    this.lcdUsed = true;
    if (op === "clear") {
      this.lcdLines = ["", ""];
      this.lcdCursor = { x: 0, y: 0 };
    } else if (op === "setCursor") {
      this.lcdCursor = { x: Number(a) || 0, y: Number(b) || 0 };
    } else if (op === "print") {
      const row = Math.min(1, Math.max(0, this.lcdCursor.y));
      const text = String(a ?? "");
      const line = this.lcdLines[row].padEnd(this.lcdCursor.x, " ");
      this.lcdLines[row] = (
        line.slice(0, this.lcdCursor.x) + text + line.slice(this.lcdCursor.x + text.length)
      ).slice(0, 16);
      this.lcdCursor.x += text.length;
    }
  }

  private get highPins(): Set<number> {
    const set = new Set<number>();
    for (const [pin, duty] of this.duties) if (duty > 0) set.add(pin);
    return set;
  }

  private dutyLevel(pin: number | "5V" | null): number {
    if (pin === "5V") return 1;
    if (pin === null) return 0;
    return (this.duties.get(pin) ?? 0) / 255;
  }

  outputs(): CircuitOutputs {
    const led = new Map<string, number>();
    const current = new Map<number, boolean>();
    const high = this.highPins;

    for (const part of this.circuit.partsByType("led")) {
      const p = ledPath(this.circuit, part.id, high, this.world.pressed, false);
      if (p && p.resistors > 0) {
        led.set(part.id, this.dutyLevel(p.sourcePin));
        for (const w of p.wires) current.set(w.index, w.forward);
      }
    }

    const rgb = new Map<string, { r: number; g: number; b: number }>();
    const isDriven = (t: Terminal) =>
      t.part === "uno" && (pinNumber(t.pin) ?? 99) <= 13 && high.has(pinNumber(t.pin)!);
    for (const part of this.circuit.partsByType("rgbled")) {
      if (this.circuit.netOf(part.id, "COM") !== this.circuit.gnd) continue;
      const level = (leg: string) => {
        const trace = tracePath(this.circuit, { part: part.id, pin: leg }, isDriven, this.world.pressed, false);
        if (!trace) return 0;
        for (const w of trace.wires) current.set(w.index, !w.forward);
        return this.dutyLevel(pinNumber(trace.goal.pin));
      };
      const channels = { r: level("R"), g: level("G"), b: level("B") };
      if (channels.r || channels.g || channels.b) rgb.set(part.id, channels);
    }

    const servo = new Map<string, number>();
    const piForServo = this.circuit.partsByType("pi")[0];
    for (const part of this.circuit.partsByType("servo")) {
      const net = this.circuit.netOf(part.id, "PWM");
      for (const [pin, angle] of this.servoByPin)
        if (this.circuit.netOf("uno", pinLabel(pin)) === net) servo.set(part.id, angle);
      // A Pi drives a servo with ~50 Hz software PWM, mapping angle to duty by the
      // standard duty = angle/18 + 2 — so angle = (duty − 2) × 18. Only a servo-rate
      // signal moves the arm; a 1 kHz LED-fade PWM on some other pin never does.
      if (piForServo) {
        for (const [pin, pwm] of this.piPwm) {
          if (Math.abs(pwm.freq - 50) > 20) continue;
          if (this.circuit.netOf(piForServo.id, `GPIO${pin}`) === net)
            servo.set(part.id, Math.max(0, Math.min(180, Math.round((pwm.duty - 2) * 18))));
        }
      }
    }

    const motor = new Map<string, number>();
    for (const part of this.circuit.partsByType("motor")) {
      const net1 = this.circuit.netOf(part.id, "1");
      const net2 = this.circuit.netOf(part.id, "2");
      const speedOf = (driveNet: string, gndNet: string): number | null => {
        if (gndNet !== this.circuit.gnd) return null;
        if (driveNet === this.circuit.v5) return 1;
        const pins = this.circuit.unoPinsOnNet(driveNet).filter((n) => n <= 13);
        if (!pins.length) return null;
        return (this.duties.get(pins[0]) ?? 0) / 255;
      };
      const speed = speedOf(net1, net2) ?? speedOf(net2, net1);
      if (speed !== null && speed > 0) motor.set(part.id, speed);
    }

    // Buzzer: a + pin driven (tone, digitalWrite HIGH, or raw 5V) with its
    // other pin to GND makes sound. Active buzzers beep on any HIGH; tone()
    // sets a specific pitch. Orientation is forgiven, like the motor.
    const buzzer = new Map<string, number>();
    for (const part of this.circuit.partsByType("buzzer")) {
      const netPlus = this.circuit.netOf(part.id, "1");
      const netMinus = this.circuit.netOf(part.id, "2");
      const freqOf = (driveNet: string, gndNet: string): number | null => {
        if (gndNet !== this.circuit.gnd) return null;
        if (driveNet === this.circuit.v5) return 2000; // active buzzer on raw 5V
        const pins = this.circuit.unoPinsOnNet(driveNet).filter((n) => n <= 13);
        if (!pins.length) return null;
        const pin = pins[0];
        const t = this.tonePins.get(pin) ?? 0;
        if (t > 0) return t; // tone(pin, freq)
        if ((this.duties.get(pin) ?? 0) > 0) return 2000; // digitalWrite HIGH beep
        return 0;
      };
      const freq = freqOf(netPlus, netMinus) ?? freqOf(netMinus, netPlus);
      if (freq !== null && freq > 0) buzzer.set(part.id, freq);
    }

    let lcd: CircuitOutputs["lcd"] = null;
    for (const part of this.circuit.partsByType("lcd")) {
      const powered =
        this.circuit.netOf(part.id, "VDD") === this.circuit.v5 &&
        this.circuit.netOf(part.id, "VSS") === this.circuit.gnd;
      if (powered && this.lcdUsed) lcd = { lines: [...this.lcdLines] as [string, string] };
    }

    // Shift register: outputs show the latched byte. Copy pending -> latched
    // whenever the latch line (ST_CP) is currently HIGH, and only when powered
    // (VCC=5V, GND=GND, OE not held high, MR not held low).
    const shiftreg = new Map<string, number>();
    for (const part of this.circuit.partsByType("shiftreg")) {
      const powered =
        this.circuit.netOf(part.id, "VCC") === this.circuit.v5 &&
        this.circuit.netOf(part.id, "GND") === this.circuit.gnd;
      const enabled =
        this.circuit.netOf(part.id, "OE") !== this.circuit.v5 &&
        this.circuit.netOf(part.id, "MR") !== this.circuit.gnd;
      const latchPins = this.circuit.unoPinsOnNet(this.circuit.netOf(part.id, "ST_CP"));
      const latchHigh = latchPins.some((p) => (this.duties.get(p) ?? 0) > 0);
      if (latchHigh && this.shiftPending.has(part.id))
        this.shiftLatched.set(part.id, this.shiftPending.get(part.id)!);
      shiftreg.set(part.id, powered && enabled ? this.shiftLatched.get(part.id) ?? 0 : 0);
    }

    return {
      led,
      current,
      rgb,
      servo,
      motor,
      buzzer,
      stepper: new Map(this.stepperAngle),
      shiftreg,
      lcd,
    };
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

  // ---------- Raspberry Pi GPIO (Python RPi.GPIO) ----------
  // The Pi shares the duty map with the Arduino pins, keyed by pin number. A
  // Python lesson never has an Uno and an Arduino lesson never has a Pi, so the
  // BCM numbers and Uno pin numbers never collide at runtime.

  /** GPIO.output(pin, HIGH/LOW): drive a Pi BCM output pin. */
  setGpio(pin: number, high: boolean): void {
    this.duties.set(pin, high ? 255 : 0);
  }

  /** pwm.ChangeDutyCycle(pct): set a Pi BCM pin's PWM duty 0..100 % (→ 0..255).
   *  Also records the duty for the servo mapping, keeping the pin's frequency. */
  setGpioPwm(pin: number, dutyPct: number, freqHz?: number): void {
    const clamped = Math.max(0, Math.min(100, dutyPct));
    this.duties.set(pin, Math.round((clamped / 100) * 255));
    const prev = this.piPwm.get(pin);
    this.piPwm.set(pin, { duty: clamped, freq: freqHz ?? prev?.freq ?? 0 });
  }

  /** pwm.ChangeFrequency(hz): change a Pi PWM pin's frequency, keeping its duty.
   *  ~50 Hz is what a hobby servo expects. */
  setGpioPwmFreq(pin: number, freqHz: number): void {
    const prev = this.piPwm.get(pin);
    this.piPwm.set(pin, { duty: prev?.duty ?? 0, freq: freqHz });
  }

  /** GPIO.cleanup(): release the Pi's driven pins (they read/drive LOW again). */
  gpioCleanup(): void {
    this.duties.clear();
    this.servoByPin.clear();
    this.piPwm.clear();
  }

  /** GPIO.input(pin): read a pushbutton on this Pi GPIO pin, honoring the pull
   *  the code configured. True = HIGH (3.3 V), False = LOW. Deterministic: a
   *  floating pin resolves to its pull state so lesson gating stays stable. */
  readGpio(pin: number, pull: "UP" | "DOWN" | "OFF"): boolean {
    const pi = this.circuit.partsByType("pi")[0];
    if (!pi) return pull === "UP";
    const net = this.circuit.netOf(pi.id, `GPIO${pin}`);
    const gnd = this.circuit.netOf(pi.id, "GND.6");
    const threeV3 = this.circuit.netOf(pi.id, "3V3.1");
    // Direct jumper to a rail reads that rail.
    if (net === threeV3) return true;
    if (net === gnd) return false;
    for (const b of this.circuit.partsByType("pushbutton")) {
      const row = this.circuit.netOf(b.id, "1.l") === net ? "1" : this.circuit.netOf(b.id, "2.l") === net ? "2" : null;
      if (!row) continue;
      const otherNet = this.circuit.netOf(b.id, row === "1" ? "2.l" : "1.l");
      const pressed = this.world.pressed.has(b.id);
      if (otherNet === gnd) return pressed ? false : pull === "UP"; // pull-up idles HIGH, pressed pulls LOW
      if (otherNet === threeV3) return pressed ? true : pull !== "DOWN" ? true : false; // pull-down idles LOW
    }
    return pull === "UP";
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

  /** DHT11 reading: temp in °C or relative humidity %, if a powered sensor's
   *  data line reaches this pin. NaN when unwired/unpowered (DHT returns NaN). */
  dhtRead(pin: number, kind: "temp" | "humidity"): number {
    const net = this.circuit.netOf("uno", pinLabel(pin));
    for (const s of this.circuit.partsByType("dht")) {
      if (this.circuit.netOf(s.id, "SDA") !== net) continue;
      const powered =
        this.circuit.netOf(s.id, "VCC") === this.circuit.v5 &&
        this.circuit.netOf(s.id, "GND") === this.circuit.gnd;
      if (!powered) return NaN;
      return kind === "temp" ? this.world.tempC : this.world.humidityPct;
    }
    return NaN;
  }

  /** BNO055 read. quantity ∈ orientation|acceleration|gyro|magnetic|temp,
   *  axis ∈ x|y|z (unused for temp). NaN unless a powered IMU (VIN=5V, GND=GND)
   *  sits on the Uno's I2C bus (SDA→A4, SCL→A5) — matches the real library. */
  imuRead(quantity: string, axis: string): number {
    for (const s of this.circuit.partsByType("imu")) {
      if (!this.imuConnected(s.id)) continue;
      return this.imuValue(quantity, axis);
    }
    return NaN;
  }

  /** 1 when a correctly-wired, powered IMU is on the bus — drives bno.begin(). */
  imuPresent(): number {
    for (const s of this.circuit.partsByType("imu"))
      if (this.imuConnected(s.id)) return 1;
    return 0;
  }

  /** The fused orientation as a unit quaternion component (w/x/y/z), built from
   *  the live heading/pitch/roll by the standard ZYX (yaw-pitch-roll) formula.
   *  |q| = 1 by construction — exactly the gimbal-lock-free form the BNO055's
   *  getQuat() returns. NaN unless a powered, correctly-wired IMU is on the bus. */
  imuReadQuat(axis: string): number {
    for (const s of this.circuit.partsByType("imu")) {
      if (!this.imuConnected(s.id)) continue;
      const rad = Math.PI / 180;
      // Same effective pitch as imuValue: the platform the IMU rides on is
      // tilted by the controlling servo, so the fused quaternion reflects it too.
      const pitchDeg = Math.max(-90, Math.min(90, this.world.pitch + this.platformCorrection()));
      const cy = Math.cos((this.world.heading * rad) / 2);
      const sy = Math.sin((this.world.heading * rad) / 2);
      const cp = Math.cos((pitchDeg * rad) / 2);
      const sp = Math.sin((pitchDeg * rad) / 2);
      const cr = Math.cos((this.world.roll * rad) / 2);
      const sr = Math.sin((this.world.roll * rad) / 2);
      if (axis === "w") return cr * cp * cy + sr * sp * sy;
      if (axis === "x") return sr * cp * cy - cr * sp * sy;
      if (axis === "y") return cr * sp * cy + sr * cp * sy;
      return cr * cp * sy - sr * sp * cy;
    }
    return NaN;
  }

  /** Mechanical tilt (°) the controlled servo adds to the platform the IMU sits
   *  on: (angle − 90) for a servo whose PWM signal reaches a written pin, else 0.
   *  Neutral 90° = level. This is what physically closes the self-leveling loop —
   *  the servo genuinely moves the platform the sensor measures. With no such
   *  servo present it returns 0, so every sensor-only lesson reads unchanged. */
  private platformCorrection(): number {
    for (const part of this.circuit.partsByType("servo")) {
      const net = this.circuit.netOf(part.id, "PWM");
      for (const [pin, angle] of this.servoByPin)
        if (this.circuit.netOf("uno", pinLabel(pin)) === net) return angle - 90;
    }
    return 0;
  }

  private imuConnected(id: string): boolean {
    const powered =
      this.circuit.netOf(id, "VIN") === this.circuit.v5 &&
      this.circuit.netOf(id, "GND") === this.circuit.gnd;
    const onBus =
      this.circuit.netOf(id, "SDA") === this.circuit.netOf("uno", "A4") &&
      this.circuit.netOf(id, "SCL") === this.circuit.netOf("uno", "A5");
    return powered && onBus;
  }

  /** Physically real BNO055 values derived from the live tilt (heading/pitch/roll):
   *  Euler angles in °, gravity-including acceleration in m/s² (|a|≈9.81), gyro in
   *  °/s from how fast the board is turning, Earth's field in µT, chip temp in °C. */
  private imuValue(quantity: string, axis: string): number {
    const { heading, roll } = this.world;
    // Effective pitch the IMU actually feels = base tilt (slider) + the
    // servo-platform correction, clamped to the sensor's ±90° range. With no
    // controlling servo the correction is 0, so this is just the world pitch and
    // every Motion Basics / Sensor Fusion lesson reads exactly as before.
    const pitch = Math.max(-90, Math.min(90, this.world.pitch + this.platformCorrection()));
    const G = 9.81;
    const rad = Math.PI / 180;
    const p = pitch * rad;
    const r = roll * rad;
    switch (quantity) {
      case "orientation":
        // Euler register order: x = heading, y = roll, z = pitch.
        return axis === "x" ? heading : axis === "y" ? roll : pitch;
      case "acceleration": {
        // Gravity projected into the sensor frame; magnitude stays ≈ 9.81 m/s².
        if (axis === "x") return -G * Math.sin(p);
        if (axis === "y") return G * Math.sin(r) * Math.cos(p);
        return G * Math.cos(r) * Math.cos(p);
      }
      case "gravity": {
        // The chip's fused gravity vector: the same 9.81 m/s² projection the
        // raw accelerometer feels at rest, cleanly separated from motion.
        if (axis === "x") return -G * Math.sin(p);
        if (axis === "y") return G * Math.sin(r) * Math.cos(p);
        return G * Math.cos(r) * Math.cos(p);
      }
      case "linearaccel":
        // Acceleration with gravity removed. This sim models a board that only
        // tilts (never translates), so at rest every axis is honestly 0 — the
        // lesson says so. On real hardware, shoving the sensor spikes an axis.
        return 0;
      case "gyro": {
        // Angular rate (°/s): how fast the tilt is changing right now.
        const now = Date.now();
        if (!this.imuPrev) {
          this.imuPrev = { heading, pitch, roll, t: now };
        } else {
          const dt = (now - this.imuPrev.t) / 1000;
          if (dt >= 0.05) {
            const dh = ((heading - this.imuPrev.heading + 540) % 360) - 180;
            this.imuRates.heading = dh / dt;
            this.imuRates.pitch = (pitch - this.imuPrev.pitch) / dt;
            this.imuRates.roll = (roll - this.imuPrev.roll) / dt;
            this.imuPrev = { heading, pitch, roll, t: now };
          }
        }
        // Body axes: x = roll rate, y = pitch rate, z = yaw (heading) rate.
        return axis === "x"
          ? this.imuRates.roll
          : axis === "y"
            ? this.imuRates.pitch
            : this.imuRates.heading;
      }
      case "magnetic": {
        // Earth's field (~47 µT) as the tilted board actually sees it. In the
        // navigation frame the field is [Hh north, 0 east, Hd down]; rotating it
        // into the board frame by yaw(heading)/pitch/roll gives what the chip
        // reports. So the horizontal compass reading skews when tilted — which
        // is exactly why a tilt-compensated heading (accel roll/pitch + this
        // mag) is needed. |m| stays ≈47 µT because a rotation preserves length.
        const h = heading * rad;
        const Hh = 22;
        const Hd = 42;
        const cy = Math.cos(h), sy = Math.sin(h);
        const cp = Math.cos(p), sp = Math.sin(p);
        const cr = Math.cos(r), sr = Math.sin(r);
        if (axis === "x") return Hh * cp * cy - Hd * sp;
        if (axis === "y") return Hh * (sr * sp * cy - cr * sy) + Hd * sr * cp;
        return Hh * (cr * sp * cy + sr * sy) + Hd * cr * cp;
      }
      case "temp":
        return Math.round(this.world.tempC);
      default:
        return 0;
    }
  }

  /** Next IR command byte waiting on a receiver whose DAT line reaches this
   *  pin, or -1 if none is queued (or the receiver is unwired/unpowered). */
  irDecode(pin: number): number {
    const net = this.circuit.netOf("uno", pinLabel(pin));
    for (const s of this.circuit.partsByType("irrecv")) {
      if (this.circuit.netOf(s.id, "DAT") !== net) continue;
      const powered =
        this.circuit.netOf(s.id, "VCC") === this.circuit.v5 &&
        this.circuit.netOf(s.id, "GND") === this.circuit.gnd;
      if (!powered) return -1;
      return this.world.irQueue.shift() ?? -1;
    }
    return -1;
  }
}
