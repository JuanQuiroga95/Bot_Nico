'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MessageSquare, Send, Settings, Users } from 'lucide-react';
export default function Sidebar() {
  const pathname = usePathname();
  return <aside className="sidebar glass-panel">
    <Link href="/" className="brand"><span className="brand-icon"><MessageSquare size={24} /></span><span>Nico CRM<small>Seguimiento comercial</small></span></Link>
    <nav aria-label="Navegación principal">{[
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/leads', label: 'Leads', icon: Users },
      { href: '/campanas', label: 'Campañas', icon: Send },
      { href: '/configuracion', label: 'Configuración', icon: Settings },
    ].map(({ href, label, icon: Icon }) => {
      const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
      return <Link key={href} href={href} className={'nav-link ' + (active ? 'active' : '')} aria-current={active ? 'page' : undefined}><Icon size={20} />{label}</Link>;
    })}</nav>
    <p className="sidebar-foot">Cada conversación es una oportunidad para volver a conectar.</p>
  </aside>;
}
