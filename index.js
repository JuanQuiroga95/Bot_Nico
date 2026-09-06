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

// Al cerrar sesion desde el telefono, la sesion guardada queda invalidada: si sigue en disco,
// WhatsApp la rechaza en cada arranque y el bot nunca llega a mostrar un QR nuevo. Se borra
// el contenido, no la carpeta: en Railway esa ruta es el punto de montaje del volumen.
function borrarSesionGuardada() {
    try {
        if (!existsSync(AUTH_PATH)) return;
        for (const entrada of readdirSync(AUTH_PATH)) rmSync(join(AUTH_PATH, entrada), { recursive: true, force: true });
        console.log('[WhatsApp] Sesion guardada borrada. El proximo arranque pide un QR nuevo.');
    } catch (error) {
        console.error('[WhatsApp] No se pudo borrar la sesion guardada:', error);
    }
}

// Salida de emergencia: con RESET_SESSION=1 en Railway, el arranque parte de cero y pide QR.
if (process.env.RESET_SESSION === '1') {
    console.log('[WhatsApp] RESET_SESSION activo: se descarta la sesion guardada antes de arrancar.');
    borrarSesionGuardada();
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
        // Por defecto usa el Chrome instalado por Puppeteer durante el build.
        // Una ruta personalizada debe apuntar al archivo: no se busca en PATH.
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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

// Las credenciales guardadas ya no sirven: conservarlas repite el mismo error en cada arranque.
client.on('auth_failure', async (message) => {
    connectionStatus = 'error de autenticacion';
    console.error('[WhatsApp] Error de autenticacion:', message);
    await cerrarNavegador();
    borrarSesionGuardada();
    process.exit(1);
});

// client.destroy() puede quedarse colgado si Chrome ya se estaba cerrando por el logout.
async function cerrarNavegador(limite = 10000) {
    try {
        await Promise.race([client.destroy(), new Promise(resolve => setTimeout(resolve, limite))]);
    } catch {
        // El navegador ya puede haberse cerrado solo al desvincular.
    }
}

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
        await cerrarNavegador();
        borrarSesionGuardada();
        // Railway solo reinicia el servicio cuando el proceso termina con error. Saliendo con 0
        // el contenedor quedaba apagado y el dashboard se quedaba sin bot al que pedirle el QR.
        return process.exit(1);
    }
    await cerrarNavegador();
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
        const chatsLivianos = await client.pupPage.evaluate(async () => {
            return new Promise((resolve) => {
                try {
                    const request = indexedDB.open('model-storage');
                    request.onsuccess = (event) => {
                        const db = event.target.result;
                        if (!db.objectStoreNames.contains('chat')) {
                            return resolve([{ error: 'No existe el store chat' }]);
                        }
                        const tx = db.transaction('chat', 'readonly');
                        const store = tx.objectStore('chat');
                        const getAllRequest = store.getAll();
                        
                        getAllRequest.onsuccess = (e) => {
                            const records = e.target.result || [];
                            const mapped = records.map(chat => {
                                const idString = chat?.id || '';
                                const [user, server] = idString.split('@');
                                return {
                                    id: idString,
                                    user: user || '',
                                    server: server || '',
                                    isGroup: idString.includes('@g.us'),
                                    name: chat?.name || '',
                                    timestamp: Number(chat?.t || 0)
                                };
                            });
                            resolve(mapped);
                        };
                        getAllRequest.onerror = () => resolve([{ error: 'Fallo al leer chat store' }]);
                    };
                    request.onerror = () => resolve([{ error: 'Fallo al abrir model-storage' }]);
                } catch (err) {
                    resolve([{ error: err.message || 'Error IDB' }]);
                }
            });
        });

        if (chatsLivianos.length > 0 && chatsLivianos[0].error) {
            console.error('[WhatsApp] Fallo al extraer chats con WWebJS:', chatsLivianos[0].error);
            return [];
        }

        return chatsLivianos
            .filter(chat => !chat.isGroup && chat.server === 'c.us' && /^[1-9]\d{7,14}$/.test(chat.user));
    } catch (error) {
        console.error('[WhatsApp] getChats fallo por completo:', error?.message || error);
        return [];
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
                // client.getChatById y fetchMessages de WWebJS también están rotos por el mismo cambio
                // de WhatsApp en IDBObjectStore. Leemos los mensajes directamente desde IndexedDB.
                const messages = await obtenerMensajesDesdeIDB(descriptor.id, SCAN_MESSAGES);

                let chatText = '';
                let containsKeywords = false;

                for (const msg of messages) {
                    const body = (msg.body || '').toLowerCase();
                    chatText += `[${msg.fromMe ? 'Vendedor' : 'Cliente'}]: ${msg.body}\n`;

                    if (!msg.fromMe && keywordMatcher.matches(body)) {
                        containsKeywords = true;
                    }
                }
                
                console.log(`[DEBUG-HISTORIAL] Chat: ${descriptor.id} | Mensajes: ${messages.length} | Match: ${containsKeywords}`);
                if (messages.length > 0) {
                    console.log(`[DEBUG-TEXTO]\n${chatText}`);
                }

                if (containsKeywords && chatText) {
                    console.log(`Enviando historial de ${descriptor.user} a Next.js para análisis...`);
                    await enviarANextJS(descriptor.user, descriptor.name || descriptor.user, chatText);
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

async function obtenerMensajesDesdeIDB(chatId, limit) {
    return await client.pupPage.evaluate(async (id, max) => {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open('model-storage');
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('message')) {
                        return resolve([]);
                    }
                    const tx = db.transaction('message', 'readonly');
                    const store = tx.objectStore('message');
                    
                    const msgs = [];
                    const cursorRequest = store.openCursor(null, 'prev');
                    
                    cursorRequest.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            const msg = cursor.value;
                            const msgChatId = msg?.remote?.remote || msg?.remote || msg?.id?.remote || '';
                            const fromMe = msg?.id?.fromMe || msg?.fromMe || false;
                            const isMatch = typeof msgChatId === 'string' ? msgChatId.includes(id) : (msgChatId?._serialized || '').includes(id);
                            
                            if (isMatch || (msg?.id && typeof msg.id === 'string' && msg.id.includes(id))) {
                                const bodyStr = msg.body || msg.text || msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || '';
                                if (bodyStr) {
                                    msgs.unshift({
                                        fromMe: fromMe,
                                        body: bodyStr
                                    });
                                }
                            }
                            if (msgs.length >= max) {
                                return resolve(msgs);
                            }
                            cursor.continue();
                        } else {
                            resolve(msgs);
                        }
                    };
                    cursorRequest.onerror = () => resolve([]);
                };
                request.onerror = () => resolve([]);
            } catch (err) {
                resolve([]);
            }
        });
    }, chatId, limit);
}

// Escuchar nuevos mensajes en tiempo real
client.on('message', async (msg) => {
    // Un mensaje que no se puede leer no debe tumbar al bot ni cortar el barrido.
    try {
        const body = (msg.body || '').toLowerCase();
        console.log(`[DEBUG] Recibido mensaje de ${msg.from}: "${body}"`);

        // Si un mensaje nuevo contiene las palabras clave, podemos procesar el chat nuevamente
        if (!keywordMatcher.matches(body)) {
            console.log(`[DEBUG] El mensaje no contiene palabras clave. Ignorando.`);
            return;
        }

        const chatId = msg.from;
        if (!chatId || chatId.includes('@g.us') || chatId.includes('broadcast')) {
            console.log(`[DEBUG] Ignorando chat por ser grupo o broadcast: ${chatId}`);
            return;
        }

        const user = chatId.split('@')[0];
        console.log(`\n¡Nuevo mensaje relevante de ${user}! Enviando a Next.js...`);
        
        // Usar nuestra extraccion por IndexedDB porque msg.getChat() falla
        const messages = await obtenerMensajesDesdeIDB(chatId, 20);

        let chatText = '';
        for (const m of messages) {
            chatText += `[${m.fromMe ? 'Vendedor' : 'Cliente'}]: ${m.body}\n`;
        }
        
        // WhatsApp Web a veces guarda los mensajes bajo @c.us pero emite el evento con @lid.
        // Si el historial en IDB no encontró nada, usamos el mensaje actual que acabamos de recibir.
        if (!chatText.trim()) {
            chatText = `[Cliente]: ${msg.body}\n`;
        }
        
        console.log(`[DEBUG] Historial a enviar para ${user}:`, chatText);
        
        const contactName = msg._data?.notifyName || msg.notifyName || user;
        await enviarANextJS(user, contactName, chatText);
    } catch (error) {
        console.error('[WhatsApp] No se pudo procesar un mensaje entrante:', error?.message || error);
    }
});

async function enviarANextJS(phoneNumber, contactName, history) {
    try {
        if (!SECRET_TOKEN) throw new Error('Falta configurar API_SECRET_TOKEN en Railway.');
        const { data } = await axios.post(NEXTJS_API_URL, {
            phoneNumber,
            contactName: contactName || 'No agendado',
            history
        }, {
            headers: {
                'Authorization': `Bearer ${SECRET_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        if (data?.success === true && data.action === 'LEAD_SAVED' && data.lead?.id) {
            console.log(`[CRM] LEAD_SAVED: ${phoneNumber}. Lead: ${data.lead.id}`);
        } else if (data?.success === true && data.action === 'IGNORED_BY_AI') {
            console.log(`[CRM] IGNORED_BY_AI: ${phoneNumber}. Motivo: ${data.reason || 'El servidor no informó el motivo.'}`);
        } else {
            console.error(`[CRM] Respuesta inesperada para ${phoneNumber}; no se confirmó el guardado.`);
        }
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
