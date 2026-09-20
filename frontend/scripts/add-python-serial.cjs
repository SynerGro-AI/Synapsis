// One-shot, idempotent: add the Python track's "Talking to Arduino" serial-bridge
// lessons (401-406) to the frontend data files, then mirror both to the backend
// copy. These are the SERIAL lessons (kind:"serial"): the learner writes a PYTHON
// program that runs on a simulated PC (pyserial) and talks over a simulated USB
// serial port to a fixed, pre-flashed Arduino sketch (shown read-only) that drives
// a real circuit. Both hand-written interpreters run concurrently on the one JS
// thread, exchanging bytes through the world's two FIFOs (serialToArduino =
// PC->MCU, serialToPc = MCU->PC) — that interleaving IS the serial line.
//
// Staged shipping (matches the live-safe deploy cadence):
//   node scripts/add-python-serial.cjs        -> Deploy 1 (401-402, both directions)
//   node scripts/add-python-serial.cjs 405     -> Deploy 2 (403-405)
//   node scripts/add-python-serial.cjs 406     -> Deploy 3 (406 capstone + finalize)
// Re-running upserts, so it is always safe to run again.
//
// Authenticity is the hard rule: nothing is faked. In 401 the number Python prints
// is the exact one the Arduino counted and Serial.println'd — the bytes truly
// cross the FIFO and decode. In 402 ser.write(b'H') pushes a real byte the Arduino
// genuinely reads with Serial.read(); the LED lights ONLY because digitalWrite(13,
// HIGH) then ran (read back from the engine's outputs, never string-matched), and
// b'L' turns it off the same honest way. Wrong baud, unopened port, or unsupported
// syntax raises a real Python/Arduino error. Learner Python is 4-space PEP-8; the
// provided Arduino sketch is 4-space C. One new idea per lesson, reusing the last.
const fs = require("fs");
const path = require("path");

const LIMIT = process.argv[2] ? Number(process.argv[2]) : 402;

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");

const lessonsPath = path.join(FE, "lessons.json");
const lessons = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));

// ---- phases: insert a new live `python_serial` phase at the FRONT of the python
// track, and push the three still-empty scaffold phases' display ranges after it.
// Serial is the foundation of the Python track, so it comes first. Both edits are
// idempotent (absolute sets / insert-if-absent).
if (!lessons.phases.some((p) => p.id === "python_serial")) {
  const idx = lessons.phases.findIndex((p) => p.id === "vpython_world");
  const at = idx >= 0 ? idx : lessons.phases.length;
  lessons.phases.splice(at, 0, {
    id: "python_serial",
    track: "python",
    name: "Talking to Arduino",
    range: "401-406",
    concepts: ["Serial ports", "Bytes & decoding", "Two-way control", "Closed loop"],
  });
}
const setRange = (id, range) => {
  const p = lessons.phases.find((x) => x.id === id);
  if (p) p.range = range;
};
setRange("vpython_world", "407-412");
setRange("python_plots", "413-420");
setRange("python_comms", "421-426");

const CREDIT =
  "Paul McWhorter, Python with Arduino — toptechboy.com; support at patreon.com/PaulMcWhorter";

// The learner types Python (codeTemplate); a fixed, pre-flashed Arduino sketch
// (arduinoSketch, shown read-only and run in the background) drives the circuit.
// palette/required are the Arduino-side parts plus the pc (laptop) + USB cable.
const lesson = (id, title, description, notes, required, starter, sketch, hints, output, featured) => ({
  id,
  phase: "python_serial",
  title,
  description,
  source: CREDIT,
  kind: "serial",
  arduinoSketch: sketch,
  featuredComponent: featured ?? "pc",
  circuit: {
    palette: required,
    required,
    notes,
  },
  codeTemplate: { language: "python", starter },
  hints,
  output,
});

const allLessons = [
  lesson(
    401,
    "Hello, Serial",
    "Until now your Python ran alone on the Pi. This course connects it to an Arduino over a wire. The Arduino here is already running — its sketch (shown on the right) counts 0, 1, 2, ... and calls Serial.println on each number, pushing it out the USB port every half second. Your job is the other end. import serial gives you pyserial; serial.Serial('COM4', 9600, timeout=1) opens the port — the baud, 9600, MUST match the sketch's Serial.begin(9600) or the bytes arrive as garbage. Then ser.readline() blocks until a whole line of bytes has come in and hands you those raw bytes. Bytes aren't text, so .decode() turns them into a string and .rstrip() trims the trailing newline the Arduino sent. Print it, loop forever, and you're watching the real numbers cross the wire.",
    "The Uno is on the board and already flashed with the counting sketch shown on the right. Add the PC (laptop) and connect it to the Uno with the USB cable — no other wiring. Then open the port in Python and print every line the Arduino sends.",
    ["pc"],
    "import serial\n\n# The Arduino is counting and sending each number over serial.\n# Open the port, then read and print every line it sends.\n",
    "int count = 0;\n\nvoid setup() {\n    Serial.begin(9600);\n}\n\nvoid loop() {\n    Serial.println(count);\n    count = count + 1;\n    delay(500);\n}\n",
    [
      "ser = serial.Serial('COM4', 9600, timeout=1)",
      "while True:",
      "line = ser.readline()",
      "text = line.decode().rstrip()",
      "print(text)",
    ],
    { initial: "Serial monitor: waiting", status: "Waiting for your Python..." },
  ),
  lesson(
    402,
    "Send a Command",
    "Reading is half a conversation; now you talk back. The same wire runs both ways, and this sketch listens: each loop it checks Serial.available(), and when a byte has arrived it reads it with Serial.read() and turns the real LED on for 'H' or off for 'L'. From Python you send a byte with ser.write(b'H') — the b'' makes a bytes literal, because only bytes cross the wire, never text. The Arduino truly reads that byte and runs digitalWrite(13, HIGH), so the LED you see lights ONLY because your command really arrived. Send b'L' and it goes dark. Wrap the two in a loop with time.sleep(1) between them and you've written software on the laptop that blinks a physical light. The time.sleep(2) up top gives the Arduino a moment to reset when the port opens, exactly as on real hardware.",
    "The Uno runs the command sketch shown on the right. Wire pin 13 -> resistor -> LED -> a GND pin, and connect the PC to the Uno with the USB cable. Your Python sends 'H' and 'L' bytes to blink the real LED on pin 13.",
    ["pc", "led", "resistor"],
    "import serial\nimport time\n\nser = serial.Serial('COM4', 9600, timeout=1)\ntime.sleep(2)\n\n# Send b'H' to turn the LED on and b'L' to turn it off.\n# Blink it: on, wait, off, wait, forever.\n",
    "void setup() {\n    Serial.begin(9600);\n    pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n    if (Serial.available() > 0) {\n        char command = Serial.read();\n        if (command == 'H') {\n            digitalWrite(13, HIGH);\n        }\n        if (command == 'L') {\n            digitalWrite(13, LOW);\n        }\n    }\n}\n",
    [
      "while True:",
      "ser.write(b'H')",
      "time.sleep(1)",
      "ser.write(b'L')",
      "time.sleep(1)",
    ],
    { initial: "LED: off", status: "Waiting for your Python..." },
    "led",
  ),
];

const toAdd = allLessons.filter((l) => l.id <= LIMIT);
for (const l of toAdd) {
  const existing = lessons.lessons.findIndex((x) => x.id === l.id);
  if (existing >= 0) {
    lessons.lessons[existing] = l;
  } else {
    let insertAt = lessons.lessons.findIndex((x) => x.id > l.id);
    if (insertAt < 0) insertAt = lessons.lessons.length;
    lessons.lessons.splice(insertAt, 0, l);
  }
}

const writeBoth = (name, obj) => {
  const text = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(path.join(FE, name), text);
  fs.writeFileSync(path.join(BE, name), text);
  console.log("wrote", name, "-> frontend + backend");
};
writeBoth("lessons.json", lessons);
console.log(
  "python serial lessons through",
  LIMIT + ":",
  toAdd.map((l) => l.id).join(", "),
  "| total lessons:",
  lessons.lessons.length,
);
