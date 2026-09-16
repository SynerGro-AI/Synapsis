import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import AccountPanel from "./components/AccountPanel";
import CircuitCanvas from "./components/CircuitCanvas";
import CodeEditor, { type CodeEditorHandle } from "./components/CodeEditor";
import SchematicSymbol from "./components/SchematicSymbol";
import { ArduinoSim } from "./sim/arduino";
import {
  getProgress,
  me,
  saveProgress,
  type User,
} from "./auth";
import {
  CREDIT,
  FALLBACK_DATA,
  fetchLessonData,
  type LessonData,
} from "./api";

const HINT_LABELS = "ABCDEFGH";
const normalize = (s: string) => s.replace(/\s+/g, "");

interface SavedLesson {
  completed: boolean;
  sketch: string | null;
}

export default function App() {
  const [data, setData] = useState<LessonData>(FALLBACK_DATA);
  const [lessonId, setLessonId] = useState(1);
  const [offline, setOffline] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [saved, setSaved] = useState<Record<number, SavedLesson>>({});
  const [restoreCount, setRestoreCount] = useState(0);

  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [ranClean, setRanClean] = useState(false);
  const [serial, setSerial] = useState<string[]>([]);
  const [pinStates, setPinStates] = useState<Record<number, boolean>>({});
  const [potValue, setPotValue] = useState(512);

  const editorRef = useRef<CodeEditorHandle | null>(null);
  const engineRef = useRef<ArduinoSim | null>(null);
  // Read synchronously by the interpreter's analogRead.
  const potRef = useRef(512);
  potRef.current = potValue;

  useEffect(() => {
    fetchLessonData()
      .then(setData)
      .catch(() => setOffline(true));
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
        for (const entry of progress.lessons)
          map[entry.lessonId] = {
            completed: entry.completed,
            sketch: entry.sketch,
          };
        setSaved(map);
        setLessonId(progress.currentLesson);
        setRestoreCount((n) => n + 1);
      })
      .catch(() => {});
  }, []);

  // Restore the session on load.
  useEffect(() => {
    me().then((who) => who && applyProgress(who));
  }, [applyProgress]);

  const lesson = data.lessons.find((l) => l.id === lessonId) ?? data.lessons[0];
  const guide = lesson.componentGuide;
  const starter = saved[lesson.id]?.sketch ?? lesson.codeTemplate.starter;
  const hasPot = lesson.circuit.components.some((c) =>
    c.toLowerCase().includes("potentiometer"),
  );

  const stopSim = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    setRunning(false);
  }, []);

  // Changing lessons resets the workspace.
  useEffect(() => {
    stopSim();
    setSerial([]);
    setPinStates({});
    setRanClean(false);
    setCode(starter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, restoreCount, stopSim]);

  function runSketch() {
    stopSim();
    const sketch = editorRef.current?.getValue() ?? code;
    const sim = new ArduinoSim();
    engineRef.current = sim;
    setSerial([]);
    setPinStates({});
    setRunning(true);

    sim
      .run(sketch, {
        digitalWrite: (pin, high) => {
          setRanClean(true);
          setPinStates((p) => (p[pin] === high ? p : { ...p, [pin]: high }));
        },
        analogRead: () => potRef.current,
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

  const codeNorm = normalize(code);
  const typedHints = lesson.hints.map((h) => codeNorm.includes(normalize(h)));
  const allTyped = lesson.hints.length > 0 && typedHints.every(Boolean);
  const completed = Boolean(saved[lesson.id]?.completed) || (allTyped && ranClean);

  // Mark completion locally the moment it's earned.
  useEffect(() => {
    if (allTyped && ranClean && !saved[lesson.id]?.completed) {
      setSaved((s) => ({
        ...s,
        [lesson.id]: { completed: true, sketch: s[lesson.id]?.sketch ?? null },
      }));
    }
  }, [allTyped, ranClean, lesson.id, saved]);

  // Autosave sketch + completion + current lesson (debounced).
  useEffect(() => {
    if (!user || !code) return;
    const timer = setTimeout(() => {
      saveProgress(lesson.id, {
        completed,
        sketch: code,
        current: true,
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [user, code, completed, lesson.id]);

  return (
    <div className="page">
      {/* Credits — lesson curriculum by Paul McWhorter */}
      <div className="credits">
        Lessons based on the Arduino tutorials of{" "}
        <a href={CREDIT.website} target="_blank" rel="noreferrer">
          {CREDIT.author} — toptechboy.com
        </a>
        <a className="donate" href={CREDIT.donate} target="_blank" rel="noreferrer">
          ❤ Support Paul on Patreon
        </a>
      </div>

      <div className="app">
        {/* Sidebar — lessons grouped by curriculum phase */}
        <aside className="sidebar">
          <h2>Synapsys</h2>
          <div className="sidebar-lessons">
            {data.phases
              .filter((phase) => data.lessons.some((l) => l.phase === phase.id))
              .map((phase) => (
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
                          className={l.id === lesson.id ? "active" : ""}
                          onClick={() => setLessonId(l.id)}
                        >
                          <span className="lesson-check">
                            {saved[l.id]?.completed ? "✓" : ""}
                          </span>
                          {l.id}. {l.title}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
          </div>
          <AccountPanel user={user} onAuth={applyProgress} />
        </aside>

        {/* Main Content */}
        <main className="main">
          <header className="topbar">
            <h3>
              Lesson {lesson.id} — {lesson.title}
            </h3>
            {completed && <span className="lesson-done">✓ completed</span>}
            {offline && (
              <span className="offline">backend offline — using built-in data</span>
            )}
          </header>

          <section className="content">
            <div className="canvas">
              <div className="panel-label">Circuit Canvas</div>
              <CircuitCanvas
                key={lesson.id}
                components={lesson.circuit.components}
                ledOn={running && !!pinStates[13]}
                potValue={potValue}
                onPotChange={setPotValue}
              />
              {hasPot && (
                <div className="pot-control">
                  <span>Potentiometer</span>
                  <input
                    type="range"
                    min={0}
                    max={1023}
                    value={potValue}
                    onChange={(e) => setPotValue(Number(e.target.value))}
                  />
                  <code>{potValue}</code>
                </div>
              )}
              <div className="circuit-notes">
                <strong>{lesson.circuit.components.join(" · ")}</strong>
                <br />
                {lesson.circuit.notes}
              </div>
            </div>

            <div className="guide">
              <div className="panel-label">Component Guide</div>
              <h4>{guide.name}</h4>
              {guide.symbol && <SchematicSymbol src={guide.symbol} />}
              <dl>
                {Object.entries(guide.info).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <h4>Objective</h4>
              <p className="why">{lesson.description}</p>
              {lesson.source && <p className="lesson-source">{lesson.source}</p>}
            </div>

            <div className="editor">
              <div className="panel-label editor-bar">
                <span>
                  Code IDE —{" "}
                  {lesson.codeTemplate.language === "cpp"
                    ? "Arduino C++"
                    : lesson.codeTemplate.language}
                </span>
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
                  <div
                    className={typedHints[i] ? "hint done" : "hint"}
                    key={hint}
                  >
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
            <p className="panel-label">
              Serial Output{running && <span className="live"> ● running</span>}
            </p>
            <pre>
              {Object.entries(pinStates)
                .map(([pin, high]) => `PIN ${pin} ${high ? "ON" : "OFF"}`)
                .join("\n")}
              {Object.keys(pinStates).length > 0 && "\n"}
              {serial.length > 0
                ? serial.join("\n")
                : running
                  ? "Sketch running..."
                  : `${lesson.output.initial}\n${lesson.output.status}`}
            </pre>
          </footer>
        </main>
      </div>
    </div>
  );
}
