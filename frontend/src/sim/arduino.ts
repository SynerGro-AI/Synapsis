// A small Arduino C++ interpreter covering the Foundation lessons:
// pinMode, digitalWrite, digitalRead, analogRead, delay, map,
// Serial.begin/print/println, int variables, arithmetic, if/else.
// Learners type real sketches; we run them and drive the simulated circuit.

export interface SimIO {
  digitalWrite(pin: number, high: boolean): void;
  digitalRead(pin: number, mode: string | undefined): number;
  analogRead(pin: number): number;
  pulseIn(pin: number): number;
  serial(line: string): void;
  onError(message: string): void;
}

class SimError extends Error {}

// ---------- Tokenizer ----------

interface Token {
  type: "num" | "str" | "id" | "punct";
  value: string;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const s = source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  const puncts = [">=", "<=", "==", "!=", "&&", "||"];
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ type: "num", value: s.slice(i, j) });
      i = j;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      tokens.push({ type: "id", value: s.slice(i, j) });
      i = j;
    } else if (ch === '"') {
      let j = i + 1;
      let value = "";
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\" && s[j + 1] === "n") {
          value += "\n";
          j += 2;
        } else {
          value += s[j++];
        }
      }
      tokens.push({ type: "str", value });
      i = j + 1;
    } else {
      const two = s.slice(i, i + 2);
      if (puncts.includes(two)) {
        tokens.push({ type: "punct", value: two });
        i += 2;
      } else {
        tokens.push({ type: "punct", value: ch });
        i++;
      }
    }
  }
  return tokens;
}

// ---------- AST ----------

type Expr =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "var"; name: string }
  | { kind: "bin"; op: string; left: Expr; right: Expr }
  | { kind: "unary"; op: string; operand: Expr }
  | { kind: "call"; name: string; args: Expr[] };

type Stmt =
  | { kind: "decl"; name: string; init?: Expr }
  | { kind: "assign"; name: string; expr: Expr }
  | { kind: "expr"; expr: Expr }
  | { kind: "if"; cond: Expr; then: Stmt[]; else?: Stmt[] };

interface Program {
  globals: Stmt[];
  setup: Stmt[];
  loop: Stmt[];
}

// ---------- Parser ----------

const TYPE_KEYWORDS = ["int", "long", "float", "double", "bool", "byte", "unsigned"];

class Parser {
  private pos = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new SimError("Unexpected end of sketch — are you missing a closing } or ; ?");
    return t;
  }
  private expect(value: string): void {
    const t = this.next();
    if (t.value !== value)
      throw new SimError(`Expected '${value}' but found '${t.value}'`);
  }
  private at(value: string): boolean {
    return this.peek()?.value === value;
  }
  private eat(value: string): boolean {
    if (this.at(value)) {
      this.pos++;
      return true;
    }
    return false;
  }

  parseProgram(): Program {
    const program: Program = { globals: [], setup: [], loop: [] };
    while (this.peek()) {
      const t = this.peek()!;
      if (t.value === "void") {
        this.next();
        const name = this.next().value;
        this.expect("(");
        this.expect(")");
        const body = this.parseBlock();
        if (name === "setup") program.setup = body;
        else if (name === "loop") program.loop = body;
        // other functions: parsed but ignored for now
      } else if (TYPE_KEYWORDS.includes(t.value)) {
        program.globals.push(this.parseDecl());
      } else {
        throw new SimError(`Unexpected '${t.value}' at the top of the sketch`);
      }
    }
    if (!program.setup.length && !program.loop.length)
      throw new SimError("A sketch needs a void setup() and a void loop()");
    return program;
  }

  private parseDecl(): Stmt {
    while (TYPE_KEYWORDS.includes(this.peek()?.value ?? "")) this.next();
    const name = this.next().value;
    let init: Expr | undefined;
    if (this.eat("=")) init = this.parseExpr();
    this.expect(";");
    return { kind: "decl", name, init };
  }

  private parseBlock(): Stmt[] {
    this.expect("{");
    const stmts: Stmt[] = [];
    while (!this.at("}")) stmts.push(this.parseStmt());
    this.expect("}");
    return stmts;
  }

  private parseStmt(): Stmt {
    const t = this.peek()!;
    if (TYPE_KEYWORDS.includes(t.value)) return this.parseDecl();
    if (t.value === "if") {
      this.next();
      this.expect("(");
      const cond = this.parseExpr();
      this.expect(")");
      const then = this.at("{") ? this.parseBlock() : [this.parseStmt()];
      let elseBranch: Stmt[] | undefined;
      if (this.eat("else"))
        elseBranch = this.at("{")
          ? this.parseBlock()
          : this.at("if")
            ? [this.parseStmt()]
            : [this.parseStmt()];
      return { kind: "if", cond, then, else: elseBranch };
    }
    if (t.value === "for" || t.value === "while")
      throw new SimError(`'${t.value}' loops aren't supported yet — loop() already repeats forever`);

    // assignment or expression statement
    if (
      t.type === "id" &&
      this.tokens[this.pos + 1]?.value === "="
    ) {
      const name = this.next().value;
      this.next(); // =
      const expr = this.parseExpr();
      this.expect(";");
      return { kind: "assign", name, expr };
    }
    const expr = this.parseExpr();
    this.expect(";");
    return { kind: "expr", expr };
  }

  private parseExpr(): Expr {
    return this.parseLogic();
  }
  private parseLogic(): Expr {
    let left = this.parseCompare();
    while (this.at("&&") || this.at("||")) {
      const op = this.next().value;
      left = { kind: "bin", op, left, right: this.parseCompare() };
    }
    return left;
  }
  private parseCompare(): Expr {
    let left = this.parseAdd();
    while ([">", "<", ">=", "<=", "==", "!="].includes(this.peek()?.value ?? "")) {
      const op = this.next().value;
      left = { kind: "bin", op, left, right: this.parseAdd() };
    }
    return left;
  }
  private parseAdd(): Expr {
    let left = this.parseMul();
    while (this.at("+") || this.at("-")) {
      const op = this.next().value;
      left = { kind: "bin", op, left, right: this.parseMul() };
    }
    return left;
  }
  private parseMul(): Expr {
    let left = this.parseUnary();
    while (this.at("*") || this.at("/") || this.at("%")) {
      const op = this.next().value;
      left = { kind: "bin", op, left, right: this.parseUnary() };
    }
    return left;
  }
  private parseUnary(): Expr {
    if (this.at("-") || this.at("!")) {
      const op = this.next().value;
      return { kind: "unary", op, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }
  private parsePrimary(): Expr {
    const t = this.next();
    if (t.type === "num") return { kind: "num", value: Number(t.value) };
    if (t.type === "str") return { kind: "str", value: t.value };
    if (t.value === "(") {
      const expr = this.parseExpr();
      this.expect(")");
      return expr;
    }
    if (t.type === "id") {
      let name = t.value;
      if (this.eat(".")) name += "." + this.next().value; // Serial.begin etc.
      if (this.eat("(")) {
        const args: Expr[] = [];
        if (!this.at(")")) {
          args.push(this.parseExpr());
          while (this.eat(",")) args.push(this.parseExpr());
        }
        this.expect(")");
        return { kind: "call", name, args };
      }
      return { kind: "var", name };
    }
    throw new SimError(`Unexpected '${t.value}'`);
  }
}

// ---------- Interpreter ----------

type Value = number | string;

const CONSTANTS: Record<string, number> = {
  HIGH: 1,
  LOW: 0,
  OUTPUT: 1,
  INPUT: 0,
  INPUT_PULLUP: 2,
  true: 1,
  false: 0,
  A0: 14,
  A1: 15,
  A2: 16,
  A3: 17,
  A4: 18,
  A5: 19,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MODE_NAMES: Record<number, string> = {
  0: "INPUT",
  1: "OUTPUT",
  2: "INPUT_PULLUP",
};

export class ArduinoSim {
  private stopped = false;
  private pinModes = new Map<number, number>();
  private serialStarted = false;
  private serialBuffer = "";
  private startTime = 0;
  private stepsSinceYield = 0;

  stop(): void {
    this.stopped = true;
  }

  get running(): boolean {
    return !this.stopped;
  }

  async run(code: string, io: SimIO): Promise<void> {
    let program: Program;
    try {
      program = new Parser(tokenize(code)).parseProgram();
    } catch (e) {
      io.onError(e instanceof Error ? e.message : String(e));
      this.stopped = true;
      return;
    }

    this.startTime = Date.now();
    const globals = new Map<string, Value>();
    const scopes: Map<string, Value>[] = [globals];

    try {
      await this.execBlock(program.globals, scopes, io);
      await this.execBlock(program.setup, scopes, io);
      while (!this.stopped) {
        const before = Date.now();
        await this.execBlock(program.loop, scopes, io);
        // Pace loop() passes that contain no delay(), like a serial monitor would.
        if (Date.now() - before < 20) await sleep(100);
      }
    } catch (e) {
      if (!this.stopped)
        io.onError(e instanceof Error ? e.message : String(e));
    } finally {
      this.stopped = true;
    }
  }

  private async execBlock(stmts: Stmt[], scopes: Map<string, Value>[], io: SimIO): Promise<void> {
    for (const stmt of stmts) {
      if (this.stopped) return;
      await this.execStmt(stmt, scopes, io);
    }
  }

  private async execStmt(stmt: Stmt, scopes: Map<string, Value>[], io: SimIO): Promise<void> {
    if (++this.stepsSinceYield > 2000) {
      this.stepsSinceYield = 0;
      await sleep(0);
    }
    switch (stmt.kind) {
      case "decl":
        scopes[scopes.length - 1].set(
          stmt.name,
          stmt.init ? await this.evalExpr(stmt.init, scopes, io) : 0,
        );
        return;
      case "assign": {
        for (let i = scopes.length - 1; i >= 0; i--) {
          if (scopes[i].has(stmt.name)) {
            scopes[i].set(stmt.name, await this.evalExpr(stmt.expr, scopes, io));
            return;
          }
        }
        throw new SimError(
          `'${stmt.name}' hasn't been declared — declare it first: int ${stmt.name} = 0;`,
        );
      }
      case "expr":
        await this.evalExpr(stmt.expr, scopes, io);
        return;
      case "if": {
        const cond = await this.evalExpr(stmt.cond, scopes, io);
        const branch = Number(cond) !== 0 ? stmt.then : stmt.else;
        if (branch) {
          scopes.push(new Map());
          await this.execBlock(branch, scopes, io);
          scopes.pop();
        }
        return;
      }
    }
  }

  private async evalExpr(expr: Expr, scopes: Map<string, Value>[], io: SimIO): Promise<Value> {
    switch (expr.kind) {
      case "num":
        return expr.value;
      case "str":
        return expr.value;
      case "var": {
        for (let i = scopes.length - 1; i >= 0; i--)
          if (scopes[i].has(expr.name)) return scopes[i].get(expr.name)!;
        if (expr.name in CONSTANTS) return CONSTANTS[expr.name];
        throw new SimError(`'${expr.name}' hasn't been declared`);
      }
      case "unary": {
        const v = Number(await this.evalExpr(expr.operand, scopes, io));
        return expr.op === "-" ? -v : v === 0 ? 1 : 0;
      }
      case "bin": {
        const l = await this.evalExpr(expr.left, scopes, io);
        const r = await this.evalExpr(expr.right, scopes, io);
        if (typeof l === "string" || typeof r === "string") {
          if (expr.op === "+") return String(l) + String(r);
          throw new SimError(`Can't use '${expr.op}' on text`);
        }
        switch (expr.op) {
          case "+": return l + r;
          case "-": return l - r;
          case "*": return l * r;
          case "/":
            if (r === 0) return 0;
            // C semantics: int/int truncates, anything with a float stays float.
            return Number.isInteger(l) && Number.isInteger(r)
              ? Math.trunc(l / r)
              : l / r;
          case "%": return r === 0 ? 0 : l % r;
          case ">": return l > r ? 1 : 0;
          case "<": return l < r ? 1 : 0;
          case ">=": return l >= r ? 1 : 0;
          case "<=": return l <= r ? 1 : 0;
          case "==": return l === r ? 1 : 0;
          case "!=": return l !== r ? 1 : 0;
          case "&&": return l !== 0 && r !== 0 ? 1 : 0;
          case "||": return l !== 0 || r !== 0 ? 1 : 0;
        }
        throw new SimError(`Unknown operator '${expr.op}'`);
      }
      case "call":
        return this.callBuiltin(expr, scopes, io);
    }
  }

  private async callBuiltin(expr: Extract<Expr, { kind: "call" }>, scopes: Map<string, Value>[], io: SimIO): Promise<Value> {
    const arg = async (i: number) => this.evalExpr(expr.args[i], scopes, io);
    const num = async (i: number) => Number(await arg(i));

    switch (expr.name) {
      case "pinMode": {
        this.pinModes.set(await num(0), await num(1));
        return 0;
      }
      case "digitalWrite": {
        const pin = await num(0);
        if (this.pinModes.get(pin) !== CONSTANTS.OUTPUT)
          throw new SimError(
            `Pin ${pin} is not set as an OUTPUT — add pinMode(${pin}, OUTPUT); in setup()`,
          );
        io.digitalWrite(pin, (await num(1)) !== 0);
        return 0;
      }
      case "digitalRead": {
        const pin = await num(0);
        return io.digitalRead(pin, MODE_NAMES[this.pinModes.get(pin) ?? -1]);
      }
      case "analogRead":
        return io.analogRead(await num(0));
      case "pulseIn": {
        const pin = await num(0);
        return io.pulseIn(pin);
      }
      case "delayMicroseconds":
        // Microseconds are below our simulation resolution; treat as instant.
        await num(0);
        return 0;
      case "analogWrite": {
        const pin = await num(0);
        io.digitalWrite(pin, (await num(1)) > 127);
        return 0;
      }
      case "delay": {
        const ms = await num(0);
        const end = Date.now() + Math.min(ms, 10_000);
        while (!this.stopped && Date.now() < end)
          await sleep(Math.min(50, end - Date.now()));
        return 0;
      }
      case "millis":
        return Date.now() - this.startTime;
      case "map": {
        const [v, inMin, inMax, outMin, outMax] = await Promise.all(
          [0, 1, 2, 3, 4].map(num),
        );
        if (inMax === inMin) return outMin;
        return Math.trunc(((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin);
      }
      case "Serial.begin":
        this.serialStarted = true;
        return 0;
      case "Serial.print":
      case "Serial.println": {
        if (!this.serialStarted)
          throw new SimError(
            "Serial isn't started — add Serial.begin(9600); in setup()",
          );
        const value = expr.args.length ? await arg(0) : "";
        const text =
          typeof value === "number" && !Number.isInteger(value)
            ? value.toFixed(2)
            : String(value);
        this.serialBuffer += text;
        if (expr.name === "Serial.println") {
          io.serial(this.serialBuffer);
          this.serialBuffer = "";
        }
        return 0;
      }
      default:
        throw new SimError(`'${expr.name}()' isn't supported yet`);
    }
  }
}

// ---------- Static sketch analysis (for circuit cross-checking) ----------

export interface SketchAnalysis {
  parseError?: string;
  digitalWrites: number[];
  digitalReads: number[];
  analogReads: number[];
  pulseIns: number[];
  pinModes: Map<number, string>;
}

/**
 * Statically walk the sketch to find which pins the code uses, resolving
 * simple constant variables (int ledPin = 13;). Used by the diagnostics
 * panel to explain code/circuit mismatches without running the sketch.
 */
export function analyzeSketch(code: string): SketchAnalysis {
  const result: SketchAnalysis = {
    digitalWrites: [],
    digitalReads: [],
    analogReads: [],
    pulseIns: [],
    pinModes: new Map(),
  };

  let program: Program;
  try {
    program = new Parser(tokenize(code)).parseProgram();
  } catch (e) {
    result.parseError = e instanceof Error ? e.message : String(e);
    return result;
  }

  const consts = new Map<string, number>();

  function staticEval(expr: Expr): number | null {
    switch (expr.kind) {
      case "num":
        return expr.value;
      case "var":
        if (consts.has(expr.name)) return consts.get(expr.name)!;
        if (expr.name in CONSTANTS) return CONSTANTS[expr.name];
        return null;
      case "unary": {
        const v = staticEval(expr.operand);
        return v === null ? null : expr.op === "-" ? -v : v === 0 ? 1 : 0;
      }
      case "bin": {
        const l = staticEval(expr.left);
        const r = staticEval(expr.right);
        if (l === null || r === null) return null;
        switch (expr.op) {
          case "+": return l + r;
          case "-": return l - r;
          case "*": return l * r;
          case "/": return r === 0 ? 0 : Math.trunc(l / r);
        }
        return null;
      }
      default:
        return null;
    }
  }

  const addUnique = (list: number[], v: number | null) => {
    if (v !== null && !list.includes(v)) list.push(v);
  };

  function visitExpr(expr: Expr): void {
    switch (expr.kind) {
      case "call": {
        const pin = expr.args.length ? staticEval(expr.args[0]) : null;
        if (expr.name === "digitalWrite") addUnique(result.digitalWrites, pin);
        else if (expr.name === "digitalRead") addUnique(result.digitalReads, pin);
        else if (expr.name === "analogRead") addUnique(result.analogReads, pin);
        else if (expr.name === "pulseIn") addUnique(result.pulseIns, pin);
        else if (expr.name === "pinMode" && pin !== null && expr.args.length > 1) {
          const mode = staticEval(expr.args[1]);
          if (mode !== null && MODE_NAMES[mode]) result.pinModes.set(pin, MODE_NAMES[mode]);
        }
        expr.args.forEach(visitExpr);
        return;
      }
      case "bin":
        visitExpr(expr.left);
        visitExpr(expr.right);
        return;
      case "unary":
        visitExpr(expr.operand);
        return;
    }
  }

  function visitStmts(stmts: Stmt[]): void {
    for (const s of stmts) {
      switch (s.kind) {
        case "decl":
          if (s.init) {
            const v = staticEval(s.init);
            if (v !== null) consts.set(s.name, v);
            visitExpr(s.init);
          }
          break;
        case "assign":
          visitExpr(s.expr);
          break;
        case "expr":
          visitExpr(s.expr);
          break;
        case "if":
          visitExpr(s.cond);
          visitStmts(s.then);
          if (s.else) visitStmts(s.else);
          break;
      }
    }
  }

  visitStmts(program.globals);
  visitStmts(program.setup);
  visitStmts(program.loop);
  return result;
}
