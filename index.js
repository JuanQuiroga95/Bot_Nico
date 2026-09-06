import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
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
// Por defecto se barre el historial de dos anos: es lo que hace falta para encontrar
// clientes viejos que dejaron de comprar, no solo consultas del ultimo mes.
const SCAN_MESSAGES = Number(process.env.SCAN_MESSAGES) || 60;
const SCAN_DAYS = Number(process.env.SCAN_DAYS) || 730;
const SCAN_CHATS = Number(process.env.SCAN_CHATS) || 1000;
// El volcado del texto de cada chat sirve para depurar, pero con miles de mensajes
// inunda los logs de Railway y deja conversaciones de clientes escritas ahi.
const DEBUG_CHATS = process.env.DEBUG_CHATS === '1';
// Un contacto con el que no se habla hace mas de esto es al que hay que volver a tocar.
const INACTIVE_DAYS = Number(process.env.INACTIVE_DAYS) || 30;
// Cada cuanto se vuelve a revisar la agenda. Corre solo: nadie tiene que pedirlo.
const SWEEP_HOURS = Number(process.env.SWEEP_HOURS) || 12;

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
const campaign = createCampaign(async (phoneNumber, message, media) => {
    // Con imagen el texto viaja como epigrafe: llega un solo mensaje, no dos.
    if (media) await client.sendMessage(phoneNumber + '@c.us', new MessageMedia(media.mimetype, media.data, media.filename), { caption: message });
    else await client.sendMessage(phoneNumber + '@c.us', message);
    console.log('[Campana] Mensaje enviado a', phoneNumber, media ? '(con imagen)' : '');
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

// client.getChats() serializa cada conversacion entera y basta con que una sola este rota
// para que se caiga la lista completa. Se leen a mano los cuatro campos que se necesitan
// desde el mismo Store que usa WhatsApp Web, sin pasar por esa serializacion.
async function listarChatsDelStore() {
    return await client.pupPage.evaluate(() => {
        const coleccion = window.require?.('WAWebCollections')?.Chat;
        if (!coleccion?.getModelsArray) return { error: 'El Store de WhatsApp no expone la lista de chats.' };
        // WhatsApp identifica conversaciones nuevas con un @lid en lugar del telefono.
        let aTelefono = null;
        try { aTelefono = window.require('WAWebLidMigrationUtils').toPn; } catch { /* version sin @lid */ }
        const chats = [];
        for (const chat of coleccion.getModelsArray()) {
            // Un chat ilegible no puede cortar el listado de todos los demas.
            try {
                const wid = (chat.id?.server === 'lid' && aTelefono ? aTelefono(chat.id) : null) || chat.id;
                chats.push({
                    id: chat.id?._serialized || '',
                    user: wid?.user || '',
                    server: wid?.server || '',
                    isGroup: !!chat.isGroup,
                    name: chat.formattedTitle || chat.name || '',
                    timestamp: Number(chat.t || 0),
                });
            } catch { /* siguiente chat */ }
        }
        return { chats };
    });
}

// Respaldo por si una actualizacion de WhatsApp cambia los nombres de sus modulos internos:
// los mismos datos estan en la base IndexedDB del navegador.
async function listarChatsDesdeIDB() {
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
            console.error('[WhatsApp] Fallo al extraer chats desde IndexedDB:', chatsLivianos[0].error);
            return [];
        }
        return chatsLivianos;
    } catch (error) {
        console.error('[WhatsApp] La lectura de chats por IndexedDB fallo por completo:', error?.message || error);
        return [];
    }
}

// Solo las conversaciones individuales tienen un telefono al que volver a escribir:
// los grupos, los estados y los canales tambien aparecen como chats.
function esChatDeCliente(chat) {
    return !chat.isGroup && chat.server === 'c.us' && /^[1-9]\d{7,14}$/.test(chat.user);
}

async function listarChats() {
    let crudos = [];
    try {
        const resultado = await listarChatsDelStore();
        if (resultado?.error) console.error('[WhatsApp]', resultado.error, 'Se prueba con IndexedDB.');
        else crudos = resultado.chats || [];
    } catch (error) {
        console.error('[WhatsApp] No se pudo leer el Store de chats:', error?.message || error);
    }
    if (!crudos.length) crudos = await listarChatsDesdeIDB();
    const chats = crudos.filter(esChatDeCliente);
    console.log(`[WhatsApp] ${crudos.length} conversaciones en total, ${chats.length} son de clientes individuales.`);
    return chats;
}

// El barrido se repite solo cada SWEEP_HOURS. No manda nada: deja la lista de contactos
// dormidos en el panel para que el vendedor elija a quien escribirle y con que texto.
let barridoEnCurso = false;
let barridoProgramado = false;
client.on('ready', () => {
    console.log('Cliente de WhatsApp listo y conectado.');
    if (barridoProgramado) return;
    barridoProgramado = true;
    // Damos aire a la sincronizacion antes de leer historiales: con menos margen,
    // WhatsApp Web todavia esta acomodando los chats y devuelve la lista incompleta.
    setTimeout(barrerAgenda, 60000);
    setInterval(barrerAgenda, SWEEP_HOURS * 3600000).unref();
});

// Lee los mensajes de un chat pidiendole a WhatsApp los mas viejos, igual que cuando se
// sube el scroll en la aplicacion. Sin esto solo se ve lo que quedo en cache al vincular.
async function obtenerMensajesDelStore(chatId, limite, vueltas) {
    return await client.pupPage.evaluate(async (id, max, maxVueltas) => {
        const modulos = window.require?.('WAWebCollections');
        if (!modulos?.Chat?.get) return { error: 'El Store de WhatsApp no expone los chats.', messages: [] };
        const chat = modulos.Chat.get(window.require('WAWebWidFactory').createWid(id));
        if (!chat) return { error: 'La conversacion ya no esta en el Store.', messages: [] };
        const util = m => m && !m.isNotification;
        let msgs = chat.msgs?.getModelsArray?.().filter(util) || [];
        const cargar = window.require('WAWebChatLoadMessages');
        // Cada pedido trae una tanda de mensajes viejos; el tope de vueltas evita quedarse
        // colgado en una conversacion con anos de historial.
        for (let vuelta = 0; msgs.length < max && vuelta < maxVueltas; vuelta++) {
            let previos;
            try { previos = await cargar.loadEarlierMsgs({ chat }); } catch { break; }
            if (!previos?.length) break;
            msgs = [...previos.filter(util), ...msgs];
        }
        msgs.sort((a, b) => Number(a.t || 0) - Number(b.t || 0));
        if (msgs.length > max) msgs = msgs.slice(msgs.length - max);
        return { messages: msgs.map(m => ({
            fromMe: !!(m.id?.fromMe ?? m.fromMe),
            body: String(m.body || m.caption || ''),
            t: Number(m.t || 0),
        })) };
    }, chatId, limite, vueltas);
}

// El Store es la fuente buena; IndexedDB queda como respaldo por si WhatsApp renombra
// sus modulos internos en una actualizacion.
async function obtenerMensajes(chatId, limite, vueltas = 4) {
    try {
        const resultado = await obtenerMensajesDelStore(chatId, limite, vueltas);
        if (resultado?.messages?.length) return resultado.messages;
        if (resultado?.error) console.error('[WhatsApp] Sin historial en el Store para ' + chatId + ': ' + resultado.error);
    } catch (error) {
        console.error('[WhatsApp] Fallo la lectura del historial en el Store:', error?.message || error);
    }
    return await obtenerMensajesDesdeIDB(chatId, limite);
}

// Recorre la agenda y registra los contactos con los que hace tiempo que no se habla.
// Aca no interviene la IA: son fechas de ultimo mensaje, no hay nada que interpretar.
async function barrerAgenda() {
    if (barridoEnCurso) {
        console.log('[Barrido] El barrido anterior sigue corriendo; se saltea esta vuelta.');
        return 0;
    }
    if (!whatsappListo) {
        console.log('[Barrido] WhatsApp todavia no esta listo; se reintenta en la proxima vuelta.');
        return 0;
    }
    barridoEnCurso = true;
    try {
        const ahora = Date.now() / 1000;
        const desde = ahora - SCAN_DAYS * 86400;
        const hasta = ahora - INACTIVE_DAYS * 86400;
        const todos = await listarChats();
        // Dormidos: hablaron alguna vez dentro de la ventana, pero no en el ultimo mes.
        const dormidos = todos
            .filter(chat => (chat.timestamp || 0) >= desde && (chat.timestamp || 0) <= hasta)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, SCAN_CHATS);
        console.log('[Barrido] ' + dormidos.length + ' contactos sin actividad hace mas de ' + INACTIVE_DAYS + ' dias (ventana de ' + SCAN_DAYS + ' dias).');

        let revisados = 0;
        let sinHistorial = 0;
        let descartados = 0;
        let sincronizados = 0;
        let lote = [];
        for (const descriptor of dormidos) {
            // Un chat ilegible no puede cortar el barrido de todos los demas.
            try {
                const messages = await obtenerMensajes(descriptor.id, SCAN_MESSAGES, 2);
                if (!messages.length) sinHistorial++;
                const delCliente = messages.filter(m => !m.fromMe);
                // Escribirle a alguien que nunca contesto es la via rapida a que WhatsApp
                // marque la cuenta como spam: solo entran conversaciones de ida y vuelta.
                if (!delCliente.length) { descartados++; revisados++; continue; }
                const ultimo = messages.reduce((max, m) => Math.max(max, m.t || 0), descriptor.timestamp || 0);
                const historial = messages.map(m => '[' + (m.fromMe ? 'Vendedor' : 'Cliente') + ']: ' + m.body).join('\n');
                if (DEBUG_CHATS) console.log('[Barrido] ' + descriptor.user + ' | ' + messages.length + ' mensajes | ultimo ' + new Date(ultimo * 1000).toISOString());
                lote.push({
                    phoneNumber: descriptor.user,
                    contactName: descriptor.name || null,
                    lastMessageAt: new Date(ultimo * 1000).toISOString(),
                    inboundCount: delCliente.length,
                    // Alcanza con el final de la conversacion para saber por donde quedo.
                    history: historial.slice(-4000),
                    // Si alguna vez preguntaron por productos, la promo les cae mejor.
                    matchedKeywords: delCliente.some(m => keywordMatcher.matches((m.body || '').toLowerCase())),
                });
            } catch (error) {
                console.error('[Barrido] No se pudo leer el chat de ' + descriptor.user + ':', error?.message || error);
            }
            revisados++;
            if (lote.length >= 100) { sincronizados += await sincronizarContactos(lote); lote = []; }
            if (revisados % 25 === 0) console.log('[Barrido] ' + revisados + ' de ' + dormidos.length + ' revisados.');
            // Pausa corta: leer historiales viejos obliga a WhatsApp a pedirselos al telefono.
            await new Promise(resolve => setTimeout(resolve, 1200));
        }
        if (lote.length) sincronizados += await sincronizarContactos(lote);

        console.log('[Barrido] Terminado: ' + revisados + ' chats revisados, ' + sincronizados + ' contactos cargados en el panel, ' + descartados + ' descartados por no haber respondido nunca.');
        if (sinHistorial) console.log('[Barrido] ' + sinHistorial + ' chats no devolvieron mensajes. Si son casi todos, WhatsApp cambio la forma de guardar el historial.');
        return sincronizados;
    } catch (error) {
        console.error('[Barrido] El barrido fallo:', error?.message || error);
        return 0;
    } finally {
        barridoEnCurso = false;
    }
}

// Guarda los contactos dormidos en el panel. Va de a lotes para no mandar miles en un POST.
async function sincronizarContactos(contactos) {
    try {
        const { data } = await axios.post(urlDelPanel('/api/contacts/sync'), { contacts: contactos }, {
            headers: { Authorization: 'Bearer ' + SECRET_TOKEN, 'Content-Type': 'application/json' },
            timeout: 30000,
        });
        console.log('[Barrido] Cargados ' + (data?.saved ?? 0) + ' contactos (' + (data?.created ?? 0) + ' nuevos).');
        return Number(data?.saved) || 0;
    } catch (error) {
        console.error('[Barrido] No se pudieron cargar los contactos en el panel:', error.response?.data || error.message);
        return 0;
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
        
        // msg.getChat() falla por un cambio de WhatsApp: el historial se lee del Store.
        const messages = await obtenerMensajes(chatId, 20, 1);

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

// Todas las rutas del panel cuelgan del mismo dominio ya configurado en NEXTJS_API_URL.
function urlDelPanel(ruta) {
    return new URL(ruta, NEXTJS_API_URL).toString();
}

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
