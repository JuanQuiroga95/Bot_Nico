'use client';
import { useEffect, useRef, useState } from 'react';
import { defaultMessage } from './whatsapp-link';
export default function Preferences() {
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const refreshRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    try {
      if (templateRef.current) templateRef.current.value = localStorage.getItem('nico-message-template') || defaultMessage;
      if (refreshRef.current) refreshRef.current.checked = localStorage.getItem('nico-auto-refresh') === 'true';
    } catch { /* Se pueden usar las preferencias predeterminadas. */ }
  }, []);
  return <form className="form-stack" onSubmit={event => {
    event.preventDefault();
    try {
      const template = templateRef.current?.value.trim() || defaultMessage;
      localStorage.setItem('nico-message-template', template);
      localStorage.setItem('nico-auto-refresh', String(refreshRef.current?.checked ?? false));
      setMessage('Preferencias guardadas en este navegador.');
    } catch { setMessage('El navegador no permite guardar preferencias. Revisá sus permisos de almacenamiento.'); }
  }}>
    <label>Mensaje para retomar el contacto<textarea ref={templateRef} defaultValue={defaultMessage} maxLength={1000} rows={4} required /><small className="muted">Usá {'{nombre}'} y {'{producto}'}. Se completan al abrir WhatsApp desde la ficha.</small></label>
    <label className="checkbox-label"><input type="checkbox" ref={refreshRef} />Actualizar Dashboard y Leads cada 30 segundos</label>
    <p className="muted small">Estas preferencias se guardan solo en este navegador. El mensaje se abre como borrador; vos decidís cuándo enviarlo.</p>
    <div className="button-row"><button className="button">Guardar preferencias</button><button type="button" className="button secondary" onClick={() => {
      if (templateRef.current) templateRef.current.value = defaultMessage;
      if (refreshRef.current) refreshRef.current.checked = false;
      setMessage('Valores restablecidos. Guardá para aplicarlos.');
    }}>Restablecer</button></div>
    {message && <p role="status">{message}</p>}
  </form>;
}
