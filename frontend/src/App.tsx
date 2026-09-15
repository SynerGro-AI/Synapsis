import { useEffect, useState } from "react";
import "./App.css";
import CircuitCanvas from "./components/CircuitCanvas";
import CodeEditor from "./components/CodeEditor";
import {
  CREDIT,
  FALLBACK_LESSONS,
  FALLBACK_PARTS,
  fetchComponents,
  fetchLessons,
  type Lesson,
  type PartInfo,
} from "./api";

export default function App() {
  const [lessons, setLessons] = useState<Lesson[]>(FALLBACK_LESSONS);
  const [parts, setParts] = useState<PartInfo[]>(FALLBACK_PARTS);
  const [lessonId, setLessonId] = useState(1);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    Promise.all([fetchLessons(), fetchComponents()])
      .then(([l, p]) => {
        setLessons(l);
        setParts(p);
      })
      .catch(() => setOffline(true));
  }, []);

  const lesson = lessons.find((l) => l.id === lessonId) ?? lessons[0];
  const part =
    parts.find((p) => p.id === lesson.components[0]) ?? parts[0];

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
        {/* Sidebar */}
        <aside className="sidebar">
          <h2>Synapsys</h2>
          <ul>
            {lessons.map((l) => (
              <li
                key={l.id}
                className={l.id === lesson.id ? "active" : ""}
                onClick={() => setLessonId(l.id)}
              >
                {l.id}. {l.title}
              </li>
            ))}
          </ul>
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
            </div>
            <div className="guide">
              <div className="panel-label">Component Guide</div>
              <h4>{part.name}</h4>
              <dl>
                {Object.entries(part.specs).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="why">{part.why}</p>
              <p className="note">⚠ {part.polarityNote}</p>
              <h4>Objective</h4>
              <p className="why">{lesson.objective}</p>
              <ol className="steps">
                {lesson.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <div className="editor">
              <div className="panel-label">Code IDE</div>
              <CodeEditor />
            </div>
          </section>

          <footer className="console">
            <p className="panel-label">Serial Output</p>
            <pre>PIN 13 OFF{"\n"}Waiting for sketch…</pre>
          </footer>
        </main>
      </div>
    </div>
  );
}
