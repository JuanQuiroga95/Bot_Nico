export const statuses = {
  PENDING_CONTACT: 'Pendiente', CONTACTED: 'Contactado', CONVERTED: 'Recuperado', DISCARDED: 'Descartado',
} as const;
export type LeadStatus = keyof typeof statuses;
export function isLeadStatus(value: string): value is LeadStatus {
  return Object.prototype.hasOwnProperty.call(statuses, value);
}
export function normalizePhone(value: string) {
  const phone = value.replace(/[\s()+.-]/g, '');
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
}
export function csvCell(value: unknown) {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
