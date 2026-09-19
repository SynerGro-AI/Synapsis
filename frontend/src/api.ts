export interface Track {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  accent: string;
}

export interface Phase {
  id: string;
  track: string;
  name: string;
  range: string;
  concepts: string[];
}

/** One typed command the learner is guided to enter, with the "why" behind it. */
export interface TerminalStep {
  cmd: string;
  why: string;
}

/** A serializable filesystem seed for a terminal lesson (real files to explore). */
export type TerminalSeedNode =
  | { type: "file"; content: string; mode?: number }
  | { type: "dir"; children: Record<string, TerminalSeedNode> };

export interface Lesson {
  id: number;
  phase: string;
  title: string;
  description: string;
  source?: string;
  /** Defaults to "arduino" when absent. "terminal" lessons render the shell course. */
  kind?: "arduino" | "terminal";
  terminal?: {
    shell: string;
    /** Prompt user (defaults to "you"); Pi lessons use "pi". */
    user?: string;
    /** Prompt host (defaults to "synapsys"); Pi lessons use "raspberrypi". */
    host?: string;
    /** Starting working directory, e.g. "~/projects". */
    cwd: string;
    intro: string;
    /** Files to preload into the sandbox so grep/find/globs have real material. */
    seed?: Record<string, TerminalSeedNode>;
    steps: TerminalStep[];
  };
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
  tracks: Track[];
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
  tracks: [
    {
      id: "arduino",
      name: "Arduino Electronics",
      icon: "⚡",
      blurb: "Build real circuits and write the C++ that drives them.",
      accent: "#e8a33d",
    },
    {
      id: "devsetup",
      name: "Build on Your Computer",
      icon: "⌨",
      blurb: "Set up your own machine: the command line, git, compilers.",
      accent: "#5cc8ff",
    },
    {
      id: "python",
      name: "Python & Raspberry Pi",
      icon: "🐍",
      blurb: "Carry your electronics instincts into Python on a Raspberry Pi.",
      accent: "#7fbf7f",
    },
    {
      id: "ai",
      name: "AI & Machine Learning",
      icon: "🧠",
      blurb: "From sensors to smarts: see, classify, and decide.",
      accent: "#c58cff",
    },
  ],
  phases: [
    {
      id: "foundation",
      track: "arduino",
      name: "Foundation",
      range: "1-5",
      concepts: ["Digital out", "Analog in", "Serial monitor", "Variables", "Conditionals"],
    },
    {
      id: "cli_basics",
      track: "devsetup",
      name: "Command Line Basics",
      range: "101-104",
      concepts: ["Navigation", "Files & folders", "Git", "Compilers"],
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
        "digitalWrite(13, HIGH);\ndelay(500);",
        "digitalWrite(13, LOW);\ndelay(500);",
      ],
      output: { initial: "PIN 13 OFF", status: "Waiting for sketch..." },
    },
    {
      id: 101,
      phase: "cli_basics",
      title: "Meet the Command Line",
      description:
        "The terminal is how professionals drive their computer with words instead of clicks. Type each command, press Enter, and watch it work — exactly like the Arduino track, but for your own machine.",
      kind: "terminal",
      terminal: {
        shell: "bash",
        cwd: "~/projects",
        intro:
          "This is a safe practice terminal. Nothing here touches your real computer — but every command behaves just like the real thing. Type the commands on the right, one at a time.",
        steps: [
          { cmd: "pwd", why: "Print Working Directory — asks the shell 'where am I right now?'" },
          { cmd: "ls", why: "List the files and folders in the current directory." },
          { cmd: "mkdir hello-cli", why: "Make a new directory (folder) called hello-cli." },
          { cmd: "cd hello-cli", why: "Change Directory — step inside the folder you just made." },
          { cmd: "pwd", why: "Confirm you moved. The path now ends in /hello-cli." },
        ],
      },
      featuredComponent: "terminal",
      circuit: { palette: [], required: [], notes: "" },
      codeTemplate: { language: "bash", starter: "" },
      hints: [],
      output: { initial: "", status: "" },
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
