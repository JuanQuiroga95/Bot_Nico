'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { canEditLeads } from '@/lib/auth';
import { isLeadStatus, normalizePhone, renderMessage } from '@/lib/leads';
import { passwordMatches, signSession } from '@/lib/session';
export type ActionResult = { error?: string; success?: string; id?: string };
export async function login(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const password = process.env.DASHBOARD_PASSWORD ?? '';
  if (!password) return { error: 'Configurá DASHBOARD_PASSWORD en Vercel para habilitar el acceso privado.' };
  const input = String(form.get('password') ?? '');
  const username = String(form.get('username') ?? '').trim();
  if (input.length > 256 || username !== (process.env.DASHBOARD_USERNAME || 'nicofabrica') || !passwordMatches(input, password)) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { error: 'El usuario o la contraseña no son correctos.' };
  }
  const maxAge = 60 * 60 * 12;
  (await cookies()).set('nico-session', signSession(Date.now() + maxAge * 1000, password), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge,
  });
  redirect('/');
}
export async function logout() {
  (await cookies()).delete('nico-session');
  redirect('/login');
}
// Encola la campaña en el bot y recién entonces marca los leads como contactados: si el
// bot no responde, nada cambia y se puede reintentar sin perder el estado real.
export async function startCampaign(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  if (!await canEditLeads()) return { error: 'Iniciá sesión para enviar mensajes.' };
  const base = process.env.BOT_STATUS_URL;
  const token = process.env.API_SECRET_TOKEN;
  if (!base || !token) return { error: 'Falta configurar BOT_STATUS_URL o API_SECRET_TOKEN en Vercel.' };
  const template = String(form.get('message') ?? '').trim();
  if (template.length < 10 || template.length > 1000) return { error: 'Escribí un mensaje de entre 10 y 1000 caracteres.' };
  const limit = Math.max(1, Math.min(200, Number.parseInt(String(form.get('limit')), 10) || 40));
  const leads = await prisma.lead.findMany({
    where: { status: 'PENDING_CONTACT' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit,
    select: { id: true, name: true, phoneNumber: true, interestedIn: true },
  });
  const enviables = leads.filter(lead => normalizePhone(lead.phoneNumber));
  if (!enviables.length) return { error: 'No hay contactos pendientes con un teléfono válido.' };
  try {
    const url = new URL('/send', base);
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Invalid bot URL');
    const response = await fetch(url, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: enviables.map(lead => ({ phoneNumber: lead.phoneNumber, message: renderMessage(template, lead) })) }),
      cache: 'no-store', signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!response.ok) return { error: response.status === 401 ? 'El API_SECRET_TOKEN de Vercel no coincide con el de Railway.' : 'El bot rechazó la campaña. Revisá su despliegue.' };
    const result = await response.json();
    await prisma.lead.updateMany({ where: { id: { in: enviables.map(lead => lead.id) } }, data: { status: 'CONTACTED' } });
    revalidatePath('/');
    revalidatePath('/leads');
    revalidatePath('/campanas');
    return { success: `${result.queued} mensajes en cola. Salen de a uno, espaciados, con un tope de ${result.cap} por día.` };
  } catch {
    return { error: 'No pudimos conectar con el bot. Revisá BOT_STATUS_URL y que Railway esté funcionando.' };
  }
}
export async function saveLead(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  if (!await canEditLeads()) return { error: 'Iniciá sesión para guardar cambios. Configurá DASHBOARD_PASSWORD en Vercel si todavía no está habilitado.' };
  const id = String(form.get('id') ?? '');
  const name = String(form.get('name') ?? '').trim();
  const interestedIn = String(form.get('interestedIn') ?? '').trim();
  const status = String(form.get('status') ?? 'PENDING_CONTACT');
  if (name.length > 120 || interestedIn.length > 200 || !isLeadStatus(status)) return { error: 'Revisá el nombre, el producto y el estado del lead.' };
  try {
    if (id) {
      const updatedAt = new Date(String(form.get('updatedAt') ?? ''));
      if (Number.isNaN(updatedAt.getTime())) return { error: 'Recargá la ficha antes de guardar.' };
      const result = await prisma.lead.updateMany({
        where: { id, updatedAt }, data: { name: name || null, interestedIn: interestedIn || null, status },
      });
      if (!result.count) return { error: 'El lead cambió desde que abriste la ficha. Actualizá la página y revisá los datos antes de guardar.' };
    } else {
      const phoneNumber = normalizePhone(String(form.get('phoneNumber') ?? ''));
      if (!phoneNumber) return { error: 'Ingresá un teléfono internacional válido, con código de país (8 a 15 dígitos).' };
      const lead = await prisma.lead.create({ data: {
        phoneNumber, name: name || null, interestedIn: interestedIn || null,
        status, lastHistory: '', aiReasoning: 'Lead agregado manualmente.',
      } });
      revalidatePath('/');
      revalidatePath('/leads');
      return { success: 'Lead creado.', id: lead.id };
    }
    revalidatePath('/');
    revalidatePath('/leads');
    revalidatePath('/leads/' + id);
    return { success: 'Cambios guardados.' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { error: 'Ya existe un lead con ese teléfono. Buscalo en Leads.' };
    console.error('No se pudo guardar el lead:', error);
    return { error: 'No pudimos guardar los cambios. Intentá nuevamente.' };
  }
}
