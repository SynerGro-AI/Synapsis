import { useEffect, useRef, type RefObject } from "react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";

// Vite needs to be told how to spawn Monaco's web worker.
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

export interface CodeEditorHandle {
  /** Current sketch text, exactly as the learner typed it. */
  getValue(): string;
}

interface CodeEditorProps {
  starter: string;
  language?: string;
  handleRef?: RefObject<CodeEditorHandle | null>;
  onChange?: (code: string) => void;
}

export default function CodeEditor({
  starter,
  language = "cpp",
  handleRef,
  onChange,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const editor = monaco.editor.create(containerRef.current, {
      value: starter,
      language,
      theme: "vs-dark",
      minimap: { enabled: false },
      automaticLayout: true,
      fontSize: 13,
      ...(language === "python"
        ? {
            tabSize: 4,
            insertSpaces: true,
            detectIndentation: false,
            autoIndent: "full" as const,
            guides: { indentation: true, highlightActiveIndentation: true },
          }
        : {}),
    });

    const sub = editor.onDidChangeModelContent(() =>
      onChangeRef.current?.(editor.getValue()),
    );
    const indentSub =
      language === "python"
        ? editor.onKeyDown((event) => {
            if (event.keyCode !== monaco.KeyCode.Enter) return;
            const model = editor.getModel();
            const position = editor.getPosition();
            if (!model || !position) return;
            const line = model.getLineContent(position.lineNumber);
            const beforeCursor = line.slice(0, position.column - 1);
            const afterCursor = line.slice(position.column - 1);
            if (!beforeCursor.trimEnd().endsWith(":") || afterCursor.trim()) return;

            event.preventDefault();
            event.stopPropagation();
            const indent = line.match(/^[ \t]*/)?.[0] ?? "";
            editor.executeEdits("python-auto-indent", [
              {
                range: new monaco.Range(
                  position.lineNumber,
                  position.column,
                  position.lineNumber,
                  position.column,
                ),
                text: `\n${indent}    `,
                forceMoveMarkers: true,
              },
            ]);
          })
        : null;

    if (handleRef) {
      handleRef.current = { getValue: () => editor.getValue() };
    }

    return () => {
      if (handleRef) handleRef.current = null;
      sub.dispose();
      indentSub?.dispose();
      editor.dispose();
    };
  }, [starter, language, handleRef]);

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />;
}
