import { prisma } from "@/lib/prisma";
import { PhoneForwarded, ShoppingCart, UserX } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const totalLeads = leads.length;
  const pendingLeads = leads.filter((l: any) => l.status === 'PENDING_CONTACT').length;
  const contactedLeads = leads.filter((l: any) => l.status === 'CONTACTED').length;

  return (
    <div className="animate-fade-in">
      <h1>Leads Recuperados</h1>
      <p className="subtitle">Potenciales clientes detectados por Inteligencia Artificial en WhatsApp</p>

      <div className="stat-cards">
        <div className="stat-card glass delay-1">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Total Detectados</span>
            <UserX size={20} color="#3b82f6" />
          </div>
          <span className="stat-value">{totalLeads}</span>
        </div>
        
        <div className="stat-card glass delay-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Pendientes de Contacto</span>
            <PhoneForwarded size={20} color="#f59e0b" />
          </div>
          <span className="stat-value" style={{ color: '#f59e0b' }}>{pendingLeads}</span>
        </div>

        <div className="stat-card glass delay-3">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Contactados / Recuperados</span>
            <ShoppingCart size={20} color="#10b981" />
          </div>
          <span className="stat-value" style={{ color: '#10b981' }}>{contactedLeads}</span>
        </div>
      </div>

      <div className="glass" style={{ padding: '24px' }}>
        <h3 style={{ marginBottom: '24px' }}>Últimos Leads</h3>
        
        {leads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
            Aún no hay leads detectados. Escanea el código QR en el microservicio para empezar a recuperar clientes.
          </div>
        ) : (
          <div className="leads-container">
            {leads.map((lead: any) => (
              <div key={lead.id} className="lead-card glass">
                <div className="lead-info">
                  <span className="lead-name">{lead.name || 'Sin agendar'}</span>
                  <span className="lead-phone">{lead.phoneNumber}</span>
                  <div className="lead-reason">
                    {lead.aiReasoning}
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
                  <span className={lead.status === 'PENDING_CONTACT' ? 'badge badge-pending' : 'badge badge-product'}>
                    {lead.status === 'PENDING_CONTACT' ? 'Pendiente' : lead.status}
                  </span>
                  
                  {lead.interestedIn && (
                    <span className="badge badge-product" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                      Interés: {lead.interestedIn}
                    </span>
                  )}
                  
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {new Date(lead.createdAt).toLocaleDateString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
