import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";

// Vite needs to be told how to spawn Monaco's web worker.
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

const STARTER_SKETCH = `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}`;

export default function CodeEditor() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const editor = monaco.editor.create(containerRef.current, {
      value: STARTER_SKETCH,
      language: "cpp",
      theme: "vs-dark",
      minimap: { enabled: false },
      automaticLayout: true,
      fontSize: 13,
    });

    return () => editor.dispose();
  }, []);

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />;
}
