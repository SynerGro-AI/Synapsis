export interface Phase {
  id: string;
  name: string;
  range: string;
  concepts: string[];
}

export interface Lesson {
  id: number;
  phase: string;
  title: string;
  description: string;
  source?: string;
  featuredComponent: string;
  circuit: {
    palette: string[];
    required: string[];
    notes: string;
  };
  codeTemplate: {
    language: string;
    starter: string;
  };
  hints: string[];
  output: {
    initial: string;
    status: string;
  };
}

export interface PartInfo {
  id: string;
  name: string;
  category: string;
  function: string;
  science: string;
  specs: Record<string, string>;
  notes: string;
  symbol?: string;
  terminals: string;
}

export interface Attribution {
  author: string;
  website: string;
  donate: string;
  note: string;
}

export interface LessonData {
  version: number;
  attribution?: Attribution;
  phases: Phase[];
  lessons: Lesson[];
}

export const CREDIT: Attribution = {
  author: "Paul McWhorter",
  website: "https://toptechboy.com/arduino-lessons/",
  donate: "https://www.patreon.com/PaulMcWhorter",
  note: "Lesson curriculum based on Paul McWhorter's Arduino tutorial series at toptechboy.com.",
};

// Fallbacks let the UI run standalone (backend not started yet).
export const FALLBACK_DATA: LessonData = {
  version: 2,
  phases: [
    {
      id: "foundation",
      name: "Foundation",
      range: "1-5",
      concepts: ["Digital out", "Analog in", "Serial monitor", "Variables", "Conditionals"],
    },
  ],
  lessons: [
    {
      id: 1,
      phase: "foundation",
      title: "Digital Output — LED Blink",
      description:
        "Control a digital pin and blink an LED using pinMode() and digitalWrite(). Build the circuit: pin 13 → resistor → LED → GND.",
      featuredComponent: "led",
      circuit: {
        palette: ["led", "resistor"],
        required: ["led", "resistor"],
        notes:
          "Wire pin 13 to one side of the resistor, the other side to the LED anode (A), and the LED cathode (C) to GND.",
      },
      codeTemplate: {
        language: "cpp",
        starter:
          "void setup() {\n  // One-time configuration\n}\n\nvoid loop() {\n  // Blink LED\n}",
      },
      hints: [
        "pinMode(13, OUTPUT);",
        "digitalWrite(13, HIGH);",
        "delay(500);",
        "digitalWrite(13, LOW);",
      ],
      output: { initial: "PIN 13 OFF", status: "Waiting for sketch..." },
    },
  ],
};

export const FALLBACK_PARTS: PartInfo[] = [
  {
    id: "led",
    name: "LED — Light Emitting Diode",
    category: "output",
    function: "Turns current into light. Use it to SEE what your code is doing.",
    science:
      "A semiconductor diode: current flowing forward across the junction releases energy as photons. Being a diode, current only flows one way.",
    specs: {
      forwardVoltage: "2.0–2.2V",
      maxCurrent: "20mA",
      resistorNeeded: "220Ω",
    },
    notes:
      "The longer leg is the anode (+) — wire it toward the pin. The shorter leg is the cathode (–) — wire it toward GND.",
    symbol: "kicad-symbols/LED.kicad_sym",
    terminals: "A (anode +), C (cathode –)",
  },
];

export async function fetchLessonData(): Promise<LessonData> {
  const res = await fetch("/api/lessons");
  if (!res.ok) throw new Error(`GET /api/lessons → ${res.status}`);
  return res.json();
}

export async function fetchParts(): Promise<PartInfo[]> {
  const res = await fetch("/api/components");
  if (!res.ok) throw new Error(`GET /api/components → ${res.status}`);
  const data = await res.json();
  return data.components;
}
