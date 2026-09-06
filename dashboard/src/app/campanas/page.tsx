import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/auth';
import CampaignForm from '@/components/campaign-form';
import Refresh from '@/components/refresh';
export const dynamic = 'force-dynamic';
// Solo se ofrecen contactos que hace por lo menos este tiempo que no escriben.
const diasPorDefecto = 30;
function corteDeInactividad(dias: number) {
  return new Date(Date.now() - dias * 86400000);
}
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await requireDashboardSession();
  const params = await searchParams;
  const dias = Math.max(1, Math.min(3650, Number.parseInt(String(params.dias), 10) || diasPorDefecto));
  const corte = corteDeInactividad(dias);
  const where = {
    status: 'PENDING_CONTACT',
    OR: [{ lastMessageAt: { lte: corte } }, { lastMessageAt: null, createdAt: { lte: corte } }],
  };
  const [contactos, contactados] = await Promise.all([
    // Primero los más olvidados: son los que más urge recuperar.
    prisma.lead.findMany({ where, orderBy: [{ lastMessageAt: 'asc' }, { createdAt: 'asc' }], take: 200,
      select: { id: true, name: true, phoneNumber: true, interestedIn: true, aiReasoning: true, status: true, leadType: true, lastMessageAt: true, createdAt: true } }),
    prisma.lead.count({ where: { status: 'CONTACTED' } }),
  ]);
  return <div className="animate-fade-in">
    <header className="page-header"><div><span className="eyebrow">VOLVER A CONECTAR</span><h1>Campañas</h1><p className="subtitle">Elegí a quiénes escribirles y qué mandarles.</p></div><Refresh /></header>
    <div className="settings-grid">
      <section className="glass panel">
        <h2>Nueva campaña</h2>
        <form className="filter-bar" action="/campanas">
          <label>Sin actividad hace al menos
            <select name="dias" defaultValue={String(dias)}>
              <option value="30">1 mes</option><option value="60">2 meses</option>
              <option value="90">3 meses</option><option value="180">6 meses</option><option value="365">1 año</option>
            </select>
          </label>
          <button className="button secondary">Aplicar</button>
        </form>
        <CampaignForm contactos={contactos} />
      </section>
      <section className="glass panel">
        <h2>Cómo funciona</h2>
        <ol className="steps">
          <li>El bot revisa tu agenda de WhatsApp cada varias horas y carga acá a los contactos que hace tiempo no te escriben.</li>
          <li>Elegís de la lista a quiénes querés recontactar. No se manda nada sin que lo marques.</li>
          <li>Escribís el mensaje y, si querés, adjuntás una imagen con la promo.</li>
          <li>Los envíos salen de a uno y espaciados para que WhatsApp no marque la cuenta como automatizada.</li>
          <li>Cuando alguien responde, el bot lo detecta y actualiza su ficha en <Link className="text-link" href="/leads">Leads</Link>.</li>
        </ol>
        <hr />
        <p className="muted">Contactos disponibles ahora: <strong>{contactos.length}</strong>. Ya contactados: <strong>{contactados}</strong>.</p>
        <p className="muted small">Solo entran a la lista conversaciones en las que la persona te escribió alguna vez. Los envíos masivos a desconocidos son la causa más común de suspensión de una cuenta de WhatsApp.</p>
      </section>
    </div>
  </div>;
}
