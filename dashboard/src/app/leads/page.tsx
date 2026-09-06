import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/auth';
import { isLeadStatus, statuses } from '@/lib/leads';
import LeadList from '@/components/lead-list';
import Refresh from '@/components/refresh';
import { Plus, Search } from 'lucide-react';
export const dynamic = 'force-dynamic';
type Query = { q?: string; status?: string; page?: string };
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireDashboardSession();
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, 120) : '';
  const status = typeof params.status === 'string' && isLeadStatus(params.status) ? params.status : '';
  const requestedPage = Math.max(1, Math.min(100000, Number.parseInt(String(params.page), 10) || 1));
  const where: Prisma.LeadWhereInput = {
    ...(status ? { status } : {}),
    ...(q ? { OR: [
      { name: { contains: q } },
      { phoneNumber: { contains: q.replace(/^\+/, '') } },
      { interestedIn: { contains: q } },
    ] } : {}),
  };
  const total = await prisma.lead.count({ where });
  const pages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(requestedPage, pages);
  const leads = await prisma.lead.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20, skip: (page - 1) * 20,
    select: { id: true, name: true, phoneNumber: true, interestedIn: true, aiReasoning: true, status: true, leadType: true, lastMessageAt: true, createdAt: true } });
  const pageUrl = (next: number) => '/leads?' + new URLSearchParams({ q, status, page: String(next) });
  return <div className="animate-fade-in">
    <header className="page-header"><div><span className="eyebrow">TU CARTERA DE CONTACTOS</span><h1>Leads</h1><p className="subtitle">Buscá, contactá y acompañá cada oportunidad.</p></div><div className="button-row"><Refresh /><Link className="button" href="/leads/nuevo"><Plus size={17} />Nuevo lead</Link></div></header>
    <section className="glass panel">
      <form className="filter-bar" action="/leads"><label className="search-field"><span className="sr-only">Buscar por nombre, teléfono o producto</span><Search size={18} /><input name="q" placeholder="Nombre, teléfono o producto…" defaultValue={q} maxLength={120} /></label>
        <label><span className="sr-only">Filtrar por estado</span><select name="status" defaultValue={status}><option value="">Todos los estados</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="button secondary">Buscar</button>{(q || status) && <Link className="text-link" href="/leads">Limpiar</Link>}
      </form>
      <div className="section-header"><p className="muted">{total} {total === 1 ? 'lead encontrado' : 'leads encontrados'}</p><a className="text-link" href={'/api/leads/export?' + new URLSearchParams({ q, status })}>Exportar CSV</a></div>
      <LeadList leads={leads} filtered={!!(q || status)} />
      <nav className="pagination" aria-label="Paginación de leads">{page > 1 ? <Link className="button secondary" href={pageUrl(page - 1)}>Anterior</Link> : <span />}<span className="muted">Página {page} de {pages}</span>{page < pages ? <Link className="button secondary" href={pageUrl(page + 1)}>Siguiente</Link> : <span />}</nav>
    </section>
  </div>;
}
