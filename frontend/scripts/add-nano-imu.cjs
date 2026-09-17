// One-shot, idempotent: add the BNO055 9-axis IMU component and the Nano
// track's "Motion Basics" lessons (201-206) to the frontend data files, then
// mirror both to the backend copy.
//
// Staged shipping: `node scripts/add-nano-imu.cjs 202` writes only 201-202
// (Deploy A); `node scripts/add-nano-imu.cjs 206` (or no arg) writes all six
// (Deploy B). Re-running upserts, so it is always safe to run again.
//
// Authentic to the Adafruit_BNO055 `sensorapi.ino` IDE example: real I2C
// address 0x28, real getEvent/sensors_event_t API, 4-space learner indentation.
const fs = require("fs");
const path = require("path");

const LIMIT = process.argv[2] ? Number(process.argv[2]) : 206;

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

// ---- components.json: the BNO055 (the featured new part) ----
upsertComp({
  id: "imu",
  name: "BNO055 9-axis IMU (Adafruit)",
  category: "sensor",
  function:
    "A single chip that knows which way it is pointing. It packs three sensors — an accelerometer (which way is down, plus any shove), a gyroscope (how fast it is spinning), and a magnetometer (a compass) — and a small processor that fuses all nine readings into one clean answer: the board's heading, roll, and pitch, in degrees, updated a hundred times a second. Point it, tilt it, spin it, and it tells you exactly how. This is the sensor that lets a drone hold level, a phone rotate its screen, and a self-balancing robot stay upright.",
  science:
    "Nine 'axes' = three sensors, three axes each. The MEMS accelerometer measures acceleration in m/s^2 on X, Y, Z; sitting still it reads Earth's gravity (~9.81 m/s^2) pointing down, so from its direction you can work out tilt. The gyroscope measures angular rate in degrees/second on each axis — it sees rotation, not position, so it is zero when the board is held still. The magnetometer measures the Earth's magnetic field in microtesla to find true heading. Raw accel is noisy and gyro drifts, so the BNO055's built-in ARM Cortex-M0 runs a sensor-fusion algorithm that blends all three into a stable absolute orientation (Euler angles or a quaternion). The Adafruit_BNO055 library talks to it over I2C at address 0x28: bno.begin() starts it, then sensors_event_t event; bno.getEvent(&event); fills event.orientation.x/.y/.z (heading/roll/pitch in degrees). Pass a vector type — bno.getEvent(&event, Adafruit_BNO055::VECTOR_ACCELEROMETER) — to read event.acceleration or event.gyro instead.",
  specs: {
    axes: "9 (3-axis accel + 3-axis gyro + 3-axis magnetometer)",
    fusion: "on-chip ARM Cortex-M0 — absolute orientation, no math on the Uno",
    output: "Euler angles (deg), quaternion, accel (m/s^2), gyro (deg/s), mag (uT)",
    interface: "I2C, default address 0x28",
    power: "VIN 3.3-5V (on-board regulator)",
  },
  notes:
    "Four wires: VIN->5V, GND->GND, SDA->A4, SCL->A5 (A4/A5 are the Uno's fixed I2C pins). In code: #include <Adafruit_Sensor.h> and <Adafruit_BNO055.h>, then Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire); guard bno.begin() so you know it was found. The gyroscope reads ~0 while the board is still — it senses turning, not tilt; use the accelerometer or the fused orientation for angle.",
  terminals: "VIN , GND , SDA (->A4) , SCL (->A5)",
});

// ---- lessons.json: activate the Motion Basics phase ----
const phase = lessons.phases.find((p) => p.id === "motion_basics");
if (phase) delete phase.status; // drop "coming-soon" -> the phase goes live

// ---- lessons.json: Motion Basics 201-206 ----
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

const allLessons = [
  {
    id: 201,
    phase: "motion_basics",
    title: "Meet the IMU",
    description:
      "Wire up the BNO055 9-axis IMU and prove the Uno can talk to it. Four wires carry power and the I2C bus: VIN->5V, GND->GND, SDA->A4, SCL->A5. Create the sensor object with its real I2C address 0x28, then call bno.begin() inside setup() and guard it — if the chip isn't found, say so and stop. Get this handshake right and every later lesson just works.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: {
      palette: ["imu"],
      required: ["imu"],
      notes:
        "BNO055 -> Uno: VIN to 5V, GND to GND, SDA to A4, SCL to A5. A4 and A5 are the Uno's dedicated I2C pins — the sensor won't answer on any other pair. The address 0x28 in the constructor must match the hardware (it's the BNO055 default).",
    },
    codeTemplate: {
      language: "cpp",
      starter:
        "#include <Wire.h>\n#include <Adafruit_Sensor.h>\n#include <Adafruit_BNO055.h>\n#include <utility/imumaths.h>\n\n// Create the BNO055 object, then start it inside setup().\n\nvoid setup() {\n\n}\n\nvoid loop() {\n\n}",
    },
    hints: [
      "Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire);",
      "Serial.begin(115200);",
      'if (!bno.begin()) {\n        Serial.println("No BNO055 detected");\n        while (1);\n    }',
      "delay(1000);",
    ],
    output: { initial: "BNO055 not started", status: "Waiting for sketch..." },
  },
  {
    id: 202,
    phase: "motion_basics",
    title: "Reading Orientation",
    description:
      "Now that the IMU answers, ask it which way it's pointing. Each pass through loop(), make a sensors_event_t, fill it with bno.getEvent(&event), and read the fused orientation: event.orientation.x is heading (0-360), .y is roll, .z is pitch — all in degrees. Print them, then drag the Heading / Pitch / Roll sliders and watch the numbers track the board as it tilts live.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: {
      palette: ["imu"],
      required: ["imu"],
      notes:
        "Same wiring as Lesson 201: VIN->5V, GND->GND, SDA->A4, SCL->A5. Unwire SDA and the reading goes nan — exactly like the real sensor dropping off the bus.",
    },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER + "void loop() {\n    // Read an orientation event, then print heading, roll, pitch.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event);",
      'Serial.print("Heading: ");\n    Serial.print(event.orientation.x);',
      'Serial.print(" Roll: ");\n    Serial.print(event.orientation.y);',
      'Serial.print(" Pitch: ");\n    Serial.println(event.orientation.z);',
      "delay(100);",
    ],
    output: { initial: "Heading: --", status: "Waiting for sketch..." },
  },
  {
    id: 203,
    phase: "motion_basics",
    title: "Accelerometers",
    description:
      "Read the raw accelerometer instead of the fused angle. Pass a vector type to getEvent — bno.getEvent(&event, Adafruit_BNO055::VECTOR_ACCELEROMETER) — and event.acceleration.x/.y/.z give acceleration in m/s^2. Held still, the sensor still feels gravity: the three axes always add up to about 9.81 m/s^2, and tilting the board just pours that 9.81 from one axis into another. Tilt the sliders and watch it move.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: {
      palette: ["imu"],
      required: ["imu"],
      notes: "Same wiring as Lesson 201: VIN->5V, GND->GND, SDA->A4, SCL->A5.",
    },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER + "void loop() {\n    // Read the accelerometer vector and print X, Y, Z in m/s^2.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event, Adafruit_BNO055::VECTOR_ACCELEROMETER);",
      'Serial.print("X: ");\n    Serial.print(event.acceleration.x);',
      'Serial.print(" Y: ");\n    Serial.print(event.acceleration.y);',
      'Serial.print(" Z: ");\n    Serial.println(event.acceleration.z);',
      "delay(100);",
    ],
    output: { initial: "Accel: --", status: "Waiting for sketch..." },
  },
  {
    id: 204,
    phase: "motion_basics",
    title: "Gyroscopes",
    description:
      "The gyroscope measures rotation speed, not angle. Read it with Adafruit_BNO055::VECTOR_GYROSCOPE and event.gyro.x/.y/.z gives degrees per second on each axis. The key idea: hold the board still and the gyro reads ~0, because nothing is turning; only while you're actively moving a slider does it spike. That's what makes a gyro different from the accelerometer — it sees change, not position.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: {
      palette: ["imu"],
      required: ["imu"],
      notes: "Same wiring as Lesson 201: VIN->5V, GND->GND, SDA->A4, SCL->A5.",
    },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER + "void loop() {\n    // Read the gyroscope vector and print X, Y, Z in deg/s.\n}",
    },
    hints: [
      "sensors_event_t event;\n    bno.getEvent(&event, Adafruit_BNO055::VECTOR_GYROSCOPE);",
      'Serial.print("X: ");\n    Serial.print(event.gyro.x);',
      'Serial.print(" Y: ");\n    Serial.print(event.gyro.y);',
      'Serial.print(" Z: ");\n    Serial.println(event.gyro.z);',
      "delay(100);",
    ],
    output: { initial: "Gyro: --", status: "Waiting for sketch..." },
  },
  {
    id: 205,
    phase: "motion_basics",
    title: "Reading Raw Data",
    description:
      "Real projects read several quantities each loop. Reuse one sensors_event_t: call bno.getEvent(&event) for the fused heading, then bno.getEvent(&event, Adafruit_BNO055::VECTOR_ACCELEROMETER) for acceleration, printing after each. One tidy line per pass gives you orientation and motion side by side — the raw feed a filter or controller would consume.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: {
      palette: ["imu"],
      required: ["imu"],
      notes: "Same wiring as Lesson 201: VIN->5V, GND->GND, SDA->A4, SCL->A5.",
    },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER +
        "void loop() {\n    // Read orientation, then acceleration, into the same event.\n}",
    },
    hints: [
      "sensors_event_t event;",
      'bno.getEvent(&event);\n    Serial.print("Heading: ");\n    Serial.print(event.orientation.x);',
      'bno.getEvent(&event, Adafruit_BNO055::VECTOR_ACCELEROMETER);\n    Serial.print("  Accel Z: ");\n    Serial.println(event.acceleration.z);',
      "delay(100);",
    ],
    output: { initial: "Raw: --", status: "Waiting for sketch..." },
  },
  {
    id: 206,
    phase: "motion_basics",
    title: "Calibration",
    description:
      "The BNO055 fuses its sensors best once it's calibrated, and it will tell you how far along it is. Declare four uint8_t status bytes, fill them with bno.getCalibration(&system, &gyro, &accel, &mag), and print each 0-3 (3 = fully calibrated). bno.isFullyCalibrated() returns true when all four hit 3. On real hardware you calibrate by moving the board through a few poses; here the sim reports fully calibrated so you can see the API.",
    source: CREDIT,
    featuredComponent: "imu",
    circuit: {
      palette: ["imu"],
      required: ["imu"],
      notes: "Same wiring as Lesson 201: VIN->5V, GND->GND, SDA->A4, SCL->A5.",
    },
    codeTemplate: {
      language: "cpp",
      starter:
        HEADER +
        "void loop() {\n    // Read the four calibration bytes and report progress.\n}",
    },
    hints: [
      "uint8_t system = 0, gyro = 0, accel = 0, mag = 0;",
      "bno.getCalibration(&system, &gyro, &accel, &mag);",
      'Serial.print("Sys: ");\n    Serial.print(system, DEC);\n    Serial.print(" Gyro: ");\n    Serial.print(gyro, DEC);',
      'Serial.print(" Accel: ");\n    Serial.print(accel, DEC);\n    Serial.print(" Mag: ");\n    Serial.println(mag, DEC);',
      'if (bno.isFullyCalibrated()) {\n        Serial.println("Fully calibrated!");\n    }',
      "delay(100);",
    ],
    output: { initial: "Calibration: --", status: "Waiting for sketch..." },
  },
];

const toAdd = allLessons.filter((l) => l.id <= LIMIT);
for (const lesson of toAdd) {
  const existing = lessons.lessons.findIndex((l) => l.id === lesson.id);
  if (existing >= 0) {
    lessons.lessons[existing] = lesson;
  } else {
    // keep the array ordered by id
    let insertAt = lessons.lessons.findIndex((l) => l.id > lesson.id);
    if (insertAt < 0) insertAt = lessons.lessons.length;
    lessons.lessons.splice(insertAt, 0, lesson);
  }
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
console.log(
  "components:",
  comps.components.length,
  "| nano lessons through",
  LIMIT + ":",
  toAdd.map((l) => l.id).join(", "),
);
