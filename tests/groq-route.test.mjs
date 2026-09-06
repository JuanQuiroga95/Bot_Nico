import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('../dashboard/node_modules/typescript');
const OpenAI = require('../dashboard/node_modules/openai').default;
const code = ts.transpileModule(readFileSync(new URL('../dashboard/src/app/api/process-chat/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load({ key = 'test-only', status = 200, content = JSON.stringify({ isRecoverable: true, reason: 'Consulta pendiente', lastInteractedProduct: 'jabón' }) } = {}) {
  let writes = 0;
  let calls = 0;
  class Client extends OpenAI {
    constructor(options) {
      super({ ...options, maxRetries: 0, fetch: async (url, init) => {
        calls++;
        assert.equal(String(url), 'https://api.groq.com/openai/v1/chat/completions');
        assert.equal(new Headers(init.headers).get('authorization'), 'Bearer test-only');
        assert.equal(JSON.parse(init.body).model, 'openai/gpt-oss-20b');
        return Response.json(status === 200 ? { choices: [{ message: { content } }] } : { error: { message: 'upstream error' } }, { status });
      } });
    }
  }
  const modules = {
    'openai': { default: Client },
    'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma: { lead: { upsert: async () => { writes++; return { id: 'test-lead' }; } } } },
  };
  const sandbox = { exports: {}, require: name => modules[name], process: { env: { GROQ_SECRET_API: key, API_SECRET_TOKEN: 'bot-test' } }, console };
  vm.runInNewContext(code, sandbox);
  return {
    run: (token = 'bot-test') => sandbox.exports.POST(new Request('http://localhost/api/process-chat', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '5491112345678', history: 'Quiero precio del jabón' }),
    })),
    writes: () => writes, calls: () => calls,
  };
}

test('el análisis usa Groq y guarda el lead validado', async () => {
  const route = load();
  assert.equal((await (await route.run()).json()).action, 'LEAD_SAVED');
  assert.equal(route.writes(), 1);
  assert.equal(route.calls(), 1);
});
test('sin clave o con token incorrecto no consulta ni guarda', async () => {
  for (const [key, token, expected] of [['', 'bot-test', 503], ['test-only', 'wrong', 401]]) {
    const route = load({ key });
    assert.equal((await route.run(token)).status, expected);
    assert.equal(route.calls(), 0);
    assert.equal(route.writes(), 0);
  }
});
test('límites y errores de acceso de Groq se comunican sin guardar', async () => {
  for (const status of [429, 401]) {
    const route = load({ status });
    const response = await route.run();
    assert.equal(response.status, status === 429 ? 503 : 502);
    assert.match((await response.json()).error, /Groq/);
    assert.equal(route.writes(), 0);
  }
});
test('un resultado incompleto de Groq no crea leads', async () => {
  const route = load({ content: '{}' });
  assert.equal((await route.run()).status, 502);
  assert.equal(route.writes(), 0);
});

test('un chat descartado devuelve el motivo sin crear un lead', async () => {
  const route = load({ content: JSON.stringify({ isRecoverable: false, reason: 'Consulta de soporte de software', lastInteractedProduct: null }) });
  const response = await route.run();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.action, 'IGNORED_BY_AI');
  assert.equal(result.reason, 'Consulta de soporte de software');
  assert.equal(route.writes(), 0);
});
