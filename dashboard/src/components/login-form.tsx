'use client';
import { useActionState } from 'react';
import { login } from '@/app/actions';
import { LockKeyhole } from 'lucide-react';
export default function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(login, {});
  return <form action={action} className="form-stack">
    {!configured && <p className="notice">Falta activar el acceso: configurá DASHBOARD_PASSWORD en las variables privadas de Vercel y volvé a desplegar.</p>}
    <label>Usuario<input name="username" autoComplete="username" required maxLength={100} autoFocus /></label>
    <label>Contraseña<input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button className="button" disabled={pending || !configured}><LockKeyhole size={17} />{pending ? 'Ingresando…' : 'Ingresar'}</button>
  </form>;
}
