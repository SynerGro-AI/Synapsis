import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";

// Vite needs to be told how to spawn Monaco's web worker.
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

interface CodeEditorProps {
  starter: string;
  language?: string;
}

export default function CodeEditor({ starter, language = "cpp" }: CodeEditorProps) {
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

    return () => editor.dispose();
  }, [starter, language]);

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />;
}
