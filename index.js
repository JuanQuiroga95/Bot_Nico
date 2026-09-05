import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Cambia esto a la URL de tu Next.js cuando lo subas a Vercel
const NEXTJS_API_URL = process.env.NEXTJS_API_URL || 'http://localhost:3000/api/process-chat';
const SECRET_TOKEN = process.env.API_SECRET_TOKEN || 'mi_secreto_super_seguro'; 
const KEYWORDS = ['combo', 'jabon', 'jabón', 'limpieza'];

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        // Ejecutable de Chromium provisto por Nixpacks en Railway
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'chromium',
        // Argumentos necesarios para que Puppeteer funcione en Railway sin interfaz gráfica
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    }
});

client.on('qr', (qr) => {
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

                if (!msg.fromMe && KEYWORDS.some(kw => body.includes(kw))) {
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
    if (KEYWORDS.some(kw => body.includes(kw))) {
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

client.initialize();
