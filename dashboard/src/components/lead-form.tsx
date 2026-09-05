'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { saveLead } from '@/app/actions';
import { statuses } from '@/lib/leads';
type EditableLead = { id: string; name: string | null; phoneNumber: string; interestedIn: string | null; status: string; updatedAt: string };
export default function LeadForm({ lead }: { lead?: EditableLead }) {
  const [state, action, pending] = useActionState(saveLead, {});
  if (state.id) return <div className="empty-state"><h2>Lead creado</h2><p>Ya podés hacer el seguimiento de este contacto.</p><Link className="button" href={'/leads/' + state.id}>Abrir ficha</Link></div>;
  return <form action={action} className="form-stack">
    {lead && <><input type="hidden" name="id" value={lead.id} /><input type="hidden" name="updatedAt" value={lead.updatedAt} /></>}
    <label>Nombre<input name="name" defaultValue={lead?.name ?? ''} maxLength={120} placeholder="Nombre del contacto" /></label>
    {lead ? <label>Teléfono<input value={'+' + lead.phoneNumber} readOnly /><small className="muted">El teléfono identifica la conversación de WhatsApp.</small></label> : <label>Teléfono internacional<input type="tel" name="phoneNumber" placeholder="+54 9 11 1234 5678" maxLength={30} required /><small className="muted">Incluí el código de país y de área.</small></label>}
    <label>Producto de interés<input name="interestedIn" defaultValue={lead?.interestedIn ?? ''} maxLength={200} placeholder="Ej.: combo de limpieza" /></label>
    <label>Estado<select name="status" defaultValue={lead?.status ?? 'PENDING_CONTACT'}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <p className="muted small">Marcá «Recuperado» cuando se concrete la venta. «Descartado» conserva la ficha sin dejarla entre los pendientes.</p>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.success && <p className="form-success" role="status">{state.success}</p>}
    <button className="button" disabled={pending}>{pending ? 'Guardando…' : lead ? 'Guardar cambios' : 'Crear lead'}</button>
  </form>;
}
