import Link from 'next/link';

import { ArrowUpRight, Users } from 'lucide-react';
import { describeSilence, formatDate, isLeadStatus, isLeadType, leadTypes, statuses, type LeadRow } from '@/lib/leads';
export function StatusBadge({ status }: { status: string }) {
  return <span className={'badge status-' + status.toLowerCase()}>{isLeadStatus(status) ? statuses[status] : 'Sin clasificar'}</span>;
}
export function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  return <span className={'badge type-' + type.toLowerCase()}>{isLeadType(type) ? leadTypes[type] : type}</span>;
}
export default function LeadList({ leads, filtered = false }: { leads: LeadRow[]; filtered?: boolean }) {
  if (!leads.length) return <div className="empty-state"><Users size={32} /><h3>{filtered ? 'No hay coincidencias' : 'Tu próxima oportunidad empieza acá'}</h3><p>{filtered ? 'Probá con otro nombre, teléfono o estado.' : 'Agregá tu primer lead o conectá WhatsApp para recibir oportunidades detectadas en tus conversaciones.'}</p><Link className="button secondary" href={filtered ? '/leads' : '/configuracion'}>{filtered ? 'Limpiar filtros' : 'Revisar configuración'}</Link></div>;
  return <div className="table-wrap"><table><thead><tr><th>Contacto</th><th>Interés / análisis</th><th>Estado</th><th>Último mensaje</th><th><span className="sr-only">Detalle</span></th></tr></thead><tbody>
    {leads.map(lead => <tr key={lead.id}>
      <td><Link className="contact-link" href={'/leads/' + lead.id}>{lead.name || 'Sin agendar'}</Link><span className="muted block">+{lead.phoneNumber}</span></td>
      <td><span>{lead.interestedIn || 'Sin producto definido'}</span><p className="reason-preview">{lead.aiReasoning || 'Sin análisis disponible'}</p></td>
      <td><StatusBadge status={lead.status} /> <TypeBadge type={lead.leadType} /></td>
      <td className="muted nowrap">{lead.lastMessageAt ? describeSilence(lead.lastMessageAt) : formatDate(lead.createdAt)}</td>
      <td><Link className="icon-button" href={'/leads/' + lead.id} aria-label={'Ver ficha de ' + (lead.name || lead.phoneNumber)}><ArrowUpRight size={19} /></Link></td>
    </tr>)}</tbody></table></div>;
}
