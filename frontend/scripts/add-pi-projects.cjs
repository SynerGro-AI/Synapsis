// One-shot, idempotent: add the Pi track's "GPIO Projects" lessons (331-338) to
// the frontend data files, then mirror both to the backend copy. These are the
// PYTHON capstone-project lessons (kind:"python"), running on the same real
// in-memory interpreter (src/sim/python.ts) that drives the shared circuit
// runtime through a PyGpioIO callback bag — exactly like the pi_gpio course.
//
// This phase deepens PROGRAMMING (functions, lists, timing/games, state
// machines) and INTEGRATION on the parts you already met in 321-330, and adds
// exactly one new component: the RGB LED (335, three PWM channels -> one color).
//
// Staged shipping (matches the live-safe deploy cadence):
//   node scripts/add-pi-projects.cjs 334   -> Deploy A (331-334, zero-engine)
//   node scripts/add-pi-projects.cjs 336   -> Deploy B (335-336, rgbled engine path)
//   node scripts/add-pi-projects.cjs        -> Deploy C (all: 337-338 + finalize)
// Re-running upserts, so it is always safe to run again.
//
// Authenticity is the hard rule: nothing is faked. Each LED lights ONLY because
// GPIO.output(pin, GPIO.HIGH) actually executed; the dimmer really steps the PWM
// duty on GPIO18; the reaction timer measures a genuine time.time() delta; the
// random wait is a real random.uniform(). Wrong pin, missing setup, or
// unsupported syntax raises an honest Python error. Identity is pi@raspberrypi.
// Learner Python is 4-space PEP-8. One new idea per lesson, reusing the last.
const fs = require("fs");
const path = require("path");

const LIMIT = process.argv[2] ? Number(process.argv[2]) : 338;

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");

const lessonsPath = path.join(FE, "lessons.json");
const lessons = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));

// ---- lessons.json: activate + re-scope the projects phase ----
// The original scaffold named this "Desktop & Projects" (graphical desktop /
// VNC / IP camera / near-space) — none of which can be simulated truthfully.
// Re-scope to authentic, fully-simulatable GPIO projects that compound on the
// pi_gpio course. Renaming here is idempotent.
const phase = lessons.phases.find((p) => p.id === "pi_projects");
if (phase) {
  delete phase.status; // drop "coming-soon" -> the phase goes live
  phase.name = "GPIO Projects";
  phase.concepts = [
    "Functions & lists",
    "Timing & games",
    "RGB color mixing",
    "Integrated devices",
  ];
}

const CREDIT =
  "Paul McWhorter, Raspberry Pi Python GPIO — toptechboy.com; support at patreon.com/PaulMcWhorter";

// Same Arduino-shaped shell as pi_gpio, but kind:"python" with a Python
// codeTemplate and a Pi-centered circuit. featured defaults to the Pi board.
const lesson = (id, title, description, notes, required, starter, hints, output, featured) => ({
  id,
  phase: "pi_projects",
  title,
  description,
  source: CREDIT,
  kind: "python",
  featuredComponent: featured ?? "pi",
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
    331,
    "Functions — Don't Repeat Yourself",
    "Look back at the traffic light: three LEDs, and for each one you wrote the same three lines — HIGH, sleep, LOW. When you catch yourself repeating code, wrap it in a function. def light(pin, seconds): names a reusable block; the parts that change become parameters (pin and seconds). Inside, GPIO.output(pin, GPIO.HIGH) drives whichever pin you passed. Now the loop reads like plain English — light(green, 3) — and each call genuinely blinks that real LED. One definition, many uses: this is the single biggest idea in programming.",
    "Wire three LEDs: GPIO17 → resistor → red LED → GND, GPIO27 → resistor → yellow LED → GND, GPIO22 → resistor → green LED → GND. The pin names and setup are done; write a light(pin, seconds) function, then call it for green, yellow, and red in the loop.",
    ["pi", "led", "resistor"],
    "import RPi.GPIO as GPIO\nimport time\n\nGPIO.setmode(GPIO.BCM)\nred = 17\nyellow = 27\ngreen = 22\nGPIO.setup(red, GPIO.OUT)\nGPIO.setup(yellow, GPIO.OUT)\nGPIO.setup(green, GPIO.OUT)\n\n# Write a function light(pin, seconds) that blinks one LED,\n# then call it in the loop: green, yellow, red.\n",
    [
      "def light(pin, seconds):",
      "GPIO.output(pin, GPIO.HIGH)",
      "time.sleep(seconds)",
      "GPIO.output(pin, GPIO.LOW)",
      "while True:",
      "light(green, 3)",
      "light(yellow, 1)",
      "light(red, 3)",
    ],
    { initial: "Traffic light: idle", status: "Waiting for your Python..." },
  ),
  lesson(
    332,
    "Lists & Loops — A Larson Scanner",
    "Naming pins red, yellow, green works for three; for a whole row of LEDs you want a list. pins = [17, 27, 22, 5] holds four pin numbers in order, and pins[i] reads the one at position i. You already used a list to set them all up with one loop. Now animate: sweep i up the row with for i in range(0, 4), lighting pins[i] briefly, then sweep back down with for i in range(2, 0, -1). The light bounces end to end — the Larson scanner from Knight Rider — and every step drives a real GPIO pin.",
    "Wire four LEDs, one per pin: GPIO17, GPIO27, GPIO22, and GPIO5, each through a resistor to a GND pin. The list and setup loop are done; write the two sweeps that chase the light up and back.",
    ["pi", "led", "resistor"],
    "import RPi.GPIO as GPIO\nimport time\n\nGPIO.setmode(GPIO.BCM)\npins = [17, 27, 22, 5]\nfor pin in pins:\n    GPIO.setup(pin, GPIO.OUT)\n\n# Sweep the light up the row and back down — a Larson scanner.\n",
    [
      "while True:",
      "for i in range(0, 4):",
      "GPIO.output(pins[i], GPIO.HIGH)",
      "time.sleep(0.08)",
      "GPIO.output(pins[i], GPIO.LOW)",
      "for i in range(2, 0, -1):",
    ],
    { initial: "Scanner: off", status: "Waiting for your Python..." },
  ),
  lesson(
    333,
    "Reaction-Timer Game",
    "Time to build a game. The Pi waits a random moment so you can't cheat, flashes the LED, and measures how fast you slap the button. Two new tools make it work: import random gives random.uniform(2, 5) — a real, unpredictable wait between 2 and 5 seconds — and time.time() returns the clock in seconds, so subtracting a start reading from an end reading gives the elapsed time. Read the button in a tight loop until it goes LOW, then print the difference in milliseconds. This is a genuine stopwatch built from the pieces you already know.",
    "Wire an LED (GPIO17 → resistor → LED → GND) and a button (GPIO4 → a GND pin). Setup is done; wait a random 2-5 seconds, flash the LED, then time the press and print the reaction time. Click the button on the canvas to play.",
    ["pi", "led", "resistor", "pushbutton"],
    "import RPi.GPIO as GPIO\nimport time\nimport random\n\nGPIO.setmode(GPIO.BCM)\nGPIO.setup(17, GPIO.OUT)\nGPIO.setup(4, GPIO.IN, pull_up_down=GPIO.PUD_UP)\n\n# Wait a random 2-5 s, flash the LED, then time how fast the\n# button is pressed. Print the reaction time in milliseconds.\n",
    [
      "GPIO.output(17, GPIO.LOW)",
      "time.sleep(random.uniform(2, 5))",
      "GPIO.output(17, GPIO.HIGH)",
      "start = time.time()",
      "while GPIO.input(4) == GPIO.HIGH:",
      "time.sleep(0.01)",
      "elapsed = time.time() - start",
      'print(f"Reaction time: {round(elapsed * 1000)} ms")',
    ],
    { initial: "Reaction game: ready", status: "Waiting for your Python..." },
  ),
  lesson(
    334,
    "Dimmer — a State Machine",
    "A real dimmer switch remembers its setting and steps to the next one each tap. Build that with a list of brightness levels and an index that says where you are: levels = [0, 25, 50, 100] and index = 0. On each press, add one to index, wrap back to 0 when it runs past the end (if index >= len(levels)), and push the new brightness with led.ChangeDutyCycle(levels[index]). The short sleep right after is a debounce so one press counts once. index is the machine's memory — a variable that carries state between passes of the loop.",
    "Wire an LED for PWM (GPIO18 → resistor → LED → GND) and a button (GPIO4 → a GND pin). The PWM and level list are set up; write the loop so each press steps to the next brightness and wraps around.",
    ["pi", "led", "resistor", "pushbutton"],
    "import RPi.GPIO as GPIO\nimport time\n\nGPIO.setmode(GPIO.BCM)\nGPIO.setup(18, GPIO.OUT)\nGPIO.setup(4, GPIO.IN, pull_up_down=GPIO.PUD_UP)\n\nled = GPIO.PWM(18, 1000)\nled.start(0)\nlevels = [0, 25, 50, 100]\nindex = 0\n\n# Each press steps to the next brightness, wrapping back to 0.\n# Debounce so one press = one step.\n",
    [
      "while True:",
      "if GPIO.input(4) == GPIO.LOW:",
      "index = index + 1",
      "if index >= len(levels):",
      "index = 0",
      "led.ChangeDutyCycle(levels[index])",
      "time.sleep(0.3)",
      "time.sleep(0.01)",
    ],
    { initial: "Dimmer: 0%", status: "Waiting for your Python..." },
  ),
  lesson(
    335,
    "RGB LED — Mix a Color",
    "One package, three LEDs — red, green, and blue — sharing a common cathode. Give each its own PWM channel and you can mix any color by choosing how bright each one glows, exactly like a TV pixel. Set up three pins, wrap each in its own GPIO.PWM, start them at 0, then dial in the mix: red.ChangeDutyCycle(100), green.ChangeDutyCycle(0), blue.ChangeDutyCycle(100) makes purple. The color you see is the honest sum of three real PWM duties — change the numbers and the hue shifts.",
    "Wire an RGB LED (common cathode): R → resistor → GPIO17, G → resistor → GPIO27, B → resistor → GPIO22, and COM → a Pi GND pin. Set up three PWM channels and mix purple — full red, no green, full blue.",
    ["pi", "rgbled", "resistor"],
    "import RPi.GPIO as GPIO\nimport time\n\nGPIO.setmode(GPIO.BCM)\nred_pin = 17\ngreen_pin = 27\nblue_pin = 22\nGPIO.setup(red_pin, GPIO.OUT)\nGPIO.setup(green_pin, GPIO.OUT)\nGPIO.setup(blue_pin, GPIO.OUT)\n\n# Wrap each pin in its own PWM channel, start at 0,\n# then mix purple: full red, no green, full blue.\n",
    [
      "red = GPIO.PWM(red_pin, 1000)",
      "green = GPIO.PWM(green_pin, 1000)",
      "blue = GPIO.PWM(blue_pin, 1000)",
      "red.start(0)",
      "green.start(0)",
      "blue.start(0)",
      "red.ChangeDutyCycle(100)",
      "green.ChangeDutyCycle(0)",
      "blue.ChangeDutyCycle(100)",
      "while True:",
      "time.sleep(1)",
    ],
    { initial: "RGB LED: off", status: "Waiting for your Python..." },
    "rgbled",
  ),
  lesson(
    336,
    "Rainbow — Cycle the Color Wheel",
    "A fixed color is nice; a moving one is magic. Walk around the color wheel by cross-fading the channels: as red falls from full to zero, bring green up from zero to full — red slides into orange, yellow, then green. Repeat green→blue, then blue→red, and the RGB LED loops the whole rainbow forever. Each pass uses for i in range(0, 101) so i is a percentage, ChangeDutyCycle(100 - i) fades one channel down while ChangeDutyCycle(i) fades the partner up. Every frame is a genuine pair of PWM duties.",
    "Reuse your RGB LED from the last lesson (R→GPIO17, G→GPIO27, B→GPIO22, COM→Pi GND). Start red at full, then cross-fade red→green→blue→red in a loop to cycle the color wheel.",
    ["pi", "rgbled", "resistor"],
    "import RPi.GPIO as GPIO\nimport time\n\nGPIO.setmode(GPIO.BCM)\nred_pin = 17\ngreen_pin = 27\nblue_pin = 22\nGPIO.setup(red_pin, GPIO.OUT)\nGPIO.setup(green_pin, GPIO.OUT)\nGPIO.setup(blue_pin, GPIO.OUT)\n\nred = GPIO.PWM(red_pin, 1000)\ngreen = GPIO.PWM(green_pin, 1000)\nblue = GPIO.PWM(blue_pin, 1000)\nred.start(100)\ngreen.start(0)\nblue.start(0)\n\n# Cross-fade red -> green -> blue -> red, forever.\n",
    [
      "while True:",
      "for i in range(0, 101):",
      "red.ChangeDutyCycle(100 - i)",
      "green.ChangeDutyCycle(i)",
      "time.sleep(0.02)",
      "green.ChangeDutyCycle(100 - i)",
      "blue.ChangeDutyCycle(i)",
      "blue.ChangeDutyCycle(100 - i)",
      "red.ChangeDutyCycle(i)",
    ],
    { initial: "Rainbow: idle", status: "Waiting for your Python..." },
    "rgbled",
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
  "pi gpio-projects lessons through",
  LIMIT + ":",
  toAdd.map((l) => l.id).join(", "),
  "| total lessons:",
  lessons.lessons.length,
);
