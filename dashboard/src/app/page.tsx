import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/auth';
import LeadList from '@/components/lead-list';
import Refresh from '@/components/refresh';
import { ArrowRight, Users, PhoneForwarded, ShoppingCart, MessageSquare } from 'lucide-react';
export const dynamic = 'force-dynamic';
export default async function DashboardPage() {
  await requireDashboardSession();
  const [groups, leads] = await Promise.all([
    prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.lead.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 8,
      select: { id: true, name: true, phoneNumber: true, interestedIn: true, aiReasoning: true, status: true, createdAt: true, updatedAt: true } }),
  ]);
  const count = (status: string) => groups.find(group => group.status === status)?._count._all ?? 0;
  const total = groups.reduce((sum, group) => sum + group._count._all, 0);
  const recovered = count('CONVERTED');
  return <div className="animate-fade-in">
    <header className="page-header"><div><span className="eyebrow">TU ACTIVIDAD COMERCIAL</span><h1>Resumen de oportunidades</h1><p className="subtitle">De la primera consulta a una venta recuperada.</p></div><Refresh /></header>
    {!process.env.DASHBOARD_PASSWORD && <div className="notice">El CRM está en modo lectura pública. <Link href="/configuracion">Configurá el acceso privado</Link> para habilitar la edición.</div>}
    <div className="stat-cards">{[
      { label: 'Total de leads', value: total, icon: Users, status: '', color: 'blue' },
      { label: 'Por contactar', value: count('PENDING_CONTACT'), icon: PhoneForwarded, status: 'PENDING_CONTACT', color: 'amber' },
      { label: 'Contactados', value: count('CONTACTED'), icon: MessageSquare, status: 'CONTACTED', color: 'blue' },
      { label: 'Ventas recuperadas', value: recovered, icon: ShoppingCart, status: 'CONVERTED', color: 'green' },
    ].map(({ label, value, icon: Icon, status, color }) => <Link key={label} className="stat-card glass" href={'/leads' + (status ? '?status=' + status : '')}><div className="row-between"><span className="stat-title">{label}</span><Icon size={20} className={color} /></div><span className={'stat-value ' + color}>{value}</span><span className="muted small">Ver leads <ArrowRight size={13} /></span></Link>)}</div>
    <section className="glass panel"><div className="section-header"><div><h2>Últimos leads</h2><p className="muted">{total ? total + ' contactos en tu cartera · ' + Math.round(recovered / total * 100) + '% recuperados' : 'Tus contactos aparecerán acá cuando lleguen.'}</p></div><Link className="button secondary" href="/leads">Ver todos <ArrowRight size={16} /></Link></div><LeadList leads={leads} /></section>
  </div>;
}
