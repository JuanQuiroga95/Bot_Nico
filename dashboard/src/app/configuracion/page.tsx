import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/auth';
import { logout } from '@/app/actions';
import Preferences from '@/components/preferences';
import BotConnection from '@/components/bot-connection';
import Refresh from '@/components/refresh';
export const dynamic = 'force-dynamic';
export default async function SettingsPage() {
  await requireDashboardSession();
  let databaseOk = false;
  try { await prisma.$queryRaw`SELECT 1`; databaseOk = true; } catch { /* Mostrar el estado sin filtrar credenciales. */ }
  const checks = [
    { label: 'Base de datos', ok: databaseOk, detail: databaseOk ? 'Conexión comprobada.' : 'No pudimos conectar. Revisá DATABASE_URL en Vercel.' },
    { label: 'Análisis de oportunidades', ok: !!process.env.OPENAI_API_KEY, detail: process.env.OPENAI_API_KEY ? 'Clave configurada. La próxima conversación verificará el análisis.' : 'Falta OPENAI_API_KEY en Vercel.' },
    { label: 'Recepción de conversaciones', ok: !!process.env.API_SECRET_TOKEN, detail: process.env.API_SECRET_TOKEN ? 'Token configurado. Debe coincidir con el de Railway.' : 'Falta API_SECRET_TOKEN en Vercel y Railway.' },
  ];
  return <div className="animate-fade-in"><header className="page-header"><div><span className="eyebrow">TU ESPACIO DE TRABAJO</span><h1>Configuración</h1><p className="subtitle">Conectá WhatsApp y ajustá tu forma de trabajar.</p></div><Refresh /></header>
    <div className="settings-grid"><section className="glass panel"><h2>Conexión con WhatsApp</h2><p className="muted helper">Vinculá la cuenta del vendedor para recibir nuevas oportunidades.</p><BotConnection configured={!!process.env.BOT_STATUS_URL && !!process.env.API_SECRET_TOKEN} /></section>
      <section className="glass panel"><h2>Estado de las integraciones</h2><div className="connection-list">{checks.map(check => <div className="connection-item" key={check.label}><span className={'status-dot ' + (check.ok ? 'ok' : '')} /><div><strong>{check.label}</strong><p className="muted">{check.detail}</p></div></div>)}</div><p className="muted small">Las claves se administran en las variables privadas del alojamiento. No se muestran ni se guardan en el navegador.</p></section>
      <section className="glass panel"><h2>Preferencias de contacto</h2><Preferences /></section>
      <section className="glass panel"><h2>Tu cuenta</h2><p className="muted helper">Sesión iniciada como <strong>{process.env.DASHBOARD_USERNAME || 'nicofabrica'}</strong>. El acceso vence a las 12 horas.</p><form action={logout}><button className="button secondary">Cerrar sesión</button></form><hr /><h3>Cómo probar el recorrido</h3><ol className="steps"><li>Vinculá WhatsApp con el QR.</li><li>Desde otro celular enviá una consulta sobre un combo de limpieza.</li><li>Revisá Leads: se guardará si el análisis detecta una oportunidad recuperable.</li><li>Abrí la ficha, retomá el contacto y actualizá el estado.</li></ol></section>
    </div></div>;
}
