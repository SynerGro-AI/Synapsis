// A small but real POSIX-ish shell over an in-memory filesystem.
// It teaches the command line without ever touching the learner's machine:
// every command genuinely mutates a virtual filesystem and prints realistic
// output — the same "type it, watch it happen" loop as the Arduino track.

export interface FsFile {
  type: "file";
  content: string;
}
export interface FsDir {
  type: "dir";
  children: Record<string, FsNode>;
}
export type FsNode = FsFile | FsDir;

export interface RunResult {
  lines: string[];
  /** Clear the scrollback (the `clear` command). */
  clear?: boolean;
}

interface Repo {
  branch: string;
  staged: Set<string>;
  commits: { message: string; files: string[] }[];
}

const HOME = ["home", "you"];

const dir = (children: Record<string, FsNode> = {}): FsDir => ({ type: "dir", children });
const file = (content = ""): FsFile => ({ type: "file", content });

/** Split a command line into tokens, respecting double quotes. */
function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

export class Shell {
  root: FsDir;
  cwd: string[];
  private repos = new Map<string, Repo>();

  constructor(startCwd = "~/projects", seed?: Record<string, FsNode>) {
    this.root = dir({ home: dir({ you: dir({ projects: dir() }) }) });
    const start = this.resolve(startCwd) ?? [...HOME, "projects"];
    // Ensure the start directory exists, then drop any seed files into it.
    this.ensureDir(start);
    if (seed) {
      const node = this.nodeAt(start) as FsDir;
      for (const [k, v] of Object.entries(seed)) node.children[k] = v;
    }
    this.cwd = start;
  }

  // ---- path helpers ----------------------------------------------------

  private resolve(path: string): string[] | null {
    let segs: string[];
    if (path === "~" || path.startsWith("~/")) {
      segs = [...HOME, ...path.slice(2).split("/").filter(Boolean)];
    } else if (path.startsWith("/")) {
      segs = path.split("/").filter(Boolean);
    } else {
      segs = [...this.cwd];
      for (const part of path.split("/")) {
        if (part === "" || part === ".") continue;
        if (part === "..") segs.pop();
        else segs.push(part);
      }
    }
    return segs;
  }

  private nodeAt(segs: string[]): FsNode | null {
    let node: FsNode = this.root;
    for (const s of segs) {
      if (node.type !== "dir" || !node.children[s]) return null;
      node = node.children[s];
    }
    return node;
  }

  private ensureDir(segs: string[]): FsDir {
    let node = this.root;
    for (const s of segs) {
      if (!node.children[s]) node.children[s] = dir();
      const next = node.children[s];
      if (next.type !== "dir") throw new Error(`${s} is a file`);
      node = next;
    }
    return node;
  }

  private display(segs: string[]): string {
    if (segs.length >= 2 && segs[0] === HOME[0] && segs[1] === HOME[1]) {
      const rest = segs.slice(2);
      return rest.length ? `~/${rest.join("/")}` : "~";
    }
    return "/" + segs.join("/");
  }

  /** The `you@synapsys:~/projects$ ` prompt string. */
  prompt(): string {
    return `you@synapsys:${this.display(this.cwd)}$`;
  }

  // ---- git helpers -----------------------------------------------------

  /** Nearest ancestor directory (inclusive) that is a git repo. */
  private repoRoot(): string[] | null {
    for (let i = this.cwd.length; i >= 0; i--) {
      const segs = this.cwd.slice(0, i);
      const node = this.nodeAt(segs);
      if (node?.type === "dir" && node.children[".git"]) return segs;
    }
    return null;
  }

  private repoFiles(rootSegs: string[]): string[] {
    const out: string[] = [];
    const walk = (node: FsDir, prefix: string) => {
      for (const [name, child] of Object.entries(node.children)) {
        if (name === ".git") continue;
        const p = prefix ? `${prefix}/${name}` : name;
        if (child.type === "dir") walk(child, p);
        else out.push(p);
      }
    };
    walk(this.nodeAt(rootSegs) as FsDir, "");
    return out;
  }

  // ---- the interpreter -------------------------------------------------

  run(line: string): RunResult {
    const trimmed = line.trim();
    if (!trimmed) return { lines: [] };

    // Handle redirection for echo before tokenizing args.
    const argv = tokenize(trimmed);
    const cmd = argv[0];
    const args = argv.slice(1);

    switch (cmd) {
      case "clear":
        return { lines: [], clear: true };
      case "help":
        return {
          lines: [
            "Available commands in this lesson terminal:",
            "  pwd  ls  cd  mkdir  touch  cat  echo  rm  tree  clear",
            "  git  node  npm  python  dotnet  code",
            "Everything runs in a safe in-memory sandbox.",
          ],
        };
      case "pwd":
        return { lines: [this.display(this.cwd) === "~" ? `/${HOME.join("/")}` : "/" + this.cwd.join("/")] };
      case "ls":
        return this.ls(args);
      case "cd":
        return this.cd(args[0]);
      case "mkdir":
        return this.mkdir(args);
      case "touch":
        return this.touch(args);
      case "cat":
        return this.cat(args[0]);
      case "rm":
        return this.rm(args);
      case "tree":
        return { lines: this.tree() };
      case "echo":
        return this.echo(trimmed);
      case "git":
        return this.git(args);
      case "node":
        return this.node(args);
      case "npm":
        return this.npm(args);
      case "python":
      case "python3":
        return this.python(args);
      case "dotnet":
        return this.dotnet(args);
      case "code":
        return { lines: args[0] ? [`Opening ${args[0]} in VS Code…`] : ["Opening VS Code…"] };
      default:
        return { lines: [`${cmd}: command not found`] };
    }
  }

  private ls(args: string[]): RunResult {
    const showAll = args.includes("-a") || args.includes("-la") || args.includes("-al");
    const target = args.find((a) => !a.startsWith("-"));
    const segs = target ? this.resolve(target)! : this.cwd;
    const node = this.nodeAt(segs);
    if (!node) return { lines: [`ls: cannot access '${target}': No such file or directory`] };
    if (node.type === "file") return { lines: [target!] };
    const names = Object.keys(node.children)
      .filter((n) => showAll || !n.startsWith("."))
      .sort();
    return { lines: names.length ? [names.join("  ")] : [] };
  }

  private cd(target?: string): RunResult {
    const segs = this.resolve(target ?? "~")!;
    const node = this.nodeAt(segs);
    if (!node) return { lines: [`cd: ${target}: No such file or directory`] };
    if (node.type !== "dir") return { lines: [`cd: ${target}: Not a directory`] };
    this.cwd = segs;
    return { lines: [] };
  }

  private mkdir(args: string[]): RunResult {
    const recursive = args.includes("-p");
    const names = args.filter((a) => !a.startsWith("-"));
    if (!names.length) return { lines: ["mkdir: missing operand"] };
    for (const name of names) {
      const segs = this.resolve(name)!;
      if (recursive) {
        this.ensureDir(segs);
      } else {
        const parent = this.nodeAt(segs.slice(0, -1));
        if (!parent || parent.type !== "dir")
          return { lines: [`mkdir: cannot create directory '${name}': No such file or directory`] };
        if (parent.children[segs[segs.length - 1]])
          return { lines: [`mkdir: cannot create directory '${name}': File exists`] };
        parent.children[segs[segs.length - 1]] = dir();
      }
    }
    return { lines: [] };
  }

  private touch(args: string[]): RunResult {
    if (!args.length) return { lines: ["touch: missing file operand"] };
    for (const name of args) {
      const segs = this.resolve(name)!;
      const parent = this.nodeAt(segs.slice(0, -1));
      if (!parent || parent.type !== "dir")
        return { lines: [`touch: cannot touch '${name}': No such file or directory`] };
      const leaf = segs[segs.length - 1];
      if (!parent.children[leaf]) parent.children[leaf] = file();
    }
    return { lines: [] };
  }

  private cat(target?: string): RunResult {
    if (!target) return { lines: ["cat: missing file operand"] };
    const node = this.nodeAt(this.resolve(target)!);
    if (!node) return { lines: [`cat: ${target}: No such file or directory`] };
    if (node.type !== "file") return { lines: [`cat: ${target}: Is a directory`] };
    return { lines: node.content ? node.content.split("\n") : [] };
  }

  private rm(args: string[]): RunResult {
    const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
    const names = args.filter((a) => !a.startsWith("-"));
    if (!names.length) return { lines: ["rm: missing operand"] };
    for (const name of names) {
      const segs = this.resolve(name)!;
      const parent = this.nodeAt(segs.slice(0, -1));
      const leaf = segs[segs.length - 1];
      if (!parent || parent.type !== "dir" || !parent.children[leaf])
        return { lines: [`rm: cannot remove '${name}': No such file or directory`] };
      if (parent.children[leaf].type === "dir" && !recursive)
        return { lines: [`rm: cannot remove '${name}': Is a directory`] };
      delete parent.children[leaf];
    }
    return { lines: [] };
  }

  private echo(fullLine: string): RunResult {
    // Split off a redirection, if any.
    const append = />>/.test(fullLine);
    const parts = fullLine.replace(/^echo\s?/, "").split(append ? ">>" : ">");
    const rawText = parts[0].trim().replace(/^"|"$/g, "");
    if (parts.length === 1) return { lines: [rawText] };

    const targetName = parts[1].trim();
    const segs = this.resolve(targetName)!;
    const parent = this.nodeAt(segs.slice(0, -1));
    const leaf = segs[segs.length - 1];
    if (!parent || parent.type !== "dir")
      return { lines: [`bash: ${targetName}: No such file or directory`] };
    const existing = parent.children[leaf];
    if (append && existing?.type === "file") existing.content += (existing.content ? "\n" : "") + rawText;
    else parent.children[leaf] = file(rawText);
    return { lines: [] };
  }

  private git(args: string[]): RunResult {
    const sub = args[0];
    if (sub === "--version") return { lines: ["git version 2.43.0"] };

    if (sub === "init") {
      const node = this.nodeAt(this.cwd) as FsDir;
      if (node.children[".git"]) return { lines: [`Reinitialized existing Git repository in ${"/" + this.cwd.join("/")}/.git/`] };
      node.children[".git"] = dir();
      this.repos.set(this.cwd.join("/"), { branch: "main", staged: new Set(), commits: [] });
      return { lines: [`Initialized empty Git repository in /${this.cwd.join("/")}/.git/`] };
    }

    const rootSegs = this.repoRoot();
    if (!rootSegs) return { lines: ["fatal: not a git repository (or any of the parent directories): .git"] };
    const repo = this.repos.get(rootSegs.join("/"))!;
    const files = this.repoFiles(rootSegs);
    const committed = new Set(repo.commits.flatMap((c) => c.files));

    if (sub === "status") {
      const staged = [...repo.staged].filter((f) => files.includes(f));
      const untracked = files.filter((f) => !repo.staged.has(f) && !committed.has(f));
      const out = [`On branch ${repo.branch}`];
      if (!repo.commits.length) out.push("", "No commits yet");
      if (staged.length) {
        out.push("", "Changes to be committed:");
        for (const f of staged) out.push(`\tnew file:   ${f}`);
      }
      if (untracked.length) {
        out.push("", "Untracked files:", '  (use "git add <file>..." to include in what will be committed)');
        for (const f of untracked) out.push(`\t${f}`);
      }
      if (!staged.length && !untracked.length)
        out.push("", "nothing to commit, working tree clean");
      return { lines: out };
    }

    if (sub === "add") {
      const spec = args[1];
      if (!spec) return { lines: ["Nothing specified, nothing added."] };
      const toAdd = spec === "." || spec === "-A" ? files : [spec];
      for (const f of toAdd) if (files.includes(f)) repo.staged.add(f);
      return { lines: [] };
    }

    if (sub === "commit") {
      const mi = args.indexOf("-m");
      const message = mi >= 0 ? args[mi + 1] ?? "" : "";
      if (!message) return { lines: ["Aborting commit due to empty commit message."] };
      const staged = [...repo.staged];
      if (!staged.length)
        return { lines: [`On branch ${repo.branch}`, "nothing to commit, working tree clean"] };
      repo.commits.push({ message, files: staged });
      repo.staged.clear();
      const hash = (0x100000 + repo.commits.length * 0x9e37).toString(16).slice(0, 7);
      return {
        lines: [`[${repo.branch} ${hash}] ${message}`, ` ${staged.length} file${staged.length > 1 ? "s" : ""} changed`],
      };
    }

    if (sub === "log") {
      if (!repo.commits.length) return { lines: ["fatal: your current branch 'main' does not have any commits yet"] };
      const out: string[] = [];
      [...repo.commits].reverse().forEach((c, i) => {
        const hash = (0x100000 + (repo.commits.length - i) * 0x9e37).toString(16).padStart(7, "0");
        out.push(`commit ${hash}${i === 0 ? " (HEAD -> main)" : ""}`, "Author: you <you@synapsys.school>", "", `    ${c.message}`, "");
      });
      return { lines: out };
    }

    return { lines: [`git: '${sub}' is not a git command. See 'git --help'.`] };
  }

  private node(args: string[]): RunResult {
    if (args[0] === "-v" || args[0] === "--version") return { lines: ["v20.11.1"] };
    if (args[0]) {
      const node = this.nodeAt(this.resolve(args[0])!);
      if (!node || node.type !== "file")
        return { lines: [`node: cannot find module '${args[0]}'`] };
      const m = node.content.match(/console\.log\((["'`])([\s\S]*?)\1\)/);
      return { lines: [m ? m[2] : ""] };
    }
    return { lines: ["Welcome to Node.js v20.11.1.", 'Type ".help" for more information.'] };
  }

  private npm(args: string[]): RunResult {
    if (args[0] === "-v" || args[0] === "--version") return { lines: ["10.2.4"] };
    if (args[0] === "init") {
      const node = this.nodeAt(this.cwd) as FsDir;
      const name = this.cwd[this.cwd.length - 1] ?? "project";
      node.children["package.json"] = file(
        `{\n  "name": "${name}",\n  "version": "1.0.0",\n  "main": "index.js",\n  "scripts": {\n    "test": "echo \\"Error: no test specified\\" && exit 1"\n  }\n}`,
      );
      return { lines: [`Wrote to /${this.cwd.join("/")}/package.json`, "", "created package.json"] };
    }
    return { lines: [`Unknown npm command: ${args.join(" ")}`] };
  }

  private python(args: string[]): RunResult {
    if (args[0] === "--version" || args[0] === "-V") return { lines: ["Python 3.12.1"] };
    if (args[0]) {
      const node = this.nodeAt(this.resolve(args[0])!);
      if (!node || node.type !== "file")
        return { lines: [`python: can't open file '${args[0]}': No such file or directory`] };
      const m = node.content.match(/print\((["'`])([\s\S]*?)\1\)/);
      return { lines: [m ? m[2] : ""] };
    }
    return { lines: ["Python 3.12.1 (main) — type exit() to quit"] };
  }

  private dotnet(args: string[]): RunResult {
    if (args[0] === "--version") return { lines: ["8.0.101"] };

    if (args[0] === "new" && args[1] === "console") {
      const ni = args.indexOf("-n");
      const name = ni >= 0 ? args[ni + 1] : this.cwd[this.cwd.length - 1] ?? "app";
      const target = ni >= 0 ? this.ensureDir([...this.cwd, name]) : (this.nodeAt(this.cwd) as FsDir);
      target.children["Program.cs"] = file('Console.WriteLine("Hello, World!");');
      target.children[`${name}.csproj`] = file(
        '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <OutputType>Exe</OutputType>\n    <TargetFramework>net8.0</TargetFramework>\n  </PropertyGroup>\n</Project>',
      );
      return {
        lines: [
          `The template "Console App" was created successfully.`,
          "",
          "Processing post-creation actions...",
          "Restore succeeded.",
        ],
      };
    }

    if (args[0] === "build") {
      const node = this.nodeAt(this.cwd) as FsDir;
      const hasProj = node.type === "dir" && Object.keys(node.children).some((n) => n.endsWith(".csproj"));
      if (!hasProj) return { lines: ["MSBUILD : error MSB1003: Specify a project or solution file."] };
      return { lines: ["Determining projects to restore...", "Build succeeded.", "    0 Warning(s)", "    0 Error(s)"] };
    }

    if (args[0] === "run") {
      const node = this.nodeAt(this.cwd) as FsDir;
      const program = node.type === "dir" ? node.children["Program.cs"] : null;
      if (!program || program.type !== "file")
        return { lines: ["Couldn't find a project to run. Ensure a project exists in the current directory."] };
      const m = program.content.match(/WriteLine\((["'`])([\s\S]*?)\1\)/);
      return { lines: [m ? m[2] : ""] };
    }

    return { lines: [`Unknown dotnet command: ${args.join(" ")}`] };
  }

  private tree(): string[] {
    const out: string[] = ["."];
    const walk = (node: FsDir, prefix: string) => {
      const entries = Object.entries(node.children).filter(([n]) => !n.startsWith("."));
      entries.forEach(([name, child], i) => {
        const last = i === entries.length - 1;
        out.push(`${prefix}${last ? "└── " : "├── "}${name}`);
        if (child.type === "dir") walk(child, prefix + (last ? "    " : "│   "));
      });
    };
    walk(this.nodeAt(this.cwd) as FsDir, "");
    return out;
  }
}
