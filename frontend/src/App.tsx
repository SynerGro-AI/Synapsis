import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import AccountPanel from "./components/AccountPanel";
import ActivityBar from "./components/ActivityBar";
import CircuitCanvas from "./components/CircuitCanvas";
import type { CodeEditorHandle } from "./components/CodeEditor";
import SchematicSymbol from "./components/SchematicSymbol";
import TerminalCourse from "./components/TerminalCourse";
import Transcript from "./components/Transcript";
import ReactCourse from "./components/ReactCourse";
import FeedbackWidget from "./components/FeedbackWidget";
import VisionCanvas, { type VisionFrame } from "./components/VisionCanvas";
import MathGraph from "./components/MathGraph";
import MathVisualModel from "./components/MathVisualModel";
import { ArduinoSim, analyzeSketch, type SimIO } from "./sim/arduino";
import { PythonSim, analyzePython, type PyGpioIO } from "./sim/python";
import { makeBallScene, makeLedBlinkFrame } from "./sim/cv";
import {
  CircuitRuntime,
  validate,
  validatePython,
  type CircuitState,
  type PartType,
  type WorldState,
} from "./circuit/engine";
import { getProgress, me, saveProgress, type User } from "./auth";
import { LOCALES, LOCALE_NAMES, useI18n } from "./i18n";
import {
  CREDIT,
  FALLBACK_DATA,
  FALLBACK_PARTS,
  fetchLessonData,
  fetchParts,
  type LessonData,
  type PartInfo,
} from "./api";

const HINT_LABELS = "ABCDEFGH";
const normalize = (s: string) => s.replace(/\s+/g, "");
const numericOutput = (line: string) =>
  line
    .trim()
    .split(/[\s,]+/)
    .flatMap((token) => {
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) return [];
      const value = Number(token);
      return Number.isFinite(value) ? [value] : [];
    });
const parseMathAnswer = (answer: string) => {
  const tokens = answer.split(",").map((token) => token.trim());
  if (
    !answer.trim() ||
    tokens.some((token) => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token))
  ) {
    return null;
  }
  const values = tokens.map(Number);
  return values.every(Number.isFinite) ? values : null;
};
type MathAnswerFeedback =
  | "correct"
  | "incorrect"
  | "invalid"
  | "no-result"
  | "configuration-error";
const EMPTY_CIRCUIT: CircuitState = { parts: [], wires: [] };
const CodeEditor = lazy(() => import("./components/CodeEditor"));

type MobileTab = "canvas" | "editor" | "guide" | "console";
interface SavedLesson {
  completed: boolean;
  sketch: string | null;
  circuit: CircuitState | null;
}

export default function App() {
  const { locale, setLocale, lessonLocale, setLessonLocale, t } = useI18n();
  const [data, setData] = useState<LessonData>(FALLBACK_DATA);
  const [parts, setParts] = useState<PartInfo[]>(FALLBACK_PARTS);
  const [lessonId, setLessonId] = useState(1);
  const [activeTrack, setActiveTrack] = useState("arduino");
  const [view, setView] = useState<"workspace" | "transcript">("workspace");
  const [offline, setOffline] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [saved, setSaved] = useState<Record<number, SavedLesson>>({});
  const [restoreCount, setRestoreCount] = useState(0);

  const [code, setCode] = useState("");
  const [circuit, setCircuit] = useState<CircuitState>(EMPTY_CIRCUIT);
  const [selected, setSelected] = useState<string | null>(null);

  // Mobile: which single panel is showing, and whether the lesson drawer is open.
  const [mobileTab, setMobileTab] = useState<MobileTab>("canvas");
  const [editorActivated, setEditorActivated] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const [running, setRunning] = useState(false);
  const [ranClean, setRanClean] = useState(false);
  const [serial, setSerial] = useState<string[]>([]);
  const [mathValues, setMathValues] = useState<number[]>([]);
  const [mathRunId, setMathRunId] = useState(0);
  const [mathAnswer, setMathAnswer] = useState("");
  const [selectedMathChoice, setSelectedMathChoice] = useState<number | null>(null);
  const [mathAnswerFeedback, setMathAnswerFeedback] = useState<MathAnswerFeedback | null>(null);
  const [ledLevels, setLedLevels] = useState<Map<string, number>>(new Map());
  const [currentWires, setCurrentWires] = useState<Map<number, boolean>>(new Map());
  const [rgbLevels, setRgbLevels] = useState<Map<string, { r: number; g: number; b: number }>>(new Map());
  const [servoAngles, setServoAngles] = useState<Map<string, number>>(new Map());
  const [stepperAngles, setStepperAngles] = useState<Map<string, number>>(new Map());
  const [shiftBits, setShiftBits] = useState<Map<string, number>>(new Map());
  const [motorSpeeds, setMotorSpeeds] = useState<Map<string, number>>(new Map());
  const [buzzerFreqs, setBuzzerFreqs] = useState<Map<string, number>>(new Map());
  const [lcdLines, setLcdLines] = useState<[string, string] | null>(null);
  const [boardLed, setBoardLed] = useState(false);

  // Vision lessons: the pixel buffer the learner's cv2.imshow() last painted, and
  // a cache of decoded sample photos keyed by file name (real pixels, no engine).
  const [visionFrame, setVisionFrame] = useState<VisionFrame | null>(null);
  const [visionBallX, setVisionBallX] = useState(120);
  const visionBallXRef = useRef(visionBallX);
  visionBallXRef.current = visionBallX;
  const visionSceneStartRef = useRef(0);
  const sampleFramesRef = useRef<Map<string, VisionFrame>>(new Map());

  // World: what physically surrounds the circuit
  const [potValue, setPotValue] = useState(512);
  const [lightPct, setLightPct] = useState(70);
  const [tempC, setTempC] = useState(22);
  const [humidityPct, setHumidityPct] = useState(50);
  const [distanceCm, setDistanceCm] = useState(50);
  const [heading, setHeading] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [roll, setRoll] = useState(0);

  const editorRef = useRef<CodeEditorHandle | null>(null);
  const engineRef = useRef<ArduinoSim | PythonSim | null>(null);
  // For "serial" lessons a second sim runs concurrently: engineRef holds the
  // learner's PythonSim, sketchRef holds the companion ArduinoSim.
  const sketchRef = useRef<ArduinoSim | null>(null);
  const runtimeRef = useRef<CircuitRuntime | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const worldRef = useRef<WorldState>({
    pressed: new Set<string>(),
    potValue: 512,
    lightPct: 70,
    tempC: 22,
    humidityPct: 50,
    distanceCm: 50,
    irQueue: [],
    serialToArduino: [],
    serialToPc: [],
    heading: 0,
    pitch: 0,
    roll: 0,
  });
  worldRef.current.potValue = potValue;
  worldRef.current.lightPct = lightPct;
  worldRef.current.tempC = tempC;
  worldRef.current.humidityPct = humidityPct;
  worldRef.current.distanceCm = distanceCm;
  worldRef.current.heading = heading;
  worldRef.current.pitch = pitch;
  worldRef.current.roll = roll;

  // Piezo buzzer audio: play the highest active buzzer's pitch through a
  // WebAudio oscillator so the simulated circuit actually beeps.
  useEffect(() => {
    const freq = Math.max(0, ...buzzerFreqs.values());
    if (freq > 0) {
      let node = audioRef.current;
      if (!node) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        gain.gain.value = 0.05;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        node = { ctx, osc, gain };
        audioRef.current = node;
      }
      if (node.ctx.state === "suspended") void node.ctx.resume();
      node.osc.frequency.setValueAtTime(freq, node.ctx.currentTime);
      node.gain.gain.setValueAtTime(0.05, node.ctx.currentTime);
    } else if (audioRef.current) {
      audioRef.current.gain.gain.setValueAtTime(0, audioRef.current.ctx.currentTime);
    }
  }, [buzzerFreqs]);

  useEffect(() => {
    return () => {
      audioRef.current?.osc.stop();
      void audioRef.current?.ctx.close();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    fetchLessonData().then(setData).catch(() => setOffline(true));
    fetchParts().then(setParts).catch(() => {});
  }, []);

  const applyProgress = useCallback((who: User | null) => {
    setUser(who);
    if (!who) {
      setSaved({});
      setRestoreCount((n) => n + 1);
      return;
    }
    getProgress()
      .then((progress) => {
        const map: Record<number, SavedLesson> = {};
        for (const entry of progress.lessons) {
          let parsedCircuit: CircuitState | null = null;
          try {
            if (entry.circuit) parsedCircuit = JSON.parse(entry.circuit);
          } catch {
            parsedCircuit = null;
          }
          map[entry.lessonId] = {
            completed: entry.completed,
            sketch: entry.sketch,
            circuit: parsedCircuit,
          };
        }
        setSaved(map);
        setLessonId(progress.currentLesson);
        setRestoreCount((n) => n + 1);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    me().then((who) => who && applyProgress(who));
  }, [applyProgress]);

  const lesson = data.lessons.find((l) => l.id === lessonId) ?? data.lessons[0];
  const isGuidedMath = lesson.kind === "math" && lesson.phase === "math_k2";
  const lessonTranslation = lesson.translations?.[lessonLocale];
  const lessonTitle = lessonTranslation?.title ?? lesson.title;
  const lessonDescription = lessonTranslation?.description ?? lesson.description;
  const hasUntranslatedLessonText =
    lessonLocale !== "en" &&
    (!lessonTranslation?.title || !lessonTranslation?.description);
  const displayLesson = { ...lesson, title: lessonTitle, description: lessonDescription };
  useEffect(() => {
    if (isGuidedMath && mobileTab === "editor") setMobileTab("canvas");
  }, [isGuidedMath, mobileTab]);
  const mathCodeSnippet =
    lesson.kind === "math"
      ? [
          lesson.codeTemplate.starter
            .split("\n")
            .filter((line) => line.trim() && !line.trim().startsWith("#"))
            .join("\n"),
          lesson.hints.join("\n"),
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  const starter = saved[lesson.id]?.sketch ?? lesson.codeTemplate.starter;

  // ---- Track organisation: phases belong to tracks; progress rolls up by track ----
  const phaseTrack = useMemo(
    () => new Map(data.phases.map((p) => [p.id, p.track])),
    [data.phases],
  );
  const liveTracks = useMemo(() => {
    const s = new Set<string>();
    for (const l of data.lessons) s.add(phaseTrack.get(l.phase) ?? "arduino");
    return s;
  }, [data.lessons, phaseTrack]);
  const completedIds = useMemo(() => {
    const s = new Set<number>();
    for (const [id, v] of Object.entries(saved)) if (v.completed) s.add(Number(id));
    return s;
  }, [saved]);
  const activeTrackInfo = data.tracks.find((t) => t.id === activeTrack);
  const sidebarPhases = data.phases.filter(
    (p) => p.track === activeTrack && data.lessons.some((l) => l.phase === p.id),
  );
  const roadmapPhases = data.phases.filter(
    (p) => p.track === activeTrack && p.status === "coming-soon",
  );
  const trackLessons = useMemo(
    () => data.lessons.filter((l) => phaseTrack.get(l.phase) === activeTrack),
    [activeTrack, data.lessons, phaseTrack],
  );
  const courseLessonNumbers = useMemo(() => {
    if (!["math", "science", "language_arts", "react"].includes(activeTrack)) {
      return new Map<number, number>();
    }
    return new Map(
      [...trackLessons]
        .sort((a, b) => a.id - b.id)
        .map((trackLesson, index) => [trackLesson.id, index + 1]),
    );
  }, [activeTrack, trackLessons]);
  const displayedLessonNumber = courseLessonNumbers.get(lesson.id) ?? lesson.id;

  const selectTrack = (id: string) => {
    setView("workspace");
    setActiveTrack(id);
    const first = data.lessons.find((l) => phaseTrack.get(l.phase) === id);
    if (first) setLessonId(first.id);
    setNavOpen(false);
  };
  const openLesson = (trackId: string, id: number) => {
    setActiveTrack(trackId);
    setLessonId(id);
    setView("workspace");
  };

  // Terminal lessons drive their own completion (all steps typed & run).
  const completeTerminalLesson = useCallback(
    (id: number) => {
      setSaved((s) =>
        s[id]?.completed
          ? s
          : {
              ...s,
              [id]: {
                completed: true,
                sketch: s[id]?.sketch ?? null,
                circuit: s[id]?.circuit ?? null,
              },
            },
      );
      if (user) {
        saveProgress(id, { completed: true, sketch: "", circuit: "", current: true }).catch(
          () => {},
        );
      }
    },
    [user],
  );

  const stopSim = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    sketchRef.current?.stop();
    sketchRef.current = null;
    runtimeRef.current = null;
    worldRef.current.serialToArduino.length = 0;
    worldRef.current.serialToPc.length = 0;
    setRunning(false);
    setLedLevels(new Map());
    setCurrentWires(new Map());
    setRgbLevels(new Map());
    setServoAngles(new Map());
    setStepperAngles(new Map());
    setShiftBits(new Map());
    setMotorSpeeds(new Map());
    setBuzzerFreqs(new Map());
    setLcdLines(null);
    setBoardLed(false);
    setVisionFrame(null);
  }, []);

  // Changing lessons resets the workspace.
  useEffect(() => {
    stopSim();
    setSerial([]);
    setMathValues([]);
    setMathRunId(0);
    setMathAnswer("");
    setSelectedMathChoice(null);
    setMathAnswerFeedback(null);
    setRanClean(false);
    setSelected(null);
    setCode(starter);
    setCircuit(saved[lesson.id]?.circuit ?? EMPTY_CIRCUIT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, restoreCount, stopSim]);

  // Decode a vision lesson's committed sample photo into REAL pixels once, via an
  // offscreen canvas getImageData. cv2.imread() then hands these bytes to the
  // learner's code — the same pixels the CV algorithms genuinely read.
  useEffect(() => {
    if (lesson.kind !== "vision" || lesson.vision?.scene !== "photo") return;
    const file = lesson.vision.sampleImage;
    if (!file) return;
    const key = file.split("/").pop() ?? file;
    if (sampleFramesRef.current.has(key)) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const cx = c.getContext("2d");
      if (!cx) return;
      cx.drawImage(img, 0, 0);
      const id = cx.getImageData(0, 0, c.width, c.height);
      sampleFramesRef.current.set(key, { width: id.width, height: id.height, data: id.data });
    };
    img.src = `/vision/${key}`;
    return () => {
      cancelled = true;
    };
  }, [lesson.id, lesson.kind, lesson.vision?.scene, lesson.vision?.sampleImage]);

  const refreshOutputs = useCallback(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const out = rt.outputs();
    setLedLevels(out.led);
    setCurrentWires(out.current);
    setRgbLevels(out.rgb);
    setServoAngles(out.servo);
    setStepperAngles(out.stepper);
    setShiftBits(out.shiftreg);
    setMotorSpeeds(out.motor);
    setBuzzerFreqs(out.buzzer);
    setLcdLines(out.lcd ? out.lcd.lines : null);
  }, []);

  const onButtonChange = useCallback(
    (partId: string, pressed: boolean) => {
      if (pressed) worldRef.current.pressed.add(partId);
      else worldRef.current.pressed.delete(partId);
      refreshOutputs();
    },
    [refreshOutputs],
  );

  // A remote key-press queues its NEC command byte for IrReceiver.decode().
  const onIrButton = useCallback((code: number) => {
    worldRef.current.irQueue.push(code);
  }, []);

  function runSketch(onMathComplete?: (values: number[], failed: boolean) => void) {
    stopSim();
    const sketch = editorRef.current?.getValue() ?? code;
    const rt = new CircuitRuntime(circuit, worldRef.current);
    runtimeRef.current = rt;
    setSerial([]);
    if (lesson.kind === "math") {
      setMathValues([]);
      setMathRunId((runId) => runId + 1);
      setMathAnswerFeedback(null);
    }
    setRunning(true);

    if (lesson.kind === "math") {
      const sim = new PythonSim();
      engineRef.current = sim;
      let failed = false;
      const runValues: number[] = [];
      setSerial(["$ python lesson.py"]);
      const noop = () => undefined;
      const io: PyGpioIO = {
        setmode: noop,
        setup: noop,
        output: noop,
        input: () => false,
        pwmStart: noop,
        pwmChangeDuty: noop,
        pwmChangeFreq: noop,
        pwmStop: noop,
        cleanup: noop,
        print: (line) => {
          setRanClean(true);
          setSerial((s) => [...s.slice(-30), line]);
          const values = numericOutput(line);
          if (values.length) {
            runValues.push(...values);
            setMathValues((current) => [...current, ...values].slice(-20));
          }
        },
        serialWrite: () => 0,
        serialAvailable: () => 0,
        serialReadByte: () => -1,
        onError: (message) => {
          failed = true;
          setSerial((s) => [...s, `⚠ ${message}`]);
        },
      };
      sim.run(sketch, io).finally(() => {
        if (engineRef.current === sim) {
          setRunning(false);
          setSerial((s) => [...s, `[process exited with status ${failed ? 1 : 0}]`]);
          onMathComplete?.(runValues.slice(-20), failed);
        }
      });
      return;
    }

    if (lesson.kind === "python") {
      const sim = new PythonSim();
      engineRef.current = sim;
      const pulls = new Map<number, "UP" | "DOWN" | "OFF">();
      const io: PyGpioIO = {
        setmode: () => {
          setRanClean(true);
        },
        setup: (pin, direction, pull) => {
          setRanClean(true);
          pulls.set(pin, pull);
          if (direction === "OUT") rt.setGpio(pin, false);
          refreshOutputs();
        },
        output: (pin, high) => {
          setRanClean(true);
          rt.setGpio(pin, high);
          refreshOutputs();
        },
        input: (pin) => rt.readGpio(pin, pulls.get(pin) ?? "OFF"),
        pwmStart: (pin, freq, duty) => {
          setRanClean(true);
          rt.setGpioPwm(pin, duty, freq);
          refreshOutputs();
        },
        pwmChangeDuty: (pin, duty) => {
          setRanClean(true);
          rt.setGpioPwm(pin, duty);
          refreshOutputs();
        },
        pwmChangeFreq: (pin, freq) => {
          rt.setGpioPwmFreq(pin, freq);
          refreshOutputs();
        },
        pwmStop: (pin) => {
          rt.setGpio(pin, false);
          refreshOutputs();
        },
        cleanup: () => {
          rt.gpioCleanup();
          refreshOutputs();
        },
        print: (line) => {
          setRanClean(true);
          setSerial((s) => [...s.slice(-30), line]);
        },
        // A Raspberry Pi lesson never opens a serial port; these stay inert.
        serialWrite: () => 0,
        serialAvailable: () => 0,
        serialReadByte: () => -1,
        onError: (message) => setSerial((s) => [...s, `⚠ ${message}`]),
      };
      sim.run(sketch, io).finally(() => {
        if (engineRef.current === sim) setRunning(false);
      });
      return;
    }

    // "vision" lesson: the learner writes Python (OpenCV/cv2) that reads REAL
    // pixels. cv2.imread() hands back the decoded sample photo's buffer, every
    // cv2 op (grayscale, mask, ...) genuinely computes over those bytes in cv.ts,
    // and cv2.imshow() paints the produced frame. Nothing is read from engine or
    // LED state — the vision only ever sees pixels.
    if (lesson.kind === "vision") {
      const sim = new PythonSim();
      engineRef.current = sim;
      visionSceneStartRef.current = performance.now();
      const noop = () => {};
      const io: PyGpioIO = {
        // A vision lesson has no GPIO; these stay inert.
        setmode: noop,
        setup: noop,
        output: noop,
        input: () => false,
        pwmStart: noop,
        pwmChangeDuty: noop,
        pwmChangeFreq: noop,
        pwmStop: noop,
        cleanup: noop,
        print: (line) => {
          setRanClean(true);
          setSerial((s) => [...s.slice(-30), line]);
        },
        serialWrite: () => 0,
        serialAvailable: () => 0,
        serialReadByte: () => -1,
        // Decoded sample pixels, by file name. A copy is handed out so learner
        // ops can never disturb the cached source (cv2.imread returns a fresh Mat).
        loadImage: (imgPath) => {
          const key = imgPath.split("/").pop() ?? imgPath;
          if (key === "ball") {
            const frame = makeBallScene(visionBallXRef.current);
            setRanClean(true);
            return frame;
          }
          const f = sampleFramesRef.current.get(key);
          if (!f) return null;
          setRanClean(true);
          return { width: f.width, height: f.height, data: new Uint8ClampedArray(f.data) };
        },
        grabFrame: () =>
          lesson.vision?.scene === "led"
            ? makeLedBlinkFrame(performance.now() - visionSceneStartRef.current)
            : null,
        showFrame: (f) => {
          setRanClean(true);
          setVisionFrame({ width: f.width, height: f.height, data: new Uint8ClampedArray(f.data) });
        },
        onError: (message) => setSerial((s) => [...s, `⚠ ${message}`]),
      };
      sim.run(sketch, io).finally(() => {
        if (engineRef.current === sim) setRunning(false);
      });
      return;
    }
    // Python program — only the serial wiring differs, so both paths share it.
    const buildArduinoIO = (
      bridge: Pick<SimIO, "serial" | "serialTx" | "serialAvailable" | "serialRead" | "serialPeek">,
    ): SimIO => ({
      digitalWrite: (pin, high) => {
        setRanClean(true);
        rt.setPin(pin, high);
        if (pin === 13) setBoardLed(high);
        refreshOutputs();
      },
      analogWrite: (pin, duty) => {
        setRanClean(true);
        rt.setDuty(pin, duty);
        if (pin === 13) setBoardLed(duty > 0);
        refreshOutputs();
      },
      servoWrite: (pin, angle) => {
        setRanClean(true);
        rt.servoWrite(pin, angle);
        refreshOutputs();
      },
      stepperStep: (pins, steps, stepsPerRev) => {
        setRanClean(true);
        rt.stepperStep(pins, steps, stepsPerRev);
        refreshOutputs();
      },
      shiftOut: (dataPin, clockPin, value) => {
        setRanClean(true);
        rt.shiftOut(dataPin, clockPin, value);
        refreshOutputs();
      },
      tone: (pin, freq) => {
        setRanClean(true);
        rt.tone(pin, freq);
        refreshOutputs();
      },
      noTone: (pin) => {
        rt.noTone(pin);
        refreshOutputs();
      },
      lcd: (op, a, b) => {
        setRanClean(true);
        rt.lcdOp(op, a, b);
        refreshOutputs();
      },
      digitalRead: (pin, mode) => rt.digitalRead(pin, mode),
      analogRead: (pin) => rt.analogRead(pin),
      pulseIn: (pin) => rt.pulseIn(pin),
      dhtRead: (pin, kind) => rt.dhtRead(pin, kind),
      imuRead: (quantity, axis) => rt.imuRead(quantity, axis),
      imuReadQuat: (axis) => rt.imuReadQuat(axis),
      imuPresent: () => rt.imuPresent(),
      irDecode: (pin) => rt.irDecode(pin),
      ...bridge,
      onError: (message) => setSerial((s) => [...s, `⚠ ${message}`]),
    });

    // "serial" lesson: the learner's Python (on the PC) and the fixed companion
    // sketch (on the Arduino) run concurrently, exchanging real bytes across the
    // two WorldState FIFOs. An LED lights only because a byte was truly read.
    if (lesson.kind === "serial") {
      const world = worldRef.current;
      world.serialToArduino.length = 0;
      world.serialToPc.length = 0;
      world.irQueue.length = 0;

      const tag = (src: "Arduino" | "PC", line: string) =>
        setSerial((s) => [...s.slice(-40), `${src === "Arduino" ? "Arduino ●" : "PC ●"} ${line}`]);

      const arduino = new ArduinoSim();
      const python = new PythonSim();
      sketchRef.current = arduino;
      engineRef.current = python; // completion + "running" follow the learner's program

      const arduinoIo = buildArduinoIO({
        serial: (line) => tag("Arduino", line),
        serialTx: (byte) => {
          world.serialToPc.push(byte & 0xff);
        },
        serialAvailable: () => world.serialToArduino.length,
        serialRead: () => world.serialToArduino.shift() ?? -1,
        serialPeek: () => (world.serialToArduino.length ? world.serialToArduino[0] : -1),
      });

      const pyIo: PyGpioIO = {
        // A PC has no GPIO — these stay inert; serial lessons never import RPi.GPIO.
        setmode: () => {},
        setup: () => {},
        output: () => {},
        input: () => false,
        pwmStart: () => {},
        pwmChangeDuty: () => {},
        pwmChangeFreq: () => {},
        pwmStop: () => {},
        cleanup: () => {},
        print: (line) => {
          setRanClean(true);
          tag("PC", line);
        },
        serialWrite: (bytes) => {
          setRanClean(true);
          for (const b of bytes) world.serialToArduino.push(b & 0xff);
          return bytes.length;
        },
        serialAvailable: () => world.serialToPc.length,
        serialReadByte: () => {
          const b = world.serialToPc.shift() ?? -1;
          if (b !== -1) setRanClean(true);
          return b;
        },
        onError: (message) => tag("PC", `⚠ ${message}`),
      };

      const aDone = arduino.run(lesson.arduinoSketch ?? "", arduinoIo);
      const pDone = python.run(sketch, pyIo);
      Promise.allSettled([aDone, pDone]).finally(() => {
        if (engineRef.current === python) {
          arduino.stop();
          setRunning(false);
        }
      });
      return;
    }

    const sim = new ArduinoSim();
    engineRef.current = sim;
    worldRef.current.irQueue.length = 0; // drop stale remote presses

    sim
      .run(
        sketch,
        buildArduinoIO({
          serial: (line) => {
            setRanClean(true);
            setSerial((s) => [...s.slice(-30), line]);
          },
          // No PC is attached in a plain Arduino lesson, so the serial wire is idle.
          serialTx: () => {},
          serialAvailable: () => 0,
          serialRead: () => -1,
          serialPeek: () => -1,
        }),
      )
      .finally(() => {
        if (engineRef.current === sim) {
          setRunning(false);
        }
      });
  }

  // ---- Live diagnostics: circuit + code, explained bottom-right ----
  const diagnoses = useMemo(
    () =>
      lesson.kind === "vision" || lesson.kind === "math"
        ? []
        : lesson.kind === "python"
        ? validatePython(circuit, analyzePython(code), lesson.circuit.required as PartType[])
        : lesson.kind === "serial"
          ? // The learner types Python; the wired circuit must match the running
            // companion sketch's pins, so validate against that fixed sketch.
            validate(
              circuit,
              analyzeSketch(lesson.arduinoSketch ?? ""),
              lesson.circuit.required as PartType[],
            )
          : validate(circuit, analyzeSketch(code), lesson.circuit.required as PartType[]),
    [circuit, code, lesson.circuit.required, lesson.kind, lesson.arduinoSketch],
  );
  const circuitOk = !diagnoses.some((d) => d.level === "error");

  const codeNorm = normalize(code);
  const typedHints = lesson.hints.map((h) => codeNorm.includes(normalize(h)));
  const allTyped = lesson.hints.length > 0 && typedHints.every(Boolean);
  const lessonPassed =
    lesson.kind === "math"
      ? mathAnswerFeedback === "correct" && (isGuidedMath || ranClean)
      : allTyped && ranClean && circuitOk;
  const completed = Boolean(saved[lesson.id]?.completed) || lessonPassed;

  const checkMathAnswer = () => {
    if (isGuidedMath) {
      const choice = lesson.math?.choices?.[selectedMathChoice ?? -1];
      const answer = lesson.math?.answer;
      if (!choice) {
        setMathAnswerFeedback("invalid");
        return;
      }
      if (!answer) {
        setMathAnswerFeedback("configuration-error");
        return;
      }
      const correct =
        choice.values.length === answer.length &&
        choice.values.every((value, index) => value === answer[index]);
      setMathRunId((runId) => runId + 1);
      setMathAnswerFeedback(correct ? "correct" : "incorrect");
      setMathValues(correct ? choice.values : []);
      return;
    }
    const submitted = parseMathAnswer(mathAnswer);
    if (!submitted) {
      setMathAnswerFeedback("invalid");
      return;
    }
    setMathAnswerFeedback(null);
    runSketch((values, failed) => {
      if (failed || !values.length) {
        setMathAnswerFeedback("no-result");
        return;
      }
      const matches =
        submitted.length === values.length &&
        submitted.every(
          (value, index) =>
            Math.abs(value - values[index]) <=
            1e-9 * Math.max(1, Math.abs(value), Math.abs(values[index])),
        );
      setMathAnswerFeedback(matches ? "correct" : "incorrect");
    });
  };

  useEffect(() => {
    if (lessonPassed && !saved[lesson.id]?.completed) {
      setSaved((s) => ({
        ...s,
        [lesson.id]: {
          completed: true,
          sketch: s[lesson.id]?.sketch ?? null,
          circuit: s[lesson.id]?.circuit ?? null,
        },
      }));
    }
  }, [lessonPassed, lesson.id, saved]);

  // Autosave sketch + circuit + completion + current lesson (debounced).
  useEffect(() => {
    if (!user || !code) return;
    const timer = setTimeout(() => {
      saveProgress(lesson.id, {
        completed,
        sketch: code,
        circuit: JSON.stringify(circuit),
        current: true,
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [user, code, circuit, completed, lesson.id]);

  // ---- Component guide: selected part wins, else the lesson's featured part ----
  const selectedType: string | null = selected
    ? selected === "uno"
      ? "uno"
      : (circuit.parts.find((p) => p.id === selected)?.type ?? null)
    : null;
  const guide =
    parts.find((p) => p.id === (selectedType ?? lesson.featuredComponent)) ??
    parts[0];

  const hasType = (t: PartType) => circuit.parts.some((p) => p.type === t);

  return (
    <div className="page">
      <div className="credits">
        <a
          className="sponsor"
          href="https://synergroaicorp.net"
          target="_blank"
          rel="noreferrer"
        >
          {t("sponsoredBy")} <strong>SynerGro.Ai Corp</strong>
        </a>
        <span className="credits-text">
          {t("lessonsBasedOn")}{" "}
          <a href={CREDIT.website} target="_blank" rel="noreferrer">
            {CREDIT.author} — toptechboy.com
          </a>
        </span>
        <a className="donate" href={CREDIT.donate} target="_blank" rel="noreferrer">
          {t("supportPaul")}
        </a>
        <label className="language-picker">
          <span className="language-picker-label">{t("language")}</span>
          <select
            aria-label={t("language")}
            value={locale}
            onChange={(event) => setLocale(event.target.value as (typeof LOCALES)[number])}
          >
            {LOCALES.map((supportedLocale) => (
              <option key={supportedLocale} value={supportedLocale}>
                {LOCALE_NAMES[supportedLocale]}
              </option>
            ))}
          </select>
        </label>
        <label className="language-picker lesson-language-picker">
          <span className="language-picker-label">{t("lessonLanguage")}</span>
          <select
            aria-label={t("lessonLanguage")}
            value={lessonLocale}
            onChange={(event) =>
              setLessonLocale(event.target.value as (typeof LOCALES)[number])
            }
          >
            {LOCALES.map((supportedLocale) => (
              <option key={supportedLocale} value={supportedLocale}>
                {LOCALE_NAMES[supportedLocale]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="app">
        <ActivityBar
          tracks={data.tracks}
          liveTracks={liveTracks}
          activeTrack={activeTrack}
          view={view}
          onSelectTrack={selectTrack}
          onOpenTranscript={() => {
            setView("transcript");
            setNavOpen(false);
          }}
        />
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
        <aside className={`sidebar${navOpen ? " open" : ""}`}>
          <h2>
            <span className="sidebar-track-icon">{activeTrackInfo?.icon}</span>
            {activeTrackInfo?.name ?? "Synapsis"}
          </h2>
          <div className="sidebar-lessons">
            {sidebarPhases.length === 0 ? (
              <div className="sidebar-soon">
                <p>{activeTrackInfo?.blurb}</p>
                <span className="cs-tag">{t("lessonsComingSoon")}</span>
              </div>
            ) : (
              sidebarPhases.map((phase) => (
                <div key={phase.id}>
                  <div className="phase-header">
                    {phase.name} ({phase.range})
                  </div>
                  <ul>
                    {data.lessons
                      .filter((l) => l.phase === phase.id)
                      .map((l) => (
                        <li
                          key={l.id}
                          className={
                            view === "workspace" && l.id === lesson.id ? "active" : ""
                          }
                          onClick={() => {
                            setLessonId(l.id);
                            setView("workspace");
                            setNavOpen(false);
                          }}
                        >
                          <span className="lesson-check">
                            {saved[l.id]?.completed ? "✓" : ""}
                          </span>
                          {courseLessonNumbers.get(l.id) ?? l.id}.{" "}
                          {l.translations?.[lessonLocale]?.title ?? l.title}
                        </li>
                      ))}
                  </ul>
                </div>
              ))
            )}
            {roadmapPhases.length > 0 && (
              <section className="sidebar-roadmap" aria-label="Coming-soon curriculum phases">
                <h3>Coming next</h3>
                {roadmapPhases.map((phase) => (
                  <article key={phase.id}>
                    <strong>{phase.name}</strong>
                    <span>{phase.range}</span>
                    <p>{phase.concepts.join(" · ")}</p>
                    {phase.prerequisites?.length ? (
                      <small>
                        Prerequisite:{" "}
                        {phase.prerequisites
                          .map((id) => data.phases.find((item) => item.id === id)?.name ?? id)
                          .join(", ")}
                      </small>
                    ) : null}
                  </article>
                ))}
              </section>
            )}
          </div>
          <AccountPanel user={user} onAuth={applyProgress} />
        </aside>

        {view === "transcript" ? (
          <Transcript
            tracks={data.tracks}
            phases={data.phases}
            lessons={data.lessons}
            completedIds={completedIds}
            user={user}
            credit={CREDIT}
            onOpenLesson={openLesson}
          />
        ) : trackLessons.length === 0 ? (
          <main className="main coming-soon-main">
            <div className="coming-soon">
              <span className="cs-icon" style={{ color: activeTrackInfo?.accent }}>
                {activeTrackInfo?.icon}
              </span>
              <h2>{activeTrackInfo?.name}</h2>
              <p>{activeTrackInfo?.blurb}</p>
              <span className="cs-tag">{t("comingSoon")}</span>
            </div>
          </main>
        ) : lesson.kind === "terminal" ? (
          <main className="main terminal-main">
            <header className="topbar">
              <button
                className="nav-toggle"
                onClick={() => setNavOpen(true)}
                aria-label={t("openLessons")}
              >
                ☰
              </button>
              <h3>
                {t("lesson")} {displayedLessonNumber} — {lessonTitle}
              </h3>
              {completed && <span className="lesson-done">✓ {t("completed")}</span>}
              {offline && (
                <span className="offline">{t("backendOffline")}</span>
              )}
            </header>
            {hasUntranslatedLessonText && (
              <div className="lesson-language-fallback" role="status">
                {t("lessonLanguageFallback", {
                  language: LOCALE_NAMES[lessonLocale],
                })}
              </div>
            )}
            <TerminalCourse
              lesson={displayLesson}
              completed={completed}
              onComplete={completeTerminalLesson}
              restoreKey={`${lesson.id}:${restoreCount}`}
            />
          </main>
        ) : lesson.kind === "react" ? (
          <main className="main react-main">
            <header className="topbar">
              <button
                className="nav-toggle"
                onClick={() => setNavOpen(true)}
                aria-label={t("openLessons")}
              >
                ☰
              </button>
              <h3>
                {t("lesson")} {displayedLessonNumber} — {lessonTitle}
              </h3>
              {completed && <span className="lesson-done">✓ {t("completed")}</span>}
              {offline && <span className="offline">{t("backendOffline")}</span>}
            </header>
            <ReactCourse
              key={`${lesson.id}:${restoreCount}`}
              lesson={displayLesson}
              displayedLessonNumber={displayedLessonNumber}
              completed={completed}
              onComplete={completeTerminalLesson}
              restoreKey={`${lesson.id}:${restoreCount}`}
            />
          </main>
        ) : (
        <main className={`main m-${mobileTab}`}>
          <header className="topbar">
            <button
              className="nav-toggle"
              onClick={() => setNavOpen(true)}
              aria-label={t("openLessons")}
            >
              ☰
            </button>
            <h3>
              {t("lesson")} {displayedLessonNumber} — {lessonTitle}
            </h3>
            {completed && <span className="lesson-done">✓ {t("completed")}</span>}
            {offline && (
              <span className="offline">{t("backendOffline")}</span>
            )}
          </header>
          {hasUntranslatedLessonText && (
            <div className="lesson-language-fallback" role="status">
              {t("lessonLanguageFallback", {
                language: LOCALE_NAMES[lessonLocale],
              })}
            </div>
          )}

          <nav className="mobile-tabs">
            {([
              ["canvas", lesson.kind === "math" ? "Workspace" : t("tabCircuit")],
              ...(!isGuidedMath ? [["editor", t("tabCode")] as const] : []),
              ["guide", t("tabGuide")],
              ["console", isGuidedMath ? "Activity" : t("tabConsole")],
            ] as const).map(([tabId, label]) => (
              <button
                key={tabId}
                className={mobileTab === tabId ? "active" : ""}
                aria-pressed={mobileTab === tabId}
                onClick={() => {
                  if (tabId === "editor") setEditorActivated(true);
                  setMobileTab(tabId);
                }}
              >
                {label}
                {tabId === "console" && running && <span className="tab-dot" />}
              </button>
            ))}
          </nav>

          <section className={`content${isGuidedMath ? " guided-math-content" : ""}`}>
            <div className="canvas">
              {lesson.kind === "math" ? (
                <>
                  <div className="panel-label">
                    {isGuidedMath ? "Math activity" : "Math workspace"}
                  </div>
                  {isGuidedMath ? (
                    <div className="kindergarten-math-board">
                      <p className={`math-problem${mathRunId ? " math-problem-result" : ""}`}>
                        {lesson.math?.problem ?? lessonDescription}
                      </p>
                      {mathValues.length ? (
                        <MathVisualModel
                          key={`${lesson.id}:${mathRunId}`}
                          visual={lesson.math?.visual}
                          values={mathValues}
                          resultLabel="Your answer"
                        />
                      ) : (
                        <p className="kindergarten-board-prompt" role="status">
                          Think it through. Choose your answer in the activity guide to reveal
                          your result.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="math-workspace">
                      <MathGraph values={mathValues} />
                    </div>
                  )}
                </>
              ) : lesson.kind === "vision" ? (
                <>
                  <div className="panel-label">{t("cameraLabel")}</div>
                  <VisionCanvas frame={visionFrame} sampleImage={lesson.vision?.sampleImage} />
                  {lesson.vision?.scene === "ball" && (
                    <div className="world-controls vision-controls">
                      <label>
                        {t("moveRedBall")}
                        <input
                          type="range"
                          min={50}
                          max={175}
                          value={visionBallX}
                          onChange={(event) => setVisionBallX(Number(event.target.value))}
                          aria-label={t("moveRedBall")}
                        />
                        <code>{visionBallX}px</code>
                      </label>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="panel-label">{t("circuitCanvasLabel")}</div>
                  <CircuitCanvas
                key={`${lesson.id}:${restoreCount}`}
                palette={lesson.circuit.palette as PartType[]}
                circuit={circuit}
                onCircuitChange={setCircuit}
                ledLevels={ledLevels}
                currentWires={currentWires}
                rgbLevels={rgbLevels}
                servoAngles={servoAngles}
                stepperAngles={stepperAngles}
                shiftBits={shiftBits}
                motorSpeeds={motorSpeeds}
                imuOrient={{ heading, pitch, roll }}
                buzzerFreqs={buzzerFreqs}
                lcdLines={lcdLines}
                selected={selected}
                onSelect={setSelected}
                onButtonChange={onButtonChange}
                onIrButton={onIrButton}
                boardLed={running && boardLed}
              />
              <div className="world-controls">
                {hasType("potentiometer") && (
                  <label>
                    {t("potentiometer")}
                    <input type="range" min={0} max={1023} value={potValue}
                      onChange={(e) => setPotValue(Number(e.target.value))} />
                    <code>{potValue}</code>
                  </label>
                )}
                {hasType("photoresistor") && (
                  <label>
                    {t("light")}
                    <input type="range" min={0} max={100} value={lightPct}
                      onChange={(e) => setLightPct(Number(e.target.value))} />
                    <code>{lightPct}%</code>
                  </label>
                )}
                {(hasType("ntc") || hasType("dht")) && (
                  <label>
                    {t("temperature")}
                    <input type="range" min={-24} max={80} value={tempC}
                      onChange={(e) => setTempC(Number(e.target.value))} />
                    <code>{tempC}°C</code>
                  </label>
                )}
                {hasType("dht") && (
                  <label>
                    {t("humidity")}
                    <input type="range" min={0} max={100} value={humidityPct}
                      onChange={(e) => setHumidityPct(Number(e.target.value))} />
                    <code>{humidityPct}%</code>
                  </label>
                )}
                {hasType("imu") && (
                  <>
                    <label>
                      {t("heading")}
                      <input type="range" min={0} max={360} value={heading}
                        onChange={(e) => setHeading(Number(e.target.value))} />
                      <code>{heading}°</code>
                    </label>
                    <label>
                      {t("pitch")}
                      <input type="range" min={-90} max={90} value={pitch}
                        onChange={(e) => setPitch(Number(e.target.value))} />
                      <code>{pitch}°</code>
                    </label>
                    <label>
                      {t("roll")}
                      <input type="range" min={-90} max={90} value={roll}
                        onChange={(e) => setRoll(Number(e.target.value))} />
                      <code>{roll}°</code>
                    </label>
                  </>
                )}
                {hasType("ultrasonic") && (
                  <label>
                    {t("distance")}
                    <input type="range" min={2} max={200} value={distanceCm}
                      onChange={(e) => setDistanceCm(Number(e.target.value))} />
                    <code>{distanceCm}cm</code>
                  </label>
                )}
                {hasType("pushbutton") && (
                  <span className="world-hint">{t("pushButtonHint")}</span>
                )}
                {hasType("irremote") && (
                  <span className="world-hint">{t("remoteHint")}</span>
                )}
              </div>
              <div className="circuit-notes">{lesson.circuit.notes}</div>
                </>
              )}
            </div>

            <div className="guide">
              {lesson.kind === "math" ? (
                <>
                  <div className="panel-label">Math Guide</div>
                  <h4>Lesson theory</h4>
                  <p className="why">
                    {lesson.math?.theory ?? lessonDescription}
                  </p>
                  <h5>1. {isGuidedMath ? "Solve and choose your prediction" : "Solve and make a prediction"}</h5>
                  <p className={`math-problem${mathRunId ? " math-problem-result" : ""}`}>
                    {lesson.math?.problem ?? lessonDescription}
                  </p>
                  <form
                    className="math-answer-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      checkMathAnswer();
                    }}
                  >
                    {isGuidedMath ? (
                      <>
                        <span className="math-answer-label">Tap your answer</span>
                        <div className="math-answer-choices" role="group" aria-label="Choose your answer">
                          {(lesson.math?.choices ?? []).map((choice, index) => (
                            <button
                              className={`math-answer-choice${selectedMathChoice === index ? " selected" : ""}`}
                              type="button"
                              aria-pressed={selectedMathChoice === index}
                              key={`${choice.label}-${index}`}
                              onClick={() => {
                                setSelectedMathChoice(index);
                                setMathAnswerFeedback(null);
                                setMathValues([]);
                              }}
                            >
                              {choice.label}
                            </button>
                          ))}
                        </div>
                        <button className="math-check-button" type="submit">
                          2. Check and animate
                        </button>
                      </>
                    ) : (
                      <>
                        <label htmlFor="math-answer">Your prediction</label>
                        <div className="math-answer-controls">
                          <input
                            id="math-answer"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="Type your answer"
                            value={mathAnswer}
                            onChange={(event) => {
                              setMathAnswer(event.target.value);
                              setMathAnswerFeedback(null);
                            }}
                          />
                        </div>
                        {lesson.math?.problem.includes("____") &&
                          lesson.math.problem.split("____").length > 2 && (
                          <span className="math-answer-help">
                            Enter answers in blank order, separated by commas.
                          </span>
                          )}
                        <h5>2. Type the Python code in the editor</h5>
                        <p className="why">
                          Use the code editor beside this guide. Type these lines, then run the program
                          to see what your code calculates.
                        </p>
                        <pre className="math-code-snippet">
                          <code>{mathCodeSnippet}</code>
                        </pre>
                        <p className="why">
                          The visual result is built from the numbers your program actually prints.
                          Program Output and the graph update from the same run.
                        </p>
                        <button className="math-check-button" type="submit" disabled={running}>
                          3. Run code and check prediction
                        </button>
                      </>
                    )}
                    {mathAnswerFeedback && (
                      <p
                        className={`math-answer-feedback ${mathAnswerFeedback}`}
                        role="status"
                        aria-live="polite"
                      >
                        {mathAnswerFeedback === "correct"
                          ? isGuidedMath
                            ? "That's right! Your answer is coming to life."
                            : "Correct — your answer matches the result of your Python program."
                          : mathAnswerFeedback === "incorrect"
                            ? isGuidedMath
                              ? "Not quite. Look at the question and try another answer."
                              : "Not quite. Review the lesson theory or adjust your Python calculation, then try again."
                            : mathAnswerFeedback === "invalid"
                              ? isGuidedMath
                                ? "Choose one of the answer cards first."
                                : "Enter a number for each blank. Separate multiple answers with commas."
                              : mathAnswerFeedback === "configuration-error"
                                ? "This activity is missing its answer key. Please let a teacher know."
                                : "Your program must run successfully and print numeric results before the answer can be checked."}
                      </p>
                    )}
                    {!isGuidedMath && (
                      <MathVisualModel
                        key={`${lesson.id}:${mathRunId}`}
                        visual={lesson.math?.visual}
                        values={mathValues}
                      />
                    )}
                  </form>
                  {lesson.source && <p className="lesson-source">{lesson.source}</p>}
                </>
              ) : (
                <>
                  <div className="panel-label">
                    {t("componentGuide")}{selected ? ` — ${selected}` : ""}
                  </div>
                  <h4>{guide.name}</h4>
                  {guide.symbol && <SchematicSymbol src={guide.symbol} />}
                  <h5>{t("whatItDoes")}</h5>
                  <p className="why">{guide.function}</p>
                  <h5>{t("science")}</h5>
                  <p className="why">{guide.science}</p>
                  <dl>
                    {Object.entries(guide.specs).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>{t("terminals")}</dt>
                      <dd>{guide.terminals}</dd>
                    </div>
                  </dl>
                  <p className="note">⚠ {guide.notes}</p>
                  <h5>{t("objective")}</h5>
                  <p className="why">{lessonDescription}</p>
                  {lesson.source && <p className="lesson-source">{lesson.source}</p>}
                </>
              )}
            </div>

            {!isGuidedMath && <div className="editor">
              <div className="panel-label editor-bar">
                <span>
                  {lesson.kind === "math"
                    ? "Code IDE — Math with Python"
                    : lesson.kind === "python"
                      ? "Code IDE — Python (RPi.GPIO)"
                    : lesson.kind === "serial"
                      ? "Code IDE — Python (pyserial)"
                      : lesson.kind === "vision"
                        ? "Code IDE — Python (OpenCV)"
                        : "Code IDE — Arduino C++"}
                </span>
                {running ? (
                  <button className="run stop" onClick={stopSim}>
                    {t("stop")}
                  </button>
                ) : (
                  <button className="run" onClick={() => runSketch()}>
                    {t("run")}
                  </button>
                )}
              </div>
              {editorActivated ? (
                <Suspense
                  fallback={
                    <div className="editor-load-placeholder" role="status">
                      Loading code editor…
                    </div>
                  }
                >
                  <CodeEditor
                    key={`${lesson.id}:${restoreCount}`}
                    starter={starter}
                    language={lesson.codeTemplate.language}
                    handleRef={editorRef}
                    onChange={setCode}
                  />
                </Suspense>
              ) : (
                <button
                  className="editor-load-placeholder"
                  onClick={() => setEditorActivated(true)}
                  aria-label="Load code editor"
                >
                  <strong>Click to start coding</strong>
                  <span>The code editor loads when you are ready.</span>
                </button>
              )}
              {lesson.codeTemplate.language === "python" && (
                <p className="python-indent-note">
                  {t("pythonIndentation")}
                </p>
              )}
              <div className="hints">
                <div className="hints-title">{t("hintsTitle")}</div>
                {lesson.kind === "math" ? (
                  <details className="math-hints">
                    <summary>Need a coding hint? Show steps.</summary>
                    {lesson.hints.map((hint, i) => (
                      <div className={typedHints[i] ? "hint done" : "hint"} key={hint}>
                        <span className="hint-label">
                          {typedHints[i] ? "✓" : (HINT_LABELS[i] ?? "•")}
                        </span>
                        <code>{hint}</code>
                      </div>
                    ))}
                  </details>
                ) : (
                  lesson.hints.map((hint, i) => (
                    <div className={typedHints[i] ? "hint done" : "hint"} key={hint}>
                      <span className="hint-label">
                        {typedHints[i] ? "✓" : (HINT_LABELS[i] ?? "•")}
                      </span>
                      <code>{hint}</code>
                    </div>
                  ))
                )}
              </div>
              {lesson.kind === "serial" && lesson.arduinoSketch && (
                <div className="companion-sketch">
                  <div className="panel-label">
                    {t("companionSketch")}
                  </div>
                  <pre className="companion-code">{lesson.arduinoSketch}</pre>
                </div>
              )}
            </div>}
          </section>

          <footer className="console">
            <div className="console-pane">
              <p className="panel-label">
                {isGuidedMath
                  ? "Activity"
                  : lesson.kind === "math"
                    ? "Program Output"
                    : t("serialOutput")}
                {running && <span className="live"> ● {t("running")}</span>}
              </p>
              <pre>
                {serial.length > 0
                  ? serial.join("\n")
                  : running
                    ? t("sketchRunning")
                    : isGuidedMath
                      ? mathAnswerFeedback === "correct"
                        ? "You solved it! See your answer take shape in the activity."
                        : "Choose an answer to reveal the animated result."
                      : `${lesson.output.initial}\n${lesson.output.status}`}
              </pre>
            </div>
            <div className="console-pane diagnostics">
              <p className="panel-label">{t("diagnostics")}</p>
              <div className="diag-list">
                {lesson.kind === "math" ? null : lesson.kind === "vision" ? (
                  <div className="diag diag-ok">
                    <span className="diag-badge">✓ pixels</span>
                    {t("pixelDiagnostic")}
                  </div>
                ) : (
                  diagnoses.map((d, i) => (
                    <div key={i} className={`diag diag-${d.level}`}>
                      <span className="diag-badge">
                        {d.level === "error" ? "✖" : d.level === "warn" ? "▲" : "✓"}{" "}
                        {d.source}
                      </span>
                      {d.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          </footer>
        </main>
        )}
      </div>
      <FeedbackWidget
        context={
          view === "transcript"
            ? "transcript"
            : `${activeTrackInfo?.name ?? activeTrack} · lesson ${displayedLessonNumber}`
        }
      />
    </div>
  );
}
