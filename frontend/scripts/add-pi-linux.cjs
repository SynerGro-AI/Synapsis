// One-shot, idempotent: add the Pi track's "Linux Command Line" lessons (301-312)
// to the frontend data files, then mirror both to the backend copy. These are
// TERMINAL lessons (kind:"terminal") running on the real in-memory shell
// (src/sim/shell.ts) — no components.json change.
//
// Staged shipping (matches the live-safe deploy cadence):
//   node scripts/add-pi-linux.cjs 306   -> partial (301-306)
//   node scripts/add-pi-linux.cjs        -> all (301-312)
// Re-running upserts, so it is always safe to run again.
//
// Authenticity is the hard rule: every command genuinely does the real thing in
// the sandbox — grep really greps the seeded files, `ls *.txt` really globs,
// `ls | wc -l` really pipes a count, `chmod +x` really flips the mode `ls -l`
// then shows, and `nano` opens a real editor that writes content `cat` reads
// back. The prompt is pi@raspberrypi and home is /home/pi. One new concept per
// lesson, reusing the previous ones (the compounding rule).
const fs = require("fs");
const path = require("path");

const LIMIT = process.argv[2] ? Number(process.argv[2]) : 312;

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");

const lessonsPath = path.join(FE, "lessons.json");
const lessons = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));

// ---- lessons.json: activate the Linux Command Line phase ----
const phase = lessons.phases.find((p) => p.id === "linux_cli");
if (phase) delete phase.status; // drop "coming-soon" -> the phase goes live

const CREDIT =
  "Paul McWhorter, Raspberry Pi Linux lessons — toptechboy.com; support at patreon.com/PaulMcWhorter";

// ---- a realistic /home/pi seeded into every lesson's sandbox ----
// Serializable FS nodes the Shell constructor drops into the start directory,
// so grep/find/wildcards/pipes all have genuine material to work on.
const f = (content) => ({ type: "file", content });
const d = (children) => ({ type: "dir", children });

const seed = {
  ".bashrc": f("# ~/.bashrc — runs for every interactive shell\nalias ll='ls -l'"),
  "README.txt": f(
    "Raspberry Pi starter files.\nType ls to see what is here, then cat a file to read it.",
  ),
  "notes.txt": f(
    "Remember to water the plants\nBuy more resistors and jumper wires\nFinish the LED project",
  ),
  "todo.txt": f("[ ] flash the SD card\n[ ] solder the headers\n[x] read the datasheet"),
  "app.log": f(
    "INFO  server started on port 8080\n" +
      "INFO  client connected\n" +
      "WARN  slow response from sensor\n" +
      "ERROR could not read from I2C bus\n" +
      "INFO  retrying the connection\n" +
      "ERROR timeout waiting for device\n" +
      "INFO  shutting down cleanly",
  ),
  "sensors.log": f("temp 21.4\ntemp 21.6\ntemp 22.0\ntemp 21.9"),
  "backup.sh": f('#!/bin/bash\necho "backing up the project..."'),
  Documents: d({
    "shopping.txt": f("resistors\njumper wires\nbreadboard\nheat-shrink tubing"),
    "ideas.txt": f("weather station\nself-balancing robot\nplant monitor"),
  }),
  projects: d({
    "hello.py": f('print("Hello from the Raspberry Pi")'),
    "blink.py": f("# blink an LED on the Pi\nimport time"),
  }),
};

// Every Linux CLI lesson shares the same terminal shape: pi@raspberrypi in
// /home/pi, with the seeded home above.
const term = (intro, steps) => ({
  shell: "bash",
  user: "pi",
  host: "raspberrypi",
  cwd: "~",
  intro,
  seed,
  steps,
});

// Terminal lessons still carry the (empty) Arduino-shaped fields the loader expects.
const lesson = (id, title, description, intro, steps) => ({
  id,
  phase: "linux_cli",
  title,
  description,
  source: CREDIT,
  kind: "terminal",
  terminal: term(intro, steps),
  featuredComponent: "terminal",
  circuit: { palette: [], required: [], notes: "" },
  codeTemplate: { language: "bash", starter: "" },
  hints: [],
  output: { initial: "", status: "" },
});

const allLessons = [
  lesson(
    301,
    "Find Your Way Around",
    "The Raspberry Pi runs Linux, and Linux is happiest at the command line. Every session starts in your home folder, /home/pi. Three commands do almost all of your navigating: pwd tells you where you are, ls shows what is here, and cd moves you somewhere new. Add -a to ls and you also see hidden files — the ones whose names start with a dot, where Linux keeps your settings.",
    "You are logged into a Raspberry Pi. This is a safe practice terminal — nothing here touches a real machine, but every command behaves exactly like the real thing. Type each command on the right, one at a time.",
    [
      { cmd: "pwd", why: "Print Working Directory — where am I? On the Pi you start in /home/pi." },
      { cmd: "ls", why: "List the files and folders in the current directory." },
      { cmd: "ls -a", why: "List ALL entries, including hidden dotfiles like .bashrc, plus . (here) and .. (up)." },
      { cmd: "cd Documents", why: "Change Directory — step into the Documents folder." },
      { cmd: "ls", why: "List what is inside Documents. You have moved." },
    ],
  ),
  lesson(
    302,
    "Paths: Relative and Absolute",
    "You can name a place two ways. A relative path is from where you stand: cd projects goes down, cd .. goes up to the parent. An absolute path starts from the root with a leading slash and works from anywhere: cd /home/pi/Documents. And cd ~ always jumps home to /home/pi. Once you can move freely, tree draws the whole folder structure at once so you can see the shape of things.",
    "Now practice moving around. Watch the prompt: the part before the $ shows your current folder, and ~ is shorthand for your home directory.",
    [
      { cmd: "cd Documents", why: "A relative path: step down into Documents from home." },
      { cmd: "cd ..", why: "'..' means the parent directory — step back up to /home/pi." },
      { cmd: "cd /home/pi/projects", why: "An absolute path (leading /) works no matter where you are." },
      { cmd: "cd ~", why: "'~' is a shortcut for your home directory, /home/pi." },
      { cmd: "tree", why: "Draw the whole directory tree from here — see how it all nests." },
    ],
  ),
  lesson(
    303,
    "Read and Create Files",
    "Files are the whole point. cat prints a file's contents to the screen — use it to read notes, logs, anything. echo prints whatever you give it. touch creates a new, empty file (or updates a file's timestamp). Between reading with cat and making files with touch, you have the raw materials; the next lessons teach you how to fill and organize them.",
    "Time to work with files directly. First read the ones that came with your Pi, then make one of your own.",
    [
      { cmd: "cat README.txt", why: "conCATenate and print a file to the screen — the everyday way to read." },
      { cmd: "cat notes.txt", why: "Read another file. cat just dumps whatever text is inside." },
      { cmd: "echo Hello from the Pi", why: "echo prints its arguments straight back to the screen." },
      { cmd: "touch scratch.txt", why: "Create a new, empty file called scratch.txt." },
      { cmd: "ls", why: "List the folder — your new scratch.txt is really there." },
    ],
  ),
  lesson(
    304,
    "Edit Files with nano",
    "touch makes an empty file, but to actually write into one you need an editor. nano is the friendly editor that ships with the Pi. Type nano <file> to open it: edit the text, press Ctrl+O then Enter to write (save) it, and Ctrl+X to exit back to the shell. Open an existing file to change it, or name a file that does not exist yet and nano starts it fresh. Whatever you save is really on disk — cat proves it.",
    "This lesson opens a real editor. When nano appears, type some text, then press Ctrl+O and Enter to save, and Ctrl+X to leave. Then read the file back.",
    [
      { cmd: "nano todo.txt", why: "Open todo.txt in nano. Add a line, then Ctrl+O Enter to save, Ctrl+X to exit." },
      { cmd: "cat todo.txt", why: "Read it back — the line you added is genuinely saved in the file." },
      { cmd: "nano groceries.txt", why: "Naming a new file opens an empty buffer. Type a few items, save, and exit." },
      { cmd: "cat groceries.txt", why: "The file you created in nano now exists, with exactly what you typed." },
    ],
  ),
  lesson(
    305,
    "Redirection: Save Output to a File",
    "Every command prints to the screen by default — but > redirects that output into a file instead. echo \"hello\" > out.txt writes 'hello' into out.txt, replacing whatever was there. Two arrows >> append to the end instead of overwriting, so you never lose the previous lines. This works for ANY command: ls > listing.txt captures a folder listing as a file you can keep. This is how logs and reports get made.",
    "So far output has gone to the screen. Now send it into files with > (overwrite) and >> (append).",
    [
      { cmd: 'echo "line one" > out.txt', why: "> sends echo's output INTO out.txt instead of the screen (overwrites)." },
      { cmd: 'echo "line two" >> out.txt', why: ">> APPENDS a second line rather than overwriting the first." },
      { cmd: "cat out.txt", why: "Read the file — both lines are there, in order." },
      { cmd: "ls > listing.txt", why: "Redirection works for any command: capture the file list into listing.txt." },
      { cmd: "cat listing.txt", why: "Your folder listing is now saved text, one name per line." },
    ],
  ),
  lesson(
    306,
    "Wildcards: Match Many Files at Once",
    "Typing filenames one by one is slow. Wildcards let one pattern stand for many. * matches any run of characters, so *.txt means 'every file ending in .txt'. ? matches exactly one character. The shell expands the pattern to the matching filenames before the command runs, so ls *.log, cat *.log, and rm *.log all act on the whole group. Powerful — and with rm, permanent — so look before you leap.",
    "Wildcards turn one command into many. The seeded home has several .txt and .log files to practice on.",
    [
      { cmd: "ls *.txt", why: "* matches anything: list every file whose name ends in .txt." },
      { cmd: "ls *.log", why: "The same pattern for logs — app.log and sensors.log match." },
      { cmd: "cat *.log", why: "cat every matching file at once, printed one after another." },
      { cmd: "rm *.log", why: "Remove ALL matching files in one stroke. rm is permanent — be sure." },
      { cmd: "ls", why: "The .log files are gone; everything else remains." },
    ],
  ),
  lesson(
    307,
    "Pipes: Connect Commands Together",
    "A pipe | takes the output of one command and feeds it as the input of the next, so small tools combine into big ones. wc -l counts lines, head shows the first few, tail the last few. Chain them: ls | wc -l counts how many things are in a folder; cat app.log | head -3 shows just the top of a log. This 'do one thing well, then pipe' idea is the heart of Linux.",
    "Pipes join commands with |. The left command's output becomes the right command's input.",
    [
      { cmd: "ls | wc -l", why: "Pipe the listing into wc -l, which counts lines — so this counts your files." },
      { cmd: "cat app.log | wc -l", why: "Count how many lines the log file has." },
      { cmd: "cat app.log | head -3", why: "head -3 keeps only the first 3 lines of whatever it receives." },
      { cmd: "cat app.log | tail -2", why: "tail -2 keeps only the last 2 lines — the newest entries." },
    ],
  ),
  lesson(
    308,
    "grep: Search Inside Files",
    "When a file is long, you do not want to read all of it — you want the lines that matter. grep prints only the lines that contain a pattern. grep ERROR app.log pulls just the error lines out of a busy log. Add -i to ignore case, and -n to show each match's line number so you can find it again. grep is the command you will reach for more than almost any other.",
    "grep filters a file down to the lines you care about. The seeded app.log mixes INFO, WARN, and ERROR lines to search.",
    [
      { cmd: "grep ERROR app.log", why: "Print only the lines of app.log that contain ERROR." },
      { cmd: "grep -i error app.log", why: "-i ignores case, so 'error' still matches the uppercase ERROR lines." },
      { cmd: "grep -n WARN app.log", why: "-n prefixes each match with its line number." },
      { cmd: "grep INFO app.log", why: "Same tool, different needle: pull out the informational lines." },
    ],
  ),
  lesson(
    309,
    "grep Meets Pipes",
    "grep reads a file, but it also reads a pipe — which means you can filter the output of any command. cat app.log | grep ERROR does the same as grep ERROR app.log, but now the pattern goes at the end of a chain you can keep building. ls | grep .txt filters a listing. And grep -r searches an entire directory tree at once, so you can hunt a word across every file below you.",
    "grep is even stronger downstream of a pipe. Combine what you know: pipe into grep, and search recursively.",
    [
      { cmd: "cat app.log | grep ERROR", why: "Pipe the whole log into grep — it filters the stream to ERROR lines." },
      { cmd: "ls | grep .txt", why: "Filter a directory listing: keep only names containing .txt." },
      { cmd: 'grep -r temp .', why: "-r searches recursively from '.' (here) down — it finds temp in sensors.log." },
      { cmd: "cat app.log | grep -i error", why: "Flags still work through a pipe: case-insensitive filtering." },
    ],
  ),
  lesson(
    310,
    "find: Locate Files by Name",
    "grep searches inside files; find searches for the files themselves. Give it a starting point and a -name pattern and it walks the whole tree beneath, printing every path that matches. find . -name \"*.txt\" lists every text file no matter how deep it hides. Narrow the start folder to search just part of the tree. When you know a file exists 'somewhere down there', find is how you get its path.",
    "find walks directories to locate files by name — wildcards in the pattern, quoted so the shell passes them to find intact.",
    [
      { cmd: 'find . -name "*.txt"', why: "From '.' (here) down, print every path ending in .txt." },
      { cmd: 'find . -name "*.log"', why: "The same search for log files, wherever they live." },
      { cmd: 'find . -name "*.py"', why: "Find the Python files — they are down inside projects/." },
      { cmd: 'find Documents -name "*.txt"', why: "Start the search inside Documents to scope it to one branch." },
    ],
  ),
  lesson(
    311,
    "Permissions: Who Can Do What",
    "Every file carries permissions: who may read (r), write (w), and execute (x) it. ls -l shows them as a string like -rw-r--r-- along with the owner. A script will not run until it is executable, so chmod changes the bits. chmod +x backup.sh adds execute permission; run ls -l again and watch the string change to -rwxr-xr-x. You can also set them numerically — chmod 644 means owner read/write, everyone else read-only.",
    "Permissions decide what may happen to a file. ls -l reveals them; chmod changes them. Watch the permission string flip.",
    [
      { cmd: "ls -l", why: "The long listing shows permissions, owner, size, and name for each entry." },
      { cmd: "ls -l backup.sh", why: "Focus on one file. It starts -rw-r--r-- : readable, writable, not executable." },
      { cmd: "chmod +x backup.sh", why: "Add the execute bit so the script is allowed to run." },
      { cmd: "ls -l backup.sh", why: "Look again — the string is now -rwxr-xr-x. The x's appeared." },
      { cmd: "chmod 644 backup.sh", why: "Set permissions numerically: 6=rw for owner, 4=r for group and others." },
    ],
  ),
  lesson(
    312,
    "sudo: Do It as the Administrator",
    "Some actions are off-limits to an ordinary user — changing system files, adding users, restricting a file you do not own. sudo ('superuser do') runs a single command with administrator rights. You have already met whoami, which tells you who you are: pi. Lock a file down with chmod 600 so only its owner can touch it, then use sudo to change it back. sudo is the key to the whole machine, so real systems ask for your password first — use it with care.",
    "The capstone: put permissions and administrator rights together. whoami confirms who you are, and sudo runs a command with full privileges.",
    [
      { cmd: "whoami", why: "Print the current user. On a fresh Pi that is 'pi'." },
      { cmd: "chmod 600 notes.txt", why: "600 = read/write for the owner only; no one else may even read it." },
      { cmd: "ls -l notes.txt", why: "Confirm the lock-down: the string is now -rw------- ." },
      { cmd: "sudo chmod 644 notes.txt", why: "sudo runs chmod with administrator rights to open the file back up." },
      { cmd: "ls -l notes.txt", why: "Back to -rw-r--r-- : you commanded the change as the superuser." },
    ],
  ),
];

const toAdd = allLessons.filter((l) => l.id <= LIMIT);
for (const l of toAdd) {
  const existing = lessons.lessons.findIndex((x) => x.id === l.id);
  if (existing >= 0) {
    lessons.lessons[existing] = l;
  } else {
    let insertAt = lessons.lessons.findIndex((x) => x.id > l.id);
    if (insertAt < 0) insertAt = lessons.lessons.length;
    lessons.lessons.splice(insertAt, 0, l);
  }
}

const writeBoth = (name, obj) => {
  const text = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(path.join(FE, name), text);
  fs.writeFileSync(path.join(BE, name), text);
  console.log("wrote", name, "-> frontend + backend");
};
writeBoth("lessons.json", lessons);
console.log(
  "pi linux lessons through",
  LIMIT + ":",
  toAdd.map((l) => l.id).join(", "),
  "| total lessons:",
  lessons.lessons.length,
);
