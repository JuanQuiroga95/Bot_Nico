'use client';
import { useEffect, useState } from 'react';
type BotState = { state: string; qrSvg?: string | null; qrUpdatedAt?: string | null; error?: string; keywords?: string[] };
const labels: Record<string, string> = { STARTING: 'Iniciando WhatsApp', LOADING: 'Cargando WhatsApp', QR: 'Esperando que escanees el QR', AUTHENTICATED: 'Sincronizando tu cuenta', READY: 'WhatsApp conectado', DISCONNECTED: 'WhatsApp desconectado', AUTH_FAILURE: 'No se pudo autenticar la cuenta', ERROR: 'El bot no pudo iniciar' };
export default function BotConnection({ configured }: { configured: boolean }) {
  const [bot, setBot] = useState<BotState | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch('/api/bot/status', { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No pudimos consultar el bot.');
        if (active) { setBot(result); setError(''); }
      } catch (e) {
        if (active) { setBot(null); setError(e instanceof Error ? e.message : 'Error de conexión.'); }
      } finally {
        if (active) timer = setTimeout(poll, 5000);
      }
    }
    void poll();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [configured, attempt]);
  if (!configured) return <div className="notice">Para mostrar el QR acá, configurá BOT_STATUS_URL en Vercel con la dirección HTTPS pública del bot en Railway. Ambos servicios deben tener el mismo API_SECRET_TOKEN.</div>;
  return <div className="bot-connection">
    {error ? <div className="notice" role="alert">{error}<button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Reintentar</button></div> : <p className={bot?.state === 'READY' ? 'green' : 'muted'} role="status">{bot ? labels[bot.state] || 'Consultando conexión' : 'Consultando el bot…'}</p>}
    {bot?.state === 'QR' && bot.qrSvg && <div className="qr-box">
      {/* SVG generado por el bot; se muestra como imagen aislada, nunca como HTML. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(bot.qrSvg)} width={360} height={360} alt="Código QR para vincular tu cuenta de WhatsApp" />
      <p>En WhatsApp Business: <strong>Dispositivos vinculados → Vincular un dispositivo</strong>. Escaneá esta imagen desde otro dispositivo.</p><small className="muted">El QR se actualiza automáticamente. No uses una captura antigua.</small>
    </div>}
    {bot?.state === 'QR' && !bot.qrSvg && <p className="muted">Esperando un QR nuevo…</p>}
    {bot?.state === 'READY' && <p>Ya podés enviar un mensaje de prueba con «combo», «jabón» o «limpieza» desde otro celular.</p>}
    {bot?.state === 'DISCONNECTED' && <p>Reiniciá el servicio del bot en Railway para volver a vincularlo.</p>}
    {!!bot?.keywords?.length && <details className="keyword-details"><summary>{bot.keywords.length} palabras y frases de detección activas</summary><p className="muted small helper">Reconoce tildes y plurales. La IA evalúa luego si la consulta es una oportunidad recuperable.</p><div className="keyword-tags">{bot.keywords.map(word => <span className="badge status-contacted" key={word}>{word}</span>)}</div></details>}
  </div>;
}
