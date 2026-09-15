import { useEffect, useRef, type RefObject } from "react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";

// Vite needs to be told how to spawn Monaco's web worker.
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

export interface CodeEditorHandle {
  /** Insert a line of code at the cursor position. */
  insert(text: string): void;
}

interface CodeEditorProps {
  starter: string;
  language?: string;
  handleRef?: RefObject<CodeEditorHandle | null>;
}

export default function CodeEditor({
  starter,
  language = "cpp",
  handleRef,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

    if (handleRef) {
      handleRef.current = {
        insert(text: string) {
          editor.focus();
          editor.trigger("hint", "type", { text: text + "\n" });
        },
      };
    }

    return () => {
      if (handleRef) handleRef.current = null;
      editor.dispose();
    };
  }, [starter, language, handleRef]);

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />;
}
