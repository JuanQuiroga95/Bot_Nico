import { redirect } from 'next/navigation';
import { hasSession } from '@/lib/auth';
import LoginForm from '@/components/login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await hasSession()) redirect('/');
  return <section className="login-wrap"><div className="glass login-card"><span className="eyebrow">BIENVENIDO A NICO CRM</span><h1>Volvé a conectar.</h1><p className="subtitle">Ingresá para gestionar tus contactos y oportunidades de venta.</p><LoginForm configured={!!process.env.DASHBOARD_PASSWORD} /></div></section>;
}
