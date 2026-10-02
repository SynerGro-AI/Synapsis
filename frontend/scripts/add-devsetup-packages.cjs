// Idempotently publish package-manager lessons 111-116.
// Package operations modify only the lesson terminal's in-memory filesystem.
const fs = require("fs");
const path = require("path");

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");
const filePath = path.join(FE, "lessons.json");
const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

const phase = data.phases.find((item) => item.id === "packages");
if (!phase) throw new Error("Missing package managers phase in lessons.json");
delete phase.status;
phase.concepts = ["npm dependencies and lockfiles", "pip and virtual environments", "apt-get", "winget"];

const credit =
  "Paul McWhorter, Command Line and Linux learning resources — toptechboy.com; support at patreon.com/PaulMcWhorter";
const f = (content) => ({ type: "file", content });
const makeLesson = (id, title, description, shell, intro, steps, seed = {}) => ({
  id,
  phase: "packages",
  title,
  description,
  source: credit,
  kind: "terminal",
  terminal: {
    shell,
    user: "learner",
    host: "synapsis",
    cwd: "~/projects",
    intro,
    seed,
    steps,
  },
  featuredComponent: "terminal",
  circuit: { palette: [], required: [], notes: "" },
  codeTemplate: { language: shell === "powershell" ? "powershell" : "bash", starter: "" },
  hints: [],
  output: { initial: "", status: "" },
});
const why = (cmd, explanation) => ({ cmd, why: explanation });

const lessons = [
  makeLesson(
    111,
    "Add a JavaScript Dependency",
    "npm records project dependencies in package.json and writes a lockfile so the selected version can be reproduced. This isolated sandbox has a small, explicit package registry; installation updates only the virtual project and never downloads code onto your device.",
    "bash",
    "Create a project manifest, install the known dayjs package, and inspect the files npm actually wrote in the virtual project.",
    [
      why("npm init -y", "Create a valid package.json manifest with safe defaults."),
      why("npm install dayjs", "Resolve dayjs from the sandbox registry and save it as a project dependency."),
      why("npm ls", "Read the installed package metadata and compare it with the declared dependency."),
      why("cat package.json", "Inspect the manifest npm updated."),
      why("cat package-lock.json", "Inspect the exact version captured for repeatable installs."),
    ],
  ),
  makeLesson(
    112,
    "Isolate Python Packages",
    "A virtual environment gives a Python project its own package location. Create and activate one before installing the sandbox's colorama package; the package metadata and files are written inside .venv, not to the host computer or the sandbox's global Python environment.",
    "bash",
    "Create a project-local virtual environment, activate it, and install a package into that isolated environment.",
    [
      why("python --version", "Check the sandbox Python interpreter version."),
      why("python -m venv .venv", "Create an isolated environment inside the virtual filesystem."),
      why("source .venv/bin/activate", "Select that environment for subsequent pip operations."),
      why("pip install colorama==0.4.6", "Install the exact version from the curated sandbox package registry."),
      why("pip show colorama", "Read metadata for the package installed in the active environment."),
      why("pip list", "List packages installed in this environment."),
      why("deactivate", "Return to the global sandbox Python environment."),
    ],
  ),
  makeLesson(
    113,
    "Install a Linux System Tool",
    "apt-get manages system packages on Debian-based Linux. Update its package index before installing, use sudo for system changes, and verify the installed package with dpkg. The sandbox uses a small local catalog and never contacts or modifies a real machine.",
    "bash",
    "Refresh the isolated package index, install tree, verify its state, then remove it again.",
    [
      why("sudo apt-get update", "Refresh the sandbox package index before resolving package names."),
      why("apt-cache policy tree", "Inspect the candidate version available in the updated index."),
      why("sudo apt-get install -y tree", "Install the curated tree package into the virtual system state."),
      why("dpkg -l tree", "Verify dpkg reports tree as installed."),
      why("sudo apt-get remove -y tree", "Remove tree from the sandbox system state."),
      why("dpkg -l tree", "Confirm the package is no longer installed."),
    ],
  ),
  makeLesson(
    114,
    "Install an App with winget",
    "Windows Package Manager uses winget to search for and install apps by package ID. This PowerShell practice terminal has a small sandbox catalog: commands update only its virtual installed-app list and do not install software on your device.",
    "powershell",
    "Use PowerShell to locate winget, search by an exact package ID, install Git, and inspect the sandbox's installed-app list.",
    [
      why("Get-Command winget", "Confirm winget is available in this PowerShell environment."),
      why("winget search Git.Git", "Find Git by its unique package identifier in the sandbox catalog."),
      why("winget install --id Git.Git --exact", "Install the selected package into virtual Windows state."),
      why("winget list", "Verify Git appears in the installed-app list."),
      why("$PSVersionTable", "Inspect the PowerShell runtime information for this shell."),
    ],
  ),
  makeLesson(
    115,
    "Install from requirements.txt",
    "A requirements file records exact Python package versions for a project. Activate a fresh virtual environment and use pip install -r to reproduce the listed environment. pip freeze reports the installed versions so they can be compared with the file.",
    "bash",
    "The seeded requirements.txt lists one exact package version. Create an environment and install only what that file declares.",
    [
      why("cat requirements.txt", "Read the exact package versions requested by this project."),
      why("python -m venv .venv", "Create a clean isolated environment for the requirements."),
      why("source .venv/bin/activate", "Direct pip to the newly created environment."),
      why("pip install -r requirements.txt", "Install each supported requirement from the sandbox registry."),
      why("pip freeze", "Print the installed package versions in requirements-file format."),
      why("deactivate", "Leave the project environment."),
    ],
    { "requirements.txt": f("# Project dependencies\npytest==8.1.1") },
  ),
  makeLesson(
    116,
    "Reproduce an npm Install",
    "npm ci installs the versions recorded in package-lock.json and replaces node_modules, making it useful in clean builds. The starter project intentionally contains an older installed package; compare it before and after npm ci to see the lockfile drive the result.",
    "bash",
    "Inspect the stale installed package, run npm ci from the seeded manifest and lockfile, then verify the exact installed version.",
    [
      why("cat node_modules/dayjs/package.json", "Inspect the stale version already present in node_modules."),
      why("npm ci", "Replace node_modules using the exact dayjs version in package-lock.json."),
      why("npm ls", "Verify the installed version now matches the project dependency."),
      why("cat package-lock.json", "Review the lockfile that controlled the clean install."),
    ],
    {
      "package.json": f(JSON.stringify({
        name: "date-report",
        version: "1.0.0",
        dependencies: { dayjs: "^1.11.11" },
      }, null, 2)),
      "package-lock.json": f(JSON.stringify({
        name: "date-report",
        version: "1.0.0",
        lockfileVersion: 3,
        requires: true,
        packages: {
          "": { name: "date-report", version: "1.0.0" },
          "node_modules/dayjs": {
            version: "1.11.11",
            resolved: "https://registry.npmjs.org/dayjs/-/dayjs-1.11.11.tgz",
            integrity: "sha512-sandbox-registry-checksum",
          },
        },
      }, null, 2)),
      node_modules: {
        type: "dir",
        children: {
          dayjs: {
            type: "dir",
            children: {
              "package.json": f('{"name":"dayjs","version":"1.0.0"}'),
              "index.js": f("// stale starter package"),
            },
          },
        },
      },
    },
  ),
];

data.lessons = data.lessons.filter((lesson) => lesson.id < 111 || lesson.id > 116);
data.lessons.push(...lessons);
data.lessons.sort((a, b) => a.id - b.id);

const serialized = JSON.stringify(data, null, 2) + "\n";
fs.writeFileSync(filePath, serialized);
fs.writeFileSync(path.join(BE, "lessons.json"), serialized);
console.log("Published package-manager lessons 111-116 to frontend and backend catalogs.");
