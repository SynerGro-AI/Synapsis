// One-shot: add the stepper motor component and Lesson 25 "Stepper Motor"
// to the frontend data files, then mirror both to the backend copy.
// Idempotent. New component = stepper; reuses the LCD from Lesson 19.
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

// ---- components.json: stepper motor (the featured new part) ----
upsertComp({
  id: "stepper",
  name: "Stepper Motor (4-wire)",
  category: "output",
  function:
    "A motor that moves in exact, countable increments instead of spinning freely. Energize its four coils in the right order and the shaft snaps forward one precise step; reverse the order and it steps back. Because every step is the same tiny angle, you can command it to an exact position — no feedback sensor needed — which is why 3D printers, camera rigs, and clocks use them.",
  science:
    "Inside are two coil pairs (A and B) surrounding a toothed magnetic rotor. When you push current through a coil it becomes an electromagnet and tugs the nearest rotor tooth into alignment. By switching current between the coils in a fixed sequence — A+, then B+, then A−, then B− — you drag the rotor around one notch at a time. A common motor has 200 steps per revolution, so each step is 360°/200 = 1.8°. The Arduino Stepper library hides the switching pattern: you tell it stepsPerRevolution and the four control pins in the constructor, call setSpeed(rpm) to choose how fast, and then step(n) to advance n steps (negative n runs it backwards). step() is blocking — it doesn't return until the move finishes.",
  specs: {
    type: "bipolar/unipolar stepper (28BYJ/NEMA-class)",
    resolution: "1.8° per step (200 steps/rev), typical",
    control: "4 coil lines, switched in sequence",
    driver: "needs a ULN2003 or H-bridge in real hardware",
    holding: "stays locked in place while a coil is energized",
  },
  notes:
    "Four coil wires: A− A+ B+ B−. In code: #include <Stepper.h>, then Stepper myStepper(stepsPerRevolution, p1, p2, p3, p4); the four pins must match how the coils are wired. Call myStepper.setSpeed(rpm) once, then myStepper.step(steps). A real stepper can't be driven straight from Uno pins — it needs a driver board — but the simulator wires it directly so you can focus on the code.",
  terminals: "A- , A+ , B+ , B- (each to a digital pin, via a driver in real life)",
});

// ---- lessons.json: extend the control phase + add Lesson 25 ----
const ctrl = lessons.phases.find((p) => p.id === "control");
if (ctrl) {
  ctrl.range = "13-25";
  if (!ctrl.concepts.includes("stepper")) ctrl.concepts.push("stepper");
}

const lesson25 = {
  id: 25,
  phase: "control",
  title: "Stepper Motor",
  description:
    "Keep the 16×2 LCD and add a stepper motor — a motor that turns in exact, countable steps instead of just spinning. The Stepper library does the coil-switching for you: set a speed in RPM, then command whole revolutions forward and back while the LCD announces each move. Run the sketch and watch the shaft's arrow sweep one full turn one way, then the other. This is the same kind of motor that positions a 3D-printer head.",
  source: "Paul McWhorter, Arduino stepper motor lessons — toptechboy.com",
  featuredComponent: "stepper",
  circuit: {
    palette: ["lcd", "stepper"],
    required: ["lcd", "stepper"],
    notes:
      "LCD wired as in Lesson 19 (RS→12, E→11, D4→5, D5→4, D6→3, D7→2; VSS/V0/RW/K→GND, VDD/A→5V). Stepper coils: A−→6, A+→7, B+→8, B−→9 — the same four pins, in the same order, that you pass to Stepper myStepper(steps, 6, 7, 8, 9). A real stepper would need a ULN2003 driver board between the Uno and the coils; the simulator drives it directly.",
  },
  codeTemplate: {
    language: "cpp",
    starter:
      "#include <Stepper.h>\n#include <LiquidCrystal.h>\n\nconst int stepsPerRevolution = 200;\n\nStepper myStepper(stepsPerRevolution, 6, 7, 8, 9);\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);\n\nvoid setup() {\n  lcd.begin(16, 2);\n  // Choose a speed in RPM before the motor can step.\n}\n\nvoid loop() {\n  // Spin one full turn forward (show \"Forward\" on the LCD),\n  // then one full turn back (show \"Reverse\").\n}",
  },
  hints: [
    "myStepper.setSpeed(30);",
    'lcd.print("Forward");',
    "myStepper.step(stepsPerRevolution);",
    'lcd.print("Reverse");',
    "myStepper.step(-stepsPerRevolution);",
  ],
  output: {
    initial: "Stepper at 0°",
    status: "Waiting for sketch...",
  },
};
if (!lessons.lessons.some((l) => l.id === 25)) {
  const i24 = lessons.lessons.findIndex((l) => l.id === 24);
  lessons.lessons.splice(i24 + 1, 0, lesson25);
} else {
  lessons.lessons = lessons.lessons.map((l) => (l.id === 25 ? lesson25 : l));
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
