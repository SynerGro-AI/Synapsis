// A small, genuine math-expression engine so the Numerical Methods Lab runs fully
// offline — the same way the graphing calculator does. It parses an expression
// like "x^2 - 2*x + 1" or "sin(x)/x" into an AST and evaluates it for real.
// No eval(), no network: a hand-written tokenizer + recursive-descent parser.

export type Scope = Record<string, number>;

interface Token {
  t: "num" | "name" | "op" | "lparen" | "rparen" | "comma";
  v: string;
}

const FUNCS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  ln: Math.log,
  log: (x: number) => Math.log10(x),
  log2: (x: number) => Math.log2(x),
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
  pow: (a: number, b: number) => a ** b,
};

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "const"; v: number }
  | { k: "unary"; op: string; a: Node }
  | { k: "binary"; op: string; a: Node; b: Node }
  | { k: "call"; name: string; args: Node[] };

export class ExprError extends Error {}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = src;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      if (j < s.length && (s[j] === "e" || s[j] === "E")) {
        j++;
        if (s[j] === "+" || s[j] === "-") j++;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      const text = s.slice(i, j);
      if (!/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))
        throw new ExprError(`Bad number "${text}"`);
      tokens.push({ t: "num", v: text });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      tokens.push({ t: "name", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/%^".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ t: "lparen", v: c });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ t: "rparen", v: c });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ t: "comma", v: c });
      i++;
      continue;
    }
    throw new ExprError(`Unexpected character "${c}"`);
  }
  return tokens;
}

class Parser {
  private p = 0;
  private readonly tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Node {
    const node = this.addsub();
    if (this.p < this.tokens.length)
      throw new ExprError(`Unexpected "${this.tokens[this.p].v}"`);
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.p];
  }

  private eat(): Token {
    const tok = this.tokens[this.p++];
    if (!tok) throw new ExprError("Unexpected end of expression");
    return tok;
  }

  private addsub(): Node {
    let a = this.muldiv();
    for (;;) {
      const tok = this.peek();
      if (tok?.t === "op" && (tok.v === "+" || tok.v === "-")) {
        this.p++;
        a = { k: "binary", op: tok.v, a, b: this.muldiv() };
      } else return a;
    }
  }

  private muldiv(): Node {
    let a = this.unary();
    for (;;) {
      const tok = this.peek();
      if (tok?.t === "op" && (tok.v === "*" || tok.v === "/" || tok.v === "%")) {
        this.p++;
        a = { k: "binary", op: tok.v, a, b: this.unary() };
      } else return a;
    }
  }

  private unary(): Node {
    const tok = this.peek();
    if (tok?.t === "op" && (tok.v === "+" || tok.v === "-")) {
      this.p++;
      return { k: "unary", op: tok.v, a: this.unary() };
    }
    return this.power();
  }

  private power(): Node {
    const base = this.primary();
    const tok = this.peek();
    if (tok?.t === "op" && tok.v === "^") {
      this.p++;
      // right-associative, and binds tighter than unary on the right (2^-1)
      return { k: "binary", op: "^", a: base, b: this.unary() };
    }
    return base;
  }

  private primary(): Node {
    const tok = this.eat();
    if (tok.t === "num") return { k: "num", v: Number(tok.v) };
    if (tok.t === "lparen") {
      const node = this.addsub();
      const close = this.eat();
      if (close.t !== "rparen") throw new ExprError('Expected ")"');
      return node;
    }
    if (tok.t === "name") {
      const next = this.peek();
      if (next?.t === "lparen") {
        this.p++;
        const args: Node[] = [];
        if (this.peek()?.t !== "rparen") {
          args.push(this.addsub());
          while (this.peek()?.t === "comma") {
            this.p++;
            args.push(this.addsub());
          }
        }
        const close = this.eat();
        if (close.t !== "rparen") throw new ExprError('Expected ")"');
        if (!(tok.v in FUNCS)) throw new ExprError(`Unknown function "${tok.v}"`);
        return { k: "call", name: tok.v, args };
      }
      if (tok.v in CONSTS) return { k: "const", v: CONSTS[tok.v] };
      return { k: "var", name: tok.v };
    }
    throw new ExprError(`Unexpected "${tok.v}"`);
  }
}

function evalNode(node: Node, scope: Scope): number {
  switch (node.k) {
    case "num":
    case "const":
      return node.v;
    case "var": {
      if (node.name in scope) return scope[node.name];
      throw new ExprError(`Unknown variable "${node.name}"`);
    }
    case "unary": {
      const a = evalNode(node.a, scope);
      return node.op === "-" ? -a : a;
    }
    case "binary": {
      const a = evalNode(node.a, scope);
      const b = evalNode(node.b, scope);
      switch (node.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "%":
          return a % b;
        case "^":
          return a ** b;
        default:
          throw new ExprError(`Bad operator ${node.op}`);
      }
    }
    case "call": {
      const fn = FUNCS[node.name];
      const args = node.args.map((arg) => evalNode(arg, scope));
      return fn(...args);
    }
  }
}

export interface CompiledExpr {
  /** Evaluate for a given variable value (defaults to variable name "x"). */
  eval(value: number, varName?: string): number;
  /** Evaluate against a full scope of named variables. */
  evalScope(scope: Scope): number;
  source: string;
}

/** Parse an expression once; the returned object evaluates it for real, repeatedly. */
export function compileExpression(source: string): CompiledExpr {
  const trimmed = source.trim();
  if (!trimmed) throw new ExprError("Enter an expression, e.g. x^2");
  const ast = new Parser(tokenize(trimmed)).parse();
  return {
    source: trimmed,
    eval(value: number, varName = "x") {
      return evalNode(ast, { [varName]: value });
    },
    evalScope(scope: Scope) {
      return evalNode(ast, scope);
    },
  };
}

export const SUPPORTED_FUNCTIONS = Object.keys(FUNCS);
export const SUPPORTED_CONSTANTS = Object.keys(CONSTS);
