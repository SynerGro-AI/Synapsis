// Idempotently publish the Bash shell skills phase (lessons 105-110).
// Every exercise runs through the in-memory shell simulator; no host shell runs.
const fs = require("fs");
const path = require("path");

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");
const filePath = path.join(FE, "lessons.json");
const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

const phase = data.phases.find((item) => item.id === "shells");
if (!phase) throw new Error("Missing devsetup shells phase in lessons.json");
phase.name = "Shell Skills — Bash";
phase.concepts = [
  "Environment variables",
  "Quoting and paths",
  "Reusable variables",
  "Pipelines and filters",
  "Executable scripts",
  "Shell automation",
];
delete phase.status;

const credit =
  "Paul McWhorter, Command Line and Linux learning resources — toptechboy.com; support at patreon.com/PaulMcWhorter";
const f = (content, mode) => ({ type: "file", content, ...(mode ? { mode } : {}) });
const baseSeed = {
  "README.txt": f("A safe Bash practice workspace.\nCommands affect only this virtual filesystem."),
};
const makeLesson = (id, title, description, intro, steps, seed = baseSeed) => ({
  id,
  phase: "shells",
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

const lessons = [
  makeLesson(
    105,
    "Your Shell Environment",
    "A shell starts with useful environment variables. HOME names your home directory, USER identifies the current account, SHELL names the command interpreter, and PWD tracks the current directory. Print them instead of guessing; the same shell concepts apply in Bash and PowerShell, though their variable syntax differs.",
    "This is Bash in a safe virtual workspace. The commands read the sandbox's environment; they never inspect your real computer.",
    [
      { cmd: 'echo "$HOME"', why: "HOME is the absolute path to this account's home directory." },
      { cmd: 'echo "$USER"', why: "USER identifies the account running this practice shell." },
      { cmd: 'echo "$SHELL"', why: "SHELL names the command interpreter; this sandbox runs Bash." },
      { cmd: 'echo "$PWD"', why: "PWD changes as you move and reports the current working directory." },
      { cmd: 'echo "Home: $HOME"', why: "Bash expands a variable inside double quotes while keeping the result together as one argument." },
    ],
  ),
  makeLesson(
    106,
    "Quote Paths with Spaces",
    "A space normally separates command arguments. Put a path in double quotes to keep its words together, then use that same quoted path to create, write, and read a file. Quoting is a small habit that prevents paths from being interpreted as several arguments.",
    "Create a folder and a file whose names contain spaces. The virtual filesystem will show that each quoted path is one name.",
    [
      { cmd: 'mkdir "field notes"', why: "The quotes keep field notes together as one directory name." },
      { cmd: 'touch "field notes/reading log.txt"', why: "The quoted path has a directory and filename that both contain spaces." },
      { cmd: 'echo "temperature 21.4 C" > "field notes/reading log.txt"', why: "Redirect the text into the single file named reading log.txt." },
      { cmd: 'cat "field notes/reading log.txt"', why: "Read the same spaced path; the saved text is in the virtual file." },
      { cmd: 'ls "field notes"', why: "List the folder and confirm reading log.txt is one filename." },
    ],
  ),
  makeLesson(
    107,
    "Save a Value in a Variable",
    "A shell variable gives a value a reusable name. In Bash, write NAME=value with no spaces around the equals sign; use $NAME to read it. Double quotes preserve the expanded value as one argument. PowerShell uses a different form ($name = 'value'), so use the Bash syntax in this practice terminal.",
    "Set a project name once, then reuse it to create and enter that project folder.",
    [
      { cmd: "PROJECT=weather-station", why: "Assign a value to PROJECT; Bash does not put spaces around =." },
      { cmd: 'echo "$PROJECT"', why: "Expand the variable to check the value you saved." },
      { cmd: 'mkdir "$PROJECT"', why: "Use the saved value as the new directory name." },
      { cmd: 'cd "$PROJECT"', why: "Use it again to enter the folder without retyping its name." },
      { cmd: 'echo "Project: $PROJECT" > README.txt', why: "Expand the variable inside a quoted string and save the result." },
      { cmd: "cat README.txt", why: "Read the file to verify the expanded project name was written." },
    ],
  ),
  makeLesson(
    108,
    "Build a Report with Pipes",
    "A pipeline sends one command's output into another. Here grep selects matching log lines and wc -l counts them. Build the report from real seeded log data instead of counting by eye. PowerShell also has pipelines, though it passes structured objects where Bash typically passes text lines.",
    "The sensor log is already in this workspace. Filter it and count its readings with a pipeline.",
    [
      { cmd: "cat sensors.log", why: "Inspect the real sample readings before filtering them." },
      { cmd: "grep temp sensors.log", why: "Select only lines containing the sensor label." },
      { cmd: "grep temp sensors.log | wc -l", why: "Pass matching lines to wc -l and count them." },
      { cmd: "grep 21 sensors.log", why: "Select readings containing 21 to narrow the report." },
      { cmd: "grep 21 sensors.log | wc -l", why: "Count the filtered readings using the same pipeline pattern." },
    ],
    {
      "sensors.log": f("temp 21.4\ntemp 21.6\ntemp 22.0\ntemp 21.9\ntemp 20.8"),
      "README.txt": baseSeed["README.txt"],
    },
  ),
  makeLesson(
    109,
    "Make a Script Executable",
    "A shell script is a text file of commands that Bash can run in order. The first line selects Bash, and chmod +x marks the file executable so you can launch it with ./filename. The simulator executes each supported command against its isolated virtual filesystem.",
    "Inspect the starter script, grant execute permission, then run it as a program. Its commands genuinely execute in this sandbox.",
    [
      { cmd: "cat check-project.sh", why: "Read the script; its first line is the Bash interpreter declaration." },
      { cmd: "ls -l check-project.sh", why: "Check the starting permissions: it is not executable yet." },
      { cmd: "chmod +x check-project.sh", why: "Add the execute bit so the shell allows ./check-project.sh." },
      { cmd: "ls -l check-project.sh", why: "Confirm the permission string now includes x." },
      { cmd: "./check-project.sh", why: "Run the script; Bash executes its saved commands one by one." },
    ],
    {
      "check-project.sh": f('#!/bin/bash\necho "Project check started"\npwd\nls\necho "Project check finished"'),
      "README.txt": baseSeed["README.txt"],
      "src": { type: "dir", children: { "app.js": f('console.log("sensor ready");') } },
    },
  ),
  makeLesson(
    110,
    "Automate a Project Report",
    "Bring variables, scripts, redirection, and command output together. The report script stores a project name, writes a heading and current directory to report.txt, then appends a real file listing. Run it, inspect the report, and count its lines. This is a compact example of repeatable shell automation.",
    "Run the provided report script, then inspect the file it creates. All commands operate on seeded sandbox files.",
    [
      { cmd: "cat make-report.sh", why: "Inspect the script's variable assignment and output redirection." },
      { cmd: "chmod +x make-report.sh", why: "Mark the script executable before launching it directly." },
      { cmd: "./make-report.sh", why: "Run the script to generate report.txt from actual workspace state." },
      { cmd: "cat report.txt", why: "Read the report and verify the variable, path, and file list." },
      { cmd: "wc -l report.txt", why: "Count the lines in the generated report." },
    ],
    {
      "make-report.sh": f(
        '#!/bin/bash\nPROJECT=weather-station\necho "Project: $PROJECT" > report.txt\necho "Workspace: $PWD" >> report.txt\necho "Files:" >> report.txt\nls >> report.txt',
      ),
      "README.txt": baseSeed["README.txt"],
      "src": { type: "dir", children: { "sensor.py": f('print("sensor ready")') } },
      "measurements.csv": f("time,temp\n08:00,21.4\n09:00,21.8"),
    },
  ),
];

for (const lesson of lessons) {
  const index = data.lessons.findIndex((existing) => existing.id === lesson.id);
  if (index >= 0) data.lessons[index] = lesson;
  else {
    const insertAt = data.lessons.findIndex((existing) => existing.id > lesson.id);
    data.lessons.splice(insertAt < 0 ? data.lessons.length : insertAt, 0, lesson);
  }
}

const serialized = JSON.stringify(data, null, 2) + "\n";
fs.writeFileSync(filePath, serialized);
fs.writeFileSync(path.join(BE, "lessons.json"), serialized);
console.log("Published shell lessons 105-110 to frontend and backend catalogs.");
