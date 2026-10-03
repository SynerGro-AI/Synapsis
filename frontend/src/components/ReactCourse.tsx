import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Lesson } from "../api";
import type { CodeEditorHandle } from "./CodeEditor";

const CodeEditor = lazy(() => import("./CodeEditor"));

interface ReactCourseProps {
  lesson: Lesson;
  displayedLessonNumber: number;
  completed: boolean;
  onComplete: (id: number) => void;
  restoreKey: string;
}

interface PreviewMessage {
  type: "synapsis-react-render" | "synapsis-react-error";
  token: string;
  text?: string;
  message?: string;
}

interface ReactCorrection {
  title: string;
  code: string;
}

interface ReactDiagnosis {
  code: string;
  meaning: string;
  corrections: ReactCorrection[];
}

function explainReactError(message: string): ReactDiagnosis {
  if (/one parent|adjacent jsx|single parent/i.test(message)) {
    return {
      code: "JSX-STRUCTURE-01",
      meaning: "A component must return one top-level JSX element. Wrap sibling elements in a main or fragment.",
      corrections: [{ title: "Wrap the page in main", code: "<main>\n  \n</main>" }],
    };
  }
  if (/not defined|ReferenceError/i.test(message)) {
    const name = message.match(/(?:['"])?([A-Za-z_$][\w$]*)(?:['"])? is not defined/i)?.[1];
    return {
      code: "JS-RUNTIME-01",
      meaning: name
        ? `${name} is used before it is declared, or its spelling/capitalization does not match.`
        : "A name used by the app was not declared in the component.",
      corrections: name
        ? [{ title: `Declare ${name} before using it`, code: `const ${name} = "";` }]
        : [],
    };
  }
  if (/objects are not valid as a react child/i.test(message)) {
    return {
      code: "JSX-RENDER-01",
      meaning: "JSX cannot display a whole object. Render one of its text or number properties instead.",
      corrections: [{ title: "Render a record's name", code: "{record.name}" }],
    };
  }
  if (/invalid hook call/i.test(message)) {
    return {
      code: "REACT-HOOK-01",
      meaning: "React hooks must be called at the top level of a function component, not inside a condition or event handler.",
      corrections: [{ title: "Call state at the component top level", code: "const [value, setValue] = React.useState(\"\");" }],
    };
  }
  if (/unexpected token|unterminated|expected .*\\}|syntaxerror/i.test(message)) {
    return {
      code: "JSX-SYNTAX-01",
      meaning: "The compiler could not parse this code. Check matching JSX tags, braces, parentheses, and quotation marks near the reported position.",
      corrections: [{ title: "Close a JSX element", code: "</main>" }],
    };
  }
  if (/is not a function|cannot read propert|cannot read properties|typeerror/i.test(message)) {
    return {
      code: "JS-RUNTIME-02",
      meaning: "The app tried an operation on a value that is missing or has a different type. Check the value and its property names.",
      corrections: [],
    };
  }
  return {
    code: "REACT-PREVIEW-01",
    meaning: "The preview reported an error. Read the message, then check the referenced line and the values used there.",
    corrections: [],
  };
}

function isPreviewMessage(data: unknown): data is PreviewMessage {
  if (!data || typeof data !== "object") return false;
  const message = data as Record<string, unknown>;
  return (
    (message.type === "synapsis-react-render" ||
      message.type === "synapsis-react-error") &&
    typeof message.token === "string" &&
    (message.text === undefined || typeof message.text === "string") &&
    (message.message === undefined || typeof message.message === "string")
  );
}

export default function ReactCourse({
  lesson,
  displayedLessonNumber,
  completed,
  onComplete,
  restoreKey,
}: ReactCourseProps) {
  const [code, setCode] = useState(lesson.codeTemplate.starter);
  const [runtime, setRuntime] = useState("");
  const [runId, setRunId] = useState(0);
  const [token, setToken] = useState("");
  const [compiledCode, setCompiledCode] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [compileError, setCompileError] = useState("");
  const [diagnosis, setDiagnosis] = useState<ReactDiagnosis | null>(null);
  const [compiling, setCompiling] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const expectedText = lesson.react?.expectedText ?? "";
  const passed = Boolean(expectedText && previewText.includes(expectedText));

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}react-runtime.js`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`React preview runtime request failed (${response.status})`);
        return response.text();
      })
      .then((source) => {
        if (!cancelled) setRuntime(source);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setPreviewError(error instanceof Error ? error.message : "Could not load the React preview runtime.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCode(lesson.codeTemplate.starter);
    setRunId(0);
    setPreviewText("");
    setPreviewError("");
    setCompileError("");
    setDiagnosis(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreKey]);

  useEffect(() => {
    if (passed && !completed) onComplete(lesson.id);
  }, [completed, lesson.id, onComplete, passed]);

  const documentSource = useMemo(() => {
    if (!runtime || !runId || !token) return "";
    const safeRuntime = runtime.replace(/<\/script/gi, "<\\/script");
    return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src data:; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'">
<style>body{margin:0;padding:20px;background:#f7f8fc;color:#172033;font:16px/1.5 system-ui,sans-serif}button,input{font:inherit}button{cursor:pointer}</style></head>
<body><div id="root"></div><script>${safeRuntime}</script>
<script>
(() => {
  const runToken = ${JSON.stringify(token)};
  const rootNode = document.getElementById("root");
  const publish = () => parent.postMessage({type:"synapsis-react-render",token:runToken,text:rootNode.innerText}, "*");
  const reportError = (message) => parent.postMessage({type:"synapsis-react-error",token:runToken,message:String(message)}, "*");
  window.alert = () => {};
  window.confirm = () => false;
  window.prompt = () => null;
  window.addEventListener("error", event => reportError(event.message));
  const root = window.SynapsisCreateRoot(rootNode);
  new MutationObserver(publish).observe(rootNode, {subtree:true,childList:true,characterData:true,attributes:true});
  window.addEventListener("message", event => {
    if (event.source !== parent || event.data?.type !== "synapsis-react-run" || event.data?.token !== runToken) return;
    try {
      const App = new Function("React", '"use strict";' + event.data.code + '\\n;return App;')(window.SynapsisReact);
      if (typeof App !== "function") throw new Error("Define a function named App that returns JSX.");
      root.render(window.SynapsisReact.createElement(App));
      setTimeout(publish, 100);
    } catch (error) {
      reportError(error instanceof Error ? error.message : error);
    }
  }, {once:true});
})();
</script></body></html>`;
  }, [runId, runtime, token]);

  async function runPreview() {
    if (!runtime) {
      setPreviewError("The React preview is still loading. Try again in a moment.");
      return;
    }
    setCompiling(true);
    setPreviewError("");
    setCompileError("");
    setDiagnosis(null);
    setPreviewText("");
    try {
      const Babel = await import("@babel/standalone");
      const result = Babel.transform(code, {
        filename: "LearnerApp.jsx",
        presets: [["react", { runtime: "classic" }]],
      });
      if (!result.code) throw new Error("The JSX compiler returned no JavaScript.");
      const nextToken = crypto.randomUUID();
      setToken(nextToken);
      setRunId((current) => current + 1);
      setCompiledCode(result.code);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not compile this JSX.";
      setCompileError(message);
      setDiagnosis(explainReactError(message));
    } finally {
      setCompiling(false);
    }
  }

  useEffect(() => {
    function receive(event: MessageEvent<unknown>) {
      if (
        event.source !== frameRef.current?.contentWindow ||
        !isPreviewMessage(event.data) ||
        event.data.token !== token
      )
        return;
      if (event.data.type === "synapsis-react-error") {
        const message = event.data.message ?? "The React app could not render.";
        setPreviewError(message);
        setDiagnosis(explainReactError(message));
        return;
      }
      if (event.data.type === "synapsis-react-render") {
        setPreviewError("");
        setDiagnosis(null);
        setPreviewText(event.data.text ?? "");
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [token]);

  return (
    <section className="react-course">
      <header className="react-course-heading">
        <div>
          <span className="panel-label">React Studio</span>
          <h4>{lesson.title}</h4>
        </div>
        {completed && <span className="lesson-done">✓ completed</span>}
      </header>
      <div className="react-course-progress" aria-label={`Lesson ${displayedLessonNumber}`}>
        <span>{passed ? "App check passed" : "Build, run, and inspect your app"}</span>
        <progress value={passed ? 1 : 0} max={1} aria-label="Lesson progress" />
      </div>
      <div className="react-course-panels">
        <section className="react-guide-panel" aria-label="Lesson instructions">
          <div className="react-panel-bar"><strong>Lesson guide</strong></div>
          <div className="react-guide-content">
            <h5>What you’ll learn</h5>
            <p>{lesson.description}</p>
            <h5>Code to type</h5>
            <ol>
              {(lesson.react?.codeSteps ?? []).map((step, index) => (
                <li key={`${step.instruction}-${index}`}>
                  <p>{step.instruction}</p>
                  <pre><code>{step.code}</code></pre>
                  <small>{step.explanation}</small>
                  <button
                    type="button"
                    className="react-insert-code"
                    onClick={() => editorRef.current?.insertText(step.code)}
                  >
                    Insert at cursor
                  </button>
                </li>
              ))}
            </ol>
            <p className="react-guide-next">
              Type the code in App.jsx, then choose <strong>Run app</strong> to see what it does.
            </p>
          </div>
        </section>
        <section className="react-code-panel">
          <div className="react-panel-bar">
            <strong>App.jsx</strong>
            <button type="button" onClick={runPreview} disabled={compiling || !runtime}>
              {compiling ? "Compiling…" : "▶ Run app"}
            </button>
          </div>
          <Suspense fallback={<div className="react-editor-loading">Loading code editor…</div>}>
            <div className="react-editor">
              <CodeEditor
                starter={lesson.codeTemplate.starter}
                language="javascript"
                handleRef={editorRef}
                reactCompletions
                onChange={setCode}
              />
            </div>
          </Suspense>
          <details className="react-hint">
            <summary>Need a hint?</summary>
            <ul>{lesson.hints.map((hint) => <li key={hint}><code>{hint}</code></li>)}</ul>
          </details>
        </section>
        <section className="react-preview-panel">
          <div className="react-panel-bar"><strong>Live preview</strong><span>Runs in an isolated browser frame</span></div>
          {documentSource ? (
            <iframe
              key={runId}
              ref={frameRef}
              title="React app preview"
              sandbox="allow-scripts allow-forms"
              srcDoc={documentSource}
              onLoad={() => frameRef.current?.contentWindow?.postMessage(
                { type: "synapsis-react-run", token, code: compiledCode },
                "*",
              )}
            />
          ) : (
            <div className="react-preview-empty">
              {runtime ? "Type the lesson code, then run it to see your app." : "Preparing the local React preview…"}
            </div>
          )}
          <details className="react-verbose-output" open>
            <summary>Verbose output · errors, meanings, and fixes</summary>
            <div aria-live="polite" aria-atomic="true">
              {diagnosis ? (
                <>
                  <strong>{diagnosis.code}</strong>
                  <p>{compileError || previewError}</p>
                  <p>{diagnosis.meaning}</p>
                  {diagnosis.corrections.length > 0 && (
                    <ul>
                      {diagnosis.corrections.map((correction) => (
                        <li key={correction.title}>
                          <span>{correction.title}</span>
                          <button
                            type="button"
                            onClick={() => editorRef.current?.insertText(correction.code)}
                          >
                            Insert correction
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <small>These are Synapsis teaching labels, not native JavaScript error codes.</small>
                </>
              ) : (
                <>
                  <strong>{passed ? "Lesson check passed" : runId ? "Preview ran" : "Ready to run"}</strong>
                  <p>{previewText || "Run the app to see its rendered text and diagnostic output here."}</p>
                </>
              )}
            </div>
          </details>
          {diagnosis && diagnosis.corrections.length > 0 && (
            <div className="react-correction-popover" role="alert">
              <strong>Quick correction available</strong>
              <span>{diagnosis.meaning}</span>
              <button
                type="button"
                onClick={() => editorRef.current?.insertText(diagnosis.corrections[0].code)}
              >
                Insert suggested fix
              </button>
            </div>
          )}
          {compileError && <p className="react-error" role="alert">{compileError}</p>}
          {previewError && <p className="react-error" role="alert">{previewError}</p>}
          {passed && <p className="react-success" role="status">Your rendered app meets this lesson’s goal.</p>}
        </section>
      </div>
      <p className="lesson-source">{lesson.source}</p>
    </section>
  );
}
