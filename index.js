import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import dotenv from 'dotenv';
import { createBotStatusServer } from './bot-status.js';
import { createKeywordMatcher } from './keywords.js';
import { createCampaign } from './campaign.js';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

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

// Si el contenedor se apaga de golpe, Chrome deja cerraduras que impiden reusar el perfil
// y WhatsApp descarta la sesion. Se borran al arrancar: no contienen credenciales.
function limpiarBloqueos(ruta, profundidad = 0) {
    if (profundidad > 3 || !existsSync(ruta)) return;
    for (const entrada of readdirSync(ruta, { withFileTypes: true })) {
        const hijo = join(ruta, entrada.name);
        if (entrada.isDirectory()) limpiarBloqueos(hijo, profundidad + 1);
        else if (['SingletonLock', 'SingletonCookie', 'SingletonSocket'].includes(entrada.name)) {
            rmSync(hijo, { force: true });
            console.log('[WhatsApp] Cerradura de Chrome eliminada:', hijo);
        }
    }
}
try {
    limpiarBloqueos(AUTH_PATH);
} catch (error) {
    console.error('[WhatsApp] No se pudieron revisar las cerraduras de Chrome:', error);
}

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    // Identifica claramente esta instancia y resuelve una sesión web duplicada
    // (por ejemplo, una pestaña de WhatsApp Web abierta en otra computadora).
    deviceName: 'Nico CRM Bot',
    browserName: 'Nico CRM',
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
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
    // Con LOGOUT la sesion quedo invalidada: reconectar en caliente hace fallar a Puppeteer
    // ("Execution context was destroyed"). Conviene salir y dejar que arranque un proceso limpio.
    if (String(reason).toUpperCase() === 'LOGOUT') {
        console.error('[WhatsApp] La sesion fue cerrada desde el telefono. Reiniciando para pedir un QR nuevo.');
        return process.exit(0);
    }
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

// WhatsApp expone como chats a los estados (status@broadcast), los grupos y los canales.
// Solo las conversaciones individuales tienen un telefono al que volver a escribir.
function esChatDeCliente(chat) {
    return !chat?.isGroup && chat?.id?.server === 'c.us' && /^[1-9]\d{7,14}$/.test(chat?.id?.user ?? '');
}

// getChats() serializa todas las conversaciones en una sola operacion dentro del navegador
// y en cuentas grandes eso falla. Si pasa, se pide solo la lista de identificadores, que es
// liviana, y despues se trae cada chat por separado.
async function listarChats() {
    try {
        const chats = await client.getChats();
        return chats.filter(esChatDeCliente).map(chat => ({
            id: chat.id._serialized, user: chat.id.user, name: chat.name || '', timestamp: chat.timestamp || 0,
        }));
    } catch (error) {
        console.error('[WhatsApp] getChats fallo, uso el listado liviano de identificadores:', error?.message || error);
        const crudos = await client.pupPage.evaluate(() => {
            const hasStore = !!window.Store;
            const hasChat = !!window.Store?.Chat;
            const hasModelsArray = !!window.Store?.Chat?.getModelsArray;
            console.log('Store check:', { hasStore, hasChat, hasModelsArray });

            const modelos = window.Store?.Chat?.getModelsArray?.() || [];
            return modelos.map(chat => {
                try {
                    const id = chat?.id;
                    return {
                        id: id?._serialized ?? '',
                        user: id?.user ?? '',
                        server: id?.server ?? '',
                        isGroup: !!chat?.isGroup,
                        name: '',
                        timestamp: Number(chat?.t || 0),
                    };
                } catch {
                    return null;
                }
            }).filter(Boolean);
        });
        
        // Let's also retrieve the console logs from the page if possible, or just return the check info.
        const storeCheck = await client.pupPage.evaluate(() => {
            return {
                hasStore: !!window.Store,
                hasChat: !!window.Store?.Chat,
                hasModelsArray: !!window.Store?.Chat?.getModelsArray,
                storeKeys: window.Store ? Object.keys(window.Store) : []
            };
        });
        console.log('[WhatsApp] Debug Store:', storeCheck);

        return crudos.filter(chat => !chat.isGroup && chat.server === 'c.us' && /^[1-9]\d{7,14}$/.test(chat.user));
    }
}

// El escaneo corre una sola vez por proceso: al reconectar no se repite.
let escaneoHecho = false;
client.on('ready', () => {
    console.log('¡Cliente de WhatsApp listo y conectado!');
    if (escaneoHecho) return;
    escaneoHecho = true;
    // Damos aire a la sincronizacion antes de leer historiales: con menos margen,
    // getChats falla porque WhatsApp Web todavia esta acomodandose.
    setTimeout(iniciarEscaneo, 60000);
});

async function iniciarEscaneo(intento = 1) {
    try {
        console.log('Obteniendo chats...');
        const desde = Date.now() / 1000 - SCAN_DAYS * 86400;
        // Solo conversaciones individuales con actividad reciente: el resto no es recuperable.
        const todos = await listarChats();
        const chats = todos
            .filter(chat => (chat.timestamp || 0) >= desde)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, SCAN_CHATS);
        console.log(`Analizando ${chats.length} de ${todos.length} chats, de los ultimos ${SCAN_DAYS} dias.`);

        let revisados = 0;
        let enviados = 0;
        for (const descriptor of chats) {
            // Un chat ilegible no puede cortar el barrido de todos los demas.
            try {
                const chat = await client.getChatById(descriptor.id);
                const messages = await chat.fetchMessages({ limit: SCAN_MESSAGES });

                let chatText = '';
                let containsKeywords = false;

                for (const msg of messages) {
                    const body = (msg.body || '').toLowerCase();
                    chatText += `[${msg.fromMe ? 'Vendedor' : 'Cliente'}]: ${msg.body}\n`;

                    if (!msg.fromMe && keywordMatcher.matches(body)) {
                        containsKeywords = true;
                    }
                }

                if (containsKeywords) {
                    console.log(`Enviando historial de ${descriptor.user} a Next.js para análisis...`);
                    await enviarANextJS(descriptor.user, descriptor.name || chat.name, chatText);
                    enviados++;
                }
            } catch (error) {
                console.error(`No se pudo leer el chat de ${descriptor.user}:`, error?.message || error);
            }
            revisados++;
            if (revisados % 25 === 0) console.log(`Barrido: ${revisados} de ${chats.length} chats revisados, ${enviados} enviados a analizar.`);

            // Delay para evitar baneos
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        console.log(`Barrido terminado: ${revisados} chats revisados, ${enviados} enviados a analizar.`);

        console.log('Escaneo inicial completado. El bot quedará a la espera de nuevos mensajes.');
    } catch (error) {
        // Recien vinculado, WhatsApp Web puede rechazar getChats hasta terminar de asentarse.
        console.error(`Error durante el escaneo (intento ${intento} de 3):`, error);
        if (intento < 3) setTimeout(() => iniciarEscaneo(intento + 1), 60000);
        else console.error('[WhatsApp] El barrido del historial no pudo completarse. Reinicia el servicio para volver a intentarlo.');
    }
}

// Escuchar nuevos mensajes en tiempo real
client.on('message', async (msg) => {
    // Un mensaje que no se puede leer no debe tumbar al bot ni cortar el barrido.
    try {
        const body = (msg.body || '').toLowerCase();

        // Si un mensaje nuevo contiene las palabras clave, podemos procesar el chat nuevamente
        if (!keywordMatcher.matches(body)) return;

        const chat = await msg.getChat();
        if (!esChatDeCliente(chat)) return;

        console.log(`\n¡Nuevo mensaje relevante de ${chat.name || chat.id.user}! Enviando a Next.js...`);
        const messages = await chat.fetchMessages({ limit: 20 });

        let chatText = '';
        for (const m of messages) {
            chatText += `[${m.fromMe ? 'Vendedor' : 'Cliente'}]: ${m.body}\n`;
        }

        await enviarANextJS(chat.id.user, chat.name, chatText);
    } catch (error) {
        console.error('[WhatsApp] No se pudo procesar un mensaje entrante:', error?.message || error);
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

// Railway avisa con SIGTERM antes de apagar el contenedor. Si Chrome no cierra ordenado,
// deja el perfil a medio escribir y WhatsApp descarta la sesion en el siguiente arranque.
let cerrando = false;
async function apagar(senal) {
    if (cerrando) return;
    cerrando = true;
    console.log(`[WhatsApp] ${senal} recibido: cerrando el navegador para conservar la sesion.`);
    const limite = setTimeout(() => {
        console.error('[WhatsApp] El navegador tardo demasiado en cerrar. Saliendo igual.');
        process.exit(0);
    }, 15000);
    try {
        await client.destroy();
        console.log('[WhatsApp] Navegador cerrado. La sesion quedo guardada.');
    } catch (error) {
        console.error('[WhatsApp] No se pudo cerrar el navegador:', error);
    }
    clearTimeout(limite);
    process.exit(0);
}
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));

// Sin esto, una falla del navegador termina el proceso con un volcado de Puppeteer que
// no dice nada sobre el bot. Railway reinicia igual, pero el log queda explicado.
process.on('uncaughtException', error => {
    console.error('[WhatsApp] Fallo no controlado, reiniciando:', error);
    process.exit(1);
});
// Una promesa suelta no justifica tirar el bot: whatsapp-web.js falla seguido al leer
// mensajes de sistema, y reiniciar por eso cancelaba el barrido del historial.
process.on('unhandledRejection', error => {
    console.error('[WhatsApp] Promesa rechazada sin control (el bot sigue andando):', error);
});

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
