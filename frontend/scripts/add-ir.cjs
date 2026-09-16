// One-shot: add the IR receiver + IR remote components and Lesson 24
// "Remote Control" to the frontend data files, then mirror both to the
// backend copy. Idempotent. New component = IR receiver; reuses the LCD.
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

// ---- components.json: IR receiver (the featured new part) ----
upsertComp({
  id: "irrecv",
  name: "Infrared Receiver (38 kHz)",
  category: "input",
  function:
    "Listens for the invisible infrared light a remote control flashes at it and turns that flicker into a clean digital signal your Arduino can read. The IRremote library decodes the pulse train into a single command number for whichever button was pressed.",
  science:
    "A remote's LED doesn't glow steadily — it flickers on and off about 38,000 times a second, and that fast flicker is switched in longer and shorter bursts to spell out a number in binary (the NEC protocol). This little receiver has a photodiode tuned to 38 kHz and a demodulator chip that ignores ordinary room light and sunlight (which don't flicker at that rate) and passes only the 38 kHz bursts. It hands the Arduino a stream of clean HIGH/LOW pulses on its OUT pin. Decoding the exact widths of those pulses by hand would be maddening, so you install the IRremote library once: each pass through loop() you ask IrReceiver.decode(), and if a full code has arrived it fills in IrReceiver.decodedIRData.command with the button's number.",
  specs: {
    type: "38 kHz IR demodulator (VS1838B-class)",
    supply: "2.7–5.5 V",
    output: "single active-low digital line",
    range: "up to ~8 m, line of sight",
    protocols: "NEC and most consumer-remote formats",
  },
  notes:
    "Three pins: DAT (signal → any digital pin), VCC → 5V, GND → GND. In code: #include <IRremote.hpp>, #define IR_RECEIVE_PIN 7, then IrReceiver.begin(IR_RECEIVE_PIN, ENABLE_LED_FEEDBACK) in setup(). Each loop: if (IrReceiver.decode()) { read IrReceiver.decodedIRData.command; IrReceiver.resume(); }.",
  terminals: "DAT (to a digital pin), VCC (5V), GND",
});

// ---- components.json: IR remote (the wireless input device) ----
upsertComp({
  id: "irremote",
  name: "Infrared Remote Control",
  category: "input",
  function:
    "The handheld transmitter — a grid of buttons that beam commands to the receiver. Every key flashes an infrared LED with its own unique pattern of pulses, so the board can tell exactly which button you pressed. There are no wires: the signal travels through the air as invisible light.",
  science:
    "Press a key and a tiny microcontroller inside drives an infrared LED, flickering it at 38 kHz and chopping that carrier into a burst pattern that encodes an 8-bit address plus an 8-bit command (the NEC protocol). Different keys send different command bytes — power is 0xA2, the number 1 is 0x30, and so on. Infrared sits just past the red end of the spectrum, so your eyes can't see it, but the receiver's photodiode can. Because it's light, it only works in line of sight and gets swamped if you point two remotes at once.",
  specs: {
    type: "NEC infrared transmitter",
    carrier: "38 kHz",
    keys: "21 buttons (power, 0–9, +/−, arrows…)",
    power: "coin cell (simulated here)",
    link: "one-way, line of sight",
  },
  notes:
    "Not wired into the circuit — just drop it on the canvas and click its keys while the sketch runs. Each key sends a command byte (power = 0xA2, 1 = 0x30, …) that shows up in IrReceiver.decodedIRData.command.",
  terminals: "none — wireless infrared",
});

// ---- lessons.json: extend the control phase + add Lesson 24 ----
const ctrl = lessons.phases.find((p) => p.id === "control");
if (ctrl) {
  ctrl.range = "13-24";
  if (!ctrl.concepts.includes("IR remote")) ctrl.concepts.push("IR remote");
}

const lesson24 = {
  id: 24,
  phase: "control",
  title: "Remote Control",
  description:
    "Keep the 16×2 LCD and add an infrared receiver so your project can take orders from a TV-style remote. A library decodes the invisible pulses for you: each time a key arrives you read its command byte and print it to the screen. Run the sketch, then click keys on the remote to watch their codes appear — power is 162, the number keys each have their own value.",
  source: "Paul McWhorter, Arduino IR remote lessons — toptechboy.com",
  featuredComponent: "irrecv",
  circuit: {
    palette: ["lcd", "irrecv", "irremote"],
    required: ["lcd", "irrecv", "irremote"],
    notes:
      "LCD wired as in Lesson 19 (RS→12, E→11, D4→5, D5→4, D6→3, D7→2; VSS/V0/RW/K→GND, VDD/A→5V). IR receiver: VCC→5V, GND→GND, DAT→7 (matches IR_RECEIVE_PIN in the code). Drop the remote on the canvas — it needs no wires, it beams infrared through the air.",
  },
  codeTemplate: {
    language: "cpp",
    starter:
      "#include <LiquidCrystal.h>\n#include <IRremote.hpp>\n\n#define IR_RECEIVE_PIN 7\n\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);\n\nvoid setup() {\n  lcd.begin(16, 2);\n  lcd.print(\"Point remote...\");\n  IrReceiver.begin(IR_RECEIVE_PIN, ENABLE_LED_FEEDBACK);\n}\n\nvoid loop() {\n  // When a code arrives, decode it, show the command byte on the LCD,\n  // then call resume() so the receiver is ready for the next key.\n}",
  },
  hints: [
    "if (IrReceiver.decode()) {",
    "lcd.clear();",
    'lcd.print("Key: ");',
    "lcd.print(IrReceiver.decodedIRData.command);",
    "IrReceiver.resume();",
  ],
  output: {
    initial: "IR receiver idle",
    status: "Waiting for sketch...",
  },
};
if (!lessons.lessons.some((l) => l.id === 24)) {
  const i23 = lessons.lessons.findIndex((l) => l.id === 23);
  lessons.lessons.splice(i23 + 1, 0, lesson24);
} else {
  lessons.lessons = lessons.lessons.map((l) => (l.id === 24 ? lesson24 : l));
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
