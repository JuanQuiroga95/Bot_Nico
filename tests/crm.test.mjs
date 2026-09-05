import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { isLeadStatus, normalizePhone, csvCell } from '../dashboard/src/lib/leads.ts';
import { signSession, verifySession, passwordMatches } from '../dashboard/src/lib/session.ts';
const require = createRequire(import.meta.url);
const ts = require('../dashboard/node_modules/typescript');

test('sesiones vencidas, alteradas o firmadas con otra clave se rechazan', () => {
  const token = signSession(2000, 'test-secret');
  assert.equal(verifySession(token, 'test-secret', 1000), true);
  assert.equal(verifySession(token, 'test-secret', 2000), false);
  assert.equal(verifySession(token, 'other-secret', 1000), false);
  for (const value of ['', token + '.extra', token.replace('2000', '9000'), 'NaN.abc']) assert.equal(verifySession(value, 'test-secret', 1000), false);
  assert.equal(passwordMatches('wrong', 'correct'), false);
  assert.equal(passwordMatches('correct', 'correct'), true);
  assert.equal(passwordMatches('', ''), false);
});
test('validación de teléfonos y estados de seguimiento', () => {
  assert.equal(normalizePhone('+54 (9) 11-1234-5678'), '5491112345678');
  for (const invalid of ['123', 'abc', '001234567890', '1234567890123456', '54911@c.us']) assert.equal(normalizePhone(invalid), null);
  assert.equal(isLeadStatus('CONVERTED'), true);
  assert.equal(isLeadStatus('DISCARDED'), true);
  assert.equal(isLeadStatus('toString'), false);
  assert.equal(isLeadStatus('INVALID'), false);
});
test('CSV escapa comillas, saltos y fórmulas de planilla', () => {
  assert.equal(csvCell('Nico "A"'), '"Nico ""A"""');
  assert.equal(csvCell('uno\ndos'), '"uno\ndos"');
  for (const value of ['=1+1', '+123', '-2', '@SUM(A1)', '  =CMD()']) assert.equal(csvCell(value).charAt(1), "'");
});
function loadActions({ authorized = true, updateCount = 1, duplicate = false } = {}) {
  let writes = 0;
  let mutation;
  class KnownError extends Error { code = 'P2002'; }
  const modules = {
    'next/headers': { cookies: async () => ({ set() {}, delete() {} }) },
    'next/navigation': { redirect: () => { throw new Error('redirect'); } },
    'next/cache': { revalidatePath() {} },
    '@prisma/client': { Prisma: { PrismaClientKnownRequestError: KnownError } },
    '@/lib/auth': { canEditLeads: async () => authorized },
    '@/lib/leads': { isLeadStatus, normalizePhone },
    '@/lib/session': { passwordMatches, signSession },
    '@/lib/prisma': { prisma: { lead: {
      updateMany: async input => { writes++; mutation = input; return { count: updateCount }; },
      create: async input => { writes++; mutation = input; if (duplicate) throw new KnownError(); return { id: 'new-id' }; },
    } } },
  };
  const code = ts.transpileModule(readFileSync(new URL('../dashboard/src/app/actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, require: name => { if (!(name in modules)) throw new Error(name); return modules[name]; }, process: { env: {} }, console, setTimeout };
  vm.runInNewContext(code, sandbox);
  return { save: sandbox.exports.saveLead, writes: () => writes, mutation: () => mutation };
}
function form(values) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
test('ninguna modificación de leads se permite sin sesión', async () => {
  const action = loadActions({ authorized: false });
  assert.ok((await action.save({}, form({ phoneNumber: '5491112345678', name: 'Prueba' }))).error);
  assert.equal(action.writes(), 0);
});
test('guardar valida estado y detecta ediciones concurrentes', async () => {
  const action = loadActions({ updateCount: 0 });
  assert.ok((await action.save({}, form({ status: 'INVALID' }))).error);
  assert.equal(action.writes(), 0);
  const result = await action.save({}, form({ id: 'lead-1', status: 'CONTACTED', updatedAt: '2026-09-05T12:00:00Z' }));
  assert.match(result.error, /cambió/);
  assert.equal(action.mutation().where.id, 'lead-1');
  assert.equal(action.mutation().where.updatedAt.toISOString(), '2026-09-05T12:00:00.000Z');
});
test('alta manual normaliza teléfono y comunica duplicados', async () => {
  const action = loadActions();
  const result = await action.save({}, form({ phoneNumber: '+54 9 11 1234 5678', name: ' Cliente ', status: 'PENDING_CONTACT' }));
  assert.equal(result.id, 'new-id');
  assert.equal(action.mutation().data.phoneNumber, '5491112345678');
  assert.equal(action.mutation().data.name, 'Cliente');
  assert.equal(action.mutation().data.lastHistory, '');
  const duplicate = loadActions({ duplicate: true });
  assert.match((await duplicate.save({}, form({ phoneNumber: '5491112345678' }))).error, /Ya existe/);
});
