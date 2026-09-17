// One-shot, idempotent: add the Nano track's "Sensor Fusion" lessons (207-214)
// to the frontend data files, then mirror both to the backend copy. The BNO055
// component already exists (added by add-nano-imu.cjs), so this only touches
// lessons.json.
//
// Staged shipping (matches the live-safe deploy cadence):
//   node scripts/add-nano-fusion.cjs 209   -> Deploy A (207-209)
//   node scripts/add-nano-fusion.cjs 211   -> Deploy B (210-211)
//   node scripts/add-nano-fusion.cjs        -> Deploy C (all, 212-214)
// Re-running upserts, so it is always safe to run again.
//
// Blended, authentic pedagogy: 207-209 have learners compute tilt/heading from
// the raw sensors with real trig (atan2/sqrt) so they feel WHY fusion is needed;
// 210-214 consume the BNO055's genuine on-chip fused outputs (linear accel,
// gravity vector, quaternion, system status). 4-space learner indentation.
const fs = require("fs");
const path = require("path");

const LIMIT = process.argv[2] ? Number(process.argv[2]) : 214;

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");

const lessonsPath = path.join(FE, "lessons.json");
const lessons = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));

// ---- lessons.json: activate the Sensor Fusion phase ----
const phase = lessons.phases.find((p) => p.id === "sensor_fusion");
if (phase) delete phase.status; // drop "coming-soon" -> the phase goes live

const HEADER =
  "#include <Wire.h>\n" +
  "#include <Adafruit_Sensor.h>\n" +
  "#include <Adafruit_BNO055.h>\n" +
  "#include <utility/imumaths.h>\n\n" +
  "Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire);\n\n" +
  "void setup() {\n" +
  "    Serial.begin(115200);\n" +
  "    if (!bno.begin()) {\n" +
  '        Serial.println("No BNO055 detected");\n' +
  "        while (1);\n" +
  "    }\n" +
  "    delay(1000);\n" +
  "}\n\n";

const CREDIT = "Paul McWhorter, Arduino/IMU lessons — toptechboy.com; Adafruit_BNO055 sensorapi example";

const NOTES = "Same wiring as the Motion Basics lessons: VIN->5V, GND->GND, SDA->A4, SCL->A5.";

const allLessons = [
  {
    id: 207,
    phase: "sensor_fusion",
    title: "Roll & Pitch from Gravity",
    description:
      "Before you trust the chip's fused angles, feel where they come from. Held still, the accelerometer only feels gravity — 9.81 m/s^2 pouring across its three axes as you tilt. That means you can recover the board's tilt with pure trigonometry: roll = atan2(ay, az) and pitch = atan2(-ax, sqrt(ay^2 + az^2)), each times 180/PI to get degrees. Read the accelerometer, do the math, and watch your computed roll and pitch track the sliders exactly. This is fusion by hand.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: { palette: ["imu"], required: ["imu"], notes: NOTES },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER +
        "void loop() {\n    // Read the accelerometer, then compute roll and pitch with atan2.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event, Adafruit_BNO055::VECTOR_ACCELEROMETER);",
      "float roll = atan2(event.acceleration.y, event.acceleration.z) * 180 / PI;",
      "float pitch = atan2(-event.acceleration.x, sqrt(event.acceleration.y * event.acceleration.y + event.acceleration.z * event.acceleration.z)) * 180 / PI;",
      'Serial.print("Roll: ");\n    Serial.print(roll);\n    Serial.print(" Pitch: ");\n    Serial.println(pitch);',
      "delay(100);",
    ],
    output: { initial: "Roll: -- Pitch: --", status: "Waiting for sketch..." },
  },
  {
    id: 208,
    phase: "sensor_fusion",
    title: "Tilt-Compensated Heading",
    description:
      "A magnetometer is a compass — atan2 of its X and Y gives heading. But tilt the board and that flat compass swings wildly wrong, because the Earth's field now leaks into the vertical axis. The fix is to fuse two sensors: take roll and pitch from the accelerometer (Lesson 207), then use them to rotate the magnetic reading back to level before you read the angle. Tilt the board and watch the naive number drift while the tilt-compensated heading holds steady.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: { palette: ["imu"], required: ["imu"], notes: NOTES },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER +
        "void loop() {\n    // Get roll & pitch from accel, read the magnetometer,\n    // then compute a tilt-compensated heading.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event, Adafruit_BNO055::VECTOR_ACCELEROMETER);\n    float roll = atan2(event.acceleration.y, event.acceleration.z);\n    float pitch = atan2(-event.acceleration.x, sqrt(event.acceleration.y * event.acceleration.y + event.acceleration.z * event.acceleration.z));",
      "bno.getEvent(&event, Adafruit_BNO055::VECTOR_MAGNETOMETER);\n    float mx = event.magnetic.x;\n    float my = event.magnetic.y;\n    float mz = event.magnetic.z;",
      "float Xh = mx * cos(pitch) + my * sin(roll) * sin(pitch) + mz * cos(roll) * sin(pitch);\n    float Yh = my * cos(roll) - mz * sin(roll);\n    float heading = atan2(-Yh, Xh) * 180 / PI;\n    if (heading < 0) heading += 360;",
      'Serial.print("Heading: ");\n    Serial.println(heading);',
      "delay(100);",
    ],
    output: { initial: "Heading: --", status: "Waiting for sketch..." },
  },
  {
    id: 209,
    phase: "sensor_fusion",
    title: "The Fusion Advantage",
    description:
      "You have done fusion the hard way — now see why the BNO055 earns its keep. Print your hand-computed pitch (atan2 on the accelerometer) right next to the chip's fused event.orientation.z. In this simulator the model is clean, so the two agree; on real hardware the raw accelerometer number is jittery and jumps with every bump, while the fused one — blended with the gyroscope on-chip — stays smooth and absolute. Same angle, no math, no noise. That is what the on-board Cortex-M0 buys you.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: { palette: ["imu"], required: ["imu"], notes: NOTES },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER +
        "void loop() {\n    // Compute pitch from raw accel, then read the fused orientation.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event, Adafruit_BNO055::VECTOR_ACCELEROMETER);\n    float rawPitch = atan2(-event.acceleration.x, sqrt(event.acceleration.y * event.acceleration.y + event.acceleration.z * event.acceleration.z)) * 180 / PI;",
      "bno.getEvent(&event);\n    float fusedPitch = event.orientation.z;",
      'Serial.print("Raw pitch: ");\n    Serial.print(rawPitch);\n    Serial.print("  Fused pitch: ");\n    Serial.println(fusedPitch);',
      "delay(100);",
    ],
    output: { initial: "Raw pitch: --  Fused pitch: --", status: "Waiting for sketch..." },
  },
  {
    id: 210,
    phase: "sensor_fusion",
    title: "Linear Acceleration",
    description:
      "The raw accelerometer always feels gravity, which drowns out real motion. The BNO055 fixes this: ask for VECTOR_LINEARACCEL and it subtracts the gravity vector for you, leaving only the acceleration from actually moving the board. Hold it still and all three axes read about 0 — no gravity, no motion. (This simulator models a board that only tilts, never travels, so linear acceleration stays ~0; on real hardware, shove the sensor and the axis you pushed spikes.) This is the signal a step-counter or a dead-reckoning robot lives on.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: { palette: ["imu"], required: ["imu"], notes: NOTES },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER +
        "void loop() {\n    // Read linear acceleration (gravity removed) and print X, Y, Z.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event, Adafruit_BNO055::VECTOR_LINEARACCEL);",
      'Serial.print("X: ");\n    Serial.print(event.acceleration.x);',
      'Serial.print(" Y: ");\n    Serial.print(event.acceleration.y);',
      'Serial.print(" Z: ");\n    Serial.println(event.acceleration.z);',
      "delay(100);",
    ],
    output: { initial: "Linear: --", status: "Waiting for sketch..." },
  },
  {
    id: 211,
    phase: "sensor_fusion",
    title: "The Gravity Vector",
    description:
      "Linear acceleration is what is left after gravity is removed — so where did the gravity go? Ask for VECTOR_GRAVITY and the chip hands you the other half: a pure 9.81 m/s^2 vector pointing straight down, in the board's own frame. Add this to the linear acceleration and you get back the raw accelerometer. Tilt the board and watch the 9.81 pour between axes exactly as in Lesson 203 — but now cleanly separated from any motion. Its direction is, quite literally, which way is down.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: { palette: ["imu"], required: ["imu"], notes: NOTES },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER +
        "void loop() {\n    // Read the gravity vector and print X, Y, Z in m/s^2.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event, Adafruit_BNO055::VECTOR_GRAVITY);",
      'Serial.print("X: ");\n    Serial.print(event.acceleration.x);',
      'Serial.print(" Y: ");\n    Serial.print(event.acceleration.y);',
      'Serial.print(" Z: ");\n    Serial.println(event.acceleration.z);',
      "delay(100);",
    ],
    output: { initial: "Gravity: --", status: "Waiting for sketch..." },
  },
  {
    id: 212,
    phase: "sensor_fusion",
    title: "Quaternions",
    description:
      "Euler angles have a fatal flaw: point the board straight up and heading and roll collapse into the same motion — gimbal lock. Drones, phones, and game engines dodge it with quaternions, a four-number description of orientation (w, x, y, z) that never locks. The BNO055 outputs one directly: imu::Quaternion quat = bno.getQuat();. Read all four with quat.w()/.x()/.y()/.z(). It is a unit quaternion, so w^2 + x^2 + y^2 + z^2 always equals 1 — spin the board and watch the four numbers trade off while that length stays put.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: { palette: ["imu"], required: ["imu"], notes: NOTES },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER +
        "void loop() {\n    // Read the fused orientation as a quaternion and print w, x, y, z.\n}",
    },
    hints: [
      "imu::Quaternion quat = bno.getQuat();",
      'Serial.print("w: ");\n    Serial.print(quat.w());\n    Serial.print(" x: ");\n    Serial.print(quat.x());',
      'Serial.print(" y: ");\n    Serial.print(quat.y());\n    Serial.print(" z: ");\n    Serial.println(quat.z());',
      "delay(100);",
    ],
    output: { initial: "w: -- x: -- y: -- z: --", status: "Waiting for sketch..." },
  },
  {
    id: 213,
    phase: "sensor_fusion",
    title: "System Status",
    description:
      "A fused reading is only as good as the fusion engine behind it. The BNO055 will tell you how it is doing: bno.getSystemStatus(&status, &selfTest, &error) reports the running state (5 = sensor-fusion running), the power-on self-test result (0x0F = all four chips passed), and any system error (0 = none). Pair it with the calibration check from Lesson 206 and you can refuse to act on the sensor until it is both healthy and fully calibrated — exactly what a self-balancing robot should do before it trusts its own angle.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: { palette: ["imu"], required: ["imu"], notes: NOTES },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER +
        "void loop() {\n    // Read the system status, then gate on full calibration.\n}",
    },
    hints: [
      "uint8_t status = 0, selfTest = 0, error = 0;\n    bno.getSystemStatus(&status, &selfTest, &error);",
      'Serial.print("Status: ");\n    Serial.print(status);\n    Serial.print(" Self-test: ");\n    Serial.print(selfTest, HEX);\n    Serial.print(" Error: ");\n    Serial.println(error);',
      'if (bno.isFullyCalibrated()) {\n        Serial.println("Healthy and calibrated - ready.");\n    }',
      "delay(100);",
    ],
    output: { initial: "Status: --", status: "Waiting for sketch..." },
  },
  {
    id: 214,
    phase: "sensor_fusion",
    title: "Orientation Instrument",
    description:
      "Put it all together into one instrument. Each loop, read the fused heading from event.orientation, read the gravity-free motion from VECTOR_LINEARACCEL, and gate the whole thing on isFullyCalibrated() so you only report once the chip is sure. One tidy line — orientation, motion, and a readiness flag — is the exact feed a Sensor Fusion & Control project hands to a controller. You have built, by hand and then with the chip, everything a balancing robot needs to know which way is up.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: { palette: ["imu"], required: ["imu"], notes: NOTES },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER +
        "void loop() {\n    // Read fused heading + linear motion, then report only when calibrated.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event);\n    Serial.print(\"Heading: \");\n    Serial.print(event.orientation.x);",
      'bno.getEvent(&event, Adafruit_BNO055::VECTOR_LINEARACCEL);\n    Serial.print("  Motion Z: ");\n    Serial.print(event.acceleration.z);',
      'if (bno.isFullyCalibrated()) {\n        Serial.println("  [ready]");\n    } else {\n        Serial.println("  [calibrating]");\n    }',
      "delay(100);",
    ],
    output: { initial: "Heading: --  Motion Z: --", status: "Waiting for sketch..." },
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
  "nano sensor-fusion lessons through",
  LIMIT + ":",
  toAdd.map((l) => l.id).join(", "),
  "| total lessons:",
  lessons.lessons.length,
);
