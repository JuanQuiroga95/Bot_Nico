import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign, normalizeMedia } from '../campaign.js';
import { renderMessage } from '../dashboard/src/lib/leads.ts';

function armar(overrides = {}) {
  const enviados = [];
  const esperas = [];
  const campaign = createCampaign(async (phoneNumber, message) => { enviados.push({ phoneNumber, message }); }, {
    minDelay: 1000, maxDelay: 3000, random: () => 0.5,
    wait: ms => { esperas.push(ms); return Promise.resolve(); },
    ...overrides,
  });
  return { campaign, enviados, esperas };
}

test('espacia los envíos y respeta el tope diario sin perder los pendientes', async () => {
  const { campaign, enviados, esperas } = armar({ cap: 2 });
  assert.equal(campaign.enqueue([
    { phoneNumber: '+54 9 11 1111 1111', message: 'uno' },
    { phoneNumber: '5491122222222', message: 'dos' },
    { phoneNumber: '5491133333333', message: 'tres' },
  ]), 3);
  await campaign.whenIdle();
  assert.deepEqual(enviados.map(item => item.message), ['uno', 'dos']);
  assert.equal(enviados[0].phoneNumber, '5491111111111');
  assert.deepEqual(esperas, [2000, 2000]);
  const stats = campaign.stats();
  assert.equal(stats.pending, 1);
  assert.equal(stats.sentToday, 2);
  assert.equal(stats.remainingToday, 0);
});

test('descarta teléfonos inválidos, mensajes vacíos y repetidos', async () => {
  const { campaign, enviados } = armar();
  assert.equal(campaign.enqueue([
    { phoneNumber: '123', message: 'corto' },
    { phoneNumber: '5491144444444', message: '   ' },
    { phoneNumber: '5491155555555', message: 'válido' },
    { phoneNumber: '+54 9 11 5555-5555', message: 'repetido' },
    { phoneNumber: '5491166666666', message: 'x'.repeat(1001) },
  ]), 1);
  await campaign.whenIdle();
  assert.deepEqual(enviados, [{ phoneNumber: '5491155555555', message: 'válido' }]);
});

test('con WhatsApp desconectado la cola espera y se retoma al reconectar', async () => {
  let conectado = false;
  const { campaign, enviados } = armar({ canSend: () => conectado });
  campaign.enqueue([{ phoneNumber: '5491177777777', message: 'hola' }]);
  await campaign.whenIdle();
  assert.deepEqual(enviados, []);
  assert.equal(campaign.stats().pending, 1);
  conectado = true;
  campaign.pump();
  await campaign.whenIdle();
  assert.equal(enviados.length, 1);
  assert.equal(campaign.stats().pending, 0);
});

test('un envío fallido no detiene la cola', async () => {
  const enviados = [];
  const campaign = createCampaign(async phoneNumber => {
    if (phoneNumber === '5491188888888') throw new Error('numero inexistente');
    enviados.push(phoneNumber);
  }, { minDelay: 0, maxDelay: 0, wait: () => Promise.resolve() });
  campaign.enqueue([
    { phoneNumber: '5491188888888', message: 'falla' },
    { phoneNumber: '5491199999999', message: 'sigue' },
  ]);
  await campaign.whenIdle();
  assert.deepEqual(enviados, ['5491199999999']);
  assert.equal(campaign.stats().pending, 0);
  assert.match(campaign.stats().lastError ?? '', /inexistente|^$/);
});

test('el tope se reinicia al cambiar el día', async () => {
  let ahora = Date.UTC(2026, 8, 5, 15, 0, 0);
  const { campaign, enviados } = armar({ cap: 1, now: () => ahora });
  campaign.enqueue([
    { phoneNumber: '5491111111112', message: 'hoy' },
    { phoneNumber: '5491111111113', message: 'mañana' },
  ]);
  await campaign.whenIdle();
  assert.equal(enviados.length, 1);
  ahora += 86400000;
  campaign.pump();
  await campaign.whenIdle();
  assert.equal(enviados.length, 2);
  assert.equal(campaign.stats().sentToday, 1);
});

test('el mensaje se personaliza y no deja huecos cuando falta el nombre', () => {
  const plantilla = 'Hola {nombre}, te escribo por tu consulta sobre {producto}. ¿Seguís interesado?';
  assert.equal(renderMessage(plantilla, { name: 'Ana', interestedIn: 'Detergente' }),
    'Hola Ana, te escribo por tu consulta sobre Detergente. ¿Seguís interesado?');
  assert.equal(renderMessage(plantilla, { name: null, interestedIn: null }),
    'Hola, te escribo por tu consulta sobre nuestros productos. ¿Seguís interesado?');
});

test('la imagen se valida y viaja una sola vez para toda la tanda', async () => {
  const datos = Buffer.from('imagen de prueba').toString('base64');
  assert.equal(normalizeMedia(null), null);
  assert.equal(normalizeMedia({ mimetype: 'application/pdf', data: datos }), null);
  assert.equal(normalizeMedia({ mimetype: 'image/png', data: 'no es base64 !!' }), null);
  const limpia = normalizeMedia({ mimetype: 'IMAGE/PNG', data: datos, filename: '../promo de marzo.png' });
  assert.deepEqual(limpia, { mimetype: 'image/png', data: datos, filename: '..promodemarzo.png' });

  const enviados = [];
  const campaign = createCampaign(async (phoneNumber, message, media) => { enviados.push({ phoneNumber, message, media }); },
    { minDelay: 0, maxDelay: 0, wait: async () => {} });
  assert.equal(campaign.enqueue([{ phoneNumber: '5491133334444', message: 'Hola' }, { phoneNumber: '5491155556666', message: '' }],
    { mimetype: 'image/png', data: datos, filename: 'promo.png' }), 2);
  await campaign.whenIdle();
  assert.equal(enviados.length, 2);
  assert.equal(enviados[1].message, '', 'con imagen el texto puede ir vacio');
  assert.equal(enviados[0].media.filename, 'promo.png');
  assert.equal(enviados[0].media, enviados[1].media, 'una sola copia de la imagen en memoria');
});

test('sin imagen un mensaje vacio no se encola', () => {
  const campaign = createCampaign(async () => {}, { minDelay: 0, maxDelay: 0, wait: async () => {} });
  assert.equal(campaign.enqueue([{ phoneNumber: '5491133334444', message: '   ' }]), 0);
});
