import { hasSession } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'no-store, private' };
  if (!await hasSession()) return Response.json({ error: 'Tu sesión venció. Volvé a iniciar sesión.' }, { status: 401, headers });
  const base = process.env.BOT_STATUS_URL;
  const token = process.env.API_SECRET_TOKEN;
  if (!base || !token) return Response.json({ error: 'Falta configurar BOT_STATUS_URL o API_SECRET_TOKEN en Vercel.' }, { status: 503, headers });
  try {
    const url = new URL('/status', base);
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Invalid bot URL');
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok) return Response.json({ error: response.status === 401 ? 'El API_SECRET_TOKEN de Vercel no coincide con Railway.' : 'El bot no respondió correctamente. Revisá su despliegue.' }, { status: 502, headers });
    const result = await response.json();
    return Response.json({ state: result.state, qrSvg: result.qrSvg ?? null, qrUpdatedAt: result.qrUpdatedAt ?? null, keywords: Array.isArray(result.keywords) ? result.keywords : [] }, { headers });
  } catch {
    return Response.json({ error: 'No pudimos conectar con el bot. Revisá su dominio público en BOT_STATUS_URL y que Railway esté funcionando.' }, { status: 502, headers });
  }
}
