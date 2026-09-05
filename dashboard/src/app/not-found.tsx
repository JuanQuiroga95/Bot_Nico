import Link from 'next/link';
export default function NotFound() { return <section className="empty-state"><h1>No encontramos esta ficha</h1><p>El enlace puede ser incorrecto o el lead ya no está disponible.</p><Link className="button" href="/leads">Volver a Leads</Link></section>; }
