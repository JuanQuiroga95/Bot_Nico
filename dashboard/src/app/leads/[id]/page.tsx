import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/auth';
import { formatDate } from '@/lib/leads';
import { StatusBadge } from '@/components/lead-list';
import LeadForm from '@/components/lead-form';
import WhatsAppLink from '@/components/whatsapp-link';
export const dynamic = 'force-dynamic';
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireDashboardSession();
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) notFound();
  return <div className="animate-fade-in"><Link className="text-link" href="/leads">← Volver a Leads</Link>
    <header className="page-header"><div><h1>{lead.name || 'Sin agendar'}</h1><p className="subtitle">+{lead.phoneNumber} · Detectado el {formatDate(lead.createdAt)}</p></div><StatusBadge status={lead.status} /></header>
    <div className="detail-grid"><section className="glass panel"><h2>Seguimiento</h2><WhatsAppLink phone={lead.phoneNumber} name={lead.name} product={lead.interestedIn} /><LeadForm lead={{ id: lead.id, name: lead.name, phoneNumber: lead.phoneNumber, interestedIn: lead.interestedIn, status: lead.status, updatedAt: lead.updatedAt.toISOString() }} /></section>
      <div className="form-stack"><section className="glass panel"><span className="eyebrow">ANÁLISIS DE LA OPORTUNIDAD</span><h2>Por qué retomar el contacto</h2><p className="analysis-text">{lead.aiReasoning || 'Todavía no hay un análisis para este contacto.'}</p><p className="muted small">Última actualización: {formatDate(lead.updatedAt)}</p></section>
        <section className="glass panel"><h2>Historial de conversación</h2><p className="muted helper">Último historial recibido. Puede ser un extracto de la conversación.</p><pre className="chat-history">{lead.lastHistory || 'Este lead se agregó manualmente y todavía no tiene mensajes sincronizados.'}</pre></section>
      </div></div>
  </div>;
}
