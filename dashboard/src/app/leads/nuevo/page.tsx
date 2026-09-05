import Link from 'next/link';
import { requireDashboardSession } from '@/lib/auth';
import LeadForm from '@/components/lead-form';
export default async function NewLeadPage() {
  await requireDashboardSession();
  return <div><Link className="text-link" href="/leads">← Volver a Leads</Link><header className="page-header"><div><h1>Nuevo lead</h1><p className="subtitle">Agregá un contacto para empezar su seguimiento.</p></div></header><section className="glass panel narrow"><LeadForm /></section></div>;
}
