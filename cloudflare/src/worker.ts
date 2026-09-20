// Synapsis API on Cloudflare Workers + D1.
// Mirrors the .NET backend contract exactly (same endpoints, same JSON,
// same PBKDF2 password format "iterations:SALTHEX:HASHHEX"), so the
// frontend cannot tell the difference between local dev and synapsis.school.

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
}

// Minimal ambient types so this file stands alone without workers-types.
interface D1Database {
  prepare(sql: string): D1Statement;
}
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
interface Fetcher {
  fetch(request: Request | string): Promise<Response>;
}

const COOKIE = "synapsys_auth";
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000;

// ---------- crypto helpers ----------

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as ArrayBuffer, iterations },
    key,
    256,
  );
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_ITERATIONS}:${toHex(salt.buffer as ArrayBuffer)}:${toHex(hash)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const iterations = Number(parts[0]);
  if (!Number.isFinite(iterations)) return false;
  const expected = fromHex(parts[2]);
  const actual = new Uint8Array(await pbkdf2(password, fromHex(parts[1]), iterations));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

// ---------- session cookie (HMAC-signed) ----------

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

interface Session {
  id: number;
  username: string;
}

async function makeCookie(env: Env, id: number, username: string): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = btoa(JSON.stringify({ id, username, exp }));
  const sig = await hmac(env.SESSION_SECRET, payload);
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

async function readSession(env: Env, request: Request): Promise<Session | null> {
  const cookies = request.headers.get("Cookie") ?? "";
  const match = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!match) return null;
  const [payload, sig] = match[1].split(".");
  if (!payload || !sig) return null;
  if ((await hmac(env.SESSION_SECRET, payload)) !== sig) return null;
  try {
    const data = JSON.parse(atob(payload));
    if (typeof data.id !== "number" || typeof data.username !== "string") return null;
    if (Date.now() > data.exp) return null;
    return { id: data.id, username: data.username };
  } catch {
    return null;
  }
}

// ---------- helpers ----------

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const error = (message: string, status: number) => json({ error: message }, status);

// ---------- schema (self-migrating) ----------
// D1 never runs schema.sql for us, so ensure the tables the handlers assume
// actually exist before we touch them. CREATE TABLE IF NOT EXISTS is idempotent
// and never drops data, so this is safe to run against a live DB — with or
// without existing rows. Mirrors cloudflare/schema.sql and backend Db.cs.
let schemaReady = false;
async function ensureSchema(env: Env): Promise<void> {
  if (schemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      current_lesson INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS progress (
      user_id INTEGER NOT NULL REFERENCES users(id),
      lesson_id INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      sketch TEXT,
      circuit TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, lesson_id)
    )`,
  ).run();
  schemaReady = true;
}

// ---------- handlers ----------

async function register(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (
    username.length < 3 ||
    username.length > 32 ||
    !/^[A-Za-z0-9_-]+$/.test(username)
  )
    return error("Username must be 3–32 letters, digits, _ or -", 400);
  if (password.length < 8) return error("Password must be at least 8 characters", 400);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?1 COLLATE NOCASE")
    .bind(username)
    .first();
  if (existing) return error("That username is already taken", 409);

  const hash = await hashPassword(password);
  const row = await env.DB.prepare(
    "INSERT INTO users (username, password_hash, created_at) VALUES (?1, ?2, ?3) RETURNING id",
  )
    .bind(username, hash, new Date().toISOString())
    .first<{ id: number }>();

  return json({ username }, 200, { "Set-Cookie": await makeCookie(env, row!.id, username) });
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const row = await env.DB.prepare(
    "SELECT id, username, password_hash FROM users WHERE username = ?1 COLLATE NOCASE",
  )
    .bind((body.username ?? "").trim())
    .first<{ id: number; username: string; password_hash: string }>();
  if (!row || !(await verifyPassword(body.password ?? "", row.password_hash)))
    return error("Wrong username or password", 401);
  return json(
    { username: row.username },
    200,
    { "Set-Cookie": await makeCookie(env, row.id, row.username) },
  );
}

function logout(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}

async function getProgress(session: Session, env: Env): Promise<Response> {
  const user = await env.DB.prepare("SELECT current_lesson FROM users WHERE id = ?1")
    .bind(session.id)
    .first<{ current_lesson: number }>();
  const rows = await env.DB.prepare(
    "SELECT lesson_id, completed, sketch, circuit FROM progress WHERE user_id = ?1 ORDER BY lesson_id",
  )
    .bind(session.id)
    .all<{ lesson_id: number; completed: number; sketch: string | null; circuit: string | null }>();
  return json({
    currentLesson: user?.current_lesson ?? 1,
    lessons: rows.results.map((r) => ({
      lessonId: r.lesson_id,
      completed: r.completed !== 0,
      sketch: r.sketch,
      circuit: r.circuit,
    })),
  });
}

async function putProgress(
  session: Session,
  env: Env,
  lessonId: number,
  request: Request,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    completed?: boolean;
    sketch?: string;
    circuit?: string;
    current?: boolean;
  };
  await env.DB.prepare(
    `INSERT INTO progress (user_id, lesson_id, completed, sketch, circuit, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET
       completed = MAX(progress.completed, excluded.completed),
       sketch = excluded.sketch,
       circuit = excluded.circuit,
       updated_at = excluded.updated_at`,
  )
    .bind(
      session.id,
      lessonId,
      body.completed ? 1 : 0,
      body.sketch ?? null,
      body.circuit ?? null,
      new Date().toISOString(),
    )
    .run();
  if (body.current)
    await env.DB.prepare("UPDATE users SET current_lesson = ?1 WHERE id = ?2")
      .bind(lessonId, session.id)
      .run();
  return new Response(null, { status: 204 });
}

// ---------- router ----------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (path === "/api/health") return json({ status: "ok" });
    if (path === "/api/lessons")
      return env.ASSETS.fetch(new URL("/data/lessons.json", url.origin).toString());
    if (path === "/api/components")
      return env.ASSETS.fetch(new URL("/data/components.json", url.origin).toString());

    // Every route below this point reads or writes D1; make sure the tables exist.
    await ensureSchema(env);

    if (request.method === "POST" && path === "/api/auth/register") return register(request, env);
    if (request.method === "POST" && path === "/api/auth/login") return login(request, env);
    if (request.method === "POST" && path === "/api/auth/logout") return logout();

    const session = await readSession(env, request);
    if (path === "/api/auth/me")
      return session ? json({ username: session.username }) : error("Not signed in", 401);

    if (!session) return error("Not signed in", 401);

    if (request.method === "GET" && path === "/api/progress") return getProgress(session, env);
    const put = /^\/api\/progress\/(\d+)$/.exec(path);
    if (request.method === "PUT" && put)
      return putProgress(session, env, Number(put[1]), request);

    return error("Not found", 404);
  },
};
