export interface Lesson {
  id: number;
  phase: string;
  title: string;
  source?: string;
  objective: string;
  components: string[];
  concepts: string[];
  steps: string[];
}

export interface PartInfo {
  id: string;
  name: string;
  category: string;
  specs: Record<string, string>;
  why: string;
  polarityNote: string;
}

export interface Attribution {
  author: string;
  website: string;
  donate: string;
  note: string;
}

export const CREDIT: Attribution = {
  author: "Paul McWhorter",
  website: "https://toptechboy.com/arduino-lessons/",
  donate: "https://www.patreon.com/PaulMcWhorter",
  note: "Lesson curriculum based on Paul McWhorter's Arduino tutorial series at toptechboy.com.",
};

// Fallbacks let the UI run standalone (backend not started yet).
export const FALLBACK_LESSONS: Lesson[] = [
  {
    id: 1,
    phase: "Foundation",
    title: "Getting Started with Arduino",
    source: "Arduino Tutorial 1 — toptechboy.com",
    objective:
      "Set up the Arduino, understand the IDE, and blink the built-in LED on pin 13.",
    components: ["led-red", "resistor-220"],
    concepts: ["setup()", "loop()", "pinMode", "digitalWrite", "delay"],
    steps: [
      "Every sketch has two parts: setup() runs once, loop() runs forever.",
      "Tell the Arduino pin 13 is an OUTPUT: pinMode(13, OUTPUT);",
      "Turn the LED on with digitalWrite(13, HIGH); and off with LOW.",
      "Use delay(500); to wait half a second between changes.",
      "Watch the LED blink — you have written your first program.",
    ],
  },
];

export const FALLBACK_PARTS: PartInfo[] = [
  {
    id: "led-red",
    name: "LED — Light Emitting Diode",
    category: "output",
    specs: {
      forwardVoltage: "2.0–2.2V",
      maxCurrent: "20mA",
      resistorNeeded: "220Ω",
      wavelength: "~625nm (red)",
    },
    why: "An LED converts electrical current into light. Unlike a light bulb, it only allows current to flow in ONE direction — from anode (+) to cathode (−).",
    polarityNote:
      "The LONGER leg is the anode (+). Connect it toward power. The SHORTER leg is the cathode (−). Connect it toward GND. Reversed = no light.",
  },
];

export async function fetchLessons(): Promise<Lesson[]> {
  const res = await fetch("/api/lessons");
  if (!res.ok) throw new Error(`GET /api/lessons → ${res.status}`);
  const data = await res.json();
  return data.lessons;
}

export async function fetchComponents(): Promise<PartInfo[]> {
  const res = await fetch("/api/components");
  if (!res.ok) throw new Error(`GET /api/components → ${res.status}`);
  const data = await res.json();
  return data.components;
}
