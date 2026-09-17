// One-shot, idempotent: add the Nano track's "Control Systems" lessons (215-220)
// to the frontend data files, then mirror both to the backend copy. The BNO055
// (`imu`) and `servo` components already exist, so this only touches lessons.json.
//
// Staged shipping (matches the live-safe deploy cadence):
//   node scripts/add-nano-control.cjs 217   -> Deploy A (215-217)
//   node scripts/add-nano-control.cjs 219   -> Deploy B (218-219)
//   node scripts/add-nano-control.cjs        -> Deploy C (all, 220)
// Re-running upserts, so it is always safe to run again.
//
// Authentic feedback control: the IMU rides on a servo-actuated platform, so the
// servo's angle physically changes the tilt the sensor measures (engine plant
// coupling). Learners build a self-leveling platform from proportional -> PI ->
// full PID. P-only leaves a genuine steady-state offset; the integral removes it;
// the derivative damps it. All emergent from real math + millis() timing. Because
// the sim's loop closes with a one-sample delay, proportional gain must stay < 1
// for stability (Kp = 0.5) — itself authentic digital-control behavior.
// 4-space learner indentation.
const fs = require("fs");
const path = require("path");

const LIMIT = process.argv[2] ? Number(process.argv[2]) : 220;

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");

const lessonsPath = path.join(FE, "lessons.json");
const lessons = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));

// ---- lessons.json: activate the Control Systems phase ----
const phase = lessons.phases.find((p) => p.id === "nano_control");
if (phase) delete phase.status; // drop "coming-soon" -> the phase goes live

// Shared plumbing header. `globals` are file-scope variables that must persist
// across loop() iterations (the integral accumulator, prevError, the loop timer);
// `setupExtra` runs once at the end of setup() (used to prime the timer so the
// first dt is one loop period, not the whole boot delay).
const header = (globals, setupExtra) =>
  "#include <Wire.h>\n" +
  "#include <Adafruit_Sensor.h>\n" +
  "#include <Adafruit_BNO055.h>\n" +
  "#include <utility/imumaths.h>\n" +
  "#include <Servo.h>\n\n" +
  "Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire);\n" +
  "Servo platform;\n" +
  (globals || "") +
  "\nvoid setup() {\n" +
  "    Serial.begin(115200);\n" +
  "    if (!bno.begin()) {\n" +
  '        Serial.println("No BNO055 detected");\n' +
  "        while (1);\n" +
  "    }\n" +
  "    platform.attach(9);\n" +
  "    delay(1000);\n" +
  (setupExtra || "") +
  "}\n\n";

const CREDIT =
  "Paul McWhorter, Arduino/IMU + PID lessons — toptechboy.com; Adafruit_BNO055 sensorapi example";

const NOTES =
  "The IMU rides on a servo-driven platform. Servo: PWM (signal) -> pin 9, V+ -> 5V, GND -> GND. IMU: VIN -> 5V, GND -> GND, SDA -> A4, SCL -> A5.";

const circuit = { palette: ["imu", "servo"], required: ["imu", "servo"], notes: NOTES };

const allLessons = [
  {
    id: 215,
    phase: "nano_control",
    title: "Command the Platform",
    description:
      "Control starts with an actuator. Bolt the IMU onto a hobby servo and you have a platform whose tilt you can command: platform.write(angle) drives the horn to any position from 0 to 180 degrees, with 90 as level. Sweep it end to end and watch the platform swing. Right now you are steering it blind — open-loop, no feedback. In the next lessons the IMU will tell the servo what to do, but first make sure you can move it on command.",
    source: CREDIT,
    featuredComponent: "servo",
    circuit,
    codeTemplate: {
      language: "cpp",
      starter:
        header("", "") +
        "void loop() {\n    // Sweep the platform by writing an angle to the servo.\n}",
    },
    hints: [
      "int angle = map(millis() % 3000, 0, 3000, 0, 180);",
      "platform.write(angle);",
      'Serial.print("Servo: ");\n    Serial.println(angle);',
      "delay(20);",
    ],
    output: { initial: "Servo: --", status: "Waiting for sketch..." },
  },
  {
    id: 216,
    phase: "nano_control",
    title: "Read the Tilt Error",
    description:
      "A controller acts on error: how far the thing you are controlling is from where you want it. Here the goal (the setpoint) is level, pitch = 0. Read the fused pitch from the IMU and compute error = setpoint - pitch. Tilt the platform and watch the error grow and flip sign with the lean. You are not moving the servo yet — this lesson is about seeing the one number the whole control loop is built to drive to zero.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit,
    codeTemplate: {
      language: "cpp",
      starter:
        header("", "") +
        "void loop() {\n    // Read the pitch, then compute the error from level (0).\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event);\n    float pitch = event.orientation.z;",
      "float error = 0 - pitch;",
      'Serial.print("Pitch: ");\n    Serial.print(pitch);\n    Serial.print("  Error: ");\n    Serial.println(error);',
      "delay(50);",
    ],
    output: { initial: "Pitch: --  Error: --", status: "Waiting for sketch..." },
  },
  {
    id: 217,
    phase: "nano_control",
    title: "Proportional Control",
    description:
      "Now close the loop. Proportional control nudges the servo in proportion to the error: command = 90 + Kp * error, then constrain it to the servo's 0..180 range. The bigger the tilt, the harder the servo pushes back. Tilt the base and the platform fights to level itself — but settles a little short: with proportional-only control the servo needs a standing error to hold any correction, so a steady offset remains. That leftover tilt is the itch the next lesson scratches. (Keep Kp below 1: this loop corrects one step per reading, and too much gain makes it overshoot and oscillate — real digital-control behavior.)",
    source: CREDIT,
    featuredComponent: "imu",
    circuit,
    codeTemplate: {
      language: "cpp",
      starter:
        header("", "") +
        "void loop() {\n    // Read the error, then drive the servo proportionally.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event);\n    float error = 0 - event.orientation.z;",
      "float Kp = 0.5;\n    float command = 90 + Kp * error;",
      "platform.write(constrain(command, 0, 180));",
      'Serial.print("Error: ");\n    Serial.print(error);\n    Serial.print("  Servo: ");\n    Serial.println(command);',
      "delay(20);",
    ],
    output: { initial: "Error: --  Servo: --", status: "Waiting for sketch..." },
  },
  {
    id: 218,
    phase: "nano_control",
    title: "Integral — Kill the Offset",
    description:
      "Proportional control leaves a standing error. The integral term erases it by remembering the past: it sums the error over time — integral += error * dt — and adds Ki * integral to the command. As long as any error lingers, that sum keeps growing and keeps pushing, so the only place the platform can rest is exactly level. You need real elapsed time for the sum, so measure dt with millis(). Watch the residual tilt from Lesson 217 drift the rest of the way to zero.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit,
    codeTemplate: {
      language: "cpp",
      starter:
        header(
          "float integral = 0;\nunsigned long lastTime = 0;\n",
          "    lastTime = millis();\n",
        ) +
        "void loop() {\n    // Accumulate the error over time and add an integral term.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event);\n    float error = 0 - event.orientation.z;",
      "unsigned long now = millis();\n    float dt = (now - lastTime) / 1000.0;\n    lastTime = now;",
      "integral += error * dt;",
      "float Kp = 0.5;\n    float Ki = 0.4;\n    float command = 90 + Kp * error + Ki * integral;\n    platform.write(constrain(command, 0, 180));",
      'Serial.print("Error: ");\n    Serial.print(error);\n    Serial.print("  Integral: ");\n    Serial.println(integral);',
      "delay(20);",
    ],
    output: { initial: "Error: --  Integral: --", status: "Waiting for sketch..." },
  },
  {
    id: 219,
    phase: "nano_control",
    title: "Derivative — Damp the Overshoot",
    description:
      "Proportional and integral both push harder the longer the error lasts — which can make the platform race past level and overshoot. The derivative term is the brake: it looks at how fast the error is changing, derivative = (error - prevError) / dt, and pushes against that motion. Add Kd * derivative and the platform settles smoothly instead of ringing. Store prevError each pass so you can compare. That is all three terms — P, I, D — working together.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit,
    codeTemplate: {
      language: "cpp",
      starter:
        header(
          "float integral = 0;\nfloat prevError = 0;\nunsigned long lastTime = 0;\n",
          "    lastTime = millis();\n",
        ) +
        "void loop() {\n    // Add a derivative term that opposes fast changes in error.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event);\n    float error = 0 - event.orientation.z;",
      "unsigned long now = millis();\n    float dt = (now - lastTime) / 1000.0;\n    lastTime = now;",
      "integral += error * dt;\n    float derivative = (error - prevError) / dt;\n    prevError = error;",
      "float Kp = 0.5;\n    float Ki = 0.4;\n    float Kd = 0.1;\n    float command = 90 + Kp * error + Ki * integral + Kd * derivative;\n    platform.write(constrain(command, 0, 180));",
      'Serial.print("Error: ");\n    Serial.print(error);\n    Serial.print("  D: ");\n    Serial.println(derivative);',
      "delay(20);",
    ],
    output: { initial: "Error: --  D: --", status: "Waiting for sketch..." },
  },
  {
    id: 220,
    phase: "nano_control",
    title: "PID Self-Leveling Platform",
    description:
      "Put all three terms into one controller and gate it on a healthy, calibrated sensor. Each pass: read the error, update the integral and derivative, and drive the servo with command = 90 + Kp*error + Ki*integral + Kd*derivative. Only act once bno.isFullyCalibrated() is true, so the platform never chases a bad reading — exactly what a real self-balancing machine does. Tilt the base and the platform holds level: sensor fusion feeding a PID loop feeding an actuator. You have built a complete control system, by hand, from the accelerometer up.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit,
    codeTemplate: {
      language: "cpp",
      starter:
        header(
          "float integral = 0;\nfloat prevError = 0;\nunsigned long lastTime = 0;\n",
          "    lastTime = millis();\n",
        ) +
        "void loop() {\n    // Full PID: level the platform, but only when calibrated.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event);\n    float error = 0 - event.orientation.z;",
      "unsigned long now = millis();\n    float dt = (now - lastTime) / 1000.0;\n    lastTime = now;\n    integral += error * dt;\n    float derivative = (error - prevError) / dt;\n    prevError = error;",
      "float command = 90 + 0.5 * error + 0.4 * integral + 0.1 * derivative;\n    platform.write(constrain(command, 0, 180));",
      'if (bno.isFullyCalibrated()) {\n        Serial.print("Level error: ");\n        Serial.print(error);\n        Serial.println("  [holding]");\n    } else {\n        Serial.println("Calibrating...");\n    }',
      "delay(20);",
    ],
    output: { initial: "Level error: --", status: "Waiting for sketch..." },
  },
];

const toAdd = allLessons.filter((l) => l.id <= LIMIT);
for (const lesson of toAdd) {
  const existing = lessons.lessons.findIndex((l) => l.id === lesson.id);
  if (existing >= 0) {
    lessons.lessons[existing] = lesson;
  } else {
    let insertAt = lessons.lessons.findIndex((l) => l.id > lesson.id);
    if (insertAt < 0) insertAt = lessons.lessons.length;
    lessons.lessons.splice(insertAt, 0, lesson);
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
  "nano control lessons through",
  LIMIT + ":",
  toAdd.map((l) => l.id).join(", "),
  "| total lessons:",
  lessons.lessons.length,
);
