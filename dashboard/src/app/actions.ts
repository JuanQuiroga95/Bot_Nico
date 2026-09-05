'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { canEditLeads } from '@/lib/auth';
import { isLeadStatus, normalizePhone } from '@/lib/leads';
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
