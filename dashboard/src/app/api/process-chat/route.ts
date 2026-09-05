import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// IMPORTANTE: Configuración para Vercel Pro (máximo 300 segundos)
export const maxDuration = 300; 
export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';

// La ausencia de una clave se informa sin crear oportunidades simuladas.
const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

export async function POST(req: Request) {
  try {
    // 1. Verificación de Seguridad
    const authHeader = req.headers.get('authorization');
    const secret = process.env.API_SECRET_TOKEN;
    
    if (!secret || !authHeader || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado. Token inválido.' }, { status: 401 });
    }

    let body;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'El cuerpo debe ser JSON válido.' }, { status: 400 });
    }
    const { phoneNumber, contactName, history } = body ?? {};

    if (typeof phoneNumber !== 'string' || !/^[1-9]\d{7,14}$/.test(phoneNumber) || typeof history !== 'string' || !history.trim() || history.length > 200000 || (contactName != null && (typeof contactName !== 'string' || contactName.length > 120))) {
      return NextResponse.json({ error: 'Faltan datos requeridos (phoneNumber o history)' }, { status: 400 });
    }

    if (!openai) return NextResponse.json({ error: 'Falta configurar OPENAI_API_KEY.' }, { status: 503 });
    let aiResponse: { isRecoverable: boolean; reason: string; lastInteractedProduct: string | null };

    // 2. Procesamiento con IA (Si hay key)
    {
      console.log(`Llamando a OpenAI para procesar el chat de ${phoneNumber}...`);
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Eres un asistente de ventas de una distribuidora/empresa. Analiza el siguiente historial de chat de WhatsApp entre un vendedor y un cliente.
            El objetivo es identificar clientes perdidos o personas interesadas en productos e insumos de limpieza que no concretaron una compra. Incluye detergente, cloro, lavandina, jabones, suavizantes, pastas, esponjas, trapos, accesorios, papel y productos de higiene. También considera consultas comerciales por listas, precios, catálogo, stock, envíos, horarios, ubicación, pedidos y venta mayorista. Una palabra clave por sí sola no alcanza: analiza el contexto y no clasifiques ventas ya concretadas como perdidas.
            Determina si es un "CLIENTE PERDIDO RECUPERABLE".
            Responde EXCLUSIVAMENTE con un JSON con el siguiente formato, sin markdown extra:
            {
              "isRecoverable": true/false,
              "reason": "breve justificación de por qué en 1 oración",
              "lastInteractedProduct": "combo / jabon / etc o null"
            }`
          },
          {
            role: "user",
            content: history
          }
        ],
        response_format: { type: "json_object" }
      });

      try {
        aiResponse = JSON.parse(completion.choices[0].message.content || '{}');
      } catch (e) {
         console.error('Error parseando JSON de OpenAI:', e);
         return NextResponse.json({ error: 'El análisis no devolvió una respuesta válida.' }, { status: 502 });
      }
    }

    if (!aiResponse || typeof aiResponse.isRecoverable !== 'boolean' || typeof aiResponse.reason !== 'string' || aiResponse.reason.length > 4000 || (aiResponse.lastInteractedProduct !== null && (typeof aiResponse.lastInteractedProduct !== 'string' || aiResponse.lastInteractedProduct.length > 200))) {
      return NextResponse.json({ error: 'El análisis devolvió datos incompletos.' }, { status: 502 });
    }

    // 3. Si la IA determina que es recuperable, guardamos
    if (aiResponse.isRecoverable) {
      console.log(`Guardando Lead recuperable: ${phoneNumber}`);
      
      const recoveredLead = await prisma.lead.upsert({
        where: { phoneNumber },
        update: {
          lastHistory: history,
          aiReasoning: aiResponse.reason,
          interestedIn: aiResponse.lastInteractedProduct,
          updatedAt: new Date(),
        },
        create: {
          phoneNumber,
          name: contactName,
          lastHistory: history,
          aiReasoning: aiResponse.reason,
          interestedIn: aiResponse.lastInteractedProduct,
          status: 'PENDING_CONTACT',
        }
      });

      return NextResponse.json({ success: true, action: 'LEAD_SAVED', lead: recoveredLead });
    }

    return NextResponse.json({ success: true, action: 'IGNORED_BY_AI' });

  } catch (error) {
    console.error('Error procesando chat:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
