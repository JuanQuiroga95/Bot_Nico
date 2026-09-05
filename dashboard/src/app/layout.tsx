import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MessageSquare, LayoutDashboard, Settings, Users } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CRM WhatsApp Recovery",
  description: "AI-Powered WhatsApp Lead Recovery Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <div className="app-container">
          <aside className="sidebar glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{ background: 'var(--primary)', padding: '8px', borderRadius: '8px' }}>
                <MessageSquare size={24} color="white" />
              </div>
              <h2 style={{ fontSize: '1.2rem', color: 'white' }}>Nico CRM</h2>
            </div>
            
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', textDecoration: 'none', fontWeight: 500 }}>
                <LayoutDashboard size={20} />
                Dashboard
              </a>
              <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', color: '#94a3b8', textDecoration: 'none' }}>
                <Users size={20} />
                Leads (Pronto)
              </a>
              <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', color: '#94a3b8', textDecoration: 'none' }}>
                <Settings size={20} />
                Configuración
              </a>
            </nav>
          </aside>
          
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
