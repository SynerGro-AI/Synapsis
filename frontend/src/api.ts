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
  circuit: {
    components: string[];
    notes: string;
  };
  componentGuide: {
    name: string;
    symbol?: string;
    info: Record<string, string>;
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

// Fallback lets the UI run standalone (backend not started yet).
export const FALLBACK_DATA: LessonData = {
  version: 1,
  phases: [
    {
      id: "foundation",
      name: "Foundation",
      range: "1-5",
      concepts: [
        "Digital out",
        "Analog in",
        "Serial monitor",
        "Variables",
        "Conditionals",
      ],
    },
  ],
  lessons: [
    {
      id: 1,
      phase: "foundation",
      title: "Digital Output — LED Blink",
      description:
        "Learn how to control a digital pin and blink an LED using pinMode() and digitalWrite().",
      circuit: {
        components: ["Arduino Uno", "Breadboard", "LED", "220Ω resistor"],
        notes:
          "An Arduino Uno connected to a breadboard containing a 220Ω resistor and an LED.",
      },
      componentGuide: {
        name: "LED — Light Emitting Diode",
        info: {
          forwardVoltage: "2.0–2.2V",
          maxCurrent: "20mA",
          resistorNeeded: "220Ω",
          wavelength: "≈625nm (red)",
          polarityNotes:
            "The longer leg is the anode (+), shorter leg is the cathode (–).",
        },
      },
      codeTemplate: {
        language: "cpp",
        starter:
          "void setup() {\n  // One-time configuration\n}\n\nvoid loop() {\n  // Blink LED\n}",
      },
      hints: [
        "pinMode(13, OUTPUT);",
        "digitalWrite(13, HIGH);",
        "digitalWrite(13, LOW);",
      ],
      output: {
        initial: "PIN 13 OFF",
        status: "Waiting for sketch...",
      },
    },
  ],
};

export async function fetchLessonData(): Promise<LessonData> {
  const res = await fetch("/api/lessons");
  if (!res.ok) throw new Error(`GET /api/lessons → ${res.status}`);
  return res.json();
}
