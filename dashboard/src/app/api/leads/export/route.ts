import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hasSession } from '@/lib/auth';
import { csvCell, isLeadStatus, statuses } from '@/lib/leads';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store, private' };
  if (!await hasSession()) return Response.json({ error: 'No autorizado' }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') ?? '').trim().slice(0, 120);
  const status = params.get('status') ?? '';
  const where: Prisma.LeadWhereInput = {
    ...(isLeadStatus(status) ? { status } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { phoneNumber: { contains: q.replace(/^\+/, '') } }, { interestedIn: { contains: q } }] } : {}),
  };
  try {
    const leads = await prisma.lead.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10001,
      select: { name: true, phoneNumber: true, status: true, interestedIn: true, aiReasoning: true, createdAt: true } });
    if (leads.length > 10000) return Response.json({ error: 'La exportación admite hasta 10.000 leads. Aplicá un filtro para reducir el resultado.' }, { status: 422, headers });
    const rows = [['Nombre', 'Teléfono', 'Estado', 'Producto', 'Análisis', 'Creado'], ...leads.map(lead => [lead.name, lead.phoneNumber, isLeadStatus(lead.status) ? statuses[lead.status] : lead.status, lead.interestedIn, lead.aiReasoning, lead.createdAt.toISOString()])];
    return new Response('\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n'), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nico-leads.csv"' } });
  } catch {
    return Response.json({ error: 'No se pudo exportar. Intentá nuevamente.' }, { status: 503, headers });
  }
}
