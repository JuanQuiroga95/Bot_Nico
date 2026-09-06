'use client';
import { useActionState, useRef, useState, useSyncExternalStore } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { startCampaign } from '@/app/actions';
import { describeSilence, renderMessage, type LeadRow } from '@/lib/leads';
import { defaultMessage } from './whatsapp-link';
// La plantilla guardada vive en el navegador: en el servidor se usa la predeterminada.
const sinCambios = () => () => {};
const leerGuardada = () => {
  try { return localStorage.getItem('nico-message-template') || defaultMessage; } catch { return defaultMessage; }
};
export default function CampaignForm({ contactos }: { contactos: LeadRow[] }) {
  const [state, action, sending] = useActionState(startCampaign, {});
  const guardada = useSyncExternalStore(sinCambios, leerGuardada, () => defaultMessage);
  const [editada, setEditada] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const urlPrevia = useRef<string | null>(null);
  const campoImagen = useRef<HTMLInputElement>(null);
  const template = editada ?? guardada;
  // Enviada la campaña, esos contactos pasan a «Contactado» y desaparecen de la lista:
  // la selección se recalcula contra lo que sigue estando, sin arrastrar ids fantasma.
  const elegidos = marcados.filter(id => contactos.some(contacto => contacto.id === id));

  // La miniatura ocupa memoria hasta que se libera; se revoca al cambiarla o quitarla.
  function elegirImagen(archivo: File | null) {
    if (urlPrevia.current) URL.revokeObjectURL(urlPrevia.current);
    urlPrevia.current = archivo ? URL.createObjectURL(archivo) : null;
    setVistaPrevia(urlPrevia.current);
    // Quitar la miniatura tiene que vaciar tambien el campo, o la imagen se enviaria igual.
    if (!archivo && campoImagen.current) campoImagen.current.value = '';
  }

  if (!contactos.length) return <div className="empty-state"><h2>No hay contactos para recontactar</h2><p>El bot revisa la agenda cada varias horas y carga acá a los que hace más de un mes que no te escriben.</p></div>;

  const ejemplo = contactos.find(contacto => elegidos.includes(contacto.id)) ?? contactos[0];
  const todos = elegidos.length === contactos.length;
  return <form action={action} className="form-stack">
    <div className="section-header">
      <p className="muted">{elegidos.length} de {contactos.length} elegidos</p>
      <button type="button" className="text-link" onClick={() => setMarcados(todos ? [] : contactos.map(contacto => contacto.id))}>
        {todos ? 'No seleccionar ninguno' : 'Seleccionar todos'}
      </button>
    </div>
    <ul className="pick-list">
      {contactos.map(contacto => <li key={contacto.id}>
        <label>
          <input type="checkbox" name="ids" value={contacto.id} checked={elegidos.includes(contacto.id)}
            onChange={event => setMarcados(previos => event.target.checked ? [...previos, contacto.id] : previos.filter(id => id !== contacto.id))} />
          <span className="pick-name">{contacto.name || 'Sin agendar'}<span className="muted block">+{contacto.phoneNumber}</span></span>
          <span className="muted nowrap">{describeSilence(contacto.lastMessageAt)}</span>
        </label>
      </li>)}
    </ul>

    <label>Mensaje
      <textarea name="message" value={template} onChange={event => setEditada(event.target.value)} rows={4} maxLength={1000} />
      <small className="muted">Usá {'{nombre}'} y {'{producto}'}: se completan con los datos de cada contacto.</small>
    </label>

    <div className="field">
      <span className="field-label">Imagen (opcional)</span>
      <label className="file-drop" hidden={!!vistaPrevia}><ImagePlus size={18} />Elegir una imagen
        <input type="file" name="image" ref={campoImagen} accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={event => elegirImagen(event.target.files?.[0] ?? null)} />
      </label>
      {vistaPrevia && <div className="image-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={vistaPrevia} alt="Vista previa de la imagen a enviar" />
        <button type="button" className="button secondary" onClick={() => elegirImagen(null)}><X size={16} />Quitar</button>
      </div>}
      <small className="muted">JPG, PNG, WEBP o GIF de hasta 8 MB. El texto viaja como epígrafe de la imagen.</small>
    </div>

    <div className="preview">
      <strong>Así lo va a recibir {ejemplo?.name || 'el primero de la lista'}</strong>
      <p>{renderMessage(template, ejemplo ?? {})}</p>
    </div>

    <p className="muted small">Los mensajes salen de a uno, con pausas de entre 40 y 120 segundos, y con un tope diario. Lo que exceda el tope queda en cola y sigue al día siguiente. Cada contacto pasa a «Contactado».</p>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.success && <p className="form-success" role="status">{state.success}</p>}
    <button className="button" disabled={sending || !elegidos.length}><Send size={17} />{sending ? 'Enviando…' : `Enviar a ${elegidos.length || 'los elegidos'}`}</button>
  </form>;
}
