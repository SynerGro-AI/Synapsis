// Idempotently publish Toolchain lessons 117-122.
// Compiler, editor, and build-task effects stay inside the virtual filesystem.
const fs = require("fs");
const path = require("path");

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");
const filePath = path.join(FE, "lessons.json");
const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

const phase = data.phases.find((item) => item.id === "toolchain");
if (!phase) throw new Error("Missing toolchain phase in lessons.json");
delete phase.status;
phase.concepts = [
  "C# project compilation and diagnostics",
  "Print-based debugging",
  "JavaScript syntax checking",
  "Editor extensions in an isolated workspace",
  "Repeatable npm build tasks",
];

const credit =
  "Paul McWhorter, Command Line and Linux learning resources — toptechboy.com; support at patreon.com/PaulMcWhorter";
const f = (content) => ({ type: "file", content });
const csproj = () => f(
  `<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <OutputType>Exe</OutputType>\n    <TargetFramework>net8.0</TargetFramework>\n  </PropertyGroup>\n</Project>`,
);
const makeLesson = (id, title, description, intro, steps, seed = {}) => ({
  id,
  phase: "toolchain",
  title,
  description,
  source: credit,
  kind: "terminal",
  terminal: {
    shell: "bash",
    user: "learner",
    host: "synapsis",
    cwd: "~/projects",
    intro,
    seed,
    steps,
  },
  featuredComponent: "terminal",
  circuit: { palette: [], required: [], notes: "" },
  codeTemplate: { language: "bash", starter: "" },
  hints: [],
  output: { initial: "", status: "" },
});
const why = (cmd, explanation) => ({ cmd, why: explanation });

const lessons = [
  makeLesson(
    117,
    "Compile a Console Program",
    "The .NET SDK scaffolds a C# project, compiles its source, and runs the compiled program. This sandbox compiler deliberately supports a small, documented subset of C#; it writes a virtual build artifact and never starts a host compiler.",
    "Create a C# console project, compile its source in the sandbox, inspect the generated artifact, then run the program.",
    [
      why("dotnet --version", "Check which .NET SDK the sandbox models."),
      why("dotnet new console -n greeting", "Create a project file and C# starter program in the virtual filesystem."),
      why("cd greeting", "Move into the new project's directory."),
      why("dotnet build", "Compile the supported C# statements and create a virtual app.dll artifact."),
      why("ls bin/Debug/net8.0", "Confirm the successful build produced app.dll."),
      why("dotnet run", "Execute the output derived from the compiled program."),
    ],
  ),
  makeLesson(
    118,
    "Fix a Compiler Error",
    "Compiler diagnostics identify a source file and line to help you find a mistake. The seeded C# program is missing a semicolon. Read the diagnostic, open Program.cs in the sandbox editor, add the semicolon, save with Ctrl+O, exit with Ctrl+X, and rebuild.",
    "The starter has one intentional syntax error. Use the compiler's line number, edit the file in the sandbox nano editor, and rebuild after saving.",
    [
      why("cat Program.cs", "Read the source and locate the statement that needs its terminator."),
      why("dotnet build", "Read the compiler's source line and CS1002 diagnostic."),
      why("nano Program.cs", "Open the in-memory source in the editor; add the missing semicolon, save with Ctrl+O, and exit with Ctrl+X."),
      why("dotnet build", "Recompile the saved file and confirm the syntax error is gone."),
      why("dotnet run", "Run the corrected program."),
    ],
    {
      "Program.cs": f('using System;\nConsole.WriteLine("Fixed and built")\n'),
      "toolchain.csproj": csproj(),
    },
  ),
  makeLesson(
    119,
    "Debug with Print Statements",
    "A quick debugging technique is to print intermediate values and compare them with what you expect. The sandbox runs a deliberately small JavaScript subset: variable declarations, numeric arithmetic, and console.log. Inspect the source, run it, and use its trace output to find the faulty calculation.",
    "Run the seeded script and compare the expected total with the value printed by the calculation.",
    [
      why("cat total.js", "Inspect the inputs, calculation, and diagnostic print statements."),
      why("node --check total.js", "Ask Node's sandbox syntax checker to validate the supported JavaScript syntax."),
      why("node total.js", "Execute the supported statements and inspect the actual printed values."),
    ],
    {
      "total.js": f('const price = 3;\nconst quantity = 5;\nconst total = price + quantity;\nconsole.log("expected:", 15);\nconsole.log("actual:", total);\n'),
    },
  ),
  makeLesson(
    120,
    "Add an Editor Extension",
    "Editor extensions add language tools, but this practice terminal must not download code or change your device. The code command uses a curated sandbox catalog and records extension metadata only in the virtual filesystem. List the result to verify the state change.",
    "Install the supported C# editor extension into the virtual profile and inspect the installed extension list.",
    [
      why("code --version", "Check the version of the sandbox's editor-command model."),
      why("code --list-extensions", "List extensions currently recorded in the virtual profile."),
      why("code --install-extension ms-dotnettools.csdevkit", "Install the curated C# extension metadata in the sandbox filesystem."),
      why("code --list-extensions", "Verify the extension ID was added to the isolated profile."),
      why("cat ~/.vscode/extensions/ms-dotnettools.csdevkit-1.0.0/package.json", "Inspect the virtual extension manifest the command created."),
    ],
  ),
  makeLesson(
    121,
    "Create a Repeatable Build Task",
    "npm run executes a named script from package.json through the sandbox command interpreter. Here the build script runs dotnet build, so the same repeatable action can be called manually or wired to an editor's build-task configuration. It does not execute host commands.",
    "Inspect the seeded package script and run it. The script invokes the virtual .NET compiler to create a build artifact.",
    [
      why("cat package.json", "Read the named build task and the command it runs."),
      why("npm run", "List the scripts available in this project."),
      why("npm run build", "Run the build script through the sandbox command interpreter."),
      why("ls bin/Debug/net8.0", "Verify the task created the build artifact."),
    ],
    {
      "package.json": f(JSON.stringify({
        name: "task-demo",
        version: "1.0.0",
        scripts: { build: "dotnet build" },
      }, null, 2)),
      "Program.cs": f('using System;\nConsole.WriteLine("Build task complete");\n'),
      "task-demo.csproj": csproj(),
    },
  ),
  makeLesson(
    122,
    "Run the Project Build Workflow",
    "A small project workflow can combine a syntax check, a named build task, and execution. Each command reads or updates the sandbox's virtual files. Supported syntax is intentionally limited: Node checks this lesson's simple JavaScript, while dotnet compiles only the small C# subset described in the earlier lesson.",
    "Check the script's syntax, run the project build task, inspect the build output, then run the compiled C# program.",
    [
      why("node --check verify.js", "Check the project's JavaScript helper before building."),
      why("npm run build", "Compile the C# console program using the project's repeatable script."),
      why("ls bin/Debug/net8.0", "Confirm the project produced its virtual executable artifact."),
      why("dotnet run", "Run the compiled program and inspect its output."),
    ],
    {
      "package.json": f(JSON.stringify({
        name: "workflow-demo",
        version: "1.0.0",
        scripts: { build: "dotnet build" },
      }, null, 2)),
      "Program.cs": f('using System;\nint answer = 6 * 7;\nConsole.WriteLine(answer);\n'),
      "workflow-demo.csproj": csproj(),
      "verify.js": f('const ready = 1 + 1;\nconsole.log("helper ready:", ready);\n'),
    },
  ),
];

data.lessons = data.lessons.filter((lesson) => lesson.id < 117 || lesson.id > 122);
data.lessons.push(...lessons);
data.lessons.sort((a, b) => a.id - b.id);

const serialized = JSON.stringify(data, null, 2) + "\n";
fs.writeFileSync(filePath, serialized);
fs.writeFileSync(path.join(BE, "lessons.json"), serialized);
console.log("Published Toolchain lessons 117-122 to frontend and backend catalogs.");
