// One-shot: add the DHT11 component + Lesson 23 "Weather Station" to the
// frontend data files, then mirror both to the backend copy. Idempotent.
const fs = require("fs");
const path = require("path");

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");

const compsPath = path.join(FE, "components.json");
const lessonsPath = path.join(FE, "lessons.json");
const comps = JSON.parse(fs.readFileSync(compsPath, "utf8"));
const lessons = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));

// ---- components.json: DHT11 entry ----
const dhtComp = {
  id: "dht",
  name: "DHT11 Temperature & Humidity Sensor",
  category: "input",
  function:
    "Measures air temperature AND relative humidity, and reports both back over a single data wire. You talk to it through the DHT library: dht.readTemperature() gives degrees Celsius, dht.readHumidity() gives percent moisture in the air.",
  science:
    "Two sensing elements share one little blue package. Humidity is read by a capacitor whose plastic film soaks up water vapour — as the air gets damper the film holds more moisture, changing how much charge the capacitor stores. Temperature is read by a thermistor, a resistor whose resistance falls as it warms. A tiny chip inside measures both, converts them to digital numbers, and shoots them out on the single DATA pin as a precisely-timed train of pulses. That timing is far too fast and fussy to decode by hand, so you install the DHT library once and it does the bit-banging for you — you just call readTemperature() and readHumidity(). Because the sensor samples slowly, you should only ask it for a new reading about once per second.",
  specs: {
    type: "capacitive humidity + thermistor",
    tempRange: "0–50 °C, ±2 °C",
    humidityRange: "20–90 % RH, ±5 %",
    interface: "single-wire digital (proprietary 1-wire)",
    sampling: "≈1 reading per second",
  },
  notes:
    "Wire VCC→5V, GND→GND, and DATA→any digital pin. In code: create the object with DHT dht(pin, DHT11); call dht.begin() once in setup(); then read with dht.readTemperature() and dht.readHumidity(). Don't poll faster than once a second or the readings go stale.",
  terminals: "VCC (5V), SDA/DATA (to a digital pin), NC (unused), GND",
};
if (!comps.components.some((c) => c.id === "dht")) comps.components.push(dhtComp);
else comps.components = comps.components.map((c) => (c.id === "dht" ? dhtComp : c));

// ---- lessons.json: bump control range + add Lesson 23 ----
const ctrl = lessons.phases.find((p) => p.id === "control");
if (ctrl) {
  ctrl.range = "13-23";
  if (!ctrl.concepts.includes("DHT11 sensor")) ctrl.concepts.push("DHT11 sensor");
}

const lesson23 = {
  id: 23,
  phase: "control",
  title: "Weather Station",
  description:
    "Keep the LCD from the thermometer build and add a DHT11 — a single sensor that reads BOTH temperature and humidity over one data wire. A library decodes the sensor for you; you just call readTemperature() and readHumidity() and print them to the display. Drag the Temp and Humidity sliders while it runs to watch the readout change.",
  source: "Paul McWhorter, Arduino DHT11 + LCD projects — toptechboy.com",
  featuredComponent: "dht",
  circuit: {
    palette: ["lcd", "dht"],
    required: ["lcd", "dht"],
    notes:
      "LCD wired as in Lesson 19 (RS→12, E→11, D4→5, D5→4, D6→3, D7→2; VSS/V0/RW/K→GND, VDD/A→5V). DHT11: VCC→5V, GND→GND, SDA (data)→7. The DHT object in the code uses pin 7.",
  },
  codeTemplate: {
    language: "cpp",
    starter:
      "#include <LiquidCrystal.h>\n#include <DHT.h>\n\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);\nDHT dht(7, DHT11);\n\nvoid setup() {\n  lcd.begin(16, 2);\n  dht.begin();\n}\n\nvoid loop() {\n  float t = dht.readTemperature();\n  float h = dht.readHumidity();\n  // Show temperature on the top row and humidity on the bottom row,\n  // then wait a second before reading again.\n}",
  },
  hints: [
    'lcd.setCursor(0, 0);\n  lcd.print("Temp: ");',
    "lcd.print(t);",
    'lcd.setCursor(0, 1);\n  lcd.print("Humid: ");',
    "lcd.print(h);",
    "delay(1000);",
  ],
  output: {
    initial: "Weather station idle",
    status: "Waiting for sketch...",
  },
};
if (!lessons.lessons.some((l) => l.id === 23)) {
  const i22 = lessons.lessons.findIndex((l) => l.id === 22);
  lessons.lessons.splice(i22 + 1, 0, lesson23);
} else {
  lessons.lessons = lessons.lessons.map((l) => (l.id === 23 ? lesson23 : l));
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
