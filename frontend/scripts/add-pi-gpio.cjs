// One-shot, idempotent: add the Pi track's "Python GPIO" lessons (321-330) to the
// frontend data files, then mirror both to the backend copy. These are PYTHON
// lessons (kind:"python") running on the real in-memory interpreter
// (src/sim/python.ts), which drives the shared circuit runtime through a
// PyGpioIO callback bag — exactly like the Arduino course, but in Python.
//
// Staged shipping (matches the live-safe deploy cadence):
//   node scripts/add-pi-gpio.cjs 324   -> Deploy A (321-324: on/blink/multi/PWM)
//   node scripts/add-pi-gpio.cjs        -> all authored so far
// Re-running upserts, so it is always safe to run again.
//
// Authenticity is the hard rule: nothing is faked. The LED lights ONLY because
// GPIO.output(pin, GPIO.HIGH) actually executed in the interpreter; the fade in
// 324 happens because ChangeDutyCycle really drove the PWM duty on GPIO18. Wrong
// pin, missing setup, or unsupported syntax raises an honest Python error. The
// prompt/identity is pi@raspberrypi. Learner code is 4-space PEP-8 Python. One
// new concept per lesson, reusing the previous ones (the compounding rule).
const fs = require("fs");
const path = require("path");

const LIMIT = process.argv[2] ? Number(process.argv[2]) : 330;

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");

const lessonsPath = path.join(FE, "lessons.json");
const lessons = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));

// ---- lessons.json: activate the Python GPIO phase ----
const phase = lessons.phases.find((p) => p.id === "pi_gpio");
if (phase) delete phase.status; // drop "coming-soon" -> the phase goes live

const CREDIT =
  "Paul McWhorter, Raspberry Pi Python GPIO — toptechboy.com; support at patreon.com/PaulMcWhorter";

// Every Python GPIO lesson shares the same Arduino-shaped shell, but kind:"python"
// with a Python codeTemplate and a Pi-centered circuit.
const lesson = (id, title, description, notes, required, starter, hints, output) => ({
  id,
  phase: "pi_gpio",
  title,
  description,
  source: CREDIT,
  kind: "python",
  featuredComponent: "pi",
  circuit: {
    palette: ["pi", "led", "resistor"],
    required,
    notes,
  },
  codeTemplate: { language: "python", starter },
  hints,
  output,
});

const allLessons = [
  lesson(
    321,
    "Python on the Pi — Turn On an LED",
    "The Raspberry Pi has no separate 'sketch' — you write ordinary Python, and the RPi.GPIO library lets that Python reach out and control real pins. Three lines do it: setmode(GPIO.BCM) says 'number the pins the way the chip does', setup(17, GPIO.OUT) makes GPIO17 an output, and output(17, GPIO.HIGH) drives it to 3.3V. Current then flows GPIO17 → resistor → LED → GND, and the LED lights. Same electronics you already know — now in Python.",
    "Drag the Raspberry Pi onto the canvas. Wire GPIO17 → resistor → LED anode (A), and the LED cathode (C) → any GND pin on the Pi. Then finish the program so the LED turns on.",
    ["pi", "led", "resistor"],
    "import RPi.GPIO as GPIO\n\n# GPIO17 -> resistor -> LED(+),  LED(-) -> a GND pin.\n# Finish the three lines below to light the LED:\n",
    [
      "GPIO.setmode(GPIO.BCM)",
      "GPIO.setup(17, GPIO.OUT)",
      "GPIO.output(17, GPIO.HIGH)",
    ],
    { initial: "GPIO17: OFF", status: "Waiting for your Python..." },
  ),
  lesson(
    322,
    "Blink — Loops and time.sleep",
    "A steady light is a start; the 'Hello, World' of hardware is a blink. To blink, you turn the pin on, wait, turn it off, wait, and repeat forever. Python's while True: makes an endless loop, and time.sleep(seconds) pauses between each change so your eye can see it. Import the time module, then toggle GPIO17 HIGH and LOW inside the loop. Press Stop to end it — sleep() is interrupted just like the real thing.",
    "Same circuit as before: GPIO17 → resistor → LED → GND. The setup is done for you; add a loop that blinks the LED on and off half a second at a time.",
    ["pi", "led", "resistor"],
    "import RPi.GPIO as GPIO\nimport time\n\nGPIO.setmode(GPIO.BCM)\nGPIO.setup(17, GPIO.OUT)\n\n# Blink forever. Press Stop to end the loop.\n",
    [
      "while True:",
      "GPIO.output(17, GPIO.HIGH)",
      "time.sleep(0.5)",
      "GPIO.output(17, GPIO.LOW)",
    ],
    { initial: "GPIO17: OFF", status: "Waiting for your Python..." },
  ),
  lesson(
    323,
    "Three LEDs — A Traffic-Light Sequence",
    "One pin taught you output; now drive three. Give each LED pin a name — red = 17, yellow = 27, green = 22 — so your code reads like the circuit. Set each as an output, then light them one at a time inside the loop: HIGH, a short sleep, LOW, move to the next. Because each name is a real pin number, output(red, GPIO.HIGH) genuinely drives GPIO17. This is how any multi-output project — a traffic light, a bar graph, a keypad — is built.",
    "Wire three LEDs: GPIO17 → resistor → red LED → GND, GPIO27 → resistor → yellow LED → GND, GPIO22 → resistor → green LED → GND. The pin names and setup are done for you; write the loop that lights them in sequence.",
    ["pi", "led", "resistor"],
    "import RPi.GPIO as GPIO\nimport time\n\nGPIO.setmode(GPIO.BCM)\nred = 17\nyellow = 27\ngreen = 22\nGPIO.setup(red, GPIO.OUT)\nGPIO.setup(yellow, GPIO.OUT)\nGPIO.setup(green, GPIO.OUT)\n\n# Light red, then yellow, then green — one at a time, forever.\n",
    [
      "while True:",
      "GPIO.output(red, GPIO.HIGH)",
      "time.sleep(0.3)",
      "GPIO.output(red, GPIO.LOW)",
      "GPIO.output(yellow, GPIO.HIGH)",
      "GPIO.output(yellow, GPIO.LOW)",
      "GPIO.output(green, GPIO.HIGH)",
      "GPIO.output(green, GPIO.LOW)",
    ],
    { initial: "GPIO17/27/22: OFF", status: "Waiting for your Python..." },
  ),
  lesson(
    324,
    "PWM — Fade an LED Smoothly",
    "A digital pin is only ever fully on or fully off — so how do you dim an LED? You blink it faster than the eye can see and vary how much of each cycle is 'on': that fraction is the duty cycle, and the technique is PWM (Pulse-Width Modulation). GPIO.PWM(18, 1000) makes a 1000 Hz PWM signal on GPIO18; start(0) begins it at 0% (off). Then ChangeDutyCycle(percent) sets the brightness. Sweep the duty 0→100 and back with a for loop over range(0, 21), and the LED breathes.",
    "Wire GPIO18 → resistor → LED → GND. The pin is set up as an output for you; create a PWM signal on it and fade the LED up and down in a loop.",
    ["pi", "led", "resistor"],
    "import RPi.GPIO as GPIO\nimport time\n\nGPIO.setmode(GPIO.BCM)\nGPIO.setup(18, GPIO.OUT)\n\n# Create a PWM signal on GPIO18 and fade the LED up and down.\n",
    [
      "led = GPIO.PWM(18, 1000)",
      "led.start(0)",
      "while True:",
      "for i in range(0, 21):",
      "led.ChangeDutyCycle(i * 5)",
      "time.sleep(0.05)",
      "led.ChangeDutyCycle(100 - i * 5)",
    ],
    { initial: "GPIO18: 0%", status: "Waiting for your Python..." },
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

// ---- components.json: add the Raspberry Pi board for the Component Guide ----
const componentsPath = path.join(FE, "components.json");
const comps = JSON.parse(fs.readFileSync(componentsPath, "utf8"));
const pi = {
  id: "pi",
  name: "Raspberry Pi — Single-Board Computer",
  category: "controller",
  function:
    "A full Linux computer on one board. Its 40-pin GPIO header lets Python turn real pins HIGH or LOW, read buttons, and make PWM — the same electronics you learned on the Arduino, now driven by Python instead of a compiled sketch.",
  science:
    "The GPIO pins connect to a Broadcom SoC (system-on-chip). Under the RPi.GPIO library, 'BCM' numbering names each pin the way the chip does (GPIO17, GPIO27, …) rather than by its physical header position. A pin set as an output is a transistor switch tying it to 3.3V (HIGH) or 0V (LOW). The Pi has no analog-to-digital converter and its logic level is 3.3V, not 5V — so unlike the Uno, you never feed a Pi input pin more than 3.3V.",
  specs: {
    processor: "Broadcom SoC (ARM)",
    gpioPins: "40-pin header, BCM-numbered GPIO2–GPIO27",
    logicLevel: "3.3V (NOT 5V tolerant)",
    pinCurrent: "16mA per pin recommended",
    power: "3V3 and 5V rails, multiple GND pins",
  },
  notes:
    "The header carries 3V3, 5V, GND, and GPIO pins. Drive LEDs from a GPIO pin through a resistor to a GND pin. Never connect 5V to a GPIO input — the pins are only 3.3V tolerant. There is no analogRead here: GPIO pins are digital in/out (with PWM), not analog.",
  terminals: "40-pin GPIO header: 3V3, 5V, GND ×8, and BCM GPIO2–GPIO27.",
};
{
  const idx = comps.components.findIndex((c) => c.id === "pi");
  if (idx >= 0) comps.components[idx] = pi;
  else comps.components.push(pi);
}

const writeBoth = (name, obj) => {
  const text = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(path.join(FE, name), text);
  fs.writeFileSync(path.join(BE, name), text);
  console.log("wrote", name, "-> frontend + backend");
};
writeBoth("lessons.json", lessons);
writeBoth("components.json", comps);
console.log(
  "pi python-gpio lessons through",
  LIMIT + ":",
  toAdd.map((l) => l.id).join(", "),
  "| total lessons:",
  lessons.lessons.length,
);
