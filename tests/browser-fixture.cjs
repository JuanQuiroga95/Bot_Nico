// Base aislada para pruebas de navegador. Nunca se carga en los comandos de producción.
const Module = require('node:module');
const originalLoad = Module._load;
process.env.DASHBOARD_USERNAME = 'browser-user';
process.env.DASHBOARD_PASSWORD = 'browser-test-password';
process.env.API_SECRET_TOKEN = 'browser-test-token';
process.env.BOT_STATUS_URL = 'https://bot.test';
const leads = Array.from({ length: 56 }, (_, i) => ({
  id: 'fixture-' + (i + 1), name: 'Contacto de prueba ' + (i + 1),
  phoneNumber: String(5491100000000 + i), interestedIn: i % 2 ? 'Detergente' : 'Combo de limpieza',
  aiReasoning: 'Consultó por productos de limpieza y todavía no confirmó el pedido.',
  lastHistory: '[Cliente]: Hola, ¿me pasás la lista de precios?\n[Vendedor]: Sí, tenemos combos de limpieza.',
  status: i < 30 ? 'PENDING_CONTACT' : i < 45 ? 'CONTACTED' : i < 55 ? 'CONVERTED' : 'DISCARDED',
  createdAt: new Date(Date.UTC(2026, 8, 5, 12, 0, 0) - i * 60000),
  updatedAt: new Date(Date.UTC(2026, 8, 5, 12, 0, 0) - i * 60000),
}));
const filtered = where => leads.filter(lead => (!where?.status || lead.status === where.status) && (!where?.OR || where.OR.some(condition => Object.entries(condition).some(([key, query]) => (lead[key] || '').toLowerCase().includes(query.contains.toLowerCase())))));
class MockPrisma {
  async $queryRaw() { return [{ '?column?': 1 }]; }
  lead = {
    groupBy: async () => [...new Set(leads.map(lead => lead.status))].map(status => ({ status, _count: { _all: leads.filter(lead => lead.status === status).length } })),
    count: async ({ where } = {}) => filtered(where).length,
    findMany: async ({ where, take, skip = 0, select } = {}) => filtered(where).slice(skip, take ? skip + take : undefined).map(lead => select ? Object.fromEntries(Object.keys(select).map(key => [key, lead[key]])) : { ...lead }),
    findUnique: async ({ where }) => leads.find(lead => lead.id === where.id) || null,
    updateMany: async ({ where, data }) => {
      const lead = leads.find(lead => lead.id === where.id && lead.updatedAt.getTime() === where.updatedAt.getTime());
      if (!lead) return { count: 0 };
      Object.assign(lead, data, { updatedAt: new Date() });
      return { count: 1 };
    },
    create: async ({ data }) => {
      const lead = { ...data, id: 'fixture-new', createdAt: new Date(), updatedAt: new Date() };
      leads.unshift(lead);
      return lead;
    },
  };
}
Module._load = function(name, parent, isMain) {
  const loaded = originalLoad.call(this, name, parent, isMain);
  if (name.includes('prisma') && loaded?.PrismaClient) return { ...loaded, PrismaClient: MockPrisma };
  return loaded;
};
const originalFetch = global.fetch;
global.fetch = async function(input, init) {
  if (String(input) === 'https://bot.test/status') {
    const { qrToSvg } = await import('../bot-status.js');
    return Response.json({ state: 'QR', qrSvg: qrToSvg('browser-test-qr'), qrUpdatedAt: new Date().toISOString(), keywords: ['detergente', 'cloro', 'esponja', 'precio', 'envio'] });
  }
  return originalFetch(input, init);
};
