import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

// IMPORTANTE: Configuración para Vercel Pro (máximo 300 segundos)
export const maxDuration = 300; 
export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';

// Inicializamos OpenAI solo si hay una API Key, de lo contrario lo mockeamos para que no explote
const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

export async function POST(req: Request) {
  try {
    // 1. Verificación de Seguridad
    const authHeader = req.headers.get('authorization');
    const secret = process.env.API_SECRET_TOKEN || 'mi_secreto_super_seguro_123'; // Default para pruebas locales
    
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado. Token inválido.' }, { status: 401 });
    }

    const body = await req.json();
    const { phoneNumber, contactName, history } = body;

    if (!phoneNumber || !history) {
      return NextResponse.json({ error: 'Faltan datos requeridos (phoneNumber o history)' }, { status: 400 });
    }

    let aiResponse = {
        isRecoverable: true,
        reason: "SIMULADO: No hay OPENAI_API_KEY configurada. Se asume recuperable.",
        lastInteractedProduct: "Desconocido"
    };

    // 2. Procesamiento con IA (Si hay key)
    if (openai) {
      console.log(`Llamando a OpenAI para procesar el chat de ${phoneNumber}...`);
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Eres un asistente de ventas de una distribuidora/empresa. Analiza el siguiente historial de chat de WhatsApp entre un vendedor y un cliente.
            El objetivo es identificar clientes perdidos o personas que preguntaron por precios ("combo", "jabon", "limpieza") pero no compraron.
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
      }
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
