// A small Arduino C++ interpreter covering the Foundation lessons:
// pinMode, digitalWrite, digitalRead, analogRead, delay, map,
// Serial.begin/print/println, int variables, arithmetic, if/else.
// Learners type real sketches; we run them and drive the simulated circuit.

export interface SimIO {
  digitalWrite(pin: number, high: boolean): void;
  analogWrite(pin: number, duty: number): void;
  digitalRead(pin: number, mode: string | undefined): number;
  analogRead(pin: number): number;
  pulseIn(pin: number): number;
  dhtRead(pin: number, kind: "temp" | "humidity"): number;
  /** Read a BNO055 quantity/axis live (orientation/acceleration/gyro/magnetic/temp). */
  imuRead(quantity: string, axis: string): number;
  /** Read a component (w/x/y/z) of the BNO055's fused unit quaternion. */
  imuReadQuat(axis: string): number;
  /** 1 when a powered, correctly-wired BNO055 is on the I2C bus, else 0. */
  imuPresent(): number;
  /** Next IR command byte waiting on a receiver whose DAT reaches `pin`, or -1. */
  irDecode(pin: number): number;
  /** Advance a stepper driven by `pins` by `steps` out of `stepsPerRev`. */
  stepperStep(pins: number[], steps: number, stepsPerRev: number): void;
  /** Load an 8-bit value into a shift register via its data + shift-clock pins. */
  shiftOut(dataPin: number, clockPin: number, value: number): void;
  servoWrite(pin: number, angle: number): void;
  tone(pin: number, freq: number): void;
  noTone(pin: number): void;
  lcd(op: "clear" | "setCursor" | "print", a?: number | string, b?: number): void;
  serial(line: string): void;
  onError(message: string): void;
}

class SimError extends Error {}

// ---------- Tokenizer ----------

interface Token {
  type: "num" | "str" | "id" | "punct";
  value: string;
}

/**
 * Expand object-like `#define NAME value` macros before tokenizing. The
 * tokenizer strips every # line, so without this a `#define IR_RECEIVE_PIN 7`
 * would vanish and later references would look undeclared. Only simple
 * (non-function) macros are handled; the value is wrapped in parens so it
 * stays a single operand in expressions.
 */
function preprocess(source: string): string {
  const macros: [string, string][] = [];
  const re = /^[ \t]*#[ \t]*define[ \t]+([A-Za-z_]\w*)[ \t]+([^\n]+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) macros.push([m[1], m[2].trim()]);
  let out = source;
  for (const [name, value] of macros)
    out = out.replace(new RegExp(`\\b${name}\\b`, "g"), `(${value})`);
  return out;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const s = source
    .replace(/^[ \t]*#[^\n]*/gm, "") // preprocessor lines (#include <Servo.h>)
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  const puncts = [">=", "<=", "==", "!=", "&&", "||", "++", "--", "+=", "-=", "::"];
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      if (ch === "0" && (s[j + 1] === "x" || s[j + 1] === "X")) {
        // Hex literal (I2C addresses, register bases): 0x28.
        j += 2;
        while (j < s.length && /[0-9a-fA-F]/.test(s[j])) j++;
      } else {
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
      }
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
  | { kind: "objdecl"; type: string; name: string; args: Expr[] }
  | { kind: "assign"; name: string; op: "=" | "+=" | "-="; expr: Expr }
  | { kind: "expr"; expr: Expr }
  | { kind: "if"; cond: Expr; then: Stmt[]; else?: Stmt[] }
  | { kind: "while"; cond: Expr; body: Stmt[] }
  | { kind: "for"; init?: Stmt; cond?: Expr; post?: Stmt; body: Stmt[] }
  | { kind: "block"; body: Stmt[] };

interface Program {
  globals: Stmt[];
  setup: Stmt[];
  loop: Stmt[];
}

// ---------- Parser ----------

const TYPE_KEYWORDS = [
  "int", "long", "float", "double", "bool", "byte", "unsigned", "char",
  "uint8_t", "uint16_t", "uint32_t", "int8_t", "int16_t", "int32_t", "size_t",
];
const OBJECT_TYPES = ["Servo", "LiquidCrystal", "DHT", "Stepper", "Adafruit_BNO055", "sensors_event_t", "imu::Quaternion"];

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
  /** The declaration type at the cursor, joining a scoped name like imu::Quaternion. */
  private typeNameAhead(): string {
    const t = this.peek();
    if (!t) return "";
    if (
      this.tokens[this.pos + 1]?.value === "::" &&
      this.tokens[this.pos + 2]?.type === "id"
    ) {
      return t.value + "::" + this.tokens[this.pos + 2].value;
    }
    return t.value;
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
    let sawSetup = false;
    let sawLoop = false;
    while (this.peek()) {
      const t = this.peek()!;
      if (t.value === "void") {
        this.next();
        const name = this.next().value;
        this.expect("(");
        this.expect(")");
        const body = this.parseBlock();
        if (name === "setup") {
          program.setup = body;
          sawSetup = true;
        } else if (name === "loop") {
          program.loop = body;
          sawLoop = true;
        }
        // other functions: parsed but ignored for now
      } else if (TYPE_KEYWORDS.includes(t.value)) {
        program.globals.push(this.parseDecl());
      } else if (OBJECT_TYPES.includes(this.typeNameAhead())) {
        program.globals.push(this.parseObjDecl());
      } else {
        throw new SimError(`Unexpected '${t.value}' at the top of the sketch`);
      }
    }
    if (!sawSetup && !sawLoop)
      throw new SimError("A sketch needs a void setup() and a void loop()");
    return program;
  }

  private parseDecl(): Stmt {
    while (TYPE_KEYWORDS.includes(this.peek()?.value ?? "")) this.next();
    // Support comma lists: uint8_t system, gyro, accel, mag = 0;
    const decls: Stmt[] = [];
    do {
      const name = this.next().value;
      let init: Expr | undefined;
      if (this.eat("=")) init = this.parseExpr();
      decls.push({ kind: "decl", name, init });
    } while (this.eat(","));
    this.expect(";");
    return decls.length === 1 ? decls[0] : { kind: "block", body: decls };
  }

  private parseBlock(): Stmt[] {
    this.expect("{");
    const stmts: Stmt[] = [];
    while (!this.at("}")) stmts.push(this.parseStmt());
    this.expect("}");
    return stmts;
  }

  private parseObjDecl(): Stmt {
    let type = this.next().value;
    if (this.eat("::")) type += "::" + this.next().value; // scoped: imu::Quaternion
    const name = this.next().value;
    const args: Expr[] = [];
    if (this.eat("=")) {
      // Copy-init. Either a constructor call `Type(args)` whose args we keep,
      // or any other initializer (e.g. `bno.getQuat()`) which we parse and
      // discard — the object's components are read live on each access.
      if (this.peek()?.type === "id" && this.tokens[this.pos + 1]?.value === "(") {
        this.next(); // the class name; fall through to the "(" arg parse
      } else {
        this.parseExpr();
        this.expect(";");
        return { kind: "objdecl", type, name, args };
      }
    }
    if (this.eat("(")) {
      if (!this.at(")")) {
        args.push(this.parseExpr());
        while (this.eat(",")) args.push(this.parseExpr());
      }
      this.expect(")");
    }
    this.expect(";");
    return { kind: "objdecl", type, name, args };
  }

  private blockOrStmt(): Stmt[] {
    return this.at("{") ? this.parseBlock() : [this.parseStmt()];
  }

  /** name = expr | name += expr | name -= expr | name++ | name-- */
  private parseAssignLike(consumeSemi: boolean): Stmt {
    const name = this.next().value;
    const op = this.next().value;
    let stmt: Stmt;
    if (op === "++")
      stmt = { kind: "assign", name, op: "+=", expr: { kind: "num", value: 1 } };
    else if (op === "--")
      stmt = { kind: "assign", name, op: "-=", expr: { kind: "num", value: 1 } };
    else if (op === "=" || op === "+=" || op === "-=")
      stmt = { kind: "assign", name, op, expr: this.parseExpr() };
    else throw new SimError(`Expected an assignment after '${name}' but found '${op}'`);
    if (consumeSemi) this.expect(";");
    return stmt;
  }

  private parseStmt(): Stmt {
    const t = this.peek()!;
    if (t.value === ";") {
      // Empty statement — e.g. the body of the Adafruit `while (1);` halt.
      this.next();
      return { kind: "expr", expr: { kind: "num", value: 0 } };
    }
    if (TYPE_KEYWORDS.includes(t.value)) return this.parseDecl();
    if (OBJECT_TYPES.includes(this.typeNameAhead())) return this.parseObjDecl();
    if (t.value === "if") {
      this.next();
      this.expect("(");
      const cond = this.parseExpr();
      this.expect(")");
      const then = this.blockOrStmt();
      let elseBranch: Stmt[] | undefined;
      if (this.eat("else")) elseBranch = this.blockOrStmt();
      return { kind: "if", cond, then, else: elseBranch };
    }
    if (t.value === "while") {
      this.next();
      this.expect("(");
      const cond = this.parseExpr();
      this.expect(")");
      return { kind: "while", cond, body: this.blockOrStmt() };
    }
    if (t.value === "for") {
      this.next();
      this.expect("(");
      let init: Stmt | undefined;
      if (!this.eat(";"))
        init = TYPE_KEYWORDS.includes(this.peek()?.value ?? "")
          ? this.parseDecl()
          : this.parseAssignLike(true);
      let cond: Expr | undefined;
      if (!this.at(";")) cond = this.parseExpr();
      this.expect(";");
      let post: Stmt | undefined;
      if (!this.at(")")) post = this.parseAssignLike(false);
      this.expect(")");
      return { kind: "for", init, cond, post, body: this.blockOrStmt() };
    }

    // assignment or expression statement
    if (
      t.type === "id" &&
      ["=", "+=", "-=", "++", "--"].includes(this.tokens[this.pos + 1]?.value)
    )
      return this.parseAssignLike(true);
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
    if (this.at("-") || this.at("!") || this.at("&")) {
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
      // Scoped enum: Adafruit_BNO055::VECTOR_ACCELEROMETER → the member name
      // (globally unique in CONSTANTS).
      if (this.eat("::")) return { kind: "var", name: this.next().value };
      // Serial.begin, lcd.print, IrReceiver.decodedIRData.command — allow any depth.
      while (this.eat(".")) name += "." + this.next().value;
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
  DHT11: 11,
  DHT22: 22,
  ENABLE_LED_FEEDBACK: 1,
  DISABLE_LED_FEEDBACK: 0,
  LSBFIRST: 0,
  MSBFIRST: 1,
  // Serial.print number-base format specifiers (Arduino Print.h).
  BIN: 2,
  OCT: 8,
  DEC: 10,
  HEX: 16,
  PI: Math.PI,
  // adafruit_vector_type_t — real BNO055 register bases (Adafruit_BNO055.h).
  VECTOR_ACCELEROMETER: 0x08,
  VECTOR_MAGNETOMETER: 0x0e,
  VECTOR_GYROSCOPE: 0x14,
  VECTOR_EULER: 0x1a,
  VECTOR_LINEARACCEL: 0x28,
  VECTOR_GRAVITY: 0x2e,
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
  private stepsSinceDelay = 0;
  private objects = new Map<
    string,
    { type: string; args: number[]; pin?: number; rpm?: number; accelMode?: string }
  >();
  // IrReceiver is a library-provided global singleton (not a user object).
  private irReceivePin = -1;
  private irCommand = 0;

  stop(): void {
    this.stopped = true;
  }

  get running(): boolean {
    return !this.stopped;
  }

  async run(code: string, io: SimIO): Promise<void> {
    let program: Program;
    try {
      program = new Parser(tokenize(preprocess(code))).parseProgram();
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
    if (++this.stepsSinceDelay > 300_000)
      throw new SimError(
        "Your sketch seems stuck in an endless loop — add a delay() so the simulation can breathe.",
      );
    switch (stmt.kind) {
      case "decl":
        scopes[scopes.length - 1].set(
          stmt.name,
          stmt.init ? await this.evalExpr(stmt.init, scopes, io) : 0,
        );
        return;
      case "block":
        await this.execBlock(stmt.body, scopes, io);
        return;
      case "objdecl": {
        const args: number[] = [];
        for (const a of stmt.args) args.push(Number(await this.evalExpr(a, scopes, io)));
        this.objects.set(stmt.name, { type: stmt.type, args });
        return;
      }
      case "assign": {
        for (let i = scopes.length - 1; i >= 0; i--) {
          if (scopes[i].has(stmt.name)) {
            const value = await this.evalExpr(stmt.expr, scopes, io);
            if (stmt.op === "=") scopes[i].set(stmt.name, value);
            else {
              const old = Number(scopes[i].get(stmt.name));
              scopes[i].set(stmt.name, stmt.op === "+=" ? old + Number(value) : old - Number(value));
            }
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
      case "while": {
        while (!this.stopped && Number(await this.evalExpr(stmt.cond, scopes, io)) !== 0) {
          scopes.push(new Map());
          await this.execBlock(stmt.body, scopes, io);
          scopes.pop();
        }
        return;
      }
      case "for": {
        scopes.push(new Map());
        if (stmt.init) await this.execStmt(stmt.init, scopes, io);
        while (
          !this.stopped &&
          (stmt.cond === undefined ||
            Number(await this.evalExpr(stmt.cond, scopes, io)) !== 0)
        ) {
          scopes.push(new Map());
          await this.execBlock(stmt.body, scopes, io);
          scopes.pop();
          if (stmt.post) await this.execStmt(stmt.post, scopes, io);
        }
        scopes.pop();
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
        if (expr.name === "IrReceiver.decodedIRData.command") return this.irCommand;
        // BNO055 struct member read: event.orientation.x → live sensor value
        // (orientation = Euler °, acceleration = m/s², gyro = rad/s, magnetic = µT).
        const member = expr.name.match(
          /^(\w+)\.(orientation|acceleration|gyro|magnetic)\.([xyz])$/,
        );
        if (member) {
          const obj = this.objects.get(member[1]);
          if (obj?.type === "sensors_event_t") {
            // acceleration resolves to raw / linear-accel / gravity per the
            // VECTOR_* type passed to the matching getEvent() call.
            const quantity =
              member[2] === "acceleration" ? obj.accelMode ?? "acceleration" : member[2];
            return io.imuRead(quantity, member[3]);
          }
        }
        for (let i = scopes.length - 1; i >= 0; i--)
          if (scopes[i].has(expr.name)) return scopes[i].get(expr.name)!;
        if (expr.name in CONSTANTS) return CONSTANTS[expr.name];
        throw new SimError(`'${expr.name}' hasn't been declared`);
      }
      case "unary": {
        // Address-of (&event, &Wire, &system): our sensor models read struct
        // members live and write back by name, so the pointer value is unused.
        if (expr.op === "&") return 0;
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

    // Object methods: myServo.write(...), lcd.print(...)
    const dot = expr.name.indexOf(".");
    if (dot > 0) {
      const objName = expr.name.slice(0, dot);
      const method = expr.name.slice(dot + 1);
      const obj = this.objects.get(objName);
      if (obj) {
        if (obj.type === "Servo") {
          switch (method) {
            case "attach":
              obj.pin = await num(0);
              return 0;
            case "write": {
              if (obj.pin === undefined)
                throw new SimError(
                  `${objName}.attach(pin) must be called in setup() before ${objName}.write()`,
                );
              const angle = Math.max(0, Math.min(180, await num(0)));
              io.servoWrite(obj.pin, angle);
              obj.args = [angle];
              return 0;
            }
            case "read":
              return obj.args[0] ?? 0;
          }
        }
        if (obj.type === "LiquidCrystal") {
          switch (method) {
            case "begin":
              return 0;
            case "clear":
              io.lcd("clear");
              return 0;
            case "setCursor":
              io.lcd("setCursor", await num(0), await num(1));
              return 0;
            case "print": {
              const v = expr.args.length ? await arg(0) : "";
              io.lcd(
                "print",
                typeof v === "number" && !Number.isInteger(v)
                  ? v.toFixed(2)
                  : String(v),
              );
              return 0;
            }
          }
        }
        if (obj.type === "DHT") {
          // DHT dht(pin, DHT11); — args[0] is the data pin.
          switch (method) {
            case "begin":
              return 0;
            case "readTemperature":
              return io.dhtRead(obj.args[0], "temp");
            case "readHumidity":
              return io.dhtRead(obj.args[0], "humidity");
          }
        }
        if (obj.type === "Stepper") {
          // Stepper myStepper(stepsPerRev, p1, p2, p3, p4);
          const stepsPerRev = obj.args[0] || 200;
          const pins = obj.args.slice(1);
          switch (method) {
            case "setSpeed":
              obj.rpm = Math.max(1, await num(0));
              return 0;
            case "step": {
              const steps = Math.trunc(await num(0));
              const rpm = obj.rpm ?? 15;
              const total = Math.abs(steps);
              const dir = Math.sign(steps) || 1;
              // step() blocks in the real library; animate the sweep in chunks
              // so the shaft arrow visibly turns instead of snapping.
              const chunk = Math.max(1, Math.ceil(total / 60));
              const msPerStep = 60000 / (rpm * stepsPerRev);
              let moved = 0;
              while (moved < total && !this.stopped) {
                const n = Math.min(chunk, total - moved);
                io.stepperStep(pins, dir * n, stepsPerRev);
                moved += n;
                this.stepsSinceDelay = 0;
                await sleep(Math.min(120, Math.max(1, msPerStep * n)));
              }
              return 0;
            }
          }
        }
        if (obj.type === "Adafruit_BNO055") {
          switch (method) {
            case "begin":
              return io.imuPresent();
            case "getEvent": {
              // getEvent(&event) / getEvent(&event, TYPE): members are read
              // live, so we just report success (the real call returns bool).
              // Record which accel family the caller asked for so a later
              // event.acceleration read resolves to raw / linear / gravity.
              const evName =
                expr.args[0]?.kind === "unary" &&
                expr.args[0].op === "&" &&
                expr.args[0].operand.kind === "var"
                  ? expr.args[0].operand.name
                  : undefined;
              const evObj = evName ? this.objects.get(evName) : undefined;
              if (evObj) {
                if (expr.args.length > 1) {
                  const type = Number(await this.evalExpr(expr.args[1], scopes, io));
                  evObj.accelMode =
                    type === CONSTANTS.VECTOR_LINEARACCEL
                      ? "linearaccel"
                      : type === CONSTANTS.VECTOR_GRAVITY
                        ? "gravity"
                        : "acceleration";
                } else {
                  evObj.accelMode = "acceleration";
                }
              }
              return 1;
            }
            case "getTemp":
              return io.imuRead("temp", "");
            case "getCalibration": {
              // getCalibration(&system, &gyro, &accel, &mag): write 3 (fully
              // calibrated in the sim) back into each referenced variable.
              for (const a of expr.args) {
                if (a.kind === "unary" && a.op === "&" && a.operand.kind === "var") {
                  const target = a.operand.name;
                  for (let i = scopes.length - 1; i >= 0; i--)
                    if (scopes[i].has(target)) {
                      scopes[i].set(target, 3);
                      break;
                    }
                }
              }
              return 0;
            }
            case "isFullyCalibrated":
              return 1;
            case "getQuat":
              // Returns an imu::Quaternion; the object's components are read
              // live via quat.w()/.x()/.y()/.z(), so this is just a marker.
              return 0;
            case "getSystemStatus": {
              // getSystemStatus(&status, &selfTest, &error): write back the
              // authentic datasheet values for a healthy fused sensor —
              // status 5 (sensor-fusion running), self-test 0x0F (all four
              // chips passed), error 0 (none).
              const writes = [5, 0x0f, 0];
              expr.args.forEach((a, i) => {
                if (a.kind === "unary" && a.op === "&" && a.operand.kind === "var") {
                  const target = a.operand.name;
                  for (let s = scopes.length - 1; s >= 0; s--)
                    if (scopes[s].has(target)) {
                      scopes[s].set(target, writes[i] ?? 0);
                      break;
                    }
                }
              });
              return 0;
            }
            case "setExtCrystalUse":
            case "setMode":
            case "setAxisRemap":
            case "setAxisSign":
              return 0;
          }
        }
        if (obj.type === "imu::Quaternion") {
          // quat.w() / .x() / .y() / .z() → the live fused unit quaternion.
          if (method === "w" || method === "x" || method === "y" || method === "z") {
            return io.imuReadQuat(method);
          }
        }
        throw new SimError(`'${objName}.${method}()' isn't supported yet`);
      }
      // IrReceiver is a global singleton from the IRremote library.
      if (objName === "IrReceiver") {
        switch (method) {
          case "begin":
            this.irReceivePin = await num(0);
            return 0;
          case "decode": {
            const code = io.irDecode(this.irReceivePin);
            if (code >= 0) {
              this.irCommand = code;
              return 1;
            }
            return 0;
          }
          case "resume":
          case "end":
            return 0;
        }
        throw new SimError(`'IrReceiver.${method}()' isn't supported yet`);
      }
    }

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
      case "tone": {
        const pin = await num(0);
        const freq = await num(1);
        io.tone(pin, freq);
        // tone(pin, freq, duration): the note plays for `duration` ms then stops.
        if (expr.args.length >= 3) {
          const dur = await num(2);
          const end = Date.now() + Math.min(dur, 10_000);
          while (!this.stopped && Date.now() < end)
            await sleep(Math.min(50, end - Date.now()));
          io.noTone(pin);
        }
        return 0;
      }
      case "noTone": {
        io.noTone(await num(0));
        return 0;
      }
      case "delayMicroseconds":
        // Microseconds are below our simulation resolution; treat as instant.
        await num(0);
        return 0;
      case "analogWrite": {
        const pin = await num(0);
        const duty = Math.max(0, Math.min(255, await num(1)));
        io.analogWrite(pin, duty);
        return 0;
      }
      case "shiftOut": {
        // shiftOut(dataPin, clockPin, bitOrder, value): clock 8 bits out.
        const dataPin = await num(0);
        const clockPin = await num(1);
        const order = await num(2); // MSBFIRST=1, LSBFIRST=0
        let value = (await num(3)) & 0xff;
        if (order === 0) {
          // LSBFIRST: the first bit out (bit0) lands on Q7, so reverse the
          // byte to keep the simulator's "bit i drives Qi" convention.
          let r = 0;
          for (let i = 0; i < 8; i++) r |= ((value >> i) & 1) << (7 - i);
          value = r;
        }
        io.shiftOut(dataPin, clockPin, value);
        return 0;
      }
      case "delay": {
        this.stepsSinceDelay = 0;
        const ms = await num(0);
        const end = Date.now() + Math.min(ms, 10_000);
        while (!this.stopped && Date.now() < end)
          await sleep(Math.min(50, end - Date.now()));
        return 0;
      }
      case "millis":
        return Date.now() - this.startTime;
      // Standard Arduino/avr-libc math. Trig works in radians (convert with
      // * 180 / PI); atan2(y, x) gives the full -PI..PI angle. Used to work
      // tilt out of the accelerometer and heading out of the magnetometer.
      case "abs":
      case "fabs":
        return Math.abs(await num(0));
      case "sqrt":
        return Math.sqrt(await num(0));
      case "sin":
        return Math.sin(await num(0));
      case "cos":
        return Math.cos(await num(0));
      case "tan":
        return Math.tan(await num(0));
      case "atan2":
        return Math.atan2(await num(0), await num(1));
      case "atan":
        return Math.atan(await num(0));
      case "asin":
        return Math.asin(await num(0));
      case "acos":
        return Math.acos(await num(0));
      case "pow":
        return Math.pow(await num(0), await num(1));
      case "map": {
        const [v, inMin, inMax, outMin, outMax] = await Promise.all(
          [0, 1, 2, 3, 4].map(num),
        );
        if (inMax === inMin) return outMin;
        return Math.trunc(((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin);
      }
      case "constrain": {
        // Arduino constrain(x, lo, hi): clamp x to the [lo, hi] range. Used to
        // keep a control output inside the servo's 0..180° travel.
        const [x, lo, hi] = await Promise.all([0, 1, 2].map(num));
        return Math.min(hi, Math.max(lo, x));
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
        let text: string;
        if (typeof value === "number" && expr.args.length > 1) {
          // Serial.print(n, BASE) — format the integer in the given base,
          // uppercase and unpadded, exactly as Arduino's Print.h does.
          const base = await arg(1);
          text = Math.trunc(value).toString(Number(base)).toUpperCase();
        } else {
          text =
            typeof value === "number" && !Number.isInteger(value)
              ? value.toFixed(2)
              : String(value);
        }
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
  analogWrites: number[];
  pulseIns: number[];
  servoPins: number[];
  tonePins: number[];
  lcdPins: number[];
  dhtPins: number[];
  irPins: number[];
  stepperPins: number[];
  shiftDataPins: number[];
  shiftClockPins: number[];
  usesImu: boolean;
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
    analogWrites: [],
    pulseIns: [],
    servoPins: [],
    tonePins: [],
    lcdPins: [],
    dhtPins: [],
    irPins: [],
    stepperPins: [],
    shiftDataPins: [],
    shiftClockPins: [],
    usesImu: false,
    pinModes: new Map(),
  };

  let program: Program;
  try {
    program = new Parser(tokenize(preprocess(code))).parseProgram();
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
        else if (expr.name === "analogWrite") addUnique(result.analogWrites, pin);
        else if (expr.name === "pulseIn") addUnique(result.pulseIns, pin);
        else if (expr.name === "tone") addUnique(result.tonePins, pin);
        else if (expr.name === "IrReceiver.begin") addUnique(result.irPins, pin);
        else if (expr.name === "shiftOut") {
          addUnique(result.shiftDataPins, pin);
          if (expr.args.length > 1) addUnique(result.shiftClockPins, staticEval(expr.args[1]));
        } else if (expr.name.endsWith(".attach")) addUnique(result.servoPins, pin);
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
        case "objdecl":
          if (s.type === "LiquidCrystal")
            result.lcdPins = s.args
              .map(staticEval)
              .filter((v): v is number => v !== null);
          else if (s.type === "DHT" && s.args.length)
            addUnique(result.dhtPins, staticEval(s.args[0]));
          else if (s.type === "Stepper")
            result.stepperPins = s.args
              .slice(1)
              .map(staticEval)
              .filter((v): v is number => v !== null);
          else if (s.type === "Adafruit_BNO055") result.usesImu = true;
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
        case "while":
          visitExpr(s.cond);
          visitStmts(s.body);
          break;
        case "for":
          if (s.init) visitStmts([s.init]);
          if (s.cond) visitExpr(s.cond);
          if (s.post) visitStmts([s.post]);
          visitStmts(s.body);
          break;
        case "block":
          visitStmts(s.body);
          break;
      }
    }
  }

  visitStmts(program.globals);
  visitStmts(program.setup);
  visitStmts(program.loop);
  return result;
}
