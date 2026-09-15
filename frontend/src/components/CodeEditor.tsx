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
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const editor = monaco.editor.create(containerRef.current, {
      value: starter,
      language,
      theme: "vs-dark",
      minimap: { enabled: false },
      automaticLayout: true,
      fontSize: 13,
    });

    const sub = editor.onDidChangeModelContent(() =>
      onChangeRef.current?.(editor.getValue()),
    );

    if (handleRef) {
      handleRef.current = { getValue: () => editor.getValue() };
    }

    return () => {
      if (handleRef) handleRef.current = null;
      sub.dispose();
      editor.dispose();
    };
  }, [starter, language, handleRef]);

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />;
}
