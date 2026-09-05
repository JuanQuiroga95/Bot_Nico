'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="glass empty-state" role="alert"><h1>No pudimos cargar esta página</h1><p>Puede haber un problema temporal con la conexión. Tus datos no se modificaron.</p><div className="button-row"><button className="button" onClick={reset}>Reintentar</button><Link className="button secondary" href="/configuracion">Revisar conexiones</Link></div></section>;
}
