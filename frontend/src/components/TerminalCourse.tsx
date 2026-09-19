import { useEffect, useMemo, useRef, useState } from "react";
import type { FsNode } from "../sim/shell";
import type { Lesson } from "../api";
import { Shell } from "../sim/shell";

interface TerminalCourseProps {
  lesson: Lesson;
  completed: boolean;
  onComplete: (id: number) => void;
  /** Changes when the lesson or a "reset" is requested, to rebuild the shell. */
  restoreKey: string;
}

interface Line {
  kind: "prompt" | "out" | "sys";
  text: string;
}

/** Normalize a command line so "mkdir   hello-cli" matches "mkdir hello-cli". */
function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export default function TerminalCourse({
  lesson,
  completed,
  onComplete,
  restoreKey,
}: TerminalCourseProps) {
  const steps = lesson.terminal?.steps ?? [];

  // A fresh shell whenever the lesson changes.
  const shell = useMemo(
    () =>
      new Shell(lesson.terminal?.cwd ?? "~/projects", {
        user: lesson.terminal?.user,
        host: lesson.terminal?.host,
        seed: lesson.terminal?.seed as Record<string, FsNode> | undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restoreKey],
  );

  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  // The nano editor modal: null when closed. `saved` shows the write-out status bar.
  const [editor, setEditor] = useState<{ path: string; content: string; saved?: string } | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Reset transcript + progress when the shell is rebuilt.
  useEffect(() => {
    setLines([{ kind: "sys", text: lesson.terminal?.intro ?? "" }]);
    setInput("");
    setDoneSteps(new Set());
    setHistory([]);
    setHistIdx(null);
    setEditor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreKey]);

  // Focus the editor textarea whenever it opens.
  useEffect(() => {
    if (editor) editorRef.current?.focus();
  }, [editor]);

  // Keep the newest output in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  // Once every step has been run, mark the lesson complete.
  const allDone = steps.length > 0 && doneSteps.size === steps.length;
  useEffect(() => {
    if (allDone && !completed) onComplete(lesson.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);

  function submit() {
    const raw = input;
    const cmd = norm(raw);
    if (!cmd) return;

    const promptStr = shell.prompt();
    const result = shell.run(raw);

    setHistory((h) => [...h, raw]);
    setHistIdx(null);
    setInput("");

    if (result.clear) {
      setLines([]);
    } else {
      setLines((prev) => [
        ...prev,
        { kind: "prompt" as const, text: `${promptStr} ${raw}` },
        ...result.lines.map((t) => ({ kind: "out" as const, text: t })),
      ]);
    }

    // A `nano <file>` command opens the real editor modal.
    if (result.edit) {
      setEditor({ path: result.edit.path, content: result.edit.content });
    }

    // Advance the checklist: mark the first not-yet-done step this command matches.
    setDoneSteps((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < steps.length; i++) {
        if (!next.has(i) && norm(steps[i].cmd) === cmd) {
          next.add(i);
          break;
        }
      }
      return next;
    });
  }

  // ^O — write the buffer back to the sandbox filesystem (a genuine save).
  function saveEditor() {
    if (!editor) return;
    shell.writeFile(editor.path, editor.content);
    const count = editor.content ? editor.content.split("\n").length : 0;
    setEditor({ ...editor, saved: `[ Wrote ${count} line${count === 1 ? "" : "s"} ]` });
  }

  // ^X — leave nano, returning to the shell.
  function exitEditor() {
    setEditor(null);
    inputRef.current?.focus();
  }

  function onEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!e.ctrlKey) return;
    const key = e.key.toLowerCase();
    if (key === "o") {
      e.preventDefault();
      saveEditor();
    } else if (key === "x") {
      e.preventDefault();
      exitEditor();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const idx = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === null) return;
      const idx = histIdx + 1;
      if (idx >= history.length) {
        setHistIdx(null);
        setInput("");
      } else {
        setHistIdx(idx);
        setInput(history[idx]);
      }
    }
  }

  // The next command the learner should type (first undone step).
  const nextStep = steps.findIndex((_, i) => !doneSteps.has(i));

  return (
    <div className="terminal-course">
      <div className="terminal-pane">
        <div className="terminal-window" onClick={() => inputRef.current?.focus()}>
          <div className="terminal-titlebar">
            <span className="term-dot term-red" />
            <span className="term-dot term-amber" />
            <span className="term-dot term-green" />
            <span className="terminal-title">{lesson.terminal?.shell ?? "bash"} — practice terminal</span>
          </div>
          <div className="terminal-scroll" ref={scrollRef}>
            {lines.map((l, i) => (
              <div key={i} className={`term-line term-${l.kind}`}>
                {l.text || " "}
              </div>
            ))}
            <div className="term-input-row">
              <span className="term-prompt-inline">{shell.prompt()}</span>
              <input
                ref={inputRef}
                className="term-input"
                value={input}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                placeholder={nextStep >= 0 ? `type: ${steps[nextStep].cmd}` : "all steps done — explore freely"}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label="terminal input"
              />
            </div>
          </div>

          {editor && (
            <div className="nano-editor" onClick={(e) => e.stopPropagation()}>
              <div className="nano-titlebar">
                <span className="nano-brand">GNU nano 7.2</span>
                <span className="nano-file">{editor.path}</span>
                <span className="nano-flag">{editor.saved ? "" : "Modified"}</span>
              </div>
              <textarea
                ref={editorRef}
                className="nano-body"
                value={editor.content}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(e) => setEditor({ path: editor.path, content: e.target.value })}
                onKeyDown={onEditorKeyDown}
                aria-label="nano editor"
              />
              <div className="nano-status">{editor.saved ?? ""}</div>
              <div className="nano-keys">
                <button type="button" onClick={saveEditor}>
                  <span className="nano-key">^O</span> Write Out
                </button>
                <button type="button" onClick={exitEditor}>
                  <span className="nano-key">^X</span> Exit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="terminal-guide">
        <h3 className="tg-title">{lesson.title}</h3>
        <p className="tg-desc">{lesson.description}</p>

        <div className="tg-progress">
          <div className="tg-progress-track">
            <div
              className="tg-progress-fill"
              style={{ width: `${steps.length ? (doneSteps.size / steps.length) * 100 : 0}%` }}
            />
          </div>
          <span>
            {doneSteps.size} / {steps.length}
          </span>
        </div>

        <ol className="tg-steps">
          {steps.map((s, i) => {
            const done = doneSteps.has(i);
            const current = i === nextStep;
            return (
              <li key={i} className={`tg-step${done ? " done" : ""}${current ? " current" : ""}`}>
                <span className="tg-check">{done ? "✓" : current ? "▶" : "○"}</span>
                <div className="tg-step-body">
                  <code className="tg-cmd">{s.cmd}</code>
                  <span className="tg-why">{s.why}</span>
                </div>
              </li>
            );
          })}
        </ol>

        {allDone && (
          <div className="tg-complete">
            🎉 Lesson complete — every command run. You just used a real developer workflow.
          </div>
        )}

        <p className="tg-tip">
          Tip: type the commands yourself — muscle memory is the point. Use <kbd>↑</kbd> to
          recall a previous command, and <code>help</code> to list what this terminal understands.
        </p>
      </aside>
    </div>
  );
}
