// One-shot: add the 74HC595 shift register component and Lesson 26
// "Shift Register" to the frontend data files, then mirror both to the
// backend copy. Idempotent. New component = shiftreg; reuses the LCD.
const fs = require("fs");
const path = require("path");

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");

const compsPath = path.join(FE, "components.json");
const lessonsPath = path.join(FE, "lessons.json");
const comps = JSON.parse(fs.readFileSync(compsPath, "utf8"));
const lessons = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));

const upsertComp = (obj) => {
  if (!comps.components.some((c) => c.id === obj.id)) comps.components.push(obj);
  else comps.components = comps.components.map((c) => (c.id === obj.id ? obj : c));
};

// ---- components.json: 74HC595 shift register (the featured new part) ----
upsertComp({
  id: "shiftreg",
  name: "Shift Register (74HC595)",
  category: "output",
  function:
    "A chip that turns three Arduino pins into eight outputs. You clock eight bits into it one at a time, then flip a latch and all eight outputs update at once. When you run out of pins for LEDs, seven-segment digits, or relays, a shift register buys you eight more for the cost of three — and you can chain several to get 16, 24, 32… outputs from the same three wires.",
  science:
    "Inside are eight flip-flops in a row — a bucket brigade for bits. Each rising edge on the shift clock (SH_CP) pushes the bit currently on the data line (DS) into the first flip-flop and shoves every other bit one seat down the line. After eight clock pulses your byte is lined up inside, but the outputs haven't moved yet: they follow a second set of latch registers. A rising edge on the latch clock (ST_CP) copies all eight bits to the outputs Q0–Q7 simultaneously, so they change cleanly instead of flickering as you shift. Two active-low housekeeping pins finish the job: MR (master reset) must be HIGH (tie to 5V) or the register stays cleared, and OE (output enable) must be LOW (tie to GND) or the outputs stay off. Arduino's shiftOut(dataPin, clockPin, bitOrder, value) does the eight data-and-clock pulses for you; you wrap it in digitalWrite(latchPin, LOW) … digitalWrite(latchPin, HIGH) to latch the result.",
  specs: {
    type: "8-bit serial-in, parallel-out shift register",
    inputs: "DS (data), SH_CP (shift clock), ST_CP (latch clock)",
    control: "MR active-low (→5V), OE active-low (→GND)",
    outputs: "Q0–Q7, plus Q7' for daisy-chaining more registers",
    voltage: "2–6 V logic; ~35 mA total across all outputs",
  },
  notes:
    "Three control lines do all the work: DS→a digital pin, SH_CP→a digital pin, ST_CP→a digital pin. Power with VCC→5V and GND→GND; tie MR→5V and OE→GND so the chip is enabled. In code, latch LOW, shiftOut(dataPin, clockPin, MSBFIRST, value), latch HIGH. The simulator shows the eight Q outputs as on-board indicator lights so you can watch your byte appear; on a real board you'd wire Q0–Q7 to eight LEDs (each through its own resistor).",
  terminals:
    "DS, SH_CP, ST_CP (to digital pins) · MR→5V · OE→GND · VCC→5V · GND→GND",
});

// ---- lessons.json: extend the control phase + add Lesson 26 ----
const ctrl = lessons.phases.find((p) => p.id === "control");
if (ctrl) {
  ctrl.range = "13-26";
  if (!ctrl.concepts.includes("shiftreg")) ctrl.concepts.push("shiftreg");
}

const lesson26 = {
  id: 26,
  phase: "control",
  title: "Shift Register",
  description:
    "Keep the 16×2 LCD and add a 74HC595 shift register — a chip that turns three Arduino pins into eight outputs. Clock a byte in bit by bit, flip the latch, and all eight Q outputs update at once. Count from 0 to 255 and watch the eight on-board lights spell out each number in binary while the LCD shows it in decimal. This is how you drive far more outputs than the Uno has pins.",
  source: "Paul McWhorter, Arduino 74HC595 shift register lessons — toptechboy.com",
  featuredComponent: "shiftreg",
  circuit: {
    palette: ["lcd", "shiftreg"],
    required: ["lcd", "shiftreg"],
    notes:
      "LCD wired as in Lesson 19 (RS→12, E→11, D4→5, D5→4, D6→3, D7→2; VSS/V0/RW/K→GND, VDD/A→5V). Shift register: DS→8, SH_CP→7, ST_CP→6 — the same three pins you name as dataPin, clockPin, and latchPin in code. Enable the chip by tying MR→5V and OE→GND, and power it with VCC→5V and GND→GND. The eight Q outputs are shown as on-board lights, so you don't wire them.",
  },
  codeTemplate: {
    language: "cpp",
    starter:
      "#include <LiquidCrystal.h>\n\nconst int dataPin = 8;   // DS    -> shift register serial data\nconst int clockPin = 7;  // SH_CP -> shift clock\nconst int latchPin = 6;  // ST_CP -> latch clock\n\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);\n\nvoid setup() {\n  lcd.begin(16, 2);\n  // Make the three control pins OUTPUTs.\n}\n\nvoid loop() {\n  // Count value from 0 to 255. For each value:\n  //   pull the latch LOW, shiftOut the byte MSBFIRST, then latch HIGH,\n  //   and print the number on the LCD.\n}",
  },
  hints: [
    "pinMode(dataPin, OUTPUT);",
    "pinMode(clockPin, OUTPUT);",
    "pinMode(latchPin, OUTPUT);",
    "digitalWrite(latchPin, LOW);",
    "shiftOut(dataPin, clockPin, MSBFIRST, value);",
    "digitalWrite(latchPin, HIGH);",
    "lcd.print(value);",
  ],
  output: {
    initial: "Outputs: 00000000",
    status: "Waiting for sketch...",
  },
};
if (!lessons.lessons.some((l) => l.id === 26)) {
  const i25 = lessons.lessons.findIndex((l) => l.id === 25);
  lessons.lessons.splice(i25 + 1, 0, lesson26);
} else {
  lessons.lessons = lessons.lessons.map((l) => (l.id === 26 ? lesson26 : l));
}

// ---- write frontend + mirror to backend ----
const writeBoth = (name, obj) => {
  const text = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(path.join(FE, name), text);
  fs.writeFileSync(path.join(BE, name), text);
  console.log("wrote", name, "-> frontend + backend");
};
writeBoth("components.json", comps);
writeBoth("lessons.json", lessons);
console.log("components:", comps.components.length, "lessons:", lessons.lessons.length);
