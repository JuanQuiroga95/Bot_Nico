import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/leads';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Incoming = {
  phoneNumber?: unknown;
  contactName?: unknown;
  lastMessageAt?: unknown;
  inboundCount?: unknown;
  history?: unknown;
  matchedKeywords?: unknown;
};

// El bot manda acá los contactos con los que hace tiempo que no se habla. No hay análisis
// de por medio: es una lista de teléfonos con la fecha del último mensaje.
export async function POST(request: Request) {
  const secret = process.env.API_SECRET_TOKEN;
  const authHeader = request.headers.get('authorization');
  if (!secret || !authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado. Token inválido.' }, { status: 401 });
  }

  let body: { contacts?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'El cuerpo debe ser JSON válido.' }, { status: 400 }); }
  const contacts = body?.contacts;
  if (!Array.isArray(contacts) || contacts.length > 200) {
    return NextResponse.json({ error: 'Enviá entre 1 y 200 contactos por lote.' }, { status: 400 });
  }

  let saved = 0;
  let created = 0;
  let rechazados = 0;
  for (const raw of contacts as Incoming[]) {
    const phoneNumber = typeof raw?.phoneNumber === 'string' ? normalizePhone(raw.phoneNumber) : null;
    const lastMessageAt = new Date(String(raw?.lastMessageAt ?? ''));
    if (!phoneNumber || Number.isNaN(lastMessageAt.getTime())) {
      rechazados++;
      continue;
    }
    const name = typeof raw?.contactName === 'string' ? raw.contactName.trim().slice(0, 120) || null : null;
    const history = typeof raw?.history === 'string' ? raw.history.slice(0, 8000) : '';
    const consultoProductos = raw?.matchedKeywords === true;
    try {
      // El contacto puede existir ya como oportunidad detectada por la IA: en ese caso solo
      // se actualiza la fecha del último mensaje y no se pisa su estado ni su análisis.
      const existente = await prisma.lead.findUnique({ where: { phoneNumber }, select: { name: true, leadType: true } });
      if (existente) {
        await prisma.lead.update({
          where: { phoneNumber },
          data: { lastMessageAt, name: existente.name ?? name, leadType: existente.leadType ?? 'DORMIDO' },
        });
      } else {
        await prisma.lead.create({
          data: {
            phoneNumber,
            name,
            lastMessageAt,
            leadType: 'DORMIDO',
            status: 'PENDING_CONTACT',
            lastHistory: history,
            aiReasoning: consultoProductos
              ? 'Consultó por productos y hace tiempo que no vuelve a escribir.'
              : 'Contacto sin actividad reciente.',
          },
        });
        created++;
      }
      saved++;
    } catch (error) {
      console.error('[Contactos] No se pudo guardar', phoneNumber, error);
      rechazados++;
    }
  }

  if (rechazados) console.warn(`[Contactos] ${rechazados} contactos rechazados en este lote.`);
  return NextResponse.json({ saved, created, rejected: rechazados });
}
