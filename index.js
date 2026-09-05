import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import dotenv from 'dotenv';
import { createBotStatusServer } from './bot-status.js';
import { createKeywordMatcher } from './keywords.js';
import { createCampaign } from './campaign.js';
import { existsSync } from 'node:fs';

dotenv.config();

// Cambia esto a la URL de tu Next.js cuando lo subas a Vercel
const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'http://localhost:3000/api/process-chat';
const SECRET_TOKEN = process.env.API_SECRET_TOKEN;
const keywordMatcher = createKeywordMatcher(process.env.KEYWORDS_EXTRA || '');
console.log(`[WhatsApp] Deteccion activa con ${keywordMatcher.terms.length} palabras y frases comerciales.`);

// Limites del escaneo inicial. Bajarlos si Railway reinicia el contenedor por memoria.
const SCAN_MESSAGES = Number(process.env.SCAN_MESSAGES) || 30;
const SCAN_DAYS = Number(process.env.SCAN_DAYS) || 30;
const SCAN_CHATS = Number(process.env.SCAN_CHATS) || 150;

// Sin un volumen montado en esta ruta, cada despliegue vuelve a pedir el QR.
const AUTH_PATH = process.env.WWEBJS_AUTH_PATH || './.wwebjs_auth';
console.log(`[WhatsApp] Sesion guardada en ${AUTH_PATH}${process.env.WWEBJS_AUTH_PATH ? '' : ' (temporal: se pierde al reiniciar)'}.`);
console.log(`[WhatsApp] ${existsSync(AUTH_PATH) ? 'Hay una sesion previa en esa ruta: no deberia pedir QR.' : 'No hay sesion previa: va a pedir QR.'}`);

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    puppeteer: {
        // Argumentos necesarios para que Puppeteer funcione en Railway sin interfaz grafica
        // y para que Chrome no gaste memoria en funciones que aqui no se usan.
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-gpu', '--disable-accelerated-2d-canvas', '--disable-extensions',
            '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
        ],
    }
});

// Los envios de reactivacion salen por el mismo WhatsApp vinculado. Si todavia no esta
// conectado, la cola espera en lugar de perder mensajes.
let whatsappListo = false;
const campaign = createCampaign(async (phoneNumber, message) => {
    await client.sendMessage(phoneNumber + '@c.us', message);
    console.log('[Campana] Mensaje enviado a', phoneNumber);
}, { cap: Number(process.env.SEND_DAILY_CAP) || 40, canSend: () => whatsappListo });
// Retoma la cola cuando se libera el tope diario o vuelve la conexion.
setInterval(() => campaign.pump(), 1800000).unref();

const statusServer = createBotStatusServer(client, { token: process.env.API_SECRET_TOKEN, keywords: keywordMatcher.terms, campaign });
statusServer.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () => {
    console.log('[WhatsApp] Servicio de estado y QR disponible para el dashboard.');
});
statusServer.on('error', error => {
    console.error('[WhatsApp] No se pudo iniciar el servicio de estado:', error);
    process.exit(1);
});

let connectionStatus = 'iniciando navegador';
const startupNotice = setTimeout(() => {
    console.log(`[WhatsApp] Sigue esperando conexion. Estado: ${connectionStatus}.`);
}, 120000);
startupNotice.unref();

client.on('loading_screen', (percent, message) => {
    connectionStatus = `cargando ${percent}%`;
    console.log(`[WhatsApp] ${connectionStatus}: ${message}`);
});

client.on('authenticated', () => {
    connectionStatus = 'autenticado, sincronizando';
    console.log('[WhatsApp] Sesion autenticada. Esperando que termine de sincronizar.');
});

client.on('auth_failure', (message) => {
    connectionStatus = 'error de autenticacion';
    console.error('[WhatsApp] Error de autenticacion:', message);
});

// Una desconexion no debe matar el proceso: con la sesion en disco se recupera sola.
// Ante LOGOUT la sesion guardada ya no sirve y el navegador se esta cerrando: hay que
// esperar a que termine antes de reintentar, o Puppeteer falla al inyectar el cliente.
let reconectando = false;
client.on('disconnected', async (reason) => {
    connectionStatus = 'desconectado, reintentando';
    whatsappListo = false;
    console.error('[WhatsApp] Desconectado:', reason);
    if (reconectando) return;
    reconectando = true;
    try {
        await client.destroy();
    } catch {
        // El navegador ya puede haberse cerrado solo al desvincular.
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
    try {
        await client.initialize();
        console.log('[WhatsApp] Reconexion iniciada. Si la sesion caduco, se pedira un QR nuevo.');
    } catch (error) {
        // Railway reinicia el contenedor y el proximo arranque parte de cero.
        console.error('[WhatsApp] No se pudo reconectar:', error);
        process.exit(1);
    } finally {
        reconectando = false;
    }
});

client.on('ready', () => {
    clearTimeout(startupNotice);
    connectionStatus = 'listo';
    whatsappListo = true;
    // Si quedaron mensajes esperando una reconexion, salen ahora.
    campaign.pump();
});

client.on('qr', (qr) => {
    connectionStatus = 'QR generado, esperando escaneo';
    console.log('[WhatsApp] QR generado. Escanea el ultimo QR en los Deploy Logs.');
    console.log('\n\n=== ESCANEA ESTE QR CON TU WHATSAPP ===\n');
    qrcode.generate(qr, { small: true });
});

// El escaneo corre una sola vez por proceso: al reconectar no se repite.
let escaneoHecho = false;
client.on('ready', () => {
    console.log('¡Cliente de WhatsApp listo y conectado!');
    if (escaneoHecho) return;
    escaneoHecho = true;
    // Damos aire a la sincronizacion antes de leer historiales.
    setTimeout(iniciarEscaneo, 15000);
});

async function iniciarEscaneo() {
    try {
        console.log('Obteniendo chats...');
        const desde = Date.now() / 1000 - SCAN_DAYS * 86400;
        // Solo conversaciones individuales con actividad reciente: el resto no es recuperable.
        const chats = (await client.getChats())
            .filter(chat => !chat.isGroup && (chat.timestamp || 0) >= desde)
            .slice(0, SCAN_CHATS);
        console.log(`Analizando ${chats.length} chats de los ultimos ${SCAN_DAYS} dias.`);

        for (const chat of chats) {
            console.log(`Analizando chat con: ${chat.name || chat.id.user}`);

            const messages = await chat.fetchMessages({ limit: SCAN_MESSAGES });

            let chatText = '';
            let containsKeywords = false;

            for (const msg of messages) {
                const body = msg.body.toLowerCase();
                chatText += `[${msg.fromMe ? 'Vendedor' : 'Cliente'}]: ${msg.body}\n`;

                if (!msg.fromMe && keywordMatcher.matches(body)) {
                    containsKeywords = true;
                }
            }

            if (containsKeywords) {
                console.log(`Enviando historial de ${chat.id.user} a Next.js para análisis...`);
                await enviarANextJS(chat.id.user, chat.name, chatText);
            }

            // Delay para evitar baneos
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log('Escaneo inicial completado. El bot quedará a la espera de nuevos mensajes.');
    } catch (error) {
        console.error('Error durante el escaneo:', error);
    }
}

// Escuchar nuevos mensajes en tiempo real
client.on('message', async (msg) => {
    const body = msg.body.toLowerCase();
    
    // Si un mensaje nuevo contiene las palabras clave, podemos procesar el chat nuevamente
    if (keywordMatcher.matches(body)) {
        const chat = await msg.getChat();
        if (chat.isGroup) return;

        console.log(`\n¡Nuevo mensaje relevante de ${chat.name || chat.id.user}! Enviando a Next.js...`);
        const messages = await chat.fetchMessages({ limit: 20 });
        
        let chatText = '';
        for (const m of messages) {
            chatText += `[${m.fromMe ? 'Vendedor' : 'Cliente'}]: ${m.body}\n`;
        }

        await enviarANextJS(chat.id.user, chat.name, chatText);
    }
});

async function enviarANextJS(phoneNumber, contactName, history) {
    try {
        if (!SECRET_TOKEN) throw new Error('Falta configurar API_SECRET_TOKEN en Railway.');
        await axios.post(NEXTJS_API_URL, {
            phoneNumber,
            contactName: contactName || 'No agendado',
            history
        }, {
            headers: {
                'Authorization': `Bearer ${SECRET_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`[EXITO] Datos enviados correctamente a Next.js`);
    } catch (error) {
        console.error(`[ERROR] Al enviar datos de ${phoneNumber}:`, error.response?.data || error.message);
    }
}

console.log('[WhatsApp] Iniciando navegador y cargando WhatsApp Web...');
client.initialize().catch(async (error) => {
    clearTimeout(startupNotice);
    console.error('[WhatsApp] No se pudo inicializar:', error);
    try {
        await client.destroy();
    } catch {
        // El navegador puede no haber llegado a crearse.
    }
    process.exit(1);
});
