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
  lesson(
    403,
    "Read a Sensor",
    "In 401 the Arduino sent a plain count; now it sends something that changes — a real sensor. A potentiometer's wiper feeds pin A0, and the sketch calls analogRead(A0), which measures the voltage there and digitizes it to a whole number from 0 (0 V) up to 1023 (5 V). Serial.println pushes that number out every fifth of a second. On your end you already know readline().decode().rstrip() hands you the line as a string — but a string like \"742\" can't be compared to a number, so int() converts it into a real integer. Once value is an int you can DECIDE with it: past the halfway mark, print HIGH; otherwise, low. Turn the knob in the simulation and both the numbers and your decision follow it, because value is the exact reading the Arduino measured — never a canned sequence.",
    "The Uno runs the sensor sketch shown on the right. Wire the potentiometer: VCC -> 5V, GND -> a GND pin, SIG -> A0. Connect the PC to the Uno with the USB cable. Your Python reads each number, turns it into an int, and reacts when it passes 500.",
    ["pc", "potentiometer"],
    "import serial\n\nser = serial.Serial('COM4', 9600, timeout=1)\n\n# The Arduino sends the potentiometer reading (0-1023) every fifth of a second.\n# Read each line, turn it into an int with int(), and print HIGH or low\n# depending on whether it is past the middle (500).\n",
    "void setup() {\n    Serial.begin(9600);\n}\n\nvoid loop() {\n    int value = analogRead(A0);\n    Serial.println(value);\n    delay(200);\n}\n",
    [
      "while True:",
      "line = ser.readline()",
      "value = int(line.decode().rstrip())",
      "if value > 500:",
      "print('HIGH', value)",
      "else:",
      "print('low', value)",
    ],
    { initial: "Serial monitor: waiting", status: "Waiting for your Python..." },
    "potentiometer",
  ),
  lesson(
    404,
    "Brightness from Python",
    "In 402 your bytes flipped the LED fully on or fully off. Now you'll set it to any level in between. The sketch calls Serial.parseInt(), which watches the incoming bytes and assembles the digits into one whole number — send \"180\" and it hands back the int 180 — then analogWrite(ledPin, that) drives the LED at that brightness with PWM, where 0 is off and 255 is full. parseInt keeps reading until it meets a non-digit, so you finish every value with \"\\n\" to tell it the number is complete. You can't write an int straight onto the wire — the wire only carries bytes — so str(level) makes it text, + \"\\n\" adds the terminator, and .encode() turns the whole string into bytes for ser.write. Step through a few levels with a pause between each and the LED fades, every step exactly the number you sent.",
    "The Uno runs the brightness sketch shown on the right. Wire pin 9 -> resistor -> LED -> a GND pin (pin 9 can do PWM), and connect the PC to the Uno with the USB cable. Your Python sends brightness numbers from 0 to 255.",
    ["pc", "led", "resistor"],
    "import serial\nimport time\n\nser = serial.Serial('COM4', 9600, timeout=1)\ntime.sleep(2)\n\n# Send a brightness (0-255) as text ending in \"\\n\" so parseInt knows the\n# number is finished. Step through several levels and watch the LED fade.\n",
    "int ledPin = 9;\n\nvoid setup() {\n    Serial.begin(9600);\n    pinMode(ledPin, OUTPUT);\n}\n\nvoid loop() {\n    if (Serial.available() > 0) {\n        int brightness = Serial.parseInt();\n        analogWrite(ledPin, brightness);\n    }\n}\n",
    [
      "for level in [0, 64, 128, 192, 255]:",
      "command = str(level) + '\\n'",
      "ser.write(command.encode())",
      "print('brightness', level)",
      "time.sleep(1)",
    ],
    { initial: "LED: off", status: "Waiting for your Python..." },
    "led",
  ),
  lesson(
    405,
    "Two Values (CSV)",
    "One line can carry more than one reading. This sketch measures TWO sensors — a potentiometer on A0 and a light sensor on A1 — and sends them on a single line separated by a comma: Serial.print(pot), then Serial.print(\",\"), then Serial.println(light) produces a line like \"742,318\". That comma-separated shape is called CSV, and every language knows how to take it apart. On your side, after readline().decode().rstrip() gives you the string \"742,318\", line.split(',') breaks it at the comma into a list: ['742', '318']. Index that list — parts[0] is the first value, parts[1] the second — and int() each into a real number. Now both sensors are in Python at the same moment, each the genuine reading its own pin measured.",
    "The Uno runs the two-sensor sketch shown on the right. Wire the potentiometer SIG -> A0 (VCC -> 5V, GND -> a GND pin) and the light sensor AO -> A1 (VCC -> 5V, GND -> a GND pin). Connect the PC to the Uno with the USB cable. Your Python splits each line into its two readings.",
    ["pc", "potentiometer", "photoresistor"],
    "import serial\n\nser = serial.Serial('COM4', 9600, timeout=1)\n\n# Each line is two sensor readings joined by a comma, like \"742,318\".\n# Read the line, split it on the comma, and turn each piece into an int.\n",
    "void setup() {\n    Serial.begin(9600);\n}\n\nvoid loop() {\n    int pot = analogRead(A0);\n    int light = analogRead(A1);\n    Serial.print(pot);\n    Serial.print(\",\");\n    Serial.println(light);\n    delay(200);\n}\n",
    [
      "while True:",
      "line = ser.readline().decode().rstrip()",
      "parts = line.split(',')",
      "pot = int(parts[0])",
      "light = int(parts[1])",
      "print('pot', pot, 'light', light)",
    ],
    { initial: "Serial monitor: waiting", status: "Waiting for your Python..." },
    "potentiometer",
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
