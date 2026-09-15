import "./App.css";
import CircuitCanvas from "./components/CircuitCanvas";
import CodeEditor from "./components/CodeEditor";

export default function App() {
  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <h2>Synapsys</h2>
        <ul>
          <li>Circuits</li>
          <li>Components</li>
          <li>Code</li>
          <li>Lessons</li>
        </ul>
      </aside>

      {/* Main Content */}
      <main className="main">
        <header className="topbar">
          <h3>Lesson 1 — LED Blink</h3>
        </header>

        <section className="content">
          <div className="canvas">
            <div className="panel-label">Circuit Canvas</div>
            <CircuitCanvas />
          </div>
          <div className="guide">
            <div className="panel-label">Component Guide</div>
            <h4>LED — Light Emitting Diode</h4>
            <dl>
              <dt>Forward Voltage</dt>
              <dd>2.0 – 2.2V</dd>
              <dt>Max Current</dt>
              <dd>20mA</dd>
              <dt>Resistor Needed</dt>
              <dd>220Ω</dd>
            </dl>
            <p className="note">
              ⚠ Polarity matters! The <strong>longer</strong> leg is the anode
              (+). Connect it toward power. The <strong>shorter</strong> leg is
              the cathode (−). Connect it toward GND. Reversed = no light.
            </p>
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
  );
}
