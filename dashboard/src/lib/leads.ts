export const statuses = {
  PENDING_CONTACT: 'Pendiente', CONTACTED: 'Contactado', CONVERTED: 'Recuperado', DISCARDED: 'Descartado',
} as const;
export type LeadStatus = keyof typeof statuses;
export function isLeadStatus(value: string): value is LeadStatus {
  return Object.prototype.hasOwnProperty.call(statuses, value);
}
// De donde salio el contacto: lo detecto la IA en una consulta, o el barrido lo encontro
// dormido en la agenda.
export const leadTypes = { OPORTUNIDAD: 'Consulta', DORMIDO: 'Sin actividad' } as const;
export type LeadType = keyof typeof leadTypes;
export function isLeadType(value: string): value is LeadType {
  return Object.prototype.hasOwnProperty.call(leadTypes, value);
}
// Columnas que necesitan las listas. Se declara aparte del modelo completo para no arrastrar
// el historial entero de cada conversacion a cada pantalla.
export type LeadRow = {
  id: string;
  name: string | null;
  phoneNumber: string;
  interestedIn: string | null;
  aiReasoning: string | null;
  status: string;
  leadType: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
};
// Cuantos dias hace del ultimo mensaje. Null cuando el contacto nunca se sincronizo.
export function daysSince(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}
export function describeSilence(value: Date | string | null | undefined) {
  const dias = daysSince(value);
  if (dias === null) return 'Sin datos';
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Hace 1 día';
  if (dias < 60) return `Hace ${dias} días`;
  return `Hace ${Math.floor(dias / 30)} meses`;
}
export function normalizePhone(value: string) {
  const phone = value.replace(/[\s()+.-]/g, '');
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
}
// Completa la plantilla de reactivación. Sin nombre saluda igual, sin dejar un hueco
// ni un espacio doble a la vista del cliente.
export function renderMessage(template: string, lead: { name?: string | null; interestedIn?: string | null }) {
  return template
    .replaceAll('{nombre}', (lead.name ?? '').trim())
    .replaceAll('{producto}', (lead.interestedIn ?? '').trim() || 'nuestros productos')
    .replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}
export function csvCell(value: unknown) {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
