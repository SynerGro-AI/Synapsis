import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import AccountPanel from "./components/AccountPanel";
import ActivityBar from "./components/ActivityBar";
import CircuitCanvas from "./components/CircuitCanvas";
import CodeEditor, { type CodeEditorHandle } from "./components/CodeEditor";
import SchematicSymbol from "./components/SchematicSymbol";
import TerminalCourse from "./components/TerminalCourse";
import Transcript from "./components/Transcript";
import { ArduinoSim, analyzeSketch } from "./sim/arduino";
import {
  CircuitRuntime,
  validate,
  type CircuitState,
  type PartType,
  type WorldState,
} from "./circuit/engine";
import { getProgress, me, saveProgress, type User } from "./auth";
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
const EMPTY_CIRCUIT: CircuitState = { parts: [], wires: [] };

type MobileTab = "canvas" | "editor" | "guide" | "console";
const MOBILE_TABS: { id: MobileTab; label: string }[] = [
  { id: "canvas", label: "◆ Circuit" },
  { id: "editor", label: "‹› Code" },
  { id: "guide", label: "ℹ Guide" },
  { id: "console", label: "▤ Console" },
];

interface SavedLesson {
  completed: boolean;
  sketch: string | null;
  circuit: CircuitState | null;
}

export default function App() {
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
  const [navOpen, setNavOpen] = useState(false);

  const [running, setRunning] = useState(false);
  const [ranClean, setRanClean] = useState(false);
  const [serial, setSerial] = useState<string[]>([]);
  const [ledLevels, setLedLevels] = useState<Map<string, number>>(new Map());
  const [currentWires, setCurrentWires] = useState<Map<number, boolean>>(new Map());
  const [rgbLevels, setRgbLevels] = useState<Map<string, { r: number; g: number; b: number }>>(new Map());
  const [servoAngles, setServoAngles] = useState<Map<string, number>>(new Map());
  const [motorSpeeds, setMotorSpeeds] = useState<Map<string, number>>(new Map());
  const [buzzerFreqs, setBuzzerFreqs] = useState<Map<string, number>>(new Map());
  const [lcdLines, setLcdLines] = useState<[string, string] | null>(null);
  const [boardLed, setBoardLed] = useState(false);

  // World: what physically surrounds the circuit
  const [potValue, setPotValue] = useState(512);
  const [lightPct, setLightPct] = useState(70);
  const [tempC, setTempC] = useState(22);
  const [humidityPct, setHumidityPct] = useState(50);
  const [distanceCm, setDistanceCm] = useState(50);

  const editorRef = useRef<CodeEditorHandle | null>(null);
  const engineRef = useRef<ArduinoSim | null>(null);
  const runtimeRef = useRef<CircuitRuntime | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const worldRef = useRef<WorldState>({
    pressed: new Set<string>(),
    potValue: 512,
    lightPct: 70,
    tempC: 22,
    humidityPct: 50,
    distanceCm: 50,
  });
  worldRef.current.potValue = potValue;
  worldRef.current.lightPct = lightPct;
  worldRef.current.tempC = tempC;
  worldRef.current.humidityPct = humidityPct;
  worldRef.current.distanceCm = distanceCm;

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
  const trackLessons = data.lessons.filter((l) => phaseTrack.get(l.phase) === activeTrack);

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
    runtimeRef.current = null;
    setRunning(false);
    setLedLevels(new Map());
    setCurrentWires(new Map());
    setRgbLevels(new Map());
    setServoAngles(new Map());
    setMotorSpeeds(new Map());
    setBuzzerFreqs(new Map());
    setLcdLines(null);
    setBoardLed(false);
  }, []);

  // Changing lessons resets the workspace.
  useEffect(() => {
    stopSim();
    setSerial([]);
    setRanClean(false);
    setSelected(null);
    setCode(starter);
    setCircuit(saved[lesson.id]?.circuit ?? EMPTY_CIRCUIT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, restoreCount, stopSim]);

  const refreshOutputs = useCallback(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const out = rt.outputs();
    setLedLevels(out.led);
    setCurrentWires(out.current);
    setRgbLevels(out.rgb);
    setServoAngles(out.servo);
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

  function runSketch() {
    stopSim();
    const sketch = editorRef.current?.getValue() ?? code;
    const sim = new ArduinoSim();
    engineRef.current = sim;
    const rt = new CircuitRuntime(circuit, worldRef.current);
    runtimeRef.current = rt;
    setSerial([]);
    setRunning(true);

    sim
      .run(sketch, {
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
        serial: (line) => {
          setRanClean(true);
          setSerial((s) => [...s.slice(-30), line]);
        },
        onError: (message) => setSerial((s) => [...s, `⚠ ${message}`]),
      })
      .finally(() => {
        if (engineRef.current === sim) {
          setRunning(false);
        }
      });
  }

  // ---- Live diagnostics: circuit + code, explained bottom-right ----
  const diagnoses = useMemo(
    () => validate(circuit, analyzeSketch(code), lesson.circuit.required as PartType[]),
    [circuit, code, lesson.circuit.required],
  );
  const circuitOk = !diagnoses.some((d) => d.level === "error");

  const codeNorm = normalize(code);
  const typedHints = lesson.hints.map((h) => codeNorm.includes(normalize(h)));
  const allTyped = lesson.hints.length > 0 && typedHints.every(Boolean);
  const completed =
    Boolean(saved[lesson.id]?.completed) || (allTyped && ranClean && circuitOk);

  useEffect(() => {
    if (allTyped && ranClean && circuitOk && !saved[lesson.id]?.completed) {
      setSaved((s) => ({
        ...s,
        [lesson.id]: {
          completed: true,
          sketch: s[lesson.id]?.sketch ?? null,
          circuit: s[lesson.id]?.circuit ?? null,
        },
      }));
    }
  }, [allTyped, ranClean, circuitOk, lesson.id, saved]);

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
          Sponsored by <strong>SynerGro.Ai Corp</strong>
        </a>
        <span className="credits-text">
          Lessons based on the Arduino tutorials of{" "}
          <a href={CREDIT.website} target="_blank" rel="noreferrer">
            {CREDIT.author} — toptechboy.com
          </a>
        </span>
        <a className="donate" href={CREDIT.donate} target="_blank" rel="noreferrer">
          ❤ Support Paul on Patreon
        </a>
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
            {activeTrackInfo?.name ?? "Synapsys"}
          </h2>
          <div className="sidebar-lessons">
            {sidebarPhases.length === 0 ? (
              <div className="sidebar-soon">
                <p>{activeTrackInfo?.blurb}</p>
                <span className="cs-tag">Lessons coming soon</span>
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
                          {l.id}. {l.title}
                        </li>
                      ))}
                  </ul>
                </div>
              ))
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
              <span className="cs-tag">Coming soon</span>
            </div>
          </main>
        ) : lesson.kind === "terminal" ? (
          <main className="main terminal-main">
            <header className="topbar">
              <button
                className="nav-toggle"
                onClick={() => setNavOpen(true)}
                aria-label="Open lessons"
              >
                ☰
              </button>
              <h3>
                Lesson {lesson.id} — {lesson.title}
              </h3>
              {completed && <span className="lesson-done">✓ completed</span>}
              {offline && (
                <span className="offline">backend offline — using built-in data</span>
              )}
            </header>
            <TerminalCourse
              lesson={lesson}
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
              aria-label="Open lessons"
            >
              ☰
            </button>
            <h3>
              Lesson {lesson.id} — {lesson.title}
            </h3>
            {completed && <span className="lesson-done">✓ completed</span>}
            {offline && (
              <span className="offline">backend offline — using built-in data</span>
            )}
          </header>

          <nav className="mobile-tabs">
            {MOBILE_TABS.map((t) => (
              <button
                key={t.id}
                className={mobileTab === t.id ? "active" : ""}
                onClick={() => setMobileTab(t.id)}
              >
                {t.label}
                {t.id === "console" && running && <span className="tab-dot" />}
              </button>
            ))}
          </nav>

          <section className="content">
            <div className="canvas">
              <div className="panel-label">Circuit Canvas — click a pin, drag to another pin to wire</div>
              <CircuitCanvas
                key={`${lesson.id}:${restoreCount}`}
                palette={lesson.circuit.palette as PartType[]}
                circuit={circuit}
                onCircuitChange={setCircuit}
                ledLevels={ledLevels}
                currentWires={currentWires}
                rgbLevels={rgbLevels}
                servoAngles={servoAngles}
                motorSpeeds={motorSpeeds}
                buzzerFreqs={buzzerFreqs}
                lcdLines={lcdLines}
                selected={selected}
                onSelect={setSelected}
                onButtonChange={onButtonChange}
                boardLed={running && boardLed}
              />
              <div className="world-controls">
                {hasType("potentiometer") && (
                  <label>
                    Pot
                    <input type="range" min={0} max={1023} value={potValue}
                      onChange={(e) => setPotValue(Number(e.target.value))} />
                    <code>{potValue}</code>
                  </label>
                )}
                {hasType("photoresistor") && (
                  <label>
                    Light
                    <input type="range" min={0} max={100} value={lightPct}
                      onChange={(e) => setLightPct(Number(e.target.value))} />
                    <code>{lightPct}%</code>
                  </label>
                )}
                {(hasType("ntc") || hasType("dht")) && (
                  <label>
                    Temp
                    <input type="range" min={-24} max={80} value={tempC}
                      onChange={(e) => setTempC(Number(e.target.value))} />
                    <code>{tempC}°C</code>
                  </label>
                )}
                {hasType("dht") && (
                  <label>
                    Humidity
                    <input type="range" min={0} max={100} value={humidityPct}
                      onChange={(e) => setHumidityPct(Number(e.target.value))} />
                    <code>{humidityPct}%</code>
                  </label>
                )}
                {hasType("ultrasonic") && (
                  <label>
                    Distance
                    <input type="range" min={2} max={200} value={distanceCm}
                      onChange={(e) => setDistanceCm(Number(e.target.value))} />
                    <code>{distanceCm}cm</code>
                  </label>
                )}
                {hasType("pushbutton") && (
                  <span className="world-hint">Click & hold the button on the canvas to press it</span>
                )}
              </div>
              <div className="circuit-notes">{lesson.circuit.notes}</div>
            </div>

            <div className="guide">
              <div className="panel-label">
                Component Guide{selected ? ` — ${selected}` : ""}
              </div>
              <h4>{guide.name}</h4>
              {guide.symbol && <SchematicSymbol src={guide.symbol} />}
              <h5>What it does</h5>
              <p className="why">{guide.function}</p>
              <h5>The science</h5>
              <p className="why">{guide.science}</p>
              <dl>
                {Object.entries(guide.specs).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
                <div>
                  <dt>Terminals</dt>
                  <dd>{guide.terminals}</dd>
                </div>
              </dl>
              <p className="note">⚠ {guide.notes}</p>
              <h5>Objective</h5>
              <p className="why">{lesson.description}</p>
              {lesson.source && <p className="lesson-source">{lesson.source}</p>}
            </div>

            <div className="editor">
              <div className="panel-label editor-bar">
                <span>Code IDE — Arduino C++</span>
                {running ? (
                  <button className="run stop" onClick={stopSim}>
                    ■ Stop
                  </button>
                ) : (
                  <button className="run" onClick={runSketch}>
                    ▶ Run
                  </button>
                )}
              </div>
              <CodeEditor
                key={`${lesson.id}:${restoreCount}`}
                starter={starter}
                language={lesson.codeTemplate.language}
                handleRef={editorRef}
                onChange={setCode}
              />
              <div className="hints">
                <div className="hints-title">Type these to build your sketch:</div>
                {lesson.hints.map((hint, i) => (
                  <div className={typedHints[i] ? "hint done" : "hint"} key={hint}>
                    <span className="hint-label">
                      {typedHints[i] ? "✓" : (HINT_LABELS[i] ?? "•")}
                    </span>
                    <code>{hint}</code>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <footer className="console">
            <div className="console-pane">
              <p className="panel-label">
                Serial Output{running && <span className="live"> ● running</span>}
              </p>
              <pre>
                {serial.length > 0
                  ? serial.join("\n")
                  : running
                    ? "Sketch running..."
                    : `${lesson.output.initial}\n${lesson.output.status}`}
              </pre>
            </div>
            <div className="console-pane diagnostics">
              <p className="panel-label">Diagnostics — why it works (or doesn't)</p>
              <div className="diag-list">
                {diagnoses.map((d, i) => (
                  <div key={i} className={`diag diag-${d.level}`}>
                    <span className="diag-badge">
                      {d.level === "error" ? "✖" : d.level === "warn" ? "▲" : "✓"}{" "}
                      {d.source}
                    </span>
                    {d.message}
                  </div>
                ))}
              </div>
            </div>
          </footer>
        </main>
        )}
      </div>
    </div>
  );
}
