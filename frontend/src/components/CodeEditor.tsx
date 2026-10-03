import { useEffect, useRef, type RefObject } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";
import "monaco-editor/languages/definitions/cpp/register.js";
import "monaco-editor/languages/definitions/javascript/register.js";
import "monaco-editor/languages/definitions/powershell/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/languages/definitions/shell/register.js";

// Vite needs to be told how to spawn Monaco's web worker.
(globalThis as typeof globalThis & { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
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
  reactCompletions?: boolean;
}

export default function CodeEditor({
  starter,
  language = "cpp",
  handleRef,
  onChange,
  reactCompletions = false,
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
      language: language === "bash" ? "shell" : language,
      theme: "vs-dark",
      minimap: { enabled: false },
      automaticLayout: true,
      fontSize: 13,
      quickSuggestions: { other: true, comments: false, strings: true },
      suggestOnTriggerCharacters: true,
      snippetSuggestions: "top",
      tabCompletion: "on",
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

    const completions = reactCompletions
      ? monaco.languages.registerCompletionItemProvider("javascript", {
          triggerCharacters: ["<", "."],
          provideCompletionItems(model, position) {
            const word = model.getWordUntilPosition(position);
            const range = new monaco.Range(
              position.lineNumber,
              word.startColumn,
              position.lineNumber,
              word.endColumn,
            );
            const items = [
              {
                label: "React.useState",
                insertText: "React.useState(${1:initialValue})",
                documentation: "Create component state and receive its setter.",
              },
              {
                label: "React.useEffect",
                insertText: "React.useEffect(() => {\n\t${1}\n}, [${2}]);",
                documentation: "Run a side effect after render; list its dependencies.",
              },
              {
                label: "App component",
                insertText: "function App() {\n\treturn (\n\t\t<main>\n\t\t\t${1}\n\t\t</main>\n\t);\n}",
                documentation: "A complete function component with a semantic page landmark.",
              },
              {
                label: "Accessible button",
                insertText: '<button type="button" onClick={() => ${1}}>${2:Action}</button>',
                documentation: "A button with an explicit type and click handler.",
              },
              {
                label: "Controlled text input",
                insertText: '<label>\n\t${1:Search}\n\t<input value={${2:value}} onChange={(event) => ${3:setValue(event.target.value)} } />\n</label>',
                documentation: "A labeled input whose displayed value is kept in React state.",
              },
              {
                label: "Render array as list",
                insertText: "{${1:items}.map((${2:item}) => (\n\t<li key={${3:item.id}}>${4:${2:item}.name}</li>\n))}",
                documentation: "Render one keyed list item for every array entry.",
              },
              {
                label: "Accessible status",
                insertText: '<p role="status" aria-live="polite">${1:Update message}</p>',
                documentation: "Announce a changing status without unexpectedly interrupting reading.",
              },
            ];
            return {
              suggestions: items.map((item, index) => ({
                ...item,
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range,
                sortText: String(index).padStart(2, "0"),
              })),
            };
          },
        })
      : null;

    return () => {
      if (handleRef) handleRef.current = null;
      sub.dispose();
      indentSub?.dispose();
      completions?.dispose();
      editor.dispose();
    };
  }, [starter, language, handleRef, reactCompletions]);

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />;
}
