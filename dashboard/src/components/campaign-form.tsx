'use client';
import { useActionState, useState, useSyncExternalStore } from 'react';
import { Send } from 'lucide-react';
import { startCampaign } from '@/app/actions';
import { renderMessage } from '@/lib/leads';
import { defaultMessage } from './whatsapp-link';
// La plantilla guardada vive en el navegador: en el servidor se usa la predeterminada.
const sinCambios = () => () => {};
const leerGuardada = () => {
  try { return localStorage.getItem('nico-message-template') || defaultMessage; } catch { return defaultMessage; }
};
export default function CampaignForm({ pendientes, ejemplo }: { pendientes: number; ejemplo: { name: string | null; interestedIn: string | null } | null }) {
  const [state, action, sending] = useActionState(startCampaign, {});
  const guardada = useSyncExternalStore(sinCambios, leerGuardada, () => defaultMessage);
  const [editada, setEditada] = useState<string | null>(null);
  const template = editada ?? guardada;
  const setTemplate = setEditada;
  const maximo = Math.min(200, Math.max(1, pendientes));
  if (!pendientes) return <div className="empty-state"><h2>No hay contactos pendientes</h2><p>Cuando el bot detecte consultas sin responder van a aparecer acá para que les escribas.</p></div>;
  return <form action={action} className="form-stack">
    <label>Mensaje para todos
      <textarea name="message" value={template} onChange={event => setTemplate(event.target.value)} rows={4} maxLength={1000} minLength={10} required />
      <small className="muted">Usá {'{nombre}'} y {'{producto}'}: se completan con los datos de cada contacto.</small>
    </label>
    <div className="preview">
      <strong>Así lo va a recibir {ejemplo?.name || 'el primero de la lista'}</strong>
      <p>{renderMessage(template, ejemplo ?? {})}</p>
    </div>
    <label>Cuántos enviar en esta tanda
      <input type="number" name="limit" defaultValue={Math.min(40, maximo)} min={1} max={maximo} required />
      <small className="muted">Hay {pendientes} {pendientes === 1 ? 'contacto pendiente' : 'contactos pendientes'}. Se toman siempre los más antiguos primero.</small>
    </label>
    <p className="muted small">Los mensajes salen de a uno, con pausas de entre 40 y 120 segundos, y con un tope diario. Lo que exceda el tope queda en cola y sigue al día siguiente. Cada contacto pasa a «Contactado» y, cuando responda, el bot lo detecta solo.</p>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.success && <p className="form-success" role="status">{state.success}</p>}
    <button className="button" disabled={sending}><Send size={17} />{sending ? 'Encolando…' : 'Enviar campaña'}</button>
  </form>;
}
