'use client';
import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
export default function Refresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        if (document.visibilityState === 'visible' && localStorage.getItem('nico-auto-refresh') === 'true') startTransition(() => router.refresh());
      } catch { /* El navegador puede bloquear el almacenamiento local. */ }
    }, 30000);
    return () => clearInterval(timer);
  }, [router]);
  return <button className="button secondary" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCw size={16} className={pending ? 'spin' : ''} />{pending ? 'Actualizando…' : 'Actualizar'}</button>;
}
