// A small but real POSIX-ish shell over an in-memory filesystem.
// It teaches the command line without ever touching the learner's machine:
// every command genuinely mutates a virtual filesystem and prints realistic
// output — the same "type it, watch it happen" loop as the Arduino track.

export interface FsFile {
  type: "file";
  content: string;
  /** Unix permission bits (e.g. 0o644). Optional; a sensible default is used. */
  mode?: number;
  /** Logical size in bytes when it differs from content length (e.g. a `dd` image). */
  size?: number;
}
export interface FsDir {
  type: "dir";
  children: Record<string, FsNode>;
  mode?: number;
}
export type FsNode = FsFile | FsDir;

export interface RunResult {
  lines: string[];
  /** Clear the scrollback (the `clear` command). */
  clear?: boolean;
  /** Open the nano editor on a file (the `nano` command). */
  edit?: { path: string; content: string };
}

interface Repo {
  branch: string;
  staged: Set<string>;
  commits: { message: string; files: string[] }[];
}

/** A network interface — one model that ifconfig, ip and hostname all read. */
interface NetIface {
  name: string;
  ipv4?: string;
  netmask?: string;
  broadcast?: string;
  mac: string;
  up: boolean;
  loopback?: boolean;
}

/** A login account, mirrored into /etc/passwd. */
interface UserRec {
  name: string;
  uid: number;
  gid: number;
  groups: string[];
  home: string;
  shell: string;
}

/** A saved identity, pushed by `ssh`/`su` and restored by `exit`. */
interface SessionFrame {
  user: string;
  host: string;
  home: string[];
  cwd: string[];
  root: FsDir;
  kind: "ssh" | "su";
}

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

/** Turn a shell glob (`*`, `?`) into an anchored RegExp. */
function globToRegex(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${esc}$`);
}

export class Shell {
  root: FsDir;
  cwd: string[];
  user: string;
  host: string;
  private home: string[];
  private repos = new Map<string, Repo>();
  // Networking / users / devices — consistent state the pi_network commands read.
  private ifaces: NetIface[] = [];
  private users = new Map<string, UserRec>();
  private nextUid = 1001;
  private privileged = false; // set while a `sudo` sub-command runs
  private sessionStack: SessionFrame[] = []; // ssh / su identities to return to

  /** Numeric group ids for the standard Raspberry Pi groups (for `id`). */
  private static GID: Record<string, number> = {
    root: 0, pi: 1000, adm: 4, dialout: 20, cdrom: 24, sudo: 27, audio: 29,
    video: 44, plugdev: 46, games: 60, users: 100, input: 105, render: 106,
    netdev: 109, gpio: 997, i2c: 998, spi: 999,
  };

  constructor(
    startCwd = "~/projects",
    opts: { user?: string; host?: string; seed?: Record<string, FsNode> } = {},
  ) {
    this.user = opts.user ?? "you";
    this.host = opts.host ?? "synapsys";
    this.home = ["home", this.user];
    this.root = dir({ home: dir({ [this.user]: dir() }) });
    this.seedSystem(); // /etc, network interfaces and users — all consistent
    const start = this.resolve(startCwd) ?? [...this.home, "projects"];
    // Ensure the start directory exists, then drop any seed files into it.
    this.ensureDir(start);
    if (opts.seed) {
      const node = this.nodeAt(start) as FsDir;
      for (const [k, v] of Object.entries(opts.seed)) node.children[k] = v;
    }
    this.cwd = start;
  }

  // ---- path helpers ----------------------------------------------------

  private resolve(path: string): string[] | null {
    let segs: string[];
    if (path === "~" || path.startsWith("~/")) {
      segs = [...this.home, ...path.slice(2).split("/").filter(Boolean)];
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
    if (segs.length >= 2 && segs[0] === this.home[0] && segs[1] === this.home[1]) {
      const rest = segs.slice(2);
      return rest.length ? `~/${rest.join("/")}` : "~";
    }
    return "/" + segs.join("/");
  }

  /** The `pi@raspberrypi:~$ ` prompt string. */
  prompt(): string {
    return `${this.user}@${this.host}:${this.display(this.cwd)}$`;
  }

  /** Save editor contents back into the sandbox (used by the nano modal). */
  writeFile(path: string, content: string): void {
    const segs = this.resolve(path);
    if (!segs) return;
    const parent = this.nodeAt(segs.slice(0, -1));
    if (!parent || parent.type !== "dir") return;
    const leaf = segs[segs.length - 1];
    const existing = parent.children[leaf];
    if (existing && existing.type === "file") existing.content = content;
    else parent.children[leaf] = { type: "file", content, mode: 0o644 };
  }

  // ---- glob + source helpers ------------------------------------------

  /** Expand any `*`/`?` tokens against the filesystem; unmatched tokens pass through. */
  private expandGlobs(args: string[]): string[] {
    const out: string[] = [];
    for (const a of args) {
      if (!/[*?]/.test(a)) {
        out.push(a);
        continue;
      }
      const slash = a.lastIndexOf("/");
      const dirPart = slash >= 0 ? a.slice(0, slash) || "/" : ".";
      const pat = slash >= 0 ? a.slice(slash + 1) : a;
      const node = this.nodeAt(this.resolve(dirPart)!);
      if (!node || node.type !== "dir") {
        out.push(a);
        continue;
      }
      const rx = globToRegex(pat);
      const matches = Object.keys(node.children)
        .filter((n) => !n.startsWith(".") && rx.test(n))
        .sort();
      if (!matches.length) {
        out.push(a); // nullglob off: keep the literal, like real bash
        continue;
      }
      for (const m of matches) out.push(slash >= 0 ? `${dirPart}/${m}` : m);
    }
    return out;
  }

  /** Read lines from files (glob-expanded) or, when none given, from stdin. */
  private readSource(fileArgs: string[], stdin?: string[]): { data: string[]; error?: string } {
    const files = this.expandGlobs(fileArgs);
    if (!files.length) return { data: stdin ?? [] };
    const out: string[] = [];
    for (const f of files) {
      const node = this.nodeAt(this.resolve(f)!);
      if (!node) return { data: [], error: `${f}: No such file or directory` };
      if (node.type !== "file") return { data: [], error: `${f}: Is a directory` };
      if (node.content) out.push(...node.content.split("\n"));
    }
    return { data: out };
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

  /** Split a line into pipe segments, respecting double quotes. */
  private splitPipes(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuote = !inQuote;
        cur += c;
      } else if (c === "|" && !inQuote) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    out.push(cur.trim());
    return out.filter((s) => s.length > 0);
  }

  /** Peel a trailing `> file` / `>> file` redirection off a segment. */
  private splitRedirect(seg: string): { body: string; target?: string; append?: boolean } {
    let inQuote = false;
    for (let i = 0; i < seg.length; i++) {
      const c = seg[i];
      if (c === '"') inQuote = !inQuote;
      else if (c === ">" && !inQuote) {
        const append = seg[i + 1] === ">";
        const target = seg
          .slice(i + (append ? 2 : 1))
          .trim()
          .replace(/^"|"$/g, "");
        return { body: seg.slice(0, i).trim(), target, append };
      }
    }
    return { body: seg.trim() };
  }

  /**
   * Open a redirect target the way a real shell does — BEFORE the command runs.
   * `>` truncates the file to empty; `>>` creates it empty only if absent. This
   * is why `ls > listing.txt` lists an (empty) listing.txt: the file already
   * exists by the time ls scans the directory. Returns an error result or null.
   */
  private openRedirect(target: string, append: boolean): RunResult | null {
    const segs = this.resolve(target);
    if (!segs) return { lines: [`bash: ${target}: No such file or directory`] };
    const parent = this.nodeAt(segs.slice(0, -1));
    const leaf = segs[segs.length - 1];
    if (!parent || parent.type !== "dir")
      return { lines: [`bash: ${target}: No such file or directory`] };
    if (parent.children[leaf]?.type === "dir")
      return { lines: [`bash: ${target}: Is a directory`] };
    const existing = parent.children[leaf];
    if (!append || existing?.type !== "file") parent.children[leaf] = file("");
    return null;
  }

  /** Write captured output to an already-opened redirect target (see openRedirect). */
  private redirectTo(target: string, lines: string[], append: boolean): void {
    const segs = this.resolve(target)!;
    const parent = this.nodeAt(segs.slice(0, -1)) as FsDir;
    const leaf = segs[segs.length - 1];
    const text = lines.join("\n");
    const existing = parent.children[leaf];
    if (append && existing?.type === "file" && existing.content)
      existing.content += "\n" + text;
    else parent.children[leaf] = file(text);
  }

  /** Entry point: handle pipes + redirection, then dispatch each stage. */
  run(line: string): RunResult {
    const trimmed = line.trim();
    if (!trimmed) return { lines: [] };

    const segments = this.splitPipes(trimmed);
    if (!segments.length) return { lines: [] };

    let stdin: string[] | undefined;
    let result: RunResult = { lines: [] };
    for (let i = 0; i < segments.length; i++) {
      const { body, target, append } = this.splitRedirect(segments[i]);
      const pipedOut = i < segments.length - 1;
      // ls (and friends) print one entry per line when their output is not a
      // terminal — i.e. when it feeds a pipe or a file redirection.
      const notTty = pipedOut || target !== undefined;
      // A real shell opens the redirect target (truncating for `>`) BEFORE the
      // command runs, and a bad target path fails without running the command.
      if (target !== undefined) {
        const err = this.openRedirect(target, !!append);
        if (err) return err;
      }
      result = this.dispatch(body, stdin, notTty);
      // clear/edit are whole-terminal actions; they short-circuit any pipeline.
      if (result.clear || result.edit) return result;
      if (target !== undefined) {
        this.redirectTo(target, result.lines, !!append);
        result = { lines: [] };
      }
      stdin = result.lines;
    }
    return result;
  }

  private dispatch(body: string, stdin?: string[], piped = false): RunResult {
    const argv = tokenize(body);
    const cmd = argv[0];
    const args = argv.slice(1);

    switch (cmd) {
      case undefined:
        return { lines: [] };
      case "clear":
        return { lines: [], clear: true };
      case "help":
        return {
          lines: [
            "Available commands in this lesson terminal:",
            "  pwd  ls  cd  mkdir  touch  cat  echo  rm  tree  nano  clear",
            "  grep  find  wc  head  tail  sort  chmod  sudo  whoami  id  groups",
            "  ifconfig  ip  hostname  ping  ssh  su  adduser  exit  lsblk  df  dd",
            "  git  node  npm  python  dotnet  code",
            "Pipes (a | b), redirection (> file, >> file) and wildcards (*, ?) work too.",
            "Everything runs in a safe in-memory sandbox.",
          ],
        };
      case "pwd":
        return { lines: ["/" + this.cwd.join("/")] };
      case "ls":
        return this.ls(args, piped);
      case "cd":
        return this.cd(args[0]);
      case "mkdir":
        return this.mkdir(args);
      case "touch":
        return this.touch(args);
      case "cat":
        return this.cat(args, stdin);
      case "rm":
        return this.rm(args);
      case "tree":
        return { lines: this.tree() };
      case "echo":
        return { lines: [args.join(" ")] };
      case "nano":
        return this.nano(args);
      case "grep":
        return this.grep(args, stdin);
      case "find":
        return this.find(args);
      case "wc":
        return this.wc(args, stdin);
      case "head":
        return this.head(args, stdin);
      case "tail":
        return this.tail(args, stdin);
      case "sort":
        return this.sort(args, stdin);
      case "chmod":
        return this.chmod(args);
      case "whoami":
        return { lines: [this.user] };
      case "id":
        return this.id(args);
      case "groups":
        return this.groups(args);
      case "sudo": {
        if (!args.length) return { lines: ["usage: sudo <command>"] };
        // In the sandbox sudo is always permitted; flag privilege for the sub-command.
        const wasPriv = this.privileged;
        this.privileged = true;
        const r = this.dispatch(body.replace(/^sudo\s+/, ""), stdin, piped);
        this.privileged = wasPriv;
        return r;
      }
      case "adduser":
      case "useradd":
        return this.adduser(args);
      case "su":
        return this.su(args);
      case "ssh":
        return this.ssh(args);
      case "exit":
      case "logout":
        return this.exitSession();
      case "ifconfig":
        return this.ifconfig(args);
      case "ip":
        return this.ipCmd(args);
      case "hostname":
        return this.hostnameCmd(args);
      case "ping":
        return this.ping(args);
      case "lsblk":
        return this.lsblk();
      case "df":
        return this.df(args);
      case "dd":
        return this.dd(args);
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

  private ls(args: string[], piped = false): RunResult {
    const long = args.some((a) => a.startsWith("-") && a.includes("l"));
    const showAll = args.some((a) => a.startsWith("-") && a.includes("a"));
    const human = args.some((a) => a.startsWith("-") && a.includes("h"));
    const targets = this.expandGlobs(args.filter((a) => !a.startsWith("-")));

    const entries: { name: string; node: FsNode }[] = [];
    const listDir = (node: FsDir) => {
      if (showAll) {
        // Real `ls -a` lists the directory itself and its parent first.
        entries.push({ name: ".", node });
        entries.push({ name: "..", node: dir() });
      }
      Object.keys(node.children)
        .filter((n) => showAll || !n.startsWith("."))
        .sort()
        .forEach((n) => entries.push({ name: n, node: node.children[n] }));
    };

    if (!targets.length) {
      listDir(this.nodeAt(this.cwd) as FsDir);
    } else {
      for (const t of targets) {
        const node = this.nodeAt(this.resolve(t)!);
        if (!node) return { lines: [`ls: cannot access '${t}': No such file or directory`] };
        if (node.type === "file") entries.push({ name: t, node });
        else listDir(node);
      }
    }

    if (long) return { lines: entries.map((e) => this.longFormat(e.name, e.node, human)) };
    const names = entries.map((e) => e.name);
    return { lines: piped ? names : names.length ? [names.join("  ")] : [] };
  }

  private longFormat(name: string, node: FsNode, human = false): string {
    const isDir = node.type === "dir";
    const mode = node.mode ?? (isDir ? 0o755 : 0o644);
    const rwx = (bits: number) =>
      `${bits & 4 ? "r" : "-"}${bits & 2 ? "w" : "-"}${bits & 1 ? "x" : "-"}`;
    const perms =
      (isDir ? "d" : "-") + rwx((mode >> 6) & 7) + rwx((mode >> 3) & 7) + rwx(mode & 7);
    const bytes = node.type === "file" ? node.size ?? node.content.length : 4096;
    const size = human ? this.humanLs(bytes) : String(bytes);
    return `${perms} 1 ${this.user} ${this.user} ${size.padStart(5)} ${name}`;
  }

  /** Human-readable file size for `ls -lh` (4.0K, 100M, 29G). */
  private humanLs(bytes: number): string {
    if (bytes < 1024) return String(bytes);
    const units = ["K", "M", "G", "T"];
    let v = bytes / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return (v < 10 ? v.toFixed(1) : Math.round(v).toString()) + units[i];
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

  private cat(args: string[], stdin?: string[]): RunResult {
    const files = this.expandGlobs(args.filter((a) => !a.startsWith("-")));
    if (!files.length) {
      if (stdin) return { lines: stdin };
      return { lines: ["cat: missing file operand"] };
    }
    const out: string[] = [];
    for (const target of files) {
      const node = this.nodeAt(this.resolve(target)!);
      if (!node) return { lines: [`cat: ${target}: No such file or directory`] };
      if (node.type !== "file") return { lines: [`cat: ${target}: Is a directory`] };
      if (node.content) out.push(...node.content.split("\n"));
    }
    return { lines: out };
  }

  private rm(args: string[]): RunResult {
    const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
    const names = this.expandGlobs(args.filter((a) => !a.startsWith("-")));
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

  private nano(args: string[]): RunResult {
    const target = args.find((a) => !a.startsWith("-"));
    if (!target) return { lines: ["Usage: nano [FILE]"] };
    const segs = this.resolve(target)!;
    const parent = this.nodeAt(segs.slice(0, -1));
    if (!parent || parent.type !== "dir")
      return { lines: [`nano: ${target}: No such file or directory`] };
    const node = parent.children[segs[segs.length - 1]];
    const content = node && node.type === "file" ? node.content : "";
    return { lines: [], edit: { path: target, content } };
  }

  private grep(args: string[], stdin?: string[]): RunResult {
    let ignoreCase = false;
    let showNum = false;
    let recursive = false;
    const rest: string[] = [];
    for (const a of args) {
      if (a.startsWith("-") && a.length > 1) {
        for (const ch of a.slice(1)) {
          if (ch === "i") ignoreCase = true;
          else if (ch === "n") showNum = true;
          else if (ch === "r" || ch === "R") recursive = true;
        }
      } else {
        rest.push(a);
      }
    }
    const pattern = rest.shift();
    if (pattern === undefined) return { lines: ["usage: grep [-inr] PATTERN [FILE...]"] };
    const needle = ignoreCase ? pattern.toLowerCase() : pattern;
    const matches = (line: string) => (ignoreCase ? line.toLowerCase() : line).includes(needle);

    const fileArgs = this.expandGlobs(rest);
    const out: string[] = [];

    if (!fileArgs.length) {
      (stdin ?? []).forEach((line, i) => {
        if (matches(line)) out.push(showNum ? `${i + 1}:${line}` : line);
      });
      return { lines: out };
    }

    const multi = fileArgs.length > 1 || recursive;
    const grepFile = (path: string, node: FsFile) => {
      const lines = node.content ? node.content.split("\n") : [];
      lines.forEach((line, i) => {
        if (matches(line)) {
          const prefix = (multi ? `${path}:` : "") + (showNum ? `${i + 1}:` : "");
          out.push(prefix + line);
        }
      });
    };

    for (const fa of fileArgs) {
      const node = this.nodeAt(this.resolve(fa)!);
      if (!node) {
        out.push(`grep: ${fa}: No such file or directory`);
        continue;
      }
      if (node.type === "file") {
        grepFile(fa, node);
      } else if (recursive) {
        const walk = (d: FsDir, prefix: string) => {
          for (const [name, child] of Object.entries(d.children)) {
            const p = `${prefix}/${name}`;
            if (child.type === "file") grepFile(p, child);
            else walk(child, p);
          }
        };
        walk(node, fa.replace(/\/$/, ""));
      } else {
        out.push(`grep: ${fa}: Is a directory`);
      }
    }
    return { lines: out };
  }

  private find(args: string[]): RunResult {
    const start = args[0] && !args[0].startsWith("-") ? args[0] : ".";
    const ni = args.indexOf("-name");
    const pattern = ni >= 0 ? args[ni + 1] : "*";
    const rx = globToRegex(pattern);
    const node = this.nodeAt(this.resolve(start)!);
    if (!node) return { lines: [`find: '${start}': No such file or directory`] };
    const out: string[] = [];
    const walk = (n: FsNode, path: string) => {
      const base = path.split("/").pop() || path;
      if (rx.test(base)) out.push(path);
      if (n.type === "dir")
        for (const [name, child] of Object.entries(n.children)) walk(child, `${path}/${name}`);
    };
    walk(node, start.replace(/\/$/, "") || ".");
    return { lines: out };
  }

  private wc(args: string[], stdin?: string[]): RunResult {
    const flags = args.filter((a) => a.startsWith("-")).join("");
    const fileArgs = args.filter((a) => !a.startsWith("-"));
    const src = this.readSource(fileArgs, stdin);
    if (src.error) return { lines: [`wc: ${src.error}`] };
    const lines = src.data.length;
    const words = src.data.reduce(
      (n, l) => n + (l.trim() ? l.trim().split(/\s+/).length : 0),
      0,
    );
    const chars = src.data.join("\n").length;
    const showL = flags.includes("l");
    const showW = flags.includes("w");
    const showC = flags.includes("c");
    const none = !showL && !showW && !showC;
    const parts: string[] = [];
    if (none || showL) parts.push(String(lines));
    if (none || showW) parts.push(String(words));
    if (none || showC) parts.push(String(chars));
    const label = fileArgs.length ? ` ${fileArgs[0]}` : "";
    return { lines: [parts.join(" ") + label] };
  }

  private head(args: string[], stdin?: string[]): RunResult {
    let n = 10;
    const rest: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-n") n = Number(args[++i]) || 10;
      else if (/^-\d+$/.test(a)) n = Number(a.slice(1));
      else rest.push(a);
    }
    const src = this.readSource(rest, stdin);
    if (src.error) return { lines: [`head: cannot open '${src.error}'`] };
    return { lines: src.data.slice(0, n) };
  }

  private tail(args: string[], stdin?: string[]): RunResult {
    let n = 10;
    const rest: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-n") n = Number(args[++i]) || 10;
      else if (/^-\d+$/.test(a)) n = Number(a.slice(1));
      else rest.push(a);
    }
    const src = this.readSource(rest, stdin);
    if (src.error) return { lines: [`tail: cannot open '${src.error}'`] };
    return { lines: src.data.slice(-n) };
  }

  private sort(args: string[], stdin?: string[]): RunResult {
    const rest = args.filter((a) => !a.startsWith("-"));
    const src = this.readSource(rest, stdin);
    if (src.error) return { lines: [`sort: cannot read: ${src.error}`] };
    return { lines: [...src.data].sort((a, b) => a.localeCompare(b)) };
  }

  private chmod(args: string[]): RunResult {
    const spec = args[0];
    const targets = this.expandGlobs(args.slice(1));
    if (!spec || !targets.length) return { lines: ["chmod: missing operand"] };
    for (const t of targets) {
      const node = this.nodeAt(this.resolve(t)!);
      if (!node) return { lines: [`chmod: cannot access '${t}': No such file or directory`] };
      const isDir = node.type === "dir";
      let mode = node.mode ?? (isDir ? 0o755 : 0o644);
      if (/^[0-7]{3,4}$/.test(spec)) mode = parseInt(spec, 8);
      else mode = this.applySymbolic(mode, spec);
      node.mode = mode;
    }
    return { lines: [] };
  }

  private applySymbolic(mode: number, spec: string): number {
    const m = spec.match(/^([ugoa]*)([+\-=])([rwx]+)$/);
    if (!m) return mode;
    const who = m[1] || "a";
    const op = m[2];
    const bits =
      (m[3].includes("r") ? 4 : 0) | (m[3].includes("w") ? 2 : 0) | (m[3].includes("x") ? 1 : 0);
    const shifts: number[] = [];
    if (who.includes("u") || who.includes("a")) shifts.push(6);
    if (who.includes("g") || who.includes("a")) shifts.push(3);
    if (who.includes("o") || who.includes("a")) shifts.push(0);
    for (const s of shifts) {
      if (op === "+") mode |= bits << s;
      else if (op === "-") mode &= ~(bits << s);
      else {
        mode &= ~(7 << s);
        mode |= bits << s;
      }
    }
    return mode;
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

  // ---- system / networking / users / devices ---------------------------

  /** Seed a consistent /etc, network model and user set from user+host. */
  private seedSystem(): void {
    const pi = this.host === "raspberrypi";
    // Real Raspberry Pi Foundation MAC prefix (b8:27:eb) on a Pi, else a generic one.
    const oui = pi ? "b8:27:eb" : "dc:a6:32";
    this.ifaces = [
      { name: "eth0", ipv4: "192.168.1.42", netmask: "255.255.255.0", broadcast: "192.168.1.255", mac: `${oui}:1a:2b:3c`, up: true },
      { name: "lo", ipv4: "127.0.0.1", netmask: "255.0.0.0", mac: "00:00:00:00:00:00", up: true, loopback: true },
      { name: "wlan0", mac: `${oui}:4d:5e:6f`, up: false },
    ];
    const groups = pi
      ? ["pi", "adm", "dialout", "cdrom", "sudo", "audio", "video", "plugdev", "games", "users", "input", "render", "netdev", "gpio", "i2c", "spi"]
      : [this.user, "adm", "sudo", "users"];
    this.users.set(this.user, {
      name: this.user, uid: 1000, gid: 1000, groups,
      home: "/" + this.home.join("/"), shell: "/bin/bash",
    });
    const etc = this.ensureDir(["etc"]);
    etc.children["hostname"] = file(this.host + "\n");
    etc.children["passwd"] = file(this.etcPasswd());
    etc.children["os-release"] = file(
      'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n',
    );
  }

  /** Render the users model as /etc/passwd text. */
  private etcPasswd(): string {
    const base = [
      "root:x:0:0:root:/root:/bin/bash",
      "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin",
      "bin:x:2:2:bin:/bin:/usr/sbin/nologin",
      "sys:x:3:3:sys:/dev:/usr/sbin/nologin",
      "sync:x:4:65534:sync:/bin:/bin/sync",
      "nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin",
    ];
    const accts = [...this.users.values()]
      .sort((a, b) => a.uid - b.uid)
      .map((u) => `${u.name}:x:${u.uid}:${u.gid}:,,,:${u.home}:${u.shell}`);
    return base.concat(accts).join("\n") + "\n";
  }

  private syncPasswd(): void {
    const etc = this.nodeAt(["etc"]);
    if (etc && etc.type === "dir") etc.children["passwd"] = file(this.etcPasswd());
  }

  private id(args: string[]): RunResult {
    const name = args.find((a) => !a.startsWith("-")) ?? this.user;
    const u = this.users.get(name);
    if (!u) return { lines: [`id: '${name}': no such user`] };
    const gidNum = (g: string) => Shell.GID[g] ?? u.uid;
    const grp = u.groups.map((g) => `${gidNum(g)}(${g})`).join(",");
    return { lines: [`uid=${u.uid}(${u.name}) gid=${u.gid}(${u.groups[0] ?? u.name}) groups=${grp}`] };
  }

  private groups(args: string[]): RunResult {
    const name = args[0] ?? this.user;
    const u = this.users.get(name);
    if (!u) return { lines: [`groups: '${name}': no such user`] };
    return { lines: [u.groups.join(" ")] };
  }

  private adduser(args: string[]): RunResult {
    const name = args.find((a) => !a.startsWith("-"));
    if (!name) return { lines: ["adduser: Only one or two names allowed."] };
    if (!this.privileged && this.user !== "root")
      return { lines: ["adduser: Only root may add a user or group to the system."] };
    if (this.users.has(name)) return { lines: [`adduser: The user \`${name}' already exists.`] };
    const uid = this.nextUid++;
    this.users.set(name, { name, uid, gid: uid, groups: [name, "users"], home: `/home/${name}`, shell: "/bin/bash" });
    this.ensureDir(["home", name]);
    this.syncPasswd();
    return {
      lines: [
        `Adding user \`${name}' ...`,
        `Adding new group \`${name}' (${uid}) ...`,
        `Adding new user \`${name}' (${uid}) with group \`${name}' ...`,
        `Creating home directory \`/home/${name}' ...`,
        `Copying files from \`/etc/skel' ...`,
        `Adding new user \`${name}' to supplemental / extra groups \`users' ...`,
        `Adding user \`${name}' to group \`users' ...`,
      ],
    };
  }

  private su(args: string[]): RunResult {
    const rest = args.filter((a) => a !== "-" && a !== "-l" && a !== "--login");
    const name = rest[0] ?? "root";
    let u = this.users.get(name);
    if (!u && name === "root")
      u = { name: "root", uid: 0, gid: 0, groups: ["root"], home: "/root", shell: "/bin/bash" };
    if (!u) return { lines: [`su: user ${name} does not exist or the user entry does not contain all the required fields`] };
    // root (via sudo) may become anyone without a password; otherwise su needs it.
    if (!this.privileged && this.user !== "root")
      return { lines: ["su: Authentication failure"] };
    this.pushSession("su");
    this.user = u.name;
    this.home = u.home.split("/").filter(Boolean);
    this.ensureDir(this.home);
    this.cwd = [...this.home];
    return { lines: [] };
  }

  private pushSession(kind: "ssh" | "su"): void {
    this.sessionStack.push({
      user: this.user, host: this.host, home: [...this.home], cwd: [...this.cwd], root: this.root, kind,
    });
  }

  private exitSession(): RunResult {
    const frame = this.sessionStack.pop();
    if (!frame) return { lines: [] }; // base shell — nothing to log out of
    const leftHost = this.host;
    this.user = frame.user;
    this.host = frame.host;
    this.home = frame.home;
    this.cwd = frame.cwd;
    this.root = frame.root;
    if (frame.kind === "ssh")
      return { lines: ["logout", `Connection to ${leftHost} closed.`] };
    return { lines: [] }; // leaving an su shell is silent, like bash
  }

  /** Build the small second Pi reached over SSH (its own filesystem). */
  private buildRemote(): FsDir {
    return dir({
      etc: dir({ hostname: file("pi-node\n") }),
      home: dir({
        pi: dir({
          "README.txt": file(
            "This is pi-node, the second Raspberry Pi on the network.\nYou reached it over SSH from raspberrypi.",
          ),
          "sensors.log": file("temp 19.8\ntemp 20.1\ntemp 20.3"),
          greenhouse: dir({
            "readings.csv": file("time,temp,humidity\n08:00,19.8,61\n09:00,20.1,59\n10:00,20.6,57"),
          }),
        }),
      }),
    });
  }

  private ssh(args: string[]): RunResult {
    const target = args.find((a) => !a.startsWith("-"));
    if (!target) return { lines: ["usage: ssh [user@]hostname"] };
    const at = target.indexOf("@");
    const ruser = at >= 0 ? target.slice(0, at) : this.user;
    const rhost = at >= 0 ? target.slice(at + 1) : target;
    // The only reachable host in this sandbox is the second Pi on the LAN.
    const known = rhost === "pi-node" || rhost === "pi-node.local" || rhost === "192.168.1.50";
    if (!known) return { lines: [`ssh: connect to host ${rhost} port 22: Network is unreachable`] };
    if (ruser !== "pi") return { lines: [`${ruser}@${rhost}: Permission denied (publickey,password).`] };
    this.pushSession("ssh");
    this.root = this.buildRemote();
    this.user = "pi";
    this.host = "pi-node";
    this.home = ["home", "pi"];
    this.cwd = [...this.home];
    return {
      lines: [
        "Linux pi-node 6.6.51+rpt-rpi-v8 #1 SMP PREEMPT Debian 1:6.6.51-1+rpt3 (2024-10-08) aarch64",
        "",
        "The programs included with the Debian GNU/Linux system are free software;",
        "the exact distribution terms for each program are described in the individual",
        "files in /usr/share/doc/*/copyright.",
        "",
        "Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent",
        "permitted by applicable law.",
        "Last login: Fri Sep 19 08:14:02 2026 from 192.168.1.42",
      ],
    };
  }

  private ifconfig(args: string[]): RunResult {
    const only = args.find((a) => !a.startsWith("-"));
    const list = only ? this.ifaces.filter((i) => i.name === only) : this.ifaces;
    if (only && !list.length)
      return { lines: [`${only}: error fetching interface information: Device not found`] };
    const out: string[] = [];
    list.forEach((i, idx) => {
      if (i.loopback) {
        out.push(`${i.name}: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536`);
        out.push(`        inet ${i.ipv4}  netmask ${i.netmask}`);
        out.push(`        loop  txqueuelen 1000  (Local Loopback)`);
      } else if (i.up && i.ipv4) {
        out.push(`${i.name}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500`);
        out.push(`        inet ${i.ipv4}  netmask ${i.netmask}  broadcast ${i.broadcast}`);
        out.push(`        ether ${i.mac}  txqueuelen 1000  (Ethernet)`);
      } else {
        out.push(`${i.name}: flags=4099<BROADCAST,MULTICAST>  mtu 1500`);
        out.push(`        ether ${i.mac}  txqueuelen 1000  (Ethernet)`);
      }
      if (idx < list.length - 1) out.push("");
    });
    return { lines: out };
  }

  private ipCmd(args: string[]): RunResult {
    const sub = args[0];
    if (sub === "addr" || sub === "a" || sub === "address") {
      const si = args.indexOf("show");
      const dev = si >= 0 ? args[si + 1] : undefined;
      const list = dev ? this.ifaces.filter((i) => i.name === dev) : this.ifaces;
      const out: string[] = [];
      for (const i of list) {
        const n = this.ifaces.indexOf(i) + 1;
        if (i.loopback) {
          out.push(`${n}: ${i.name}: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000`);
          out.push(`    link/loopback ${i.mac} brd 00:00:00:00:00:00`);
          out.push(`    inet ${i.ipv4}/8 scope host lo`);
          out.push(`       valid_lft forever preferred_lft forever`);
        } else if (i.up && i.ipv4) {
          out.push(`${n}: ${i.name}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP group default qlen 1000`);
          out.push(`    link/ether ${i.mac} brd ff:ff:ff:ff:ff:ff`);
          out.push(`    inet ${i.ipv4}/24 brd ${i.broadcast} scope global dynamic ${i.name}`);
          out.push(`       valid_lft forever preferred_lft forever`);
        } else {
          out.push(`${n}: ${i.name}: <BROADCAST,MULTICAST> mtu 1500 qdisc noqueue state DOWN group default qlen 1000`);
          out.push(`    link/ether ${i.mac} brd ff:ff:ff:ff:ff:ff`);
        }
      }
      return { lines: out };
    }
    if (sub === "route" || sub === "r") {
      return {
        lines: [
          "default via 192.168.1.1 dev eth0 proto dhcp src 192.168.1.42 metric 100",
          "192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.42 metric 100",
        ],
      };
    }
    return { lines: [`Object "${sub ?? ""}" is unknown, try "ip help".`] };
  }

  private hostnameCmd(args: string[]): RunResult {
    if (args.includes("-I") || args.includes("--all-ip-addresses")) {
      const ips = this.ifaces.filter((i) => !i.loopback && i.ipv4).map((i) => i.ipv4);
      return { lines: [ips.join(" ")] };
    }
    return { lines: [this.host] };
  }

  private ping(args: string[]): RunResult {
    let count = 4;
    const rest: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-c") count = Number(args[++i]) || 4;
      else if (!a.startsWith("-")) rest.push(a);
    }
    const host = rest[0];
    if (!host) return { lines: ["ping: usage error: Destination address required"] };
    const primary = this.ifaces.find((i) => !i.loopback && i.ipv4)?.ipv4 ?? "192.168.1.42";
    const map: Record<string, string> = {
      localhost: "127.0.0.1", "127.0.0.1": "127.0.0.1",
      "192.168.1.1": "192.168.1.1", _gateway: "192.168.1.1",
      "pi-node": "192.168.1.50", "pi-node.local": "192.168.1.50", "192.168.1.50": "192.168.1.50",
      [this.host]: primary, [`${this.host}.local`]: primary,
    };
    const ipv = map[host];
    if (!ipv) return { lines: [`ping: ${host}: Name or service not known`] };
    const loop = ipv === "127.0.0.1";
    const out = [`PING ${host} (${ipv}) 56(84) bytes of data.`];
    const times: number[] = [];
    for (let s = 1; s <= count; s++) {
      const t = loop ? 0.028 + s * 0.004 : 0.38 + s * 0.06;
      times.push(t);
      out.push(`64 bytes from ${ipv}: icmp_seq=${s} ttl=64 time=${t.toFixed(3)} ms`);
    }
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const mdev = Math.sqrt(times.reduce((a, b) => a + (b - avg) ** 2, 0) / times.length);
    out.push(
      "",
      `--- ${host} ping statistics ---`,
      `${count} packets transmitted, ${count} received, 0% packet loss, time ${(count - 1) * 1000 + (loop ? 3 : 9)}ms`,
      `rtt min/avg/max/mdev = ${min.toFixed(3)}/${avg.toFixed(3)}/${max.toFixed(3)}/${mdev.toFixed(3)} ms`,
    );
    return { lines: out };
  }

  private lsblk(): RunResult {
    return {
      lines: [
        "NAME         MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS",
        "mmcblk0      179:0    0 29.7G  0 disk ",
        "├─mmcblk0p1  179:1    0  512M  0 part /boot/firmware",
        "└─mmcblk0p2  179:2    0 29.2G  0 part /",
      ],
    };
  }

  private df(args: string[]): RunResult {
    if (args.includes("-h") || args.includes("--human-readable")) {
      return {
        lines: [
          "Filesystem      Size  Used Avail Use% Mounted on",
          "/dev/root        29G  6.4G   22G  23% /",
          "devtmpfs        1.6G     0  1.6G   0% /dev",
          "tmpfs           1.9G     0  1.9G   0% /dev/shm",
          "tmpfs           780M   28K  780M   1% /run",
          "/dev/mmcblk0p1  510M   64M  447M  13% /boot/firmware",
        ],
      };
    }
    return {
      lines: [
        "Filesystem     1K-blocks    Used Available Use% Mounted on",
        "/dev/root       30218900 6553600  22405916  23% /",
        "devtmpfs         1600000       0   1600000   0% /dev",
        "/dev/mmcblk0p1    522230   65536    456694  13% /boot/firmware",
      ],
    };
  }

  private parseSize(spec: string): number {
    const m = spec.match(/^(\d+)([kKmMgG]?)(i?B?)$/);
    if (!m) return Number(spec) || 512;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === "k") return n * 1024;
    if (unit === "m") return n * 1024 * 1024;
    if (unit === "g") return n * 1024 * 1024 * 1024;
    return n;
  }

  private humanSI(bytes: number): string {
    const u = ["bytes", "kB", "MB", "GB", "TB"];
    if (bytes < 1000) return `${bytes} bytes`;
    let v = bytes;
    let i = 0;
    while (v >= 1000 && i < u.length - 1) {
      v /= 1000;
      i++;
    }
    return `${v % 1 === 0 ? v : v.toFixed(1)} ${u[i]}`;
  }

  private humanIEC(bytes: number): string {
    const u = ["B", "KiB", "MiB", "GiB", "TiB"];
    if (bytes < 1024) return `${bytes} B`;
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < u.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v % 1 === 0 ? v : v.toFixed(1)} ${u[i]}`;
  }

  private dd(args: string[]): RunResult {
    const opt = (k: string) => {
      const a = args.find((x) => x.startsWith(k + "="));
      return a ? a.slice(k.length + 1) : undefined;
    };
    const iff = opt("if");
    const off = opt("of");
    if (!iff || !off) return { lines: ["dd: missing operand"] };
    if (iff.startsWith("/dev/") && !this.privileged && this.user !== "root")
      return { lines: [`dd: failed to open '${iff}': Permission denied`] };
    const bsBytes = this.parseSize(opt("bs") ?? "512");
    const count = opt("count") ? Number(opt("count")) : 1;
    const bytes = bsBytes * count;
    const segs = this.resolve(off)!;
    const parent = this.nodeAt(segs.slice(0, -1));
    if (!parent || parent.type !== "dir")
      return { lines: [`dd: failed to open '${off}': No such file or directory`] };
    // Genuinely create the image file; its logical size is the copied byte count.
    parent.children[segs[segs.length - 1]] = { type: "file", content: "", mode: 0o644, size: bytes };
    const secs = Math.max(0.1, bytes / 1e6 / 49.9);
    return {
      lines: [
        `${count}+0 records in`,
        `${count}+0 records out`,
        `${bytes} bytes (${this.humanSI(bytes)}, ${this.humanIEC(bytes)}) copied, ${secs.toFixed(1)} s, 49.9 MB/s`,
      ],
    };
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
