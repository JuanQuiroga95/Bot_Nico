'use client';
import { MessageCircle } from 'lucide-react';
import { normalizePhone } from '@/lib/leads';
export const defaultMessage = 'Hola {nombre}, ¿cómo estás? Te contacto por tu consulta sobre {producto}. ¿Te puedo ayudar?';
export default function WhatsAppLink({ phone, name, product }: { phone: string; name: string | null; product: string | null }) {
  const normalized = normalizePhone(phone);
  function openChat() {
    let template = defaultMessage;
    try { template = localStorage.getItem('nico-message-template') || defaultMessage; } catch { /* Usar texto predeterminado. */ }
    const text = template.replaceAll('{nombre}', name || '').replaceAll('{producto}', product || 'nuestros productos');
    window.open('https://wa.me/' + normalized + '?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  }
  return <div><button className="button whatsapp" disabled={!normalized} onClick={openChat}><MessageCircle size={18} />Abrir WhatsApp</button><p className="muted small helper">{normalized ? 'Revisá el mensaje antes de enviarlo. Luego guardá el estado «Contactado».' : 'Este contacto no tiene un teléfono internacional válido.'}</p></div>;
}
