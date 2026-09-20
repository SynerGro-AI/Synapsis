// A small, honest Python interpreter for the Raspberry Pi GPIO lessons.
//
// It mirrors the shape of the Arduino simulator (src/sim/arduino.ts):
// tokenize -> parse -> a tree-walking `async run(code, io)` with `stop()` and a
// `running` flag. The subset is exactly what Paul McWhorter's Pi Python lessons
// use — `import RPi.GPIO as GPIO`, `import time`, assignments, if/elif/else,
// while (incl. `while True:`), for/range, def/return, try/except
// KeyboardInterrupt, print/f-strings — and every hardware effect goes out
// through an injectable `PyGpioIO` callback bag so the learner's real code
// genuinely drives the on-screen circuit. Anything outside the subset raises an
// honest Python-style error (NameError / AttributeError / ModuleNotFoundError /
// TypeError) rather than being silently faked.
//
// Pin numbers here are Broadcom (BCM) GPIO numbers, matching GPIO.setmode(GPIO.BCM).

import type { PySketchInfo } from "../circuit/engine";

// ---------- IO surface the runtime drives ----------

export interface PyGpioIO {
  setmode(mode: "BCM" | "BOARD"): void;
  setup(pin: number, direction: "OUT" | "IN", pull: "UP" | "DOWN" | "OFF"): void;
  output(pin: number, high: boolean): void;
  input(pin: number): boolean;
  pwmStart(pin: number, freq: number, duty: number): void;
  pwmChangeDuty(pin: number, duty: number): void;
  pwmChangeFreq(pin: number, freq: number): void;
  pwmStop(pin: number): void;
  cleanup(): void;
  print(line: string): void;
  /** Write bytes out the PC's serial port toward the Arduino; returns the count. */
  serialWrite(bytes: number[]): number;
  /** Bytes waiting from the Arduino for the PC to read (ser.in_waiting). */
  serialAvailable(): number;
  /** Consume one byte the Arduino sent, or -1 when the wire is empty. */
  serialReadByte(): number;
  onError(message: string): void;
}

// ---------- Errors + control-flow signals ----------

export class PyError extends Error {
  etype: string;
  constructor(etype: string, message: string) {
    super(message);
    this.etype = etype;
  }
  get display(): string {
    return this.message ? `${this.etype}: ${this.message}` : this.etype;
  }
}

class BreakSignal {}
class ContinueSignal {}
class ReturnSignal {
  value: PyValue;
  constructor(value: PyValue) {
    this.value = value;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- Values ----------

type PyNamespace = { __ns: "GPIO" | "time" | "random" | "serial" };
type PyPwm = { __pwm: number; freq: number; running: boolean };
type PyFunc = { __func: FuncDef };
/** A real byte string (Python `bytes`) — every element 0–255. */
type PyBytes = { __bytes: number[] };
/** An open pyserial port. Reads/writes cross the shared WorldState FIFOs. */
type PySerial = {
  __serial: true;
  port: string;
  baud: number;
  timeout: number | null;
  open: boolean;
};
type PyValue =
  | number
  | string
  | boolean
  | null
  | PyValue[]
  | PyNamespace
  | PyPwm
  | PyFunc
  | PyBytes
  | PySerial;

const isNamespace = (v: PyValue): v is PyNamespace =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "__ns" in v;
const isPwm = (v: PyValue): v is PyPwm =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "__pwm" in v;
const isFunc = (v: PyValue): v is PyFunc =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "__func" in v;
const isBytes = (v: PyValue): v is PyBytes =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "__bytes" in v;
const isSerial = (v: PyValue): v is PySerial =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "__serial" in v;

/** Render a bytes value the way CPython's repr does: b'...' with escapes. */
function bytesRepr(b: number[]): string {
  let out = "b'";
  for (const c of b) {
    if (c === 10) out += "\\n";
    else if (c === 13) out += "\\r";
    else if (c === 9) out += "\\t";
    else if (c === 39) out += "\\'";
    else if (c === 92) out += "\\\\";
    else if (c >= 32 && c < 127) out += String.fromCharCode(c);
    else out += "\\x" + c.toString(16).padStart(2, "0");
  }
  return out + "'";
}

/** Python str.lstrip/rstrip with an explicit character set. */
function trimChars(s: string, chars: string, left: boolean, right: boolean): string {
  let start = 0;
  let end = s.length;
  if (left) while (start < end && chars.includes(s[start])) start++;
  if (right) while (end > start && chars.includes(s[end - 1])) end--;
  return s.slice(start, end);
}

function truthy(v: PyValue): boolean {
  if (v === null || v === false) return false;
  if (v === 0) return false;
  if (v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (isBytes(v)) return v.__bytes.length > 0;
  return true;
}

function pyStr(v: PyValue): string {
  if (v === null) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return numStr(v);
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(", ")}]`;
  if (isBytes(v)) return bytesRepr(v.__bytes);
  if (isSerial(v)) return `Serial<port=${v.port}, baudrate=${v.baud}, open=${v.open}>`;
  if (isPwm(v)) return `<PWM on GPIO${v.__pwm}>`;
  if (isNamespace(v)) return `<module ${v.__ns}>`;
  return "<function>";
}
function pyRepr(v: PyValue): string {
  return typeof v === "string" ? `'${v}'` : pyStr(v);
}
function numStr(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(n);
}
function typeName(v: PyValue): string {
  if (v === null) return "NoneType";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
  if (typeof v === "string") return "str";
  if (Array.isArray(v)) return "list";
  if (isBytes(v)) return "bytes";
  if (isSerial(v)) return "Serial";
  return "object";
}

// ---------- AST ----------

type Expr =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bytes"; v: number[] }
  | { k: "bool"; v: boolean }
  | { k: "none" }
  | { k: "name"; name: string }
  | { k: "list"; items: Expr[] }
  | { k: "fstr"; parts: FStrPart[] }
  | { k: "unary"; op: string; e: Expr }
  | { k: "binary"; op: string; a: Expr; b: Expr }
  | { k: "logic"; op: "and" | "or"; a: Expr; b: Expr }
  | { k: "not"; e: Expr }
  | { k: "compare"; op: string; a: Expr; b: Expr }
  | { k: "call"; callee: Expr; args: Expr[]; kwargs: [string, Expr][] }
  | { k: "attr"; obj: Expr; name: string }
  | { k: "index"; obj: Expr; idx: Expr };

type FStrPart = { lit: string } | { expr: Expr; spec: string };

interface FuncDef {
  name: string;
  params: string[];
  body: Stmt[];
}

type Stmt =
  | { k: "expr"; e: Expr }
  | { k: "assign"; target: Expr; value: Expr }
  | { k: "augassign"; target: Expr; op: string; value: Expr }
  | { k: "if"; branches: { cond: Expr; body: Stmt[] }[]; elseBody: Stmt[] | null }
  | { k: "while"; cond: Expr; body: Stmt[] }
  | { k: "for"; varName: string; iter: Expr; body: Stmt[] }
  | { k: "break" }
  | { k: "continue" }
  | { k: "pass" }
  | { k: "return"; e: Expr | null }
  | { k: "def"; def: FuncDef }
  | { k: "import"; module: string; alias: string | null }
  | { k: "fromimport"; module: string; names: string[] }
  | { k: "try"; body: Stmt[]; handlers: { exc: string | null; body: Stmt[] }[]; elseBody: Stmt[] | null; finallyBody: Stmt[] | null };

// ---------- Tokenizer (indentation-aware) ----------

interface Token {
  t: string; // "NAME" "NUM" "STR" "FSTR" "BYTES" "OP" "KW" "NEWLINE" "INDENT" "DEDENT" "EOF"
  v?: string | number;
  parts?: FStrPart[];
  bytes?: number[];
}

const KEYWORDS = new Set([
  "if", "elif", "else", "while", "for", "in", "break", "continue", "def",
  "return", "pass", "import", "from", "as", "and", "or", "not", "True",
  "False", "None", "try", "except", "finally", "global",
]);

const OPS3 = ["**=", "//="];
const OPS2 = ["**", "//", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "%="];
const OPS1 = "+-*/%<>=().,:[]{}";

function tokenize(src: string): Token[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const tokens: Token[] = [];
  const indents = [0];
  let depth = 0; // bracket nesting: suppress NEWLINE/INDENT while > 0

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    if (depth > 0) {
      // continuation line inside brackets: just tokenize its content
      depth += lineTokens(raw.trim(), tokens);
      continue;
    }
    // measure indentation
    let i = 0;
    while (i < raw.length && (raw[i] === " " || raw[i] === "\t")) i++;
    const content = raw.slice(i);
    if (content === "" || content.startsWith("#")) continue; // blank / comment-only
    const indent = i;
    if (indent > indents[indents.length - 1]) {
      indents.push(indent);
      tokens.push({ t: "INDENT" });
    } else {
      while (indent < indents[indents.length - 1]) {
        indents.pop();
        tokens.push({ t: "DEDENT" });
      }
      if (indent !== indents[indents.length - 1])
        throw new PyError("IndentationError", "unindent does not match any outer indentation level");
    }
    depth += lineTokens(content, tokens);
    if (depth === 0) tokens.push({ t: "NEWLINE" });
  }
  while (indents.length > 1) {
    indents.pop();
    tokens.push({ t: "DEDENT" });
  }
  tokens.push({ t: "NEWLINE" });
  tokens.push({ t: "EOF" });
  return tokens;
}

// Tokenize one line's content, appending to `tokens`; returns the net change in
// bracket depth so the caller can join implicit continuation lines.
function lineTokens(s: string, tokens: Token[]): number {
  let depth = 0;
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "#") break; // trailing comment
    // bytes literal b"..." / b'...' — a real byte string, not text
    if ((c === "b" || c === "B") && (s[i + 1] === '"' || s[i + 1] === "'")) {
      const q = s[i + 1];
      const [body, next] = readString(s, i + 2, q);
      const bytes: number[] = [];
      for (let k = 0; k < body.length; k++) bytes.push(body.charCodeAt(k) & 0xff);
      tokens.push({ t: "BYTES", bytes });
      i = next;
      continue;
    }
    // f-string?
    if ((c === "f" || c === "F") && (s[i + 1] === '"' || s[i + 1] === "'")) {
      const q = s[i + 1];
      const [body, next] = readString(s, i + 2, q);
      tokens.push({ t: "FSTR", parts: parseFString(body) });
      i = next;
      continue;
    }
    // raw-string prefix (treated as a normal string)
    if ((c === "r" || c === "R") && (s[i + 1] === '"' || s[i + 1] === "'")) {
      const q = s[i + 1];
      const [body, next] = readRawString(s, i + 2, q);
      tokens.push({ t: "STR", v: body });
      i = next;
      continue;
    }
    if (c === '"' || c === "'") {
      const [body, next] = readString(s, i + 1, c);
      tokens.push({ t: "STR", v: body });
      i = next;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < n && /[0-9._]/.test(s[j])) j++;
      // exponent
      if (s[j] === "e" || s[j] === "E") {
        j++;
        if (s[j] === "+" || s[j] === "-") j++;
        while (j < n && /[0-9]/.test(s[j])) j++;
      }
      const text = s.slice(i, j).replace(/_/g, "");
      tokens.push({ t: "NUM", v: Number(text) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(s[j])) j++;
      const word = s.slice(i, j);
      tokens.push({ t: KEYWORDS.has(word) ? "KW" : "NAME", v: word });
      i = j;
      continue;
    }
    // operators
    const three = s.slice(i, i + 3);
    if (OPS3.includes(three)) {
      tokens.push({ t: "OP", v: three });
      i += 3;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (OPS2.includes(two)) {
      tokens.push({ t: "OP", v: two });
      i += 2;
      continue;
    }
    if (OPS1.includes(c)) {
      if (c === "(" || c === "[" || c === "{") depth++;
      if (c === ")" || c === "]" || c === "}") depth--;
      tokens.push({ t: "OP", v: c });
      i++;
      continue;
    }
    throw new PyError("SyntaxError", `invalid character '${c}'`);
  }
  return depth;
}

function readString(s: string, start: number, quote: string): [string, number] {
  let out = "";
  let i = start;
  while (i < s.length && s[i] !== quote) {
    if (s[i] === "\\") {
      const e = s[i + 1];
      out += e === "n" ? "\n" : e === "t" ? "\t" : e === "\\" ? "\\" : e === quote ? quote : e ?? "";
      i += 2;
    } else {
      out += s[i];
      i++;
    }
  }
  if (i >= s.length) throw new PyError("SyntaxError", "EOL while scanning string literal");
  return [out, i + 1];
}
function readRawString(s: string, start: number, quote: string): [string, number] {
  let out = "";
  let i = start;
  while (i < s.length && s[i] !== quote) {
    out += s[i];
    i++;
  }
  if (i >= s.length) throw new PyError("SyntaxError", "EOL while scanning string literal");
  return [out, i + 1];
}

// Split an f-string body into literal chunks and {expression:spec} parts.
function parseFString(body: string): FStrPart[] {
  const parts: FStrPart[] = [];
  let lit = "";
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === "{" && body[i + 1] === "{") {
      lit += "{";
      i += 2;
    } else if (c === "}" && body[i + 1] === "}") {
      lit += "}";
      i += 2;
    } else if (c === "{") {
      if (lit) {
        parts.push({ lit });
        lit = "";
      }
      let j = i + 1;
      let d = 1;
      while (j < body.length && d > 0) {
        if (body[j] === "{") d++;
        else if (body[j] === "}") d--;
        if (d > 0) j++;
      }
      const inner = body.slice(i + 1, j);
      const colon = inner.lastIndexOf(":");
      const exprSrc = colon >= 0 ? inner.slice(0, colon) : inner;
      const spec = colon >= 0 ? inner.slice(colon + 1) : "";
      parts.push({ expr: parseExprString(exprSrc), spec });
      i = j + 1;
    } else {
      lit += c;
      i++;
    }
  }
  if (lit) parts.push({ lit });
  return parts;
}

// ---------- Parser ----------

class Parser {
  private p = 0;
  private toks: Token[];
  constructor(toks: Token[]) {
    this.toks = toks;
  }

  private peek(o = 0): Token {
    return this.toks[this.p + o] ?? { t: "EOF" };
  }
  private next(): Token {
    return this.toks[this.p++] ?? { t: "EOF" };
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t.t === "OP" && t.v === v;
  }
  private isKw(v: string): boolean {
    const t = this.peek();
    return t.t === "KW" && t.v === v;
  }
  private eatOp(v: string): void {
    if (!this.isOp(v)) throw this.err(`expected '${v}'`);
    this.p++;
  }
  private err(msg: string): PyError {
    return new PyError("SyntaxError", msg);
  }
  private skipNewlines(): void {
    while (this.peek().t === "NEWLINE") this.p++;
  }

  parseProgram(): Stmt[] {
    const body: Stmt[] = [];
    this.skipNewlines();
    while (this.peek().t !== "EOF") {
      body.push(this.parseStmt());
      this.skipNewlines();
    }
    return body;
  }

  private parseBlock(): Stmt[] {
    this.eatOp(":");
    // Suite may be a single simple statement on the same line, or an indented block.
    if (this.peek().t !== "NEWLINE") {
      return [this.parseSimpleStmt()];
    }
    this.skipNewlines();
    if (this.peek().t !== "INDENT") throw this.err("expected an indented block");
    this.p++; // INDENT
    const body: Stmt[] = [];
    while (this.peek().t !== "DEDENT" && this.peek().t !== "EOF") {
      body.push(this.parseStmt());
      this.skipNewlines();
    }
    if (this.peek().t === "DEDENT") this.p++;
    return body;
  }

  private parseStmt(): Stmt {
    const t = this.peek();
    if (t.t === "KW") {
      switch (t.v) {
        case "if":
          return this.parseIf();
        case "while":
          return this.parseWhile();
        case "for":
          return this.parseFor();
        case "def":
          return this.parseDef();
        case "try":
          return this.parseTry();
        case "import":
          return this.finishSimple(this.parseImport());
        case "from":
          return this.finishSimple(this.parseFromImport());
      }
    }
    return this.parseSimpleStmt();
  }

  private finishSimple(s: Stmt): Stmt {
    if (this.peek().t === "NEWLINE") this.p++;
    return s;
  }

  private parseSimpleStmt(): Stmt {
    const t = this.peek();
    if (t.t === "KW") {
      if (t.v === "break") {
        this.p++;
        return this.finishSimple({ k: "break" });
      }
      if (t.v === "continue") {
        this.p++;
        return this.finishSimple({ k: "continue" });
      }
      if (t.v === "pass") {
        this.p++;
        return this.finishSimple({ k: "pass" });
      }
      if (t.v === "return") {
        this.p++;
        const e = this.peek().t === "NEWLINE" ? null : this.parseExpr();
        return this.finishSimple({ k: "return", e });
      }
      if (t.v === "import") return this.finishSimple(this.parseImport());
      if (t.v === "from") return this.finishSimple(this.parseFromImport());
      if (t.v === "global") {
        // Parsed and ignored: our scope model is flat enough that `global` is a no-op.
        this.p++;
        while (this.peek().t !== "NEWLINE" && this.peek().t !== "EOF") this.p++;
        return this.finishSimple({ k: "pass" });
      }
    }
    const target = this.parseExpr();
    const op = this.peek();
    if (op.t === "OP" && op.v === "=") {
      this.p++;
      const value = this.parseExpr();
      return this.finishSimple({ k: "assign", target, value });
    }
    if (op.t === "OP" && typeof op.v === "string" && /^(\+|-|\*|\/|%|\*\*|\/\/)=$/.test(op.v)) {
      this.p++;
      const value = this.parseExpr();
      return this.finishSimple({ k: "augassign", target, op: op.v.slice(0, -1), value });
    }
    return this.finishSimple({ k: "expr", e: target });
  }

  private parseIf(): Stmt {
    this.p++; // if
    const branches: { cond: Expr; body: Stmt[] }[] = [];
    const cond = this.parseExpr();
    branches.push({ cond, body: this.parseBlock() });
    let elseBody: Stmt[] | null = null;
    for (;;) {
      this.skipNewlines();
      if (this.isKw("elif")) {
        this.p++;
        const c = this.parseExpr();
        branches.push({ cond: c, body: this.parseBlock() });
      } else if (this.isKw("else")) {
        this.p++;
        elseBody = this.parseBlock();
        break;
      } else break;
    }
    return { k: "if", branches, elseBody };
  }

  private parseWhile(): Stmt {
    this.p++; // while
    const cond = this.parseExpr();
    const body = this.parseBlock();
    return { k: "while", cond, body };
  }

  private parseFor(): Stmt {
    this.p++; // for
    const v = this.next();
    if (v.t !== "NAME") throw this.err("expected a loop variable after 'for'");
    if (!this.isKw("in")) throw this.err("expected 'in' in for-loop");
    this.p++;
    const iter = this.parseExpr();
    const body = this.parseBlock();
    return { k: "for", varName: String(v.v), iter, body };
  }

  private parseDef(): Stmt {
    this.p++; // def
    const name = this.next();
    if (name.t !== "NAME") throw this.err("expected a function name");
    this.eatOp("(");
    const params: string[] = [];
    while (!this.isOp(")")) {
      const p = this.next();
      if (p.t !== "NAME") throw this.err("expected a parameter name");
      params.push(String(p.v));
      if (this.isOp(",")) this.p++;
      else break;
    }
    this.eatOp(")");
    const body = this.parseBlock();
    return { k: "def", def: { name: String(name.v), params, body } };
  }

  private parseTry(): Stmt {
    this.p++; // try
    const body = this.parseBlock();
    const handlers: { exc: string | null; body: Stmt[] }[] = [];
    let elseBody: Stmt[] | null = null;
    let finallyBody: Stmt[] | null = null;
    for (;;) {
      this.skipNewlines();
      if (this.isKw("except")) {
        this.p++;
        let exc: string | null = null;
        if (this.peek().t === "NAME") exc = String(this.next().v);
        // optional `as name` — parsed and discarded
        if (this.isKw("as")) {
          this.p++;
          this.next();
        }
        handlers.push({ exc, body: this.parseBlock() });
      } else if (this.isKw("else")) {
        this.p++;
        elseBody = this.parseBlock();
      } else if (this.isKw("finally")) {
        this.p++;
        finallyBody = this.parseBlock();
        break;
      } else break;
    }
    return { k: "try", body, handlers, elseBody, finallyBody };
  }

  private parseImport(): Stmt {
    this.p++; // import
    let module = this.dottedName();
    let alias: string | null = null;
    if (this.isKw("as")) {
      this.p++;
      alias = String(this.next().v);
    }
    return { k: "import", module, alias };
  }

  private parseFromImport(): Stmt {
    this.p++; // from
    const module = this.dottedName();
    if (!this.isKw("import")) throw this.err("expected 'import' after module name");
    this.p++;
    const names: string[] = [];
    for (;;) {
      const n = this.next();
      if (n.t !== "NAME" && n.t !== "OP") names.push(String(n.v));
      else names.push(String(n.v));
      if (this.isOp(",")) this.p++;
      else break;
    }
    return { k: "fromimport", module, names };
  }

  private dottedName(): string {
    let name = String(this.next().v);
    while (this.isOp(".")) {
      this.p++;
      name += "." + String(this.next().v);
    }
    return name;
  }

  // ----- expression precedence ladder -----
  parseExpr(): Expr {
    return this.parseTernaryOr();
  }
  private parseTernaryOr(): Expr {
    let e = this.parseOr();
    // `a if cond else b`
    if (this.isKw("if")) {
      this.p++;
      const cond = this.parseOr();
      if (!this.isKw("else")) throw this.err("expected 'else' in conditional expression");
      this.p++;
      const other = this.parseExpr();
      // model as: cond and e ... but keep exact via a compare-free node
      e = { k: "logic", op: "or", a: { k: "logic", op: "and", a: cond, b: e }, b: other };
    }
    return e;
  }
  private parseOr(): Expr {
    let a = this.parseAnd();
    while (this.isKw("or")) {
      this.p++;
      a = { k: "logic", op: "or", a, b: this.parseAnd() };
    }
    return a;
  }
  private parseAnd(): Expr {
    let a = this.parseNot();
    while (this.isKw("and")) {
      this.p++;
      a = { k: "logic", op: "and", a, b: this.parseNot() };
    }
    return a;
  }
  private parseNot(): Expr {
    if (this.isKw("not")) {
      this.p++;
      return { k: "not", e: this.parseNot() };
    }
    return this.parseCompare();
  }
  private parseCompare(): Expr {
    let a = this.parseAdd();
    for (;;) {
      const t = this.peek();
      let op: string | null = null;
      if (t.t === "OP" && ["==", "!=", "<", ">", "<=", ">="].includes(String(t.v))) op = String(t.v);
      else if (t.t === "KW" && t.v === "in") op = "in";
      else if (t.t === "KW" && t.v === "not" && this.peek(1).t === "KW" && this.peek(1).v === "in") {
        this.p++;
        op = "not in";
      }
      if (!op) break;
      this.p++;
      a = { k: "compare", op, a, b: this.parseAdd() };
    }
    return a;
  }
  private parseAdd(): Expr {
    let a = this.parseMul();
    while (this.isOp("+") || this.isOp("-")) {
      const op = String(this.next().v);
      a = { k: "binary", op, a, b: this.parseMul() };
    }
    return a;
  }
  private parseMul(): Expr {
    let a = this.parseUnary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%") || this.isOp("//")) {
      const op = String(this.next().v);
      a = { k: "binary", op, a, b: this.parseUnary() };
    }
    return a;
  }
  private parseUnary(): Expr {
    if (this.isOp("-")) {
      this.p++;
      return { k: "unary", op: "-", e: this.parseUnary() };
    }
    if (this.isOp("+")) {
      this.p++;
      return this.parseUnary();
    }
    return this.parsePower();
  }
  private parsePower(): Expr {
    const a = this.parsePostfix();
    if (this.isOp("**")) {
      this.p++;
      return { k: "binary", op: "**", a, b: this.parseUnary() };
    }
    return a;
  }
  private parsePostfix(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      if (this.isOp(".")) {
        this.p++;
        const name = this.next();
        e = { k: "attr", obj: e, name: String(name.v) };
      } else if (this.isOp("(")) {
        this.p++;
        const { args, kwargs } = this.parseArgs();
        this.eatOp(")");
        e = { k: "call", callee: e, args, kwargs };
      } else if (this.isOp("[")) {
        this.p++;
        const idx = this.parseExpr();
        this.eatOp("]");
        e = { k: "index", obj: e, idx };
      } else break;
    }
    return e;
  }
  private parseArgs(): { args: Expr[]; kwargs: [string, Expr][] } {
    const args: Expr[] = [];
    const kwargs: [string, Expr][] = [];
    while (!this.isOp(")")) {
      if (this.peek().t === "NAME" && this.peek(1).t === "OP" && this.peek(1).v === "=") {
        const name = String(this.next().v);
        this.p++; // =
        kwargs.push([name, this.parseExpr()]);
      } else {
        args.push(this.parseExpr());
      }
      if (this.isOp(",")) this.p++;
      else break;
    }
    return { args, kwargs };
  }
  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.t === "NUM") {
      this.p++;
      return { k: "num", v: Number(t.v) };
    }
    if (t.t === "STR") {
      this.p++;
      return { k: "str", v: String(t.v) };
    }
    if (t.t === "BYTES") {
      this.p++;
      return { k: "bytes", v: (t.bytes ?? []).slice() };
    }
    if (t.t === "FSTR") {
      this.p++;
      return { k: "fstr", parts: t.parts ?? [] };
    }
    if (t.t === "KW") {
      if (t.v === "True") {
        this.p++;
        return { k: "bool", v: true };
      }
      if (t.v === "False") {
        this.p++;
        return { k: "bool", v: false };
      }
      if (t.v === "None") {
        this.p++;
        return { k: "none" };
      }
    }
    if (t.t === "NAME") {
      this.p++;
      return { k: "name", name: String(t.v) };
    }
    if (this.isOp("(")) {
      this.p++;
      const e = this.parseExpr();
      this.eatOp(")");
      return e;
    }
    if (this.isOp("[")) {
      this.p++;
      const items: Expr[] = [];
      while (!this.isOp("]")) {
        items.push(this.parseExpr());
        if (this.isOp(",")) this.p++;
        else break;
      }
      this.eatOp("]");
      return { k: "list", items };
    }
    throw this.err(`unexpected token ${t.v ?? t.t}`);
  }
}

function parse(code: string): Stmt[] {
  return new Parser(tokenize(code)).parseProgram();
}
function parseExprString(src: string): Expr {
  const toks = tokenize(src).filter((t) => t.t !== "NEWLINE" && t.t !== "INDENT" && t.t !== "DEDENT");
  return new Parser(toks).parseExpr();
}

// ---------- GPIO / time namespace constants ----------

const GPIO_CONSTS: Record<string, PyValue> = {
  BCM: "BCM",
  BOARD: "BOARD",
  OUT: "OUT",
  IN: "IN",
  HIGH: 1,
  LOW: 0,
  PUD_UP: "UP",
  PUD_DOWN: "DOWN",
  PUD_OFF: "OFF",
  RISING: "RISING",
  FALLING: "FALLING",
  BOTH: "BOTH",
};

// ---------- Interpreter ----------

export class PythonSim {
  private stopped = false;
  private isRunning = false;
  private io!: PyGpioIO;
  private scopes: Map<string, PyValue>[] = [];
  private mode: "BCM" | "BOARD" | null = null;
  private stepsSinceYield = 0;
  private stepsSinceDelay = 0;

  get running(): boolean {
    return this.isRunning;
  }

  stop(): void {
    this.stopped = true;
  }

  async run(code: string, io: PyGpioIO): Promise<void> {
    this.io = io;
    this.stopped = false;
    this.isRunning = true;
    this.mode = null;
    this.scopes = [new Map()];
    let program: Stmt[];
    try {
      program = parse(code);
    } catch (e) {
      if (e instanceof PyError) io.onError(e.display);
      else io.onError(String(e));
      this.isRunning = false;
      return;
    }
    try {
      await this.execBlock(program);
    } catch (e) {
      if (e instanceof PyError) {
        // A clean Stop surfaces as KeyboardInterrupt; if the learner didn't catch
        // it, end quietly the way pressing Ctrl-C on the Pi would.
        if (e.etype !== "KeyboardInterrupt") io.onError(e.display);
      } else if (e instanceof ReturnSignal) {
        io.onError("SyntaxError: 'return' outside function");
      } else if (e instanceof BreakSignal || e instanceof ContinueSignal) {
        io.onError("SyntaxError: 'break'/'continue' outside loop");
      } else {
        io.onError(String(e));
      }
    } finally {
      this.isRunning = false;
    }
  }

  private get scope(): Map<string, PyValue> {
    return this.scopes[this.scopes.length - 1];
  }
  private get globals(): Map<string, PyValue> {
    return this.scopes[0];
  }

  private lookup(name: string): PyValue {
    const local = this.scope;
    if (local.has(name)) return local.get(name)!;
    if (this.globals.has(name)) return this.globals.get(name)!;
    throw new PyError("NameError", `name '${name}' is not defined`);
  }

  private async execBlock(body: Stmt[]): Promise<void> {
    for (const s of body) await this.execStmt(s);
  }

  private async tick(): Promise<void> {
    if (this.stopped) throw new PyError("KeyboardInterrupt", "");
    if (++this.stepsSinceYield > 2000) {
      this.stepsSinceYield = 0;
      await sleep(0);
    }
    if (++this.stepsSinceDelay > 300_000)
      throw new PyError(
        "RuntimeError",
        "loop ran too long without time.sleep() — a while loop with no sleep freezes the Pi",
      );
  }

  private async execStmt(s: Stmt): Promise<void> {
    await this.tick();
    switch (s.k) {
      case "expr":
        await this.evalExpr(s.e);
        return;
      case "pass":
        return;
      case "assign": {
        const v = await this.evalExpr(s.value);
        await this.assign(s.target, v);
        return;
      }
      case "augassign": {
        const cur = await this.evalExpr(s.target);
        const rhs = await this.evalExpr(s.value);
        await this.assign(s.target, this.binop(s.op, cur, rhs));
        return;
      }
      case "if": {
        for (const b of s.branches) {
          if (truthy(await this.evalExpr(b.cond))) {
            await this.execBlock(b.body);
            return;
          }
        }
        if (s.elseBody) await this.execBlock(s.elseBody);
        return;
      }
      case "while": {
        while (truthy(await this.evalExpr(s.cond))) {
          try {
            await this.execBlock(s.body);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
          await this.tick();
        }
        return;
      }
      case "for": {
        const iter = await this.evalExpr(s.iter);
        if (!Array.isArray(iter))
          throw new PyError("TypeError", `'${typeName(iter)}' object is not iterable`);
        for (const item of iter) {
          this.scope.set(s.varName, item);
          try {
            await this.execBlock(s.body);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
          await this.tick();
        }
        return;
      }
      case "break":
        throw new BreakSignal();
      case "continue":
        throw new ContinueSignal();
      case "return":
        throw new ReturnSignal(s.e ? await this.evalExpr(s.e) : null);
      case "def":
        this.scope.set(s.def.name, { __func: s.def });
        return;
      case "import":
        this.doImport(s.module, s.alias);
        return;
      case "fromimport":
        this.doFromImport(s.module, s.names);
        return;
      case "try": {
        try {
          await this.execBlock(s.body);
          if (s.elseBody) await this.execBlock(s.elseBody);
        } catch (e) {
          if (e instanceof PyError) {
            const handler = s.handlers.find((h) => h.exc === null || h.exc === e.etype);
            if (handler) await this.execBlock(handler.body);
            else {
              if (s.finallyBody) await this.execBlock(s.finallyBody);
              throw e;
            }
          } else {
            if (s.finallyBody) await this.execBlock(s.finallyBody);
            throw e;
          }
        }
        if (s.finallyBody) await this.execBlock(s.finallyBody);
        return;
      }
    }
  }

  private doImport(module: string, alias: string | null): void {
    if (module === "RPi.GPIO") {
      this.scope.set(alias ?? "GPIO", { __ns: "GPIO" });
      return;
    }
    if (module === "time") {
      this.scope.set(alias ?? "time", { __ns: "time" });
      return;
    }
    if (module === "random") {
      this.scope.set(alias ?? "random", { __ns: "random" });
      return;
    }
    if (module === "serial") {
      this.scope.set(alias ?? "serial", { __ns: "serial" });
      return;
    }
    if (module === "RPi") {
      // `import RPi` alone doesn't expose GPIO; the real hint is to import RPi.GPIO.
      throw new PyError(
        "ModuleNotFoundError",
        "use 'import RPi.GPIO as GPIO' to control the pins",
      );
    }
    throw new PyError("ModuleNotFoundError", `No module named '${module}'`);
  }

  private doFromImport(module: string, names: string[]): void {
    if (module === "time") {
      for (const n of names)
        if (n === "sleep") this.scope.set("sleep", { __ns: "time" });
        else throw new PyError("ImportError", `cannot import name '${n}' from 'time'`);
      return;
    }
    if (module === "serial") {
      // pyserial is used as `import serial` then `serial.Serial(...)`, which keeps the
      // timeout= keyword; steer the learner there rather than a kwarg-losing name call.
      throw new PyError("ImportError", "use 'import serial' then 'serial.Serial(port, baud, timeout=...)'");
    }
    throw new PyError("ModuleNotFoundError", `No module named '${module}'`);
  }

  private async assign(target: Expr, value: PyValue): Promise<void> {
    if (target.k === "name") {
      this.scope.set(target.name, value);
      return;
    }
    if (target.k === "index") {
      const obj = await this.evalExpr(target.obj);
      const idx = await this.evalExpr(target.idx);
      if (!Array.isArray(obj)) throw new PyError("TypeError", "object does not support item assignment");
      if (typeof idx !== "number") throw new PyError("TypeError", "list indices must be integers");
      obj[idx < 0 ? obj.length + idx : idx] = value;
      return;
    }
    throw new PyError("SyntaxError", "cannot assign to this expression");
  }

  private async evalExpr(e: Expr): Promise<PyValue> {
    switch (e.k) {
      case "num":
        return e.v;
      case "str":
        return e.v;
      case "bytes":
        return { __bytes: e.v.slice() };
      case "bool":
        return e.v;
      case "none":
        return null;
      case "name":
        return this.lookup(e.name);
      case "list":
        return Promise.all(e.items.map((it) => this.evalExpr(it)));
      case "fstr": {
        let out = "";
        for (const part of e.parts) {
          if ("lit" in part) out += part.lit;
          else out += this.format(await this.evalExpr(part.expr), part.spec);
        }
        return out;
      }
      case "unary": {
        const v = await this.evalExpr(e.e);
        if (typeof v !== "number") throw new PyError("TypeError", `bad operand type for unary -: '${typeName(v)}'`);
        return -v;
      }
      case "not":
        return !truthy(await this.evalExpr(e.e));
      case "logic": {
        const a = await this.evalExpr(e.a);
        if (e.op === "and") return truthy(a) ? await this.evalExpr(e.b) : a;
        return truthy(a) ? a : await this.evalExpr(e.b);
      }
      case "compare":
        return this.compare(e.op, await this.evalExpr(e.a), await this.evalExpr(e.b));
      case "binary":
        return this.binop(e.op, await this.evalExpr(e.a), await this.evalExpr(e.b));
      case "index": {
        const obj = await this.evalExpr(e.obj);
        const idx = await this.evalExpr(e.idx);
        if (Array.isArray(obj) || typeof obj === "string") {
          if (typeof idx !== "number") throw new PyError("TypeError", "indices must be integers");
          const i = idx < 0 ? obj.length + idx : idx;
          if (i < 0 || i >= obj.length) throw new PyError("IndexError", "index out of range");
          return obj[i];
        }
        if (isBytes(obj)) {
          if (typeof idx !== "number") throw new PyError("TypeError", "indices must be integers");
          const arr = obj.__bytes;
          const i = idx < 0 ? arr.length + idx : idx;
          if (i < 0 || i >= arr.length) throw new PyError("IndexError", "index out of range");
          return arr[i]; // indexing bytes yields the int value, like CPython
        }
        throw new PyError("TypeError", `'${typeName(obj)}' object is not subscriptable`);
      }
      case "attr": {
        const obj = await this.evalExpr(e.obj);
        return this.getAttr(obj, e.name);
      }
      case "call":
        return this.evalCall(e);
    }
  }

  private getAttr(obj: PyValue, name: string): PyValue {
    if (isNamespace(obj) && obj.__ns === "GPIO" && name in GPIO_CONSTS) return GPIO_CONSTS[name];
    if (isSerial(obj)) {
      // Real pyserial read-only properties.
      if (name === "in_waiting") return this.io.serialAvailable();
      if (name === "is_open") return obj.open;
      if (name === "port") return obj.port;
      if (name === "baudrate") return obj.baud;
      throw new PyError("AttributeError", `'Serial' object has no attribute '${name}'`);
    }
    // Methods are resolved at call-time via a bound marker.
    return { __ns: "__attr__" } as unknown as PyValue; // placeholder; real dispatch in evalCall
  }

  private format(v: PyValue, spec: string): string {
    if (!spec) return pyStr(v);
    const m = /^\.(\d+)f$/.exec(spec);
    if (m && typeof v === "number") return v.toFixed(Number(m[1]));
    const d = /^(\d+)d$/.exec(spec);
    if (d && typeof v === "number") return String(Math.trunc(v));
    return pyStr(v);
  }

  private async evalCall(e: Extract<Expr, { k: "call" }>): Promise<PyValue> {
    const args = await Promise.all(e.args.map((a) => this.evalExpr(a)));
    const kwargs = new Map<string, PyValue>();
    for (const [name, expr] of e.kwargs) kwargs.set(name, await this.evalExpr(expr));

    // Attribute calls: obj.method(...) — dispatch on the object.
    if (e.callee.k === "attr") {
      const obj = await this.evalExpr(e.callee.obj);
      return this.callMethod(obj, e.callee.name, args, kwargs);
    }
    // Name calls: builtins or user functions.
    if (e.callee.k === "name") return this.callNamed(e.callee.name, args);

    const fn = await this.evalExpr(e.callee);
    if (isFunc(fn)) return this.callUser(fn, args);
    throw new PyError("TypeError", `'${typeName(fn)}' object is not callable`);
  }

  private async callMethod(
    obj: PyValue,
    name: string,
    args: PyValue[],
    kwargs: Map<string, PyValue>,
  ): Promise<PyValue> {
    if (isNamespace(obj) && obj.__ns === "GPIO") return this.gpioCall(name, args, kwargs);
    if (isNamespace(obj) && obj.__ns === "time") {
      if (name === "sleep") return this.timeSleep(args);
      if (name === "time") return Date.now() / 1000;
      throw new PyError("AttributeError", `module 'time' has no attribute '${name}'`);
    }
    if (isNamespace(obj) && obj.__ns === "random") return this.randomCall(name, args);
    if (isNamespace(obj) && obj.__ns === "serial") return this.serialModuleCall(name, args, kwargs);
    if (isSerial(obj)) return this.serialObjCall(obj, name, args);
    if (isBytes(obj)) return this.bytesMethod(obj, name, args);
    if (isPwm(obj)) return this.pwmCall(obj, name, args);
    if (typeof obj === "string") return this.strMethod(obj, name, args);
    if (Array.isArray(obj)) return this.listMethod(obj, name, args);
    throw new PyError("AttributeError", `'${typeName(obj)}' object has no attribute '${name}'`);
  }

  private async callNamed(name: string, args: PyValue[]): Promise<PyValue> {
    switch (name) {
      case "print":
        this.io.print(args.map((a) => pyStr(a)).join(" "));
        return null;
      case "range":
        return this.range(args);
      case "len": {
        const v = args[0];
        if (Array.isArray(v) || typeof v === "string") return v.length;
        if (isBytes(v)) return v.__bytes.length;
        throw new PyError("TypeError", `object of type '${typeName(v)}' has no len()`);
      }
      case "int":
        return this.toInt(args[0]);
      case "float": {
        const v = args[0] ?? 0;
        const f = typeof v === "string" ? Number(v) : Number(v);
        if (Number.isNaN(f)) throw new PyError("ValueError", `could not convert to float`);
        return f;
      }
      case "str":
        return args.length ? pyStr(args[0]) : "";
      case "bool":
        return args.length ? truthy(args[0]) : false;
      case "abs":
        return Math.abs(Number(args[0]));
      case "round": {
        const n = Number(args[0]);
        const d = args.length > 1 ? Number(args[1]) : 0;
        const f = Math.pow(10, d);
        return Math.round(n * f) / f;
      }
      case "min":
        return this.minmax(args, true);
      case "max":
        return this.minmax(args, false);
      case "sum": {
        const list = args[0];
        if (!Array.isArray(list)) throw new PyError("TypeError", "sum() expects a list");
        return list.reduce((a: number, b) => a + Number(b), 0);
      }
    }
    const fn = this.lookup(name);
    if (isFunc(fn)) return this.callUser(fn, args);
    throw new PyError("TypeError", `'${typeName(fn)}' object is not callable`);
  }

  private async callUser(fn: PyFunc, args: PyValue[]): Promise<PyValue> {
    const def = fn.__func;
    if (args.length !== def.params.length)
      throw new PyError(
        "TypeError",
        `${def.name}() takes ${def.params.length} positional arguments but ${args.length} were given`,
      );
    const local = new Map<string, PyValue>();
    def.params.forEach((p, i) => local.set(p, args[i]));
    this.scopes.push(local);
    try {
      await this.execBlock(def.body);
      return null;
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    } finally {
      this.scopes.pop();
    }
  }

  // ----- GPIO API -----
  private pin(v: PyValue, ctx: string): number {
    if (typeof v !== "number" || !Number.isInteger(v))
      throw new PyError("TypeError", `${ctx}: pin must be an integer`);
    return v;
  }

  private gpioCall(name: string, args: PyValue[], kwargs: Map<string, PyValue>): PyValue {
    switch (name) {
      case "setmode": {
        const m = args[0];
        if (m !== "BCM" && m !== "BOARD")
          throw new PyError("ValueError", "setmode() expects GPIO.BCM or GPIO.BOARD");
        this.mode = m;
        this.io.setmode(m);
        return null;
      }
      case "setwarnings":
        return null;
      case "setup": {
        if (this.mode === null)
          throw new PyError("RuntimeError", "Please set pin numbering mode using GPIO.setmode(GPIO.BCM)");
        const pin = this.pin(args[0], "setup");
        const dir = args[1];
        if (dir !== "OUT" && dir !== "IN")
          throw new PyError("ValueError", "setup() direction must be GPIO.OUT or GPIO.IN");
        const pud = kwargs.get("pull_up_down");
        const pull = pud === "UP" ? "UP" : pud === "DOWN" ? "DOWN" : "OFF";
        this.io.setup(pin, dir, pull);
        return null;
      }
      case "output": {
        const pin = this.pin(args[0], "output");
        const val = args[1];
        const high = truthy(val);
        this.io.output(pin, high);
        return null;
      }
      case "input": {
        const pin = this.pin(args[0], "input");
        return this.io.input(pin) ? 1 : 0;
      }
      case "PWM": {
        const pin = this.pin(args[0], "PWM");
        const freq = Number(args[1] ?? 0);
        return { __pwm: pin, freq, running: false };
      }
      case "cleanup":
        this.io.cleanup();
        return null;
      case "setup_out":
        throw new PyError("AttributeError", "module 'GPIO' has no attribute 'setup_out'");
      default:
        throw new PyError("AttributeError", `module 'GPIO' has no attribute '${name}'`);
    }
  }

  private pwmCall(pwm: PyPwm, name: string, args: PyValue[]): PyValue {
    switch (name) {
      case "start":
        pwm.running = true;
        this.io.pwmStart(pwm.__pwm, pwm.freq, Number(args[0] ?? 0));
        return null;
      case "ChangeDutyCycle":
        this.io.pwmChangeDuty(pwm.__pwm, Number(args[0] ?? 0));
        return null;
      case "ChangeFrequency":
        pwm.freq = Number(args[0] ?? 0);
        this.io.pwmChangeFreq(pwm.__pwm, pwm.freq);
        return null;
      case "stop":
        pwm.running = false;
        this.io.pwmStop(pwm.__pwm);
        return null;
      default:
        throw new PyError("AttributeError", `'PWM' object has no attribute '${name}'`);
    }
  }

  private async timeSleep(args: PyValue[]): Promise<PyValue> {
    const sec = Number(args[0] ?? 0);
    this.stepsSinceDelay = 0;
    const end = Date.now() + Math.min(Math.max(sec, 0) * 1000, 10_000);
    while (!this.stopped && Date.now() < end) await sleep(Math.min(50, end - Date.now()));
    if (this.stopped) throw new PyError("KeyboardInterrupt", "");
    return null;
  }

  // ----- pyserial: serial.Serial(...) and its methods -----
  // The port is genuinely opened over the shared WorldState FIFOs; every byte
  // written or read really crosses the wire to/from the running Arduino sketch.
  private serialModuleCall(name: string, args: PyValue[], kwargs: Map<string, PyValue>): PyValue {
    if (name !== "Serial")
      throw new PyError("AttributeError", `module 'serial' has no attribute '${name}'`);
    const portVal = args[0] ?? kwargs.get("port");
    if (portVal === undefined || portVal === null)
      throw new PyError("TypeError", "Serial() needs a port, e.g. serial.Serial('COM4', 9600)");
    const port = pyStr(portVal);
    const baudVal = args[1] ?? kwargs.get("baudrate") ?? 9600;
    const baud = Math.trunc(Number(baudVal));
    const tVal = kwargs.get("timeout");
    const timeout = tVal === undefined || tVal === null ? null : Number(tVal);
    return { __serial: true, port, baud, timeout, open: true };
  }

  private async serialObjCall(ser: PySerial, name: string, args: PyValue[]): Promise<PyValue> {
    if (name === "write") {
      const b = args[0];
      if (!isBytes(b))
        // pyserial rejects str — teaches the learner to use b'...' or .encode().
        throw new PyError("TypeError", "unicode strings are not supported, please encode to bytes");
      if (!ser.open) throw new PyError("SerialException", "attempting to use a port that is not open");
      return this.io.serialWrite(b.__bytes.slice());
    }
    if (name === "readline") return this.serialRead(ser, -1);
    if (name === "read") return this.serialRead(ser, args.length ? Math.trunc(Number(args[0])) : 1);
    if (name === "close") {
      ser.open = false;
      return null;
    }
    if (name === "flush" || name === "reset_output_buffer") return null;
    if (name === "reset_input_buffer") {
      while (this.io.serialReadByte() !== -1) {
        /* drain the incoming wire */
      }
      return null;
    }
    throw new PyError("AttributeError", `'Serial' object has no attribute '${name}'`);
  }

  // Blocking read shared by readline() (limit < 0 → read through '\n') and read(n)
  // (limit ≥ 0 → read n bytes). Mirrors the timeSleep poll: yields cooperatively,
  // honors stop(), resets the watchdog each poll, and respects the port timeout.
  private async serialRead(ser: PySerial, limit: number): Promise<PyValue> {
    if (!ser.open) throw new PyError("SerialException", "attempting to use a port that is not open");
    this.stepsSinceDelay = 0;
    const bytes: number[] = [];
    const hasTimeout = ser.timeout !== null;
    const deadline = hasTimeout ? Date.now() + Math.max(0, ser.timeout as number) * 1000 : 0;
    const hardCap = Date.now() + 10_000; // never wedge the JS thread, even with timeout=None
    while (!this.stopped) {
      if (limit >= 0 && bytes.length >= limit) break;
      const c = this.io.serialReadByte();
      if (c === -1) {
        if (hasTimeout && Date.now() >= deadline) break; // pyserial returns what it has
        if (Date.now() >= hardCap) break;
        await sleep(20);
        this.stepsSinceDelay = 0;
        continue;
      }
      bytes.push(c);
      if (limit < 0 && c === 10) break; // '\n' terminates a line (newline kept, as in pyserial)
    }
    if (this.stopped) throw new PyError("KeyboardInterrupt", "");
    return { __bytes: bytes };
  }

  private bytesMethod(b: PyBytes, name: string, args: PyValue[]): PyValue {
    switch (name) {
      case "decode":
        // bytes.decode() -> real UTF-8 text (the string the Arduino printed).
        return new TextDecoder().decode(new Uint8Array(b.__bytes));
      case "rstrip":
      case "lstrip":
      case "strip": {
        const drop = args.length && isBytes(args[0]) ? new Set(args[0].__bytes) : new Set([9, 10, 13, 32]);
        const arr = b.__bytes.slice();
        if (name !== "rstrip") while (arr.length && drop.has(arr[0])) arr.shift();
        if (name !== "lstrip") while (arr.length && drop.has(arr[arr.length - 1])) arr.pop();
        return { __bytes: arr };
      }
      default:
        throw new PyError("AttributeError", `'bytes' object has no attribute '${name}'`);
    }
  }

  // The `random` module's authentic subset: randint/random/uniform/choice.
  // Backed by Math.random(), so results are genuinely unpredictable — exactly
  // what a reaction-timer game needs. Bad args raise Python-style errors.
  private randomCall(name: string, args: PyValue[]): PyValue {
    if (name === "random") return Math.random();
    if (name === "randint") {
      const a = Math.trunc(Number(args[0]));
      const b = Math.trunc(Number(args[1]));
      if (!Number.isFinite(a) || !Number.isFinite(b))
        throw new PyError("TypeError", "randint() requires two integers");
      if (b < a) throw new PyError("ValueError", "empty range for randint()");
      return a + Math.floor(Math.random() * (b - a + 1));
    }
    if (name === "uniform") {
      const a = Number(args[0]);
      const b = Number(args[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b))
        throw new PyError("TypeError", "uniform() requires two numbers");
      return a + Math.random() * (b - a);
    }
    if (name === "choice") {
      const seq = args[0];
      if (!Array.isArray(seq)) throw new PyError("TypeError", "object is not subscriptable");
      if (seq.length === 0) throw new PyError("IndexError", "Cannot choose from an empty sequence");
      return seq[Math.floor(Math.random() * seq.length)];
    }
    throw new PyError("AttributeError", `module 'random' has no attribute '${name}'`);
  }

  // ----- builtins helpers -----
  private range(args: PyValue[]): PyValue[] {
    let start = 0;
    let stop = 0;
    let step = 1;
    if (args.length === 1) stop = Number(args[0]);
    else if (args.length >= 2) {
      start = Number(args[0]);
      stop = Number(args[1]);
      if (args.length >= 3) step = Number(args[2]);
    }
    if (step === 0) throw new PyError("ValueError", "range() arg 3 must not be zero");
    const out: number[] = [];
    if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
    else for (let i = start; i > stop; i += step) out.push(i);
    return out;
  }
  private toInt(v: PyValue): number {
    if (typeof v === "number") return Math.trunc(v);
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string") {
      const n = parseInt(v.trim(), 10);
      if (Number.isNaN(n)) throw new PyError("ValueError", `invalid literal for int(): '${v}'`);
      return n;
    }
    throw new PyError("TypeError", `int() argument must be a string or a number`);
  }
  private minmax(args: PyValue[], min: boolean): PyValue {
    const list = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    if (!list.length) throw new PyError("ValueError", `${min ? "min" : "max"}() arg is an empty sequence`);
    return list.reduce((a, b) => ((min ? Number(b) < Number(a) : Number(b) > Number(a)) ? b : a));
  }
  private strMethod(s: string, name: string, args: PyValue[]): PyValue {
    switch (name) {
      case "upper":
        return s.toUpperCase();
      case "lower":
        return s.toLowerCase();
      case "strip":
        return s.trim();
      case "rstrip":
        return args.length ? trimChars(s, String(args[0]), false, true) : s.replace(/\s+$/, "");
      case "lstrip":
        return args.length ? trimChars(s, String(args[0]), true, false) : s.replace(/^\s+/, "");
      case "encode":
        // str.encode() -> real UTF-8 bytes (what pyserial's .write wants).
        return { __bytes: Array.from(new TextEncoder().encode(s)) };
      case "format":
        return s.replace(/\{\}/g, () => pyStr(args.shift() ?? ""));
      case "split":
        return args.length ? s.split(String(args[0])) : s.trim().split(/\s+/);
      default:
        throw new PyError("AttributeError", `'str' object has no attribute '${name}'`);
    }
  }
  private listMethod(list: PyValue[], name: string, args: PyValue[]): PyValue {
    switch (name) {
      case "append":
        list.push(args[0]);
        return null;
      case "pop":
        return list.pop() ?? null;
      case "count":
        return list.filter((x) => x === args[0]).length;
      default:
        throw new PyError("AttributeError", `'list' object has no attribute '${name}'`);
    }
  }

  private compare(op: string, a: PyValue, b: PyValue): boolean {
    if (op === "==") return this.eq(a, b);
    if (op === "!=") return !this.eq(a, b);
    if (op === "in" || op === "not in") {
      let found = false;
      if (Array.isArray(b)) found = b.some((x) => this.eq(x, a));
      else if (typeof b === "string" && typeof a === "string") found = b.includes(a);
      else throw new PyError("TypeError", "argument is not iterable");
      return op === "in" ? found : !found;
    }
    if (typeof a === "number" && typeof b === "number") {
      if (op === "<") return a < b;
      if (op === ">") return a > b;
      if (op === "<=") return a <= b;
      if (op === ">=") return a >= b;
    }
    if (typeof a === "string" && typeof b === "string") {
      if (op === "<") return a < b;
      if (op === ">") return a > b;
      if (op === "<=") return a <= b;
      if (op === ">=") return a >= b;
    }
    throw new PyError("TypeError", `'${op}' not supported between '${typeName(a)}' and '${typeName(b)}'`);
  }
  private eq(a: PyValue, b: PyValue): boolean {
    if (Array.isArray(a) && Array.isArray(b))
      return a.length === b.length && a.every((x, i) => this.eq(x, b[i]));
    if (isBytes(a) && isBytes(b))
      return a.__bytes.length === b.__bytes.length && a.__bytes.every((x, i) => x === b.__bytes[i]);
    return a === b;
  }

  private binop(op: string, a: PyValue, b: PyValue): PyValue {
    if (op === "+") {
      if (typeof a === "string" && typeof b === "string") return a + b;
      if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
      if (typeof a === "number" && typeof b === "number") return a + b;
      if (typeof a === "string" || typeof b === "string")
        throw new PyError("TypeError", `can only concatenate str (not "${typeName(a === "string" ? b : a)}") to str`);
    }
    const x = Number(a);
    const y = Number(b);
    if (typeof a !== "number" || typeof b !== "number")
      throw new PyError("TypeError", `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`);
    switch (op) {
      case "-":
        return x - y;
      case "*":
        return x * y;
      case "/":
        if (y === 0) throw new PyError("ZeroDivisionError", "division by zero");
        return x / y;
      case "//":
        if (y === 0) throw new PyError("ZeroDivisionError", "integer division or modulo by zero");
        return Math.floor(x / y);
      case "%":
        if (y === 0) throw new PyError("ZeroDivisionError", "integer division or modulo by zero");
        return ((x % y) + y) % y;
      case "**":
        return Math.pow(x, y);
    }
    throw new PyError("SyntaxError", `unknown operator ${op}`);
  }
}

// ---------- Static analysis (for circuit diagnostics) ----------

// A light pass that resolves simple `name = <int>` constants and records which
// GPIO pins the code sets up, writes, reads, or drives with PWM. It never runs
// hardware — it only reports pin usage so validatePython() can cross-check the
// wiring, exactly as analyzeSketch() does for the Arduino course.
export function analyzePython(code: string): PySketchInfo {
  const info: PySketchInfo = {
    outPins: [],
    inPins: [],
    writes: [],
    pwmPins: [],
    reads: [],
    pulls: new Map(),
  };
  let program: Stmt[];
  try {
    program = parse(code);
  } catch (e) {
    info.parseError = e instanceof PyError ? e.display : String(e);
    return info;
  }

  const consts = new Map<string, number>();
  const add = (arr: number[], n: number | null) => {
    if (n !== null && !arr.includes(n)) arr.push(n);
  };
  const resolve = (e: Expr | undefined): number | null => {
    if (!e) return null;
    if (e.k === "num" && Number.isInteger(e.v)) return e.v;
    if (e.k === "name" && consts.has(e.name)) return consts.get(e.name)!;
    return null;
  };

  const walk = (body: Stmt[]) => {
    for (const s of body) {
      if (s.k === "assign" && s.target.k === "name" && s.value.k === "num" && Number.isInteger(s.value.v))
        consts.set(s.target.name, s.value.v);
      if (s.k === "import") {
        if (s.module === "RPi.GPIO") info.mode = info.mode; // touch, no-op
      }
      if (s.k === "expr") walkExpr(s.e);
      if (s.k === "assign") walkExpr(s.value);
      if (s.k === "augassign") walkExpr(s.value);
      if (s.k === "if") {
        for (const b of s.branches) walk(b.body);
        if (s.elseBody) walk(s.elseBody);
      }
      if (s.k === "while") walk(s.body);
      if (s.k === "for") walk(s.body);
      if (s.k === "def") walk(s.def.body);
      if (s.k === "try") {
        walk(s.body);
        for (const h of s.handlers) walk(h.body);
        if (s.elseBody) walk(s.elseBody);
        if (s.finallyBody) walk(s.finallyBody);
      }
    }
  };

  const walkExpr = (e: Expr) => {
    if (e.k === "call") {
      if (e.callee.k === "attr" && e.callee.obj.k === "name") {
        const method = e.callee.name;
        if (method === "setmode") {
          // Accept both GPIO.setmode(GPIO.BCM) (attribute) and setmode(BCM) (name).
          const a = e.args[0];
          const m =
            a?.k === "attr" ? a.name.toUpperCase() : a?.k === "name" ? a.name.toUpperCase() : "";
          if (m.includes("BCM")) info.mode = "BCM";
          else if (m.includes("BOARD")) info.mode = "BOARD";
        }
        if (method === "setup") {
          const pin = resolve(e.args[0]);
          const dirArg = e.args[1];
          const isOut = dirArg?.k === "attr" ? dirArg.name === "OUT" : dirArg?.k === "name" && /OUT/i.test(dirArg.name);
          const isIn = dirArg?.k === "attr" ? dirArg.name === "IN" : dirArg?.k === "name" && /(^|_)IN$/i.test(dirArg.name);
          if (pin !== null) {
            if (isOut) add(info.outPins, pin);
            else if (isIn) add(info.inPins, pin);
            for (const [key, val] of e.kwargs) {
              if (key === "pull_up_down" && val.k === "attr")
                info.pulls.set(pin, val.name === "PUD_UP" ? "UP" : val.name === "PUD_DOWN" ? "DOWN" : "OFF");
            }
          }
        }
        if (method === "output") add(info.writes, resolve(e.args[0]));
        if (method === "input") add(info.reads, resolve(e.args[0]));
        if (method === "PWM") add(info.pwmPins, resolve(e.args[0]));
      }
      // A PWM object's pin is also a driven output; captured above via PWM().
      for (const a of e.args) walkExpr(a);
      for (const [, val] of e.kwargs) walkExpr(val);
      walkExpr(e.callee);
    } else if (e.k === "attr") walkExpr(e.obj);
    else if (e.k === "binary" || e.k === "logic" || e.k === "compare") {
      walkExpr(e.a);
      walkExpr(e.b);
    } else if (e.k === "unary" || e.k === "not") walkExpr(e.e);
    else if (e.k === "index") {
      walkExpr(e.obj);
      walkExpr(e.idx);
    } else if (e.k === "list") for (const it of e.items) walkExpr(it);
  };

  walk(program);
  // PWM pins are driven pins too, so they count as writes for wiring checks.
  for (const p of info.pwmPins) add(info.writes, p);
  return info;
}
