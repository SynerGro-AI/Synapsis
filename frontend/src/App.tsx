import { useEffect, useState } from "react";
import "./App.css";
import CircuitCanvas from "./components/CircuitCanvas";
import CodeEditor from "./components/CodeEditor";
import {
  CREDIT,
  FALLBACK_DATA,
  fetchLessonData,
  type LessonData,
} from "./api";

const HINT_LABELS = "ABCDEFGH";

export default function App() {
  const [data, setData] = useState<LessonData>(FALLBACK_DATA);
  const [lessonId, setLessonId] = useState(1);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    fetchLessonData()
      .then(setData)
      .catch(() => setOffline(true));
  }, []);

  const lesson = data.lessons.find((l) => l.id === lessonId) ?? data.lessons[0];
  const guide = lesson.componentGuide;

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
                        {l.id}. {l.title}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </aside>

        {/* Main Content */}
        <main className="main">
          <header className="topbar">
            <h3>
              Lesson {lesson.id} — {lesson.title}
            </h3>
            {offline && (
              <span className="offline">backend offline — using built-in data</span>
            )}
          </header>

          <section className="content">
            <div className="canvas">
              <div className="panel-label">Circuit Canvas</div>
              <CircuitCanvas />
              <div className="circuit-notes">
                <strong>{lesson.circuit.components.join(" · ")}</strong>
                <br />
                {lesson.circuit.notes}
              </div>
            </div>

            <div className="guide">
              <div className="panel-label">Component Guide</div>
              <h4>{guide.name}</h4>
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
              <div className="panel-label">
                Code IDE — {lesson.codeTemplate.language === "cpp" ? "Arduino C++" : lesson.codeTemplate.language}
              </div>
              <CodeEditor
                key={lesson.id}
                starter={lesson.codeTemplate.starter}
                language={lesson.codeTemplate.language}
              />
              <div className="hints">
                {lesson.hints.map((hint, i) => (
                  <div className="hint" key={hint}>
                    <span className="hint-label">{HINT_LABELS[i] ?? "•"}</span>
                    <code>{hint}</code>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <footer className="console">
            <p className="panel-label">Serial Output</p>
            <pre>
              {lesson.output.initial}
              {"\n"}
              {lesson.output.status}
            </pre>
          </footer>
        </main>
      </div>
    </div>
  );
}
