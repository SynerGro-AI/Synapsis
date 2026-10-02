const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const ts = require(path.resolve(__dirname, "../../frontend/node_modules/typescript"));

const source = ts.transpileModule(
  require("node:fs").readFileSync(path.resolve(__dirname, "../src/worker.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const workerModule = { exports: {} };
new Function("module", "exports", source)(workerModule, workerModule.exports);
const worker = workerModule.exports.default;

function createEnv() {
  const requests = [];
  let dbCalls = 0;
  const statement = {
    bind() { return this; },
    async run() { return {}; },
    async first() { return null; },
    async all() { return { results: [] }; },
  };
  return {
    requests,
    get dbCalls() { return dbCalls; },
    DB: {
      prepare() {
        dbCalls++;
        return statement;
      },
    },
    ASSETS: {
      async fetch(request) {
        requests.push(request);
        const headers = new Headers(request.headers);
        if (headers.get("If-None-Match") === '"asset-etag"')
          return new Response(null, { status: 304 });
        return new Response("{}", { headers: { "Content-Type": "application/json" } });
      },
    },
    SESSION_SECRET: "test-only",
  };
}

async function send(pathname, method = "GET", headers) {
  const env = createEnv();
  const response = await worker.fetch(
    new Request(`https://synapsis.school${pathname}`, { method, headers }),
    env,
  );
  return { response, env };
}

test("public GET endpoints reject unsupported methods", async () => {
  for (const pathname of ["/api/health", "/api/lessons", "/api/components"]) {
    const { response } = await send(pathname, "POST");
    assert.equal(response.status, 405, pathname);
    assert.equal(response.headers.get("Allow"), "GET, HEAD", pathname);
  }
});

test("static API assets preserve HEAD and conditional request semantics", async () => {
  const head = await send("/api/lessons", "HEAD");
  assert.equal(head.response.status, 200);
  assert.equal(head.env.requests[0].method, "HEAD");

  const conditional = await send("/api/lessons", "GET", { "If-None-Match": '"asset-etag"' });
  assert.equal(conditional.response.status, 304);
  assert.equal(conditional.env.requests[0].headers.get("If-None-Match"), '"asset-etag"');
});

test("known authenticated routes retain authorization while rejecting wrong methods", async () => {
  const unauthorized = await send("/api/auth/me");
  assert.equal(unauthorized.response.status, 401);

  const wrongMethod = await send("/api/auth/me", "POST");
  assert.equal(wrongMethod.response.status, 405);
  assert.equal(wrongMethod.response.headers.get("Allow"), "GET, HEAD");

  const progressWrongMethod = await send("/api/progress/5", "POST");
  assert.equal(progressWrongMethod.response.status, 405);
  assert.equal(progressWrongMethod.response.headers.get("Allow"), "PUT");
});

test("unmatched API routes return 404 without initializing the database", async () => {
  const { response, env } = await send("/api/no-such-route");
  assert.equal(response.status, 404);
  assert.equal(env.dbCalls, 0);
});

test("logout remains a no-content response", async () => {
  const { response } = await send("/api/auth/logout", "POST");
  assert.equal(response.status, 204);
});
