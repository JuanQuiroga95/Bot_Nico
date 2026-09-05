import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import dotenv from 'dotenv';
import { createBotStatusServer } from './bot-status.js';
import { createKeywordMatcher } from './keywords.js';

dotenv.config();

// Cambia esto a la URL de tu Next.js cuando lo subas a Vercel
const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'http://localhost:3000/api/process-chat';
const SECRET_TOKEN = process.env.API_SECRET_TOKEN;
const keywordMatcher = createKeywordMatcher(process.env.KEYWORDS_EXTRA || '');
console.log(`[WhatsApp] Deteccion activa con ${keywordMatcher.terms.length} palabras y frases comerciales.`);

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: process.env.WWEBJS_AUTH_PATH || './.wwebjs_auth' }),
    puppeteer: {
        // Argumentos necesarios para que Puppeteer funcione en Railway sin interfaz gráfica
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    }
});

const statusServer = createBotStatusServer(client, { token: process.env.API_SECRET_TOKEN, keywords: keywordMatcher.terms });
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

client.on('disconnected', (reason) => {
    console.error('[WhatsApp] Desconectado:', reason);
});

client.on('ready', () => {
    clearTimeout(startupNotice);
    connectionStatus = 'listo';
});

client.on('qr', (qr) => {
    connectionStatus = 'QR generado, esperando escaneo';
    console.log('[WhatsApp] QR generado. Escanea el ultimo QR en los Deploy Logs.');
    console.log('\n\n=== ESCANEA ESTE QR CON TU WHATSAPP ===\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('¡Cliente de WhatsApp listo y conectado!');
    iniciarEscaneo();
});

async function iniciarEscaneo() {
    try {
        console.log('Obteniendo chats...');
        const chats = await client.getChats();
        
        for (const chat of chats) {
            if (chat.isGroup) continue; // Ignorar grupos

            console.log(`Analizando chat con: ${chat.name || chat.id.user}`);

            const messages = await chat.fetchMessages({ limit: 100 });
            
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
