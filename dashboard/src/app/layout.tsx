import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/sidebar';
export const metadata: Metadata = {
  title: 'Nico CRM | Seguimiento de leads',
  description: 'Organizá tus contactos y recuperá oportunidades de venta.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><div className="app-container"><Sidebar /><main className="main-content">{children}</main></div></body></html>;
}
