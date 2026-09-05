import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/auth';
import CampaignForm from '@/components/campaign-form';
import Refresh from '@/components/refresh';
export const dynamic = 'force-dynamic';
export default async function CampaignsPage() {
  await requireDashboardSession();
  const where = { status: 'PENDING_CONTACT' };
  const [pendientes, ejemplo, contactados] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findFirst({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { name: true, interestedIn: true } }),
    prisma.lead.count({ where: { status: 'CONTACTED' } }),
  ]);
  return <div className="animate-fade-in">
    <header className="page-header"><div><span className="eyebrow">VOLVER A CONECTAR</span><h1>Campañas</h1><p className="subtitle">Escribiles a todos los que quedaron sin respuesta.</p></div><Refresh /></header>
    <div className="settings-grid">
      <section className="glass panel">
        <h2>Mensaje de reactivación</h2>
        <p className="muted helper">Se envía a los contactos pendientes, empezando por los más antiguos.</p>
        <CampaignForm pendientes={pendientes} ejemplo={ejemplo} />
      </section>
      <section className="glass panel">
        <h2>Cómo funciona</h2>
        <ol className="steps">
          <li>El bot revisa el historial de WhatsApp y detecta consultas comerciales que quedaron sin cerrar.</li>
          <li>Cada una se guarda en <Link className="text-link" href="/leads">Leads</Link> como pendiente, con el producto y el motivo que encontró la IA.</li>
          <li>Desde acá les escribís a todos con un mismo mensaje, personalizado con el nombre y el producto de cada uno.</li>
          <li>Los envíos salen espaciados para que WhatsApp no marque la cuenta como automatizada.</li>
          <li>Cuando alguien responde, el bot lo detecta y actualiza su ficha para que retomes la conversación.</li>
        </ol>
        <hr />
        <p className="muted">Pendientes de contacto: <strong>{pendientes}</strong>. Ya contactados: <strong>{contactados}</strong>.</p>
        <p className="muted small">Escribile solo a quien te consultó alguna vez. Los envíos masivos a desconocidos son la causa más común de suspensión de una cuenta de WhatsApp.</p>
      </section>
    </div>
  </div>;
}
